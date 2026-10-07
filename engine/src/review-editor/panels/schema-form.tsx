import React, { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { getIn, removeIn, setIn, type Path } from "../ops/paths.ts";
import {
  blankValue, blankVariant, defaultItem, fieldsForFamily, issuesByPath, parseNumberText, validateData, variantIndex,
  type ArrayField, type Field, type JsonField, type NumberField, type ObjectField, type StringField, type UnionField,
} from "./form-schema.ts";

export type SchemaFormProps = {
  family: string;

  data: unknown;
  fps: number;

  assets?: readonly string[];

  demoPaths?: readonly string[];

  onCommit: (draft: unknown, coalesceKey: string) => string | null;
};

type Ctx = {
  fps: number;
  assets: readonly string[];
  demo: ReadonlySet<string>;
  issues: Map<string, string[]>;
  change: (path: Path, value: unknown, key: string) => void;
  uid: string;
};

const pathKey = (path: Path) => path.join(".");
const MEDIA = /\.(png|jpe?g|webp|gif|svg|mp4|webm)$/i;

export const SchemaForm: React.FC<SchemaFormProps> = memo(({ family, data, fps, assets = [], demoPaths = [], onCommit }) => {
  const fields = useMemo(() => fieldsForFamily(family), [family]);
  const [draft, setDraft] = useState<unknown>(data);
  const [refusal, setRefusal] = useState<string | null>(null);
  const committed = useRef<unknown>(data);
  const uid = useId();


  useEffect(() => {
    if (data !== committed.current) {
      committed.current = data;
      setDraft(data);
      setRefusal(null);
    }
  }, [data]);

  const validation = useMemo(() => validateData(family, draft), [family, draft]);
  const issues = useMemo(() => issuesByPath(validation.issues), [validation]);
  const demo = useMemo(() => new Set(demoPaths), [demoPaths]);

  const change = (path: Path, value: unknown, key: string) => {
    const next = value === undefined ? removeIn(draft, path) : setIn(draft, path, value);
    setDraft(next);
    if (!validateData(family, next).ok) { setRefusal(null); return; }
    const err = onCommit(next, key);
    if (err === null) { committed.current = next; setRefusal(null); }
    else setRefusal(err);
  };

  if (!fields.length) return <div className="sf-empty">مفيش حقول قابلة للتعديل للـ family دي.</div>;
  const ctx: Ctx = { fps, assets, demo, issues, change, uid };
  const pending = validation.ok && refusal !== null;
  return (
    <div className="sf" dir="rtl">
      {fields.map((f) => <FieldView key={f.key} field={f} path={[f.key]} draft={draft} ctx={ctx} />)}
      {issues.get("") ? <div className="sf-msg bad">{issues.get("")!.join(" · ")}</div> : null}
      {refusal ? <div className="sf-msg bad" role="alert">مش متطبّق: {refusal}</div> : null}
      <div className={`sf-status ${validation.ok && !pending ? "ok" : "bad"}`} aria-live="polite">
        {validation.ok ? (pending ? "الحقول سليمة بس التعديل مش متطبّق (شوف السبب فوق)." : "متطبّق.") : `في ${validation.issues.length} مشكلة. التعديل ده مش متطبّق: المعاينة والحفظ لسه على آخر نسخة سليمة لحد ما تصلّحه.`}
      </div>
    </div>
  );
});
SchemaForm.displayName = "SchemaForm";



type FieldProps<F extends Field = Field> = { field: F; path: Path; draft: unknown; ctx: Ctx };

const Msgs: React.FC<{ list: string[] | undefined }> = ({ list }) => (list?.length ? <div className="sf-msg bad" role="alert">{list.join(" · ")}</div> : null);

const Label: React.FC<{ field: Field; path: Path; ctx: Ctx; extra?: React.ReactNode }> = ({ field, path, ctx, extra }) => (
  <span className="sf-label">
    {field.label}
    {field.label !== field.key && field.key ? <code dir="ltr">{field.key}</code> : null}
    {ctx.demo.has(pathKey(path)) ? <em className="sf-demo" title="النص ده تجريبي من الـ kit. بدّله بكلامك.">تجريبي</em> : null}
    {extra}
  </span>
);

const FieldView: React.FC<FieldProps> = ({ field, path, draft, ctx }) => {
  const value = getIn(draft, path);
  const key = pathKey(path);
  const present = value !== undefined;
  const optionalOff = !field.required && !present && !("default" in field && field.default !== undefined);
  const remove = () => ctx.change(path, undefined, `${key}`);

  if (optionalOff) {
    return (
      <div className="sf-field sf-off">
        <Label field={field} path={path} ctx={ctx} />
        <button type="button" className="sf-add" onClick={() => ctx.change(path, blankValue(field), key)}>+ إضافة</button>
      </div>
    );
  }
  const removable = !field.required && present ? <button type="button" className="sf-del" onClick={remove} title="شيل الحقل ده (اختياري)">حذف</button> : null;

  switch (field.kind) {
    case "string": return <StringView field={field} path={path} draft={draft} ctx={ctx} removable={removable} />;
    case "number": return <NumberView field={field} path={path} draft={draft} ctx={ctx} removable={removable} />;
    case "boolean":
      return (
        <div className="sf-field">
          <label className="sf-inline">
            <input type="checkbox" checked={Boolean(value ?? field.default)} onChange={(e) => ctx.change(path, e.target.checked, key)} />
            <Label field={field} path={path} ctx={ctx} />
          </label>
          {removable}
          <Msgs list={ctx.issues.get(key)} />
        </div>
      );
    case "enum": {
      const current = (value ?? field.default ?? field.options[0]) as string | number | boolean;
      return (
        <div className="sf-field">
          <label>
            <Label field={field} path={path} ctx={ctx} />
            {field.fixed ? (
              <span className="sf-fixed" dir="ltr">{String(field.options[0])}</span>
            ) : (
              <select value={String(current)} onChange={(e) => ctx.change(path, field.options.find((o) => String(o) === e.target.value), key)}>
                {field.options.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
              </select>
            )}
          </label>
          {removable}
          <Msgs list={ctx.issues.get(key)} />
        </div>
      );
    }
    case "object": return <ObjectView field={field} path={path} draft={draft} ctx={ctx} removable={removable} />;
    case "array": return <ArrayView field={field} path={path} draft={draft} ctx={ctx} removable={removable} />;
    case "union": return <UnionView field={field} path={path} draft={draft} ctx={ctx} removable={removable} />;
    case "json": return <JsonView field={field} path={path} draft={draft} ctx={ctx} removable={removable} />;
  }
};

type WithRemove<F extends Field> = FieldProps<F> & { removable: React.ReactNode };



const StringView: React.FC<WithRemove<StringField>> = ({ field, path, draft, ctx, removable }) => {
  const key = pathKey(path);
  const value = String((getIn(draft, path) as string | undefined) ?? field.default ?? "");
  const listId = `${ctx.uid}-${key}`;
  const over = field.maxLength !== undefined && [...value].length > field.maxLength;
  const suggestions = useMemo(() => (field.asset ? ctx.assets.filter((a) => MEDIA.test(a) && !a.startsWith("_")).slice(0, 400) : []), [field.asset, ctx.assets]);
  const common = {
    value, dir: "auto" as const, spellCheck: false, "aria-invalid": (ctx.issues.get(key)?.length ?? 0) > 0,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => ctx.change(path, e.target.value, key),
  };
  return (
    <div className="sf-field">
      <label>
        <Label field={field} path={path} ctx={ctx} extra={field.maxLength !== undefined ? <span className={`sf-count${over ? " bad" : ""}`} dir="ltr">{[...value].length}/{field.maxLength}</span> : null} />
        {field.multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} list={suggestions.length ? listId : undefined} />}
      </label>
      {suggestions.length ? <datalist id={listId}>{suggestions.map((a) => <option key={a} value={a} />)}</datalist> : null}
      {removable}
      <Msgs list={ctx.issues.get(key)} />
    </div>
  );
};



const NumberView: React.FC<WithRemove<NumberField>> = ({ field, path, draft, ctx, removable }) => {
  const key = pathKey(path);
  const raw = getIn(draft, path) as number | undefined;
  const value = raw ?? field.default;
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [local, setLocal] = useState<string | null>(null);
  const seen = useRef(value);
  useEffect(() => {
    if (value !== seen.current) { seen.current = value; setText(value === undefined ? "" : String(value)); setLocal(null); }
  }, [value]);
  const onText = (t: string) => {
    setText(t);
    const n = parseNumberText(t);
    if (n === null) { setLocal(t.trim() === "" ? "لازم رقم." : "لازم رقم صحيح بالشكل ده: 12 أو 0.5"); return; }
    setLocal(null);
    seen.current = n;
    ctx.change(path, n, key);
  };
  const hint = field.isFrame && typeof value === "number" ? `≈ ${(value / ctx.fps).toFixed(2)} ث` : null;
  return (
    <div className="sf-field">
      <label>
        <Label field={field} path={path} ctx={ctx} extra={hint ? <span className="sf-hint" dir="ltr">{hint}</span> : null} />
        <input
          type="text" inputMode="decimal" dir="ltr" className="sf-num" value={text}
          aria-invalid={local !== null || (ctx.issues.get(key)?.length ?? 0) > 0}
          onChange={(e) => onText(e.target.value)}
        />
      </label>
      {field.isFrame ? <span className="sf-hint">فريم داخل المشهد، مش داخل الفيديو كله.</span> : null}
      {removable}
      {local ? <div className="sf-msg bad">{local}</div> : <Msgs list={ctx.issues.get(key)} />}
    </div>
  );
};



const ObjectView: React.FC<WithRemove<ObjectField>> = ({ field, path, draft, ctx, removable }) => (
  <fieldset className="sf-object">
    <legend><Label field={field} path={path} ctx={ctx} /> {removable}</legend>
    {field.fields.map((f) => <FieldView key={f.key} field={f} path={[...path, f.key]} draft={draft} ctx={ctx} />)}
    <Msgs list={ctx.issues.get(pathKey(path))} />
  </fieldset>
);


function summary(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") for (const v of Object.values(value)) if (typeof v === "string" && v.trim()) return v;
  return "";
}

const ArrayView: React.FC<WithRemove<ArrayField>> = ({ field, path, draft, ctx, removable }) => {
  const key = pathKey(path);
  const list = (getIn(draft, path) as unknown[] | undefined) ?? [];
  const canAdd = !field.fixedLength && list.length < field.maxItems;
  const canDel = !field.fixedLength && list.length > field.minItems;
  return (
    <fieldset className="sf-array">
      <legend>
        <Label field={field} path={path} ctx={ctx} extra={<span className="sf-count" dir="ltr">{list.length}{Number.isFinite(field.maxItems) ? `/${field.maxItems}` : ""}</span>} /> {removable}
      </legend>
      {list.length === 0 ? <div className="sf-empty">القايمة فاضية.</div> : null}
      {list.map((item, i) => (
        <div className="sf-item" key={i}>
          <div className="sf-item-head">
            <span className="sf-item-no" dir="ltr">#{i + 1}</span>
            <span className="sf-item-title" dir="auto">{summary(item)}</span>
            {canDel ? <button type="button" className="sf-del" onClick={() => ctx.change(path, list.filter((_, j) => j !== i), key)}>حذف</button> : null}
          </div>
          <FieldView field={{ ...field.item, required: true }} path={[...path, i]} draft={draft} ctx={ctx} />
        </div>
      ))}
      {canAdd ? <button type="button" className="sf-add" onClick={() => ctx.change(path, [...list, defaultItem(field, list)], key)}>+ إضافة عنصر</button> : null}
      {field.fixedLength ? <div className="sf-hint">العدد ثابت ({field.minItems}).</div> : null}
      <Msgs list={ctx.issues.get(key)} />
    </fieldset>
  );
};



const UnionView: React.FC<WithRemove<UnionField>> = ({ field, path, draft, ctx, removable }) => {
  const key = pathKey(path);
  const value = getIn(draft, path);
  const index = variantIndex(field, value);
  const variant = field.variants[index];
  return (
    <fieldset className="sf-object">
      <legend>
        <Label field={field} path={path} ctx={ctx} />{" "}
        <select value={index} aria-label="شكل العنصر" onChange={(e) => ctx.change(path, blankVariant(field.variants[Number(e.target.value)]), key)}>
          {field.variants.map((v, i) => <option key={i} value={i}>{v.label}</option>)}
        </select>{" "}
        {removable}
      </legend>
      {variant.field.fields.map((f) => <FieldView key={f.key} field={f} path={[...path, f.key]} draft={draft} ctx={ctx} />)}
      <Msgs list={ctx.issues.get(key)} />
    </fieldset>
  );
};



const JsonView: React.FC<WithRemove<JsonField>> = ({ field, path, draft, ctx, removable }) => {
  const key = pathKey(path);
  const value = getIn(draft, path);
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [local, setLocal] = useState<string | null>(null);
  const seen = useRef(value);
  useEffect(() => {
    if (value !== seen.current) { seen.current = value; setText(JSON.stringify(value ?? null, null, 2)); setLocal(null); }
  }, [value]);
  return (
    <div className="sf-field">
      <label>
        <Label field={field} path={path} ctx={ctx} extra={<span className="sf-hint">JSON</span>} />
        <textarea
          rows={5} dir="ltr" spellCheck={false} value={text}
          onChange={(e) => {
            setText(e.target.value);
            try {
              const parsed = JSON.parse(e.target.value);
              setLocal(null);
              seen.current = parsed;
              ctx.change(path, parsed, key);
            } catch {
              setLocal("مش JSON صحيح.");
            }
          }}
        />
      </label>
      {removable}
      {local ? <div className="sf-msg bad">{local}</div> : <Msgs list={ctx.issues.get(key)} />}
    </div>
  );
};
