import React from "react";
import type { EditManifest } from "../../prepared-edit/schema.ts";
import type { PanelProps } from "../panels.ts";
import * as ops from "../ops/index.ts";
import { GRAPHICS_ENTRANCE_KINDS, TRANSITION_DIRS, TRANSITION_KINDS, type TransitionDir, type TransitionKind } from "../../prepared-edit/graphics-transitions.ts";
import { formatTimecode } from "../time.ts";
import type { Selection } from "../types.ts";
import { Badge, Empty, NoticeBar, NumInput, Section, hueOf, memoWithoutPlayhead, useNotice, usePlayheadGetter, useRunner } from "./kit.tsx";

type Sound = EditManifest["sounds"][number];
type CameraKey = EditManifest["camera"][number];
type Transition = NonNullable<EditManifest["transitions"]>[number];
type LayoutTransition = NonNullable<EditManifest["layoutTransitions"]>[number];


const onRow = ops.onRow;
const soundRow = <R extends object>(s: Sound, i: number, fn: (m: EditManifest, j: number) => ops.OpResult<R>) => onRow((m) => m.sounds, s, i, fn);
const cameraRow = <R extends object>(k: CameraKey, i: number, fn: (m: EditManifest, j: number) => ops.OpResult<R>) => onRow((m) => m.camera, k, i, fn);
const transitionRow = <R extends object>(t: Transition, i: number, fn: (m: EditManifest, j: number) => ops.OpResult<R>) => onRow((m) => m.transitions, t, i, fn);
const layoutRow = <R extends object>(t: LayoutTransition, i: number, fn: (m: EditManifest, j: number) => ops.OpResult<R>) => onRow((m) => m.layoutTransitions, t, i, fn);

const isEntrance = (kind: string) => (GRAPHICS_ENTRANCE_KINDS as readonly string[]).includes(kind);
const KIND_HINT: Record<string, string> = {
  whiteout: "وميض أبيض على الفيديو كله", leak: "تسريب ضوء", bloom: "توهّج", burn: "احتراق فيلم",
  "whip-pan": "سحب سريع للجرافيك (على أول المشهد)", "clip-wipe": "مسح بقناع للجرافيك (على أول المشهد)", "light-scan": "شعاع ضوء يمسح الجرافيك (على أول المشهد)",
  "hue-crossfade": "تحويل لون بين مشهدين (محتاج chapter على الاتنين)",
};

const EffectsPanelBody: React.FC<PanelProps> = ({ manifest, apply, seek, selection, select, project }) => {
  const { notice, show, clear } = useNotice();
  const run = useRunner(apply, show);
  const getPlayhead = usePlayheadGetter();
  const fps = manifest.source.fps;
  const recipes = project.recipes;
  const recipeList = project.recipeInfo.length ? project.recipeInfo : recipes.map((id) => ({ id, name: id, use: "", duration: 0 }));
  const [recipe, setRecipe] = React.useState(recipes[0] ?? "");
  const [gain, setGain] = React.useState(0.5);
  const [kind, setKind] = React.useState<TransitionKind>("whiteout");
  const chosenRecipe = recipes.includes(recipe) ? recipe : (recipes[0] ?? "");
  const on = (sel: Selection, k: "sound" | "camera" | "transition" | "layoutTransition", i: number) => sel?.kind === k && (sel as { index: number }).index === i;
  const go = (k: "sound" | "camera" | "transition" | "layoutTransition", index: number, frame: number) => { select({ kind: k, index }); seek(frame); };

  const recipeOptions = (current: string) => (
    <>
      {recipeList.map((r) => <option key={r.id} value={r.id} title={r.use}>{r.name === r.id ? r.id : `${r.name} (${r.id})`}</option>)}
      {recipeList.some((r) => r.id === current) ? null : <option value={current}>{current} (مش في الكاتالوج)</option>}
    </>
  );

  return (
    <div className="fx" dir="rtl">
      <NoticeBar notice={notice} onClose={clear} />

      {                                                                          }
      <Section title="الأصوات (SFX)" count={manifest.sounds.length}
        actions={
          <span className="fx-add" dir="ltr">
            <select value={chosenRecipe} onChange={(e) => setRecipe(e.target.value)} aria-label="نوع الصوت" disabled={!recipes.length}>{recipeOptions(chosenRecipe)}</select>
            <label className="pk-inline">gain <NumInput value={gain} decimals={2} min={0} max={2} width={56} label="مستوى الصوت 0 لـ 2" onCommit={(n) => { setGain(n); return true; }} /></label>
            <button type="button" className="primary" disabled={!chosenRecipe} onClick={() => {
              const at = getPlayhead();
              const r = run("إضافة صوت", (m) => ops.addSound(m, { atFrame: at, recipe: chosenRecipe, gain, knownRecipes: recipes.length ? recipes : undefined }), { coalesce: false });
              if (r.ok) select({ kind: "sound", index: r.index });
            }}>+ عند الـ playhead</button>
          </span>
        }>
        {manifest.sounds.length === 0 ? <Empty>مفيش أصوات. اختار صوت من فوق واضغط «+ عند الـ playhead». الأصوات بتتسمع في التصدير النهائي مش في الـ preview.</Empty> : null}
        {manifest.sounds.map((s, i) => (
          <div key={i} className={`fx-row${on(selection, "sound", i) ? " on" : ""}`} dir="ltr">
            <button type="button" className="fx-when" title="روح للحظة دي" onClick={() => go("sound", i, s.atFrame)}>{formatTimecode(s.atFrame, fps)}</button>
            <select value={s.recipe} onChange={(e) => run(`نوع الصوت #${i + 1}`, soundRow(s, i, (m, j) => ops.setSoundRecipe(m, j, e.target.value, recipes.length ? recipes : undefined)), { coalesce: false })} aria-label="نوع الصوت">
              {recipeOptions(s.recipe)}
            </select>
            <input type="range" min={0} max={2} step={0.05} value={s.gain} aria-label="مستوى الصوت"
              onChange={(e) => run(`مستوى الصوت #${i + 1}`, soundRow(s, i, (m, j) => ops.setSoundGain(m, j, Number(e.target.value))), { coalesce: `sound:${i}:gain` })} />
            <NumInput value={s.gain} decimals={2} min={0} max={2} width={52} label="مستوى الصوت" onCommit={(n) => run(`مستوى الصوت #${i + 1}`, soundRow(s, i, (m, j) => ops.setSoundGain(m, j, n)), { coalesce: `sound:${i}:gain` }).ok} />
            <span className="fx-at">@</span>
            <NumInput value={s.atFrame} min={0} width={60} label="فريم الصوت" onCommit={(n) => {
              const r = run(`تحريك الصوت #${i + 1}`, soundRow(s, i, (m, j) => ops.moveSound(m, j, n)), { coalesce: `sound:${i}:at` });
              if (r.ok) select({ kind: "sound", index: r.index });
              return r.ok;
            }} />
            <button type="button" className="danger" onClick={() => run(`حذف الصوت #${i + 1}`, soundRow(s, i, (m, j) => ops.deleteSound(m, j)), { coalesce: false })}>حذف</button>
          </div>
        ))}
      </Section>

      {                                                                          }
      <Section title="الكاميرا (تكبير وتركيز)" count={manifest.camera.length}
        actions={
          <button type="button" className="primary" onClick={() => {
            const at = getPlayhead();
            const r = run("إضافة مفتاح كاميرا", (m) => ops.addCameraKey(m, { atFrame: at }), { coalesce: false });
            if (r.ok) select({ kind: "camera", index: r.index });
          }}>+ مفتاح عند الـ playhead</button>
        }>
        {manifest.camera.length === 0 ? <Empty>مفيش مفاتيح كاميرا. المفتاح الجديد بيبدأ بنفس حالة الكاميرا الحالية عشان الصورة متتنطش، وبعدين تعدّله.</Empty> : null}
        {manifest.camera.map((k, i) => (
          <div key={i} className={`fx-row${on(selection, "camera", i) ? " on" : ""}`} dir="ltr">
            <button type="button" className="fx-when" onClick={() => go("camera", i, k.atFrame)} title="روح للحظة دي">{formatTimecode(k.atFrame, fps)}</button>
            <span className="fx-at">@</span>
            <NumInput value={k.atFrame} min={0} width={60} label="فريم المفتاح" onCommit={(n) => run(`تحريك مفتاح كاميرا #${i + 1}`, cameraRow(k, i, (m, j) => ops.updateCameraKey(m, j, { atFrame: n })), { coalesce: `camera:${i}:at` }).ok} />
            <label className="pk-inline">scale <NumInput value={k.scale} decimals={3} min={1} max={1.3} width={62} label="التكبير من 1 لـ 1.3" onCommit={(n) => run(`تكبير الكاميرا #${i + 1}`, cameraRow(k, i, (m, j) => ops.updateCameraKey(m, j, { scale: n })), { coalesce: `camera:${i}:scale` }).ok} /></label>
            <label className="pk-inline">x <NumInput value={k.focusX} decimals={3} min={0} max={1} width={58} label="تركيز أفقي 0 لـ 1" onCommit={(n) => run(`تركيز الكاميرا #${i + 1}`, cameraRow(k, i, (m, j) => ops.updateCameraKey(m, j, { focusX: n })), { coalesce: `camera:${i}:fx` }).ok} /></label>
            <label className="pk-inline">y <NumInput value={k.focusY} decimals={3} min={0} max={1} width={58} label="تركيز رأسي 0 لـ 1" onCommit={(n) => run(`تركيز الكاميرا #${i + 1}`, cameraRow(k, i, (m, j) => ops.updateCameraKey(m, j, { focusY: n })), { coalesce: `camera:${i}:fy` }).ok} /></label>
            <select value={k.ease ?? ""} aria-label="نوع الحركة لحد المفتاح ده"
              onChange={(e) => run(`حركة الكاميرا #${i + 1}`, cameraRow(k, i, (m, j) => ops.updateCameraKey(m, j, { ease: e.target.value === "" ? null : (e.target.value as ops.CameraEase) })), { coalesce: false })}>
              <option value="">افتراضي (smoothstep)</option>
              <option value="smooth">smooth</option>
              <option value="bezierCam">bezierCam</option>
            </select>
            <button type="button" className="danger" onClick={() => run(`حذف مفتاح كاميرا #${i + 1}`, cameraRow(k, i, (m, j) => ops.deleteCameraKey(m, j)), { coalesce: false })}>حذف</button>
          </div>
        ))}
      </Section>

      {                                                                          }
      <Section title="الـ transitions" count={manifest.transitions?.length ?? 0}
        actions={
          <span className="fx-add" dir="ltr">
            <select value={kind} onChange={(e) => setKind(e.target.value as TransitionKind)} aria-label="نوع الـ transition" title={KIND_HINT[kind]}>
              {TRANSITION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button type="button" className="primary" onClick={() => {
              const at = getPlayhead();
              const r = run("إضافة transition", (m) => ops.addTransition(m, { atFrame: at, kind }), { coalesce: false });
              if (r.ok) select({ kind: "transition", index: r.index });
            }}>+ عند الـ playhead</button>
          </span>
        }>
        <p className="pk-muted">{KIND_HINT[kind]}</p>
        {(manifest.transitions?.length ?? 0) === 0 ? <Empty>مفيش transitions.</Empty> : null}
        {(manifest.transitions ?? []).map((t, i) => (
          <div key={i} className={`fx-row${on(selection, "transition", i) ? " on" : ""}`} dir="ltr">
            <button type="button" className="fx-when" onClick={() => go("transition", i, t.atFrame)} title="روح للحظة دي">{formatTimecode(t.atFrame, fps)}</button>
            <select value={t.kind ?? "whiteout"} aria-label="نوع الـ transition"
              onChange={(e) => { const r = run(`نوع الـ transition #${i + 1}`, transitionRow(t, i, (m, j) => ops.updateTransition(m, j, { kind: e.target.value as TransitionKind })), { coalesce: false }); if (r.ok) select({ kind: "transition", index: r.index }); }}>
              {TRANSITION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <span className="fx-at">@</span>
            <NumInput value={t.atFrame} min={0} width={60} label="فريم الـ transition" onCommit={(n) => {
              const r = run(`تحريك transition #${i + 1}`, transitionRow(t, i, (m, j) => ops.updateTransition(m, j, { atFrame: n })), { coalesce: `transition:${i}:at` });
              if (r.ok) select({ kind: "transition", index: r.index });
              return r.ok;
            }} />
            <label className="pk-inline">مدة <NumInput value={t.durationInFrames} min={1} max={120} width={52} label="المدة بالفريمات" onCommit={(n) => run(`مدة transition #${i + 1}`, transitionRow(t, i, (m, j) => ops.updateTransition(m, j, { durationInFrames: n })), { coalesce: `transition:${i}:dur` }).ok} /></label>
            {isEntrance(t.kind ?? "whiteout") ? (
              <select value={t.dir ?? ""} aria-label="الاتجاه" onChange={(e) => run(`اتجاه transition #${i + 1}`, transitionRow(t, i, (m, j) => ops.updateTransition(m, j, { dir: e.target.value === "" ? null : (e.target.value as TransitionDir) })), { coalesce: false })}>
                <option value="">من غير اتجاه</option>
                {TRANSITION_DIRS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : <Badge text={KIND_HINT[t.kind ?? "whiteout"]?.split(" ")[0] ?? ""} hue={hueOf(t.kind ?? "whiteout")} />}
            <button type="button" className="danger" onClick={() => run(`حذف transition #${i + 1}`, transitionRow(t, i, (m, j) => ops.deleteTransition(m, j)), { coalesce: false })}>حذف</button>
          </div>
        ))}
      </Section>

      {                                                                          }
      <Section title="تغيير الـ layout (presenter ↔ split)" count={manifest.layoutTransitions?.length ?? 0}
        actions={
          <button type="button" className="primary" title="بيتحط لما تقف على حدّ بين مشهد presenter ومشهد split" onClick={() => {
            const at = getPlayhead();
            const r = run("إضافة layout transition", (m) => ops.addLayoutTransition(m, { atFrame: at }), { coalesce: false });
            if (r.ok) select({ kind: "layoutTransition", index: r.index });
          }}>+ عند الـ playhead</button>
        }>
        {(manifest.layoutTransitions?.length ?? 0) === 0 ? <Empty>مفيش. الـ layout transition بيتحط عند حدّ فيه الشاشة بتتغيّر من presenter لـ split أو العكس.</Empty> : null}
        {(manifest.layoutTransitions ?? []).map((t, i) => (
          <div key={i} className={`fx-row${on(selection, "layoutTransition", i) ? " on" : ""}`} dir="ltr">
            <button type="button" className="fx-when" onClick={() => go("layoutTransition", i, t.atFrame)} title="روح للحظة دي">{formatTimecode(t.atFrame, fps)}</button>
            <select value={t.kind} aria-label="النوع" onChange={(e) => run(`نوع layout transition #${i + 1}`, layoutRow(t, i, (m, j) => ops.updateLayoutTransition(m, j, { kind: e.target.value as ops.LayoutTransitionKind })), { coalesce: false })}>
              <option value="curtain">curtain</option>
              <option value="window-morph">window-morph</option>
            </select>
            <Badge text={`${t.from} → ${t.to}`} />
            <span className="fx-at">@</span>
            <NumInput value={t.atFrame} min={1} width={60} label="فريم البداية" onCommit={(n) => {
              const r = run(`تحريك layout transition #${i + 1}`, layoutRow(t, i, (m, j) => ops.updateLayoutTransition(m, j, { atFrame: n })), { coalesce: `layoutTransition:${i}:at` });
              if (r.ok) select({ kind: "layoutTransition", index: r.index });
              return r.ok;
            }} />
            <label className="pk-inline">مدة <NumInput value={t.durationInFrames} min={12} max={120} width={52} label="المدة بالفريمات" onCommit={(n) => run(`مدة layout transition #${i + 1}`, layoutRow(t, i, (m, j) => ops.updateLayoutTransition(m, j, { durationInFrames: n })), { coalesce: `layoutTransition:${i}:dur` }).ok} /></label>
            <button type="button" className="danger" onClick={() => run(`حذف layout transition #${i + 1}`, layoutRow(t, i, (m, j) => ops.deleteLayoutTransition(m, j)), { coalesce: false })}>حذف</button>
          </div>
        ))}
      </Section>
    </div>
  );
};

export const EffectsPanel = memoWithoutPlayhead(EffectsPanelBody);
