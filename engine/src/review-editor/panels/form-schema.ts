import { z } from "zod";
import { introSchema, proofSchema, processSchema, comparisonSchema, commentSchema, followSchema } from "../../creative-kit/schema.ts";
import { kineticSceneVariants } from "../../creative-kit/kinetic/schema.ts";
import { librarySceneVariants } from "../../motion-library/schema.ts";
import { getIn, type Path } from "../ops/paths.ts";



const FAMILY_DATA: Record<string, z.ZodType> = {
  intro: introSchema,
  proof: proofSchema,
  process: processSchema,
  comparison: comparisonSchema,
  comment: commentSchema,
  follow: followSchema,
};
for (const variant of [...kineticSceneVariants, ...librarySceneVariants]) {
  const shape = (variant as any).shape;
  FAMILY_DATA[shape.family.value as string] = shape.data as z.ZodType;
}

export const familyDataSchema = (family: string): z.ZodType | undefined => FAMILY_DATA[family];
export const formFamilies = (): string[] => Object.keys(FAMILY_DATA);




const LABELS: Record<string, string> = {
  kicker: "السطر الصغير (kicker)", title: "العنوان", subtitle: "العنوان الفرعي", caption: "الكابشن", label: "التسمية", value: "الرقم", suffix: "اللاحقة",
  source: "المصدر", sourceNote: "ملاحظة المصدر", steps: "الخطوات", detail: "التفاصيل", beforeTitle: "عنوان «قبل»", beforeDetail: "تفاصيل «قبل»",
  afterTitle: "عنوان «بعد»", afterDetail: "تفاصيل «بعد»", keyword: "الكلمة المفتاحية", promise: "الوعد", handle: "الـ handle", message: "الرسالة",
  valueFit: "عرض الرقم", stamp: "الـ stamp", swapFrame: "فريم الـ swap", firstTitle: "العنوان الأول", secondTitle: "العنوان التاني", stampFrame: "فريم الـ stamp",
  foreground: "الـ foreground (الشخص قدّام العنوان)", images: "الصور", items: "العناصر", variant: "الشكل", image: "الصورة", unit: "الوحدة", rollFrame: "فريم بداية العدّ",
  rollDuration: "مدة العدّ", unitFrame: "فريم ظهور الوحدة", badge: "الشارة", badgeFrame: "فريم ظهور الشارة", footer: "السطر الأخير", prompt: "الـ prompt",
  followFrame: "فريم الـ Follow", clickedFrame: "فريم الضغطة", src: "الملف", kind: "النوع", fit: "الاحتواء", trimBeforeFrame: "قص من البداية (فريم)",
  atFrame: "فريم الظهور", display: "طريقة العرض", animateFrames: "مدة الحركة", focus: "منطقة التركيز", zoom: "التكبير", sourceWidth: "عرض الأصل", sourceHeight: "ارتفاع الأصل",
  focusFrame: "فريم التركيز", settleFrames: "فريمات الاستقرار", moveFrames: "فريمات الحركة", keys: "مفاتيح الكاميرا", cursor: "مسار الماوس", callouts: "الإشارات",
  x: "x", y: "y", width: "العرض", height: "الارتفاع", text: "النص", untilFrame: "لحد فريم", click: "ضغطة", rect: "المستطيل", sourceSha256: "بصمة المصدر (sha256)",
  sourceFromFrame: "أول فريم في المصدر", frames: "عدد الفريمات",
};
export const fieldLabel = (key: string): string => LABELS[key] ?? key;

const FRAME_KEY = /(Frame|Frames|Duration)$|^frames$/;
const MULTILINE_FROM = 100;
const ASSET_KEYS = new Set(["src", "image"]);



type Base = { key: string; label: string; required: boolean; description?: string };
export type StringField = Base & { kind: "string"; minLength?: number; maxLength?: number; multiline: boolean; asset: boolean; default?: string };
export type NumberField = Base & { kind: "number"; integer: boolean; min?: number; max?: number; exclusiveMin?: number; step: number | "any"; isFrame: boolean; default?: number };
export type BooleanField = Base & { kind: "boolean"; default?: boolean };
export type EnumField = Base & { kind: "enum"; options: (string | number | boolean)[]; fixed: boolean; default?: string | number | boolean };
export type ObjectField = Base & { kind: "object"; fields: Field[] };
export type ArrayField = Base & { kind: "array"; item: Field; minItems: number; maxItems: number;                                                                                fixedLength: boolean };
export type UnionVariant = { label: string; field: ObjectField;                                                                                         consts: Record<string, string | number | boolean>; required: string[]; properties: string[]; closed: boolean };
export type UnionField = Base & { kind: "union"; variants: UnionVariant[] };
export type JsonField = Base & { kind: "json"; schema: unknown };
export type Field = StringField | NumberField | BooleanField | EnumField | ObjectField | ArrayField | UnionField | JsonField;

type JS = Record<string, any>;

function fromJsonSchema(js: JS, key: string, required: boolean): Field {
  const base: Base = { key, label: fieldLabel(key), required, ...(typeof js.description === "string" ? { description: js.description } : {}) };
  const options = (js.anyOf ?? js.oneOf) as JS[] | undefined;
  if (Array.isArray(options)) {
    const objects = options.every((o) => o.type === "object" && o.properties);
    if (!objects) return { ...base, kind: "json", schema: js };
    return {
      ...base,
      kind: "union",
      variants: options.map((o, i) => {
        const field = fromJsonSchema(o, key, true) as ObjectField;
        const consts: Record<string, string | number | boolean> = {};
        for (const [k, v] of Object.entries<JS>(o.properties)) if (v.const !== undefined) consts[k] = v.const;
        const shown = Object.entries(consts).map(([k, v]) => `${k}: ${v}`).join(" · ");
        return { label: shown || `الشكل ${i + 1}`, field, consts, required: (o.required as string[]) ?? [], properties: Object.keys(o.properties), closed: o.additionalProperties === false };
      }),
    };
  }
  if (Array.isArray(js.enum)) return { ...base, kind: "enum", options: js.enum, fixed: js.enum.length === 1, ...(js.default !== undefined ? { default: js.default } : {}) };
  if (js.const !== undefined) return { ...base, kind: "enum", options: [js.const], fixed: true };
  switch (js.type) {
    case "string":
      return {
        ...base, kind: "string", minLength: js.minLength, maxLength: js.maxLength,
        multiline: typeof js.maxLength === "number" && js.maxLength >= MULTILINE_FROM,
        asset: ASSET_KEYS.has(key),
        ...(typeof js.default === "string" ? { default: js.default } : {}),
      };
    case "integer":
    case "number": {
      const integer = js.type === "integer";
      return {
        ...base, kind: "number", integer, min: js.minimum, max: js.maximum, exclusiveMin: js.exclusiveMinimum,
        step: typeof js.multipleOf === "number" ? js.multipleOf : integer ? 1 : "any",
        isFrame: FRAME_KEY.test(key),
        ...(typeof js.default === "number" ? { default: js.default } : {}),
      };
    }
    case "boolean":
      return { ...base, kind: "boolean", ...(typeof js.default === "boolean" ? { default: js.default } : {}) };
    case "object": {
      if (!js.properties) return { ...base, kind: "json", schema: js };
      const need = new Set<string>(js.required ?? []);
      return { ...base, kind: "object", fields: Object.entries<JS>(js.properties).map(([k, v]) => fromJsonSchema(v, k, need.has(k))) };
    }
    case "array": {
      if (!js.items || Array.isArray(js.items)) return { ...base, kind: "json", schema: js };
      const min = typeof js.minItems === "number" ? js.minItems : 0;
      const max = typeof js.maxItems === "number" ? js.maxItems : Infinity;
      return { ...base, kind: "array", item: fromJsonSchema(js.items, "", true), minItems: min, maxItems: max, fixedLength: min === max };
    }
    default:
      return { ...base, kind: "json", schema: js };
  }
}


export function toJsonSchema(schema: z.ZodType): JS {
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JS;
}


export function buildFields(schema: z.ZodType): Field[] {
  const root = fromJsonSchema(toJsonSchema(schema), "", true);
  return root.kind === "object" ? root.fields : [root];
}


export function fieldsForFamily(family: string): Field[] {
  const schema = familyDataSchema(family);
  return schema ? buildFields(schema) : [];
}


export function describeFields(fields: Field[], prefix = ""): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const at = prefix ? `${prefix}.${f.key}` : f.key;
    out.push(`${at}:${f.kind}${f.required ? "" : "?"}`);
    if (f.kind === "object") out.push(...describeFields(f.fields, at));
    else if (f.kind === "array") out.push(...describeFields([{ ...f.item, key: "[]" }], at));
    else if (f.kind === "union") f.variants.forEach((v, i) => out.push(...describeFields(v.field.fields, `${at}|${i}`)));
  }
  return out;
}




export function blankValue(field: Field): unknown {
  switch (field.kind) {
    case "string": return field.default ?? "";
    case "number": {
      const floor = field.min ?? (field.exclusiveMin !== undefined ? field.exclusiveMin + (field.integer ? 1 : 0.01) : 0);
      return field.default ?? Math.min(field.max ?? Infinity, floor);
    }
    case "boolean": return field.default ?? false;
    case "enum": return field.default ?? field.options[0];
    case "object": {
      const out: Record<string, unknown> = {};
      for (const f of field.fields) if (f.required) out[f.key] = blankValue(f);
      return out;
    }
    case "array": return Array.from({ length: field.minItems }, () => blankValue(field.item));
    case "union": return blankVariant(field.variants[0]);
    case "json": return null;
  }
}


export function blankVariant(variant: UnionVariant): Record<string, unknown> {
  const value = blankValue(variant.field) as Record<string, unknown>;
  return { ...value, ...variant.consts };
}


export function defaultItem(field: ArrayField, current: readonly unknown[]): unknown {
  return current.length ? structuredClone(current[current.length - 1]) : blankValue(field.item);
}


export function variantIndex(field: UnionField, value: unknown): number {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  let best = 0;
  let bestScore = -Infinity;
  field.variants.forEach((v, i) => {
    let score = 0;
    for (const [k, c] of Object.entries(v.consts)) score += k in obj ? (obj[k] === c ? 10 : -100) : v.required.includes(k) ? -1 : 1;
    for (const k of v.required) if (!(k in obj)) score -= 2;
    if (v.closed) for (const k of Object.keys(obj)) if (!v.properties.includes(k)) score -= 3;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}



export type FieldIssue = { path: Path; message: string };

const TYPE_AR: Record<string, string> = { string: "نص", number: "رقم", boolean: "اختيار", array: "قايمة", object: "مجموعة حقول", int: "رقم صحيح" };
const CUSTOM_AR: [RegExp, string][] = [
  [/local public asset path/, "لازم مسار ملف محلي جوّه public (من غير / في الأول ومن غير : أو .. )."],
  [/local \.mp4 or \.webm/, "لازم ملف فيديو mp4 أو webm."],
  [/Focus rectangle must stay inside/, "المستطيل لازم يفضل جوّه الصورة (x+width و y+height مايزيدوش عن 1)."],
  [/complete @handle/, "لازم @handle كامل: حروف وأرقام و _ و . بحد أقصى 30."],
  [/cannot be blank/, "النص مينفعش يبقى فاضي."],
];

function translate(issue: any): string {
  switch (issue.code) {
    case "invalid_type": {

      const received = /received (\w+)/.exec(String(issue.message))?.[1];
      return received === "undefined" ? "الحقل ده مطلوب." : `النوع غلط: المفروض ${TYPE_AR[issue.expected] ?? issue.expected}.`;
    }
    case "too_small":
      if (issue.origin === "string") return issue.minimum <= 1 ? "النص مينفعش يبقى فاضي." : `النص أقصر من الحد الأدنى (${issue.minimum} حرف).`;
      if (issue.origin === "array") return `لازم ${issue.minimum} عناصر على الأقل.`;
      return `القيمة أقل من الحد الأدنى (${issue.minimum}).`;
    case "too_big":
      if (issue.origin === "string") return `النص أطول من الحد الأقصى (${issue.maximum} حرف).`;
      if (issue.origin === "array") return `أكتر من ${issue.maximum} عناصر.`;
      return `القيمة أكبر من الحد الأقصى (${issue.maximum}).`;
    case "invalid_format": {
      if (String(issue.pattern ?? "").includes("\\S")) return "النص مينفعش يبقى فاضي.";
      const custom = CUSTOM_AR.find(([rx]) => rx.test(String(issue.message)));
      return custom ? custom[1] : "الصيغة مش مظبوطة.";
    }
    case "invalid_value":
      return `قيمة مش مسموحة. المسموح: ${(issue.values ?? []).join(" / ")}.`;
    case "not_multiple_of":
      return `لازم مضاعف لـ ${issue.divisor}.`;
    case "unrecognized_keys":
      return `حقل مش معروف: ${(issue.keys ?? []).join(", ")}.`;
    case "custom": {
      const custom = CUSTOM_AR.find(([rx]) => rx.test(String(issue.message)));
      return custom ? custom[1] : String(issue.message);
    }
    default:
      return String(issue.message ?? "قيمة غير صالحة.");
  }
}


export function flattenIssues(issues: readonly any[], prefix: Path = []): FieldIssue[] {
  const out: FieldIssue[] = [];
  for (const issue of issues) {
    const path = [...prefix, ...(issue.path ?? [])] as Path;
    if (issue.code === "invalid_union" && Array.isArray(issue.errors) && issue.errors.length) {
      const branches = (issue.errors as any[][]).map((b) => flattenIssues(b, path));
      out.push(...branches.reduce((a, b) => (b.length < a.length ? b : a)));
    } else out.push({ path, message: translate(issue) });
  }
  return out;
}


export function validateData(family: string, data: unknown): { ok: boolean; issues: FieldIssue[] } {
  const schema = familyDataSchema(family);
  if (!schema) return { ok: false, issues: [{ path: [], message: `مفيش schema للـ family «${family}».` }] };
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, issues: [] };

  const seen = new Set<string>();
  const issues = flattenIssues(r.error.issues).filter((i) => {
    const key = `${i.path.join(".")}|${i.message}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
  return { ok: false, issues };
}


export function issuesByPath(issues: readonly FieldIssue[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const i of issues) {
    const key = i.path.join(".");
    const list = map.get(key) ?? [];
    if (!list.includes(i.message)) map.set(key, [...list, i.message]);
  }
  return map;
}


export function valueAt(draft: unknown, path: Path): unknown {
  return getIn(draft, path);
}


export function parseNumberText(text: string): number | null {
  const western = text.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".");
  if (!/^-?\d+(\.\d+)?$/.test(western)) return null;
  const n = Number(western);
  return Number.isFinite(n) ? n : null;
}
