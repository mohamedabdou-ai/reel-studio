import React, { memo, useCallback, useEffect, useState } from "react";
import type { EditScene } from "../../prepared-edit/schema.ts";
import type { PanelProps } from "../panels.ts";
import * as ops from "../ops/index.ts";
import { formatTimecode } from "../time.ts";
import { issuesAt } from "../validate.ts";
import type { Issue, Selection } from "../types.ts";
import { Badge, Empty, NoticeBar, NumInput, Section, hueOf, memoWithoutPlayhead, runOp, useNotice, usePlayheadGetter, useRunner } from "./kit.tsx";
import { SchemaForm } from "./schema-form.tsx";
import type { ApplyFn } from "../store.ts";

type Runner = ReturnType<typeof useRunner>;
const LAYOUT_AR: Record<string, string> = { presenter: "presenter (هو على الشاشة)", split: "split (نص ونص)", takeover: "takeover (جرافيك كامل)" };
const MOTION_AR: Record<string, string> = { land: "land (يحط)", stagger: "stagger (واحد ورا التاني)", quiet: "quiet (هادي)" };

type CardProps = {
  scene: EditScene;
  index: number;
  open: boolean;
  selected: boolean;
  fps: number;
  issues: Issue[];
  assets: readonly string[];
  apply: ApplyFn;
  run: Runner;
  seek: (frame: number) => void;
  select: (s: Selection) => void;
  toggle: (id: string) => void;
  getPlayhead: () => number;
};

const SceneCard = memo(function SceneCard({ scene, index, open, selected, fps, issues, assets, apply, run, seek, select, toggle, getPlayhead }: CardProps) {
  const [armed, setArmed] = useState(false);
  const end = scene.fromFrame + scene.durationInFrames;
  const demo = ops.sceneDemoFields(scene);
  const errors = issues.filter((i) => i.severity === "error");
  const layouts = ops.allowedLayouts(scene);
  const id = scene.id;
  useEffect(() => { if (!open) setArmed(false); }, [open]);
  const move = (by: number) => run(`تحريك المشهد ${id}`, (m) => ops.moveScene(m, id, scene.fromFrame + by), { coalesce: `scene:${id}:move` });
  return (
    <article className={`sp-scene${selected ? " on" : ""}${errors.length ? " has-error" : ""}`} id={`sp-scene-${id}`}>
      <header className="sp-head" onClick={() => { toggle(id); select({ kind: "scene", id }); seek(scene.fromFrame); }} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(id); select({ kind: "scene", id }); seek(scene.fromFrame); } }}
        aria-expanded={open}>
        <span className="sp-no" dir="ltr">{index + 1}</span>
        <Badge text={scene.family} hue={hueOf(scene.family)} />
        <strong className="sp-id" dir="ltr">{id}</strong>
        <span className="sp-range" dir="ltr">{formatTimecode(scene.fromFrame, fps)} → {formatTimecode(end, fps)} · {scene.durationInFrames}f</span>
        {demo.length ? <Badge text="نص تجريبي" tone="warn" title={`${demo.length} حقل لسه بنص الـ kit التجريبي. بدّله قبل التصدير.`} /> : null}
        {errors.length ? <Badge text={`${errors.length} مشكلة`} tone="bad" /> : null}
        <span className="sp-caret" aria-hidden>{open ? "▾" : "▸"}</span>
      </header>
      {open ? (
        <div className="sp-body">
          {issues.length ? <ul className="cp-issues">{issues.map((i, n) => <li key={`${i.code}-${n}`} className={i.severity}>{i.where}: {i.message}</li>)}</ul> : null}
          <div className="sp-row" dir="ltr">
            <label>from <NumInput value={scene.fromFrame} min={0} label="أول فريم" onCommit={(n) => run(`تحريك المشهد ${id}`, (m) => ops.moveScene(m, id, n), { coalesce: `scene:${id}:from` }).ok} /></label>
            <label>duration <NumInput value={scene.durationInFrames} min={1} label="المدة بالفريمات" onCommit={(n) => run(`مدة المشهد ${id}`, (m) => ops.setSceneDuration(m, id, n), { coalesce: `scene:${id}:dur` }).ok} /></label>
            <span className="pk-muted">{(scene.durationInFrames / fps).toFixed(2)}s</span>
            <button type="button" title="حرّك المشهد 5 فريمات للورا" onClick={() => move(-5)}>◀ 5f</button>
            <button type="button" title="حرّك المشهد 5 فريمات لقدّام" onClick={() => move(5)}>5f ▶</button>
          </div>
          <div className="sp-row">
            <button type="button" title="خلّي بداية المشهد عند الـ playhead (النهاية تفضل مكانها)" onClick={() => run(`بداية المشهد ${id}`, (m) => ops.resizeScene(m, id, "start", getPlayhead()), { coalesce: false })}>ابدأ من الـ playhead</button>
            <button type="button" title="خلّي نهاية المشهد عند الـ playhead" onClick={() => run(`نهاية المشهد ${id}`, (m) => ops.resizeScene(m, id, "end", getPlayhead()), { coalesce: false })}>خلّصه عند الـ playhead</button>
          </div>
          <div className="sp-row">
            <label>layout{" "}
              <select value={scene.layout} onChange={(e) => run(`layout المشهد ${id}`, (m) => ops.setLayout(m, id, e.target.value as ops.SceneLayout), { coalesce: false })}>
                {layouts.map((l) => <option key={l} value={l}>{LAYOUT_AR[l] ?? l}</option>)}
              </select>
            </label>
            <label>motion{" "}
              <select value={scene.motion} onChange={(e) => run(`motion المشهد ${id}`, (m) => ops.setMotion(m, id, e.target.value as ops.SceneMotion), { coalesce: false })}>
                {ops.MOTIONS.map((mo) => <option key={mo} value={mo}>{MOTION_AR[mo] ?? mo}</option>)}
              </select>
            </label>
            <span className="sp-spacer" />
            <button type="button" title="انسخ المشهد في أول مساحة فاضية" onClick={() => { const r = run(`نسخ المشهد ${id}`, (m) => ops.duplicateScene(m, id), { coalesce: false }); if (r.ok) { select({ kind: "scene", id: r.id }); seek(r.manifest.scenes[r.index].fromFrame); } }}>انسخ</button>
            {armed ? (
              <>
                <button type="button" className="danger" onClick={() => { run(`حذف المشهد ${id}`, (m) => ops.deleteScene(m, id), { coalesce: false }); setArmed(false); }}>أكيد، احذف</button>
                <button type="button" onClick={() => setArmed(false)}>لأ</button>
              </>
            ) : <button type="button" className="danger" onClick={() => setArmed(true)}>حذف</button>}
          </div>
          <SchemaForm
            family={scene.family}
            data={scene.data}
            fps={fps}
            assets={assets}
            demoPaths={demo}
            onCommit={(draft, key) => {
              const r = runOp(apply, `تعديل المشهد ${id}`, (m) => ops.setSceneData(m, id, draft), { coalesce: `scene:${id}:${key}` });
              return r.ok ? null : r.reason;
            }}
          />
        </div>
      ) : null}
    </article>
  );
});

const ScenesPanelBody: React.FC<PanelProps> = ({ manifest, apply, seek, selection, select, issues, project }) => {
  const { notice, show, clear } = useNotice();
  const run = useRunner(apply, show);
  const [open, setOpen] = useState<string | null>(selection?.kind === "scene" ? selection.id : null);
  const [family, setFamily] = useState<string>(ops.TEMPLATE_FAMILIES[0]);
  const getPlayhead = usePlayheadGetter();
  const toggle = useCallback((id: string) => setOpen((cur) => (cur === id ? null : id)), []);
  const fps = manifest.source.fps;
  const selectedId = selection?.kind === "scene" ? selection.id : null;


  useEffect(() => {
    if (!selectedId) return;
    setOpen(selectedId);
    requestAnimationFrame(() => document.getElementById(`sp-scene-${selectedId}`)?.scrollIntoView({ block: "nearest" }));
  }, [selectedId]);

  const add = () => {
    const r = run(`إضافة مشهد ${family}`, (m) => ops.addSceneFromTemplate(m, family, { atFrame: getPlayhead() }), { coalesce: false });
    if (r.ok) {
      const scene = r.manifest.scenes[r.index];
      select({ kind: "scene", id: scene.id });
      seek(scene.fromFrame);
      setOpen(scene.id);
    }
  };

  return (
    <div className="sp" dir="rtl">
      <NoticeBar notice={notice} onClose={clear} />
      <Section title="مشهد جديد" actions={null}>
        <div className="sp-row">
          <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="نوع المشهد">
            {ops.TEMPLATE_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button type="button" className="primary" onClick={add}>أضف عند الـ playhead</button>
        </div>
        <p className="pk-muted">المشهد الجديد بيتعمل بنص تجريبي من الـ kit وعليه علامة «نص تجريبي» لحد ما تبدّل الكلام بكلامك. للعائلات التانية (kinetic وغيرها) انسخ مشهد موجود.</p>
      </Section>
      <Section title="المشاهد" count={manifest.scenes.length}>
        {manifest.scenes.length === 0 ? <Empty>مفيش مشاهد لسه. ضيف مشهد من فوق. (التصدير النهائي محتاج مشاهد.)</Empty> : null}
        {manifest.scenes.map((scene, index) => (
          <SceneCard
            key={scene.id} scene={scene} index={index} open={open === scene.id} selected={selectedId === scene.id} fps={fps}
            issues={issuesAt(issues, `scenes.${index}`)} assets={project.staticFiles} apply={apply} run={run}
            seek={seek} select={select} toggle={toggle} getPlayhead={getPlayhead}
          />
        ))}
      </Section>
    </div>
  );
};

export const ScenesPanel = memoWithoutPlayhead(ScenesPanelBody);
