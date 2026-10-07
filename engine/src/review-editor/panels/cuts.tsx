import React, { useEffect, useMemo, useRef, useState } from "react";
import type { EditManifest } from "../../prepared-edit/schema.ts";
import type { PanelProps } from "../panels.ts";
import * as ops from "../ops/index.ts";
import { formatSeconds, formatTimecode, parseTimecode, plateIsStale, segmentEditedRanges, totalFrames } from "../time.ts";
import { Badge, Empty, NoticeBar, NumInput, Section, useNotice, usePlayheadGetter, useRunner } from "./kit.tsx";
import { parseNumberText } from "./form-schema.ts";

type CutResult = ops.OpResult<{ report: ops.RippleReport }>;
type CutFn = (m: EditManifest, o: ops.CutOptions) => CutResult;
type Pending = { label: string; fn: CutFn };

const reportLines = (r: ops.RippleReport, fps: number, done = false) => ops.describeReport(r, fps, done);

export const CutsPanel: React.FC<PanelProps> = ({ manifest, apply, playhead, seek, select, project }) => {
  const { notice, show, clear } = useNotice();
  const run = useRunner(apply, show);
  const getPlayhead = usePlayheadGetter();
  const [pending, setPending] = useState<Pending | null>(null);
  const fps = manifest.source.fps;
  const ranges = segmentEditedRanges(manifest);
  const total = totalFrames(manifest);
  const stale = plateIsStale(manifest, project.plate);

  const parseFrame = (text: string) => {
    const n = parseNumberText(text);
    return n !== null && Number.isInteger(n) ? n : parseTimecode(text, fps);
  };


  const preview = useMemo(() => (pending ? pending.fn(manifest, { confirmDrops: true }) : null), [pending, manifest]);



  const pendingCard = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pending) pendingCard.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [pending]);





  const attempt = (label: string, fn: CutFn, direct: boolean): boolean => {
    const dry = fn(manifest, { confirmDrops: true });
    if (!dry.ok) { show({ kind: "error", text: dry.reason }); return false; }
    if (!dry.changed) return false;
    if (dry.report.dropped.length || !direct) { setPending({ label, fn }); return false; }
    const r = run(label, (m) => fn(m, {}), { coalesce: false });
    if (r.ok) {
      const lines = reportLines(r.report, fps, true);
      show({ kind: "ok", text: lines.length ? lines.join(" · ") : "اتطبّق." });
    }
    return r.ok;
  };
  const confirm = () => {
    if (!pending) return;
    const { label, fn } = pending;
    const r = run(label, (m) => fn(m, { confirmDrops: true }), { coalesce: false });
    setPending(null);
    if (r.ok) show({ kind: "ok", text: reportLines(r.report, fps, true).join(" · ") || "اتطبّق." });
  };

  const trim = (index: number, edge: "in" | "out", delta: number, direct: boolean): boolean =>
    attempt(`قص القطعة ${index + 1}`, (m, o) => ops.trimSegment(m, index, edge, delta, o), direct);

  const sourceFrames = manifest.source.totalFrames;
  const pct = (f: number) => `${(f / sourceFrames) * 100}%`;
  const kept = manifest.segments.reduce((n, s) => n + s.toFrame - s.fromFrame, 0);

  return (
    <div className="cu" dir="rtl">
      <NoticeBar notice={notice} onClose={clear} />
      <Section title="الملخص">
        <div className="cu-sum" dir="ltr">
          <span>{formatTimecode(total, fps)} · {total} frames · {formatSeconds(total, fps)}</span>
          <span className="pk-muted">من {sourceFrames} فريم في الأصل ({Math.round((kept / sourceFrames) * 100)}% اتحفظ)</span>
        </div>
        <div className="cu-map" dir="ltr" aria-label="خريطة المصدر: الأجزاء المتحفظة">
          {manifest.segments.map((s, i) => (
            <button key={i} type="button" className="cu-map-seg" style={{ left: pct(s.fromFrame), width: pct(s.toFrame - s.fromFrame) }}
              title={`قطعة ${i + 1}: ${s.fromFrame}–${s.toFrame}`} onClick={() => { select({ kind: "segment", index: i }); seek(ranges[i].fromFrame); }}>{i + 1}</button>
          ))}
        </div>
        {stale ? <div className="pk-notice note">القص اتغيّر عن الملف اللي الـ preview بيشغّله. الـ preview لسه بيعرض القص القديم لحد ما تعمل Prepare (الصوت والصورة). الجرافيك والكابشن والصوت بيظهروا فورًا.</div> : null}
      </Section>

      {pending && preview ? (
        <div ref={pendingCard} className={`cu-pending${preview.ok && preview.report.dropped.length ? " warn" : ""}`} role="alertdialog" aria-label="مراجعة القص">
          <strong>راجع قبل ما تطبّق: {pending.label}</strong>
          {preview.ok ? (
            <>
              <ul>{reportLines(preview.report, fps).map((l, i) => <li key={i}>{l}</li>)}</ul>
              {preview.report.dropped.length ? <p className="cu-drop">التطبيق هيشيل العناصر اللي متعلّمة «هيتشال». Ctrl+Z يرجّعها.</p> : null}
              <div className="cu-buttons">
                <button type="button" className={preview.report.dropped.length ? "danger" : "primary"} onClick={confirm}>
                  {preview.report.dropped.length ? `طبّق وشيل ${preview.report.dropped.length} عنصر` : "طبّق"}
                </button>
                <button type="button" onClick={() => setPending(null)}>إلغاء</button>
              </div>
            </>
          ) : (
            <>
              <p className="cu-drop">{preview.reason}</p>
              <div className="cu-buttons"><button type="button" onClick={() => setPending(null)}>إغلاق</button></div>
            </>
          )}
        </div>
      ) : null}

      <Section title="القطع" count={manifest.segments.length}>
        {manifest.segments.length === 0 ? <Empty>مفيش قطع.</Empty> : null}
        {manifest.segments.map((seg, index) => {
          const r = ranges[index];
          const next = manifest.segments[index + 1];
          const canSplit = playhead > r.fromFrame && playhead < r.toFrame;
          return (
            <article className="cu-seg" key={index}>
              <header className="cu-head">
                <button type="button" className="cu-no" dir="ltr" onClick={() => { select({ kind: "segment", index }); seek(r.fromFrame); }} title="روح لأول القطعة">#{index + 1}</button>
                <span dir="ltr" className="cu-range">edit {formatTimecode(r.fromFrame, fps)} → {formatTimecode(r.toFrame, fps)} · {r.toFrame - r.fromFrame}f</span>
                {next && next.fromFrame === seg.toFrame ? <Badge text="متصلة بالتالية" title="القطعة دي والتالية ماسكين في بعض في الأصل" /> : null}
              </header>
              <div className="cu-edge" dir="ltr">
                <span className="cu-edge-name">in</span>
                <NumInput value={seg.fromFrame} min={0} max={seg.toFrame - 1} label="بداية القطعة في الفيديو الأصلي: فريم، أو ثواني (1.5)، أو mm:ss:ff" parse={parseFrame}
                  onCommit={(n) => trim(index, "in", n - seg.fromFrame, false)} />
                <span className="pk-muted">{formatTimecode(seg.fromFrame, fps)}</span>
                <span className="cu-spacer" />
                <button type="button" title="زوّد فريم من الأول" onClick={() => trim(index, "in", -1, true)}>+1f</button>
                <button type="button" title="زوّد 10 فريمات من الأول" onClick={() => trim(index, "in", -10, true)}>+10f</button>
                <button type="button" title="قصّ فريم من الأول" onClick={() => trim(index, "in", 1, true)}>−1f</button>
                <button type="button" title="قصّ 10 فريمات من الأول" onClick={() => trim(index, "in", 10, true)}>−10f</button>
              </div>
              <div className="cu-edge" dir="ltr">
                <span className="cu-edge-name">out</span>
                <NumInput value={seg.toFrame} min={seg.fromFrame + 1} max={sourceFrames} label="نهاية القطعة في الفيديو الأصلي: فريم، أو ثواني (1.5)، أو mm:ss:ff" parse={parseFrame}
                  onCommit={(n) => trim(index, "out", n - seg.toFrame, false)} />
                <span className="pk-muted">{formatTimecode(seg.toFrame, fps)}</span>
                <span className="cu-spacer" />
                <button type="button" title="زوّد فريم من الآخر" onClick={() => trim(index, "out", 1, true)}>+1f</button>
                <button type="button" title="زوّد 10 فريمات من الآخر" onClick={() => trim(index, "out", 10, true)}>+10f</button>
                <button type="button" title="قصّ فريم من الآخر" onClick={() => trim(index, "out", -1, true)}>−1f</button>
                <button type="button" title="قصّ 10 فريمات من الآخر" onClick={() => trim(index, "out", -10, true)}>−10f</button>
              </div>
              <div className="cu-buttons">
                <button type="button" disabled={!canSplit} title={canSplit ? "قسّم القطعة دي عند الـ playhead" : "حط الـ playhead جوّه القطعة دي الأول"}
                  onClick={() => { const at = getPlayhead(); attempt(`تقسيم القطعة ${index + 1}`, (m) => ops.splitSegmentAt(m, at), true); }}>قسّم عند الـ playhead</button>
                <button type="button" disabled={!next || next.fromFrame !== seg.toFrame} title="ادمج مع القطعة اللي بعدها"
                  onClick={() => run(`دمج القطعة ${index + 1}`, (m) => ops.mergeSegments(m, index), { coalesce: false })}>ادمج مع التالية</button>
                <button type="button" className="danger" disabled={manifest.segments.length === 1} title="احذف القطعة دي والباقي يقرّب"
                  onClick={() => attempt(`حذف القطعة ${index + 1}`, (m, o) => ops.deleteSegment(m, index, o), false)}>احذف القطعة</button>
              </div>
            </article>
          );
        })}
      </Section>
    </div>
  );
};
