import React from "react";
import { registerPanel, type PanelProps } from "../panels.ts";
import { mutate } from "../store.ts";
import { formatTimecode } from "../time.ts";

const Summary: React.FC<PanelProps> = ({ manifest, apply, issues, seek, select }) => {
  const fps = manifest.source.fps;
  const duration = manifest.segments.reduce((n, s) => n + s.toFrame - s.fromFrame, 0);
  const goto = (path: string) => {
    const scene = /^scenes\.(\d+)/.exec(path);
    if (scene) {
      const s = manifest.scenes[Number(scene[1])];
      if (s) { select({ kind: "scene", id: s.id }); seek(s.fromFrame); }
    }
  };
  return (
    <div className="pad summary">
      <dl>
        <dt>المشروع</dt><dd dir="ltr">{manifest.id}</dd>
        <dt>الستايل</dt><dd dir="ltr">{manifest.style}</dd>
        <dt>المدة</dt><dd dir="ltr">{formatTimecode(duration, fps)} @ {fps}fps ({duration} frames)</dd>
        <dt>مشاهد / كلمات / أصوات</dt><dd dir="ltr">{manifest.scenes.length} / {manifest.captions.words.length} / {manifest.sounds.length}</dd>
        <dt>الكابشن</dt>
        <dd>
          {                                                                                                                 }
          {manifest.captions.status === "reviewed" ? <>متراجع (<bdi>{manifest.captions.reviewer}</bdi>)</> : "draft"}{" "}
          <button type="button" onClick={() => apply(mutate((d) => { d.captions.mode = d.captions.mode === "phrases" ? "words" : "phrases"; }), "وضع الكابشن", { coalesce: false })}>
            وضع العرض: {manifest.captions.mode ?? "words"}
          </button>
        </dd>
      </dl>
      <h3>ملاحظات ({issues.length})</h3>
      {issues.length === 0 ? <p className="muted">مفيش مشاكل.</p> : (
        <ul className="issues">
          {issues.slice(0, 60).map((i, n) => (
            <li key={`${i.code}-${i.path}-${n}`} className={i.severity} onClick={() => goto(i.path)}>
              <span className="where">{i.stage === "delivery" ? "للتصدير النهائي · " : ""}{i.where}</span> {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

registerPanel({ id: "summary", title: "ملخص", order: 0, Component: Summary });
