import type { EditManifest } from "../../prepared-edit/schema.ts";
import { layoutTransitionIssues } from "../../prepared-edit/footage.ts";
import { graphicsTransitionIssues } from "../../prepared-edit/graphics-transitions.ts";
import { segmentEditedRanges, totalFrames, tryCompile } from "../time.ts";
import { dropForegrounds, isSceneAnchoredKind, repairForegrounds, sceneTimingIssues } from "./anchors.ts";
import { explainEnglish } from "./explain.ts";
import { finalize, refuse, type OpResult, type ReportItem, type RippleReport } from "./result.ts";
import type { Scene } from "./util.ts";

export type CutOptions = {

  confirmDrops?: boolean;
};
type Delta = { kind: "remove" | "insert"; at: number; count: number };
type Segments = EditManifest["segments"];

function mapsFor(d: Delta) {
  const a = d.at;
  const b = d.at + d.count;
  if (d.kind === "remove") {
    return {
      point: (f: number) => (f < a ? f : f < b ? a : f - d.count),
      end: (f: number) => (f <= a ? f : f < b ? a : f - d.count),
      removed: (f: number) => f >= a && f < b,
    };
  }
  return { point: (f: number) => (f < a ? f : f + d.count), end: (f: number) => (f <= a ? f : f + d.count), removed: (_f: number) => false };
}

const sceneLabel = (id: string) => `المشهد "${id}"`;

function wordCounts(m: EditManifest) {
  const c = tryCompile(m);
  return c.ok ? { cut: c.compiled.issues.length, omitted: c.compiled.omittedWordIndices.length } : { cut: 0, omitted: 0 };
}

const wordsReport = (before: EditManifest, after: EditManifest) => {
  const a = wordCounts(before);
  const b = wordCounts(after);
  return { newlyCut: Math.max(0, b.cut - a.cut), newlyOmitted: Math.max(0, b.omitted - a.omitted) };
};


function ripple(m: EditManifest, delta: Delta, segments: Segments, options: CutOptions, notes: string[]): OpResult<{ report: RippleReport }> {
  const before = totalFrames(m);
  const after = delta.kind === "remove" ? before - delta.count : before + delta.count;
  const { point, end, removed } = mapsFor(delta);
  const a = delta.at;
  const b = delta.at + delta.count;
  const adjusted: ReportItem[] = [];
  const dropped: ReportItem[] = [];
  let shifted = 0;


  const signoff = m.signoffFromFrame;
  if (delta.kind === "remove" && signoff !== undefined && b > signoff) {
    if (a <= signoff && b >= before) return refuse("ده هيشيل «التوقيع» كلها. التوقيع مينفعش يتقص.");
    dropped.push({ kind: "signoff", label: `آخر ${b - Math.max(a, signoff)} فريم من «التوقيع»`, why: "القص بيدخل في الجزء المسجّل من التوقيع" });
  }


  const nextScenes: Scene[] = [];
  const survivor = new Map<string, Scene>();
  for (const s of m.scenes) {
    const from = point(s.fromFrame);
    const to = end(s.fromFrame + s.durationInFrames);
    const duration = to - from;
    if (duration < 1) {
      dropped.push({ kind: "scene", label: sceneLabel(s.id), why: "كله وقع في الجزء المقصوص" });
      continue;
    }
    const next = from === s.fromFrame && duration === s.durationInFrames ? s : ({ ...s, fromFrame: from, durationInFrames: duration } as Scene);
    if (duration !== s.durationInFrames) {
      if (sceneTimingIssues(next).length && !sceneTimingIssues(s).length) {
        dropped.push({ kind: "scene", label: sceneLabel(s.id), why: `توقيتاته الداخلية مش هتلحق في ${duration} فريم` });
        continue;
      }
      adjusted.push({
        kind: "scene",
        label: sceneLabel(s.id),
        why: duration < s.durationInFrames ? `اتقصّر ${s.durationInFrames - duration} فريم` : `اتمدّ ${duration - s.durationInFrames} فريم (توقيتات جواه هتنزاح)`,
      });
    }
    if (from !== s.fromFrame) shifted++;
    nextScenes.push(next);
    survivor.set(s.id, next);
  }


  let nextSignoff = signoff;
  if (signoff !== undefined) {
    nextSignoff = removed(signoff) ? a : point(signoff);
    if (nextSignoff !== signoff) shifted++;
  }
  const limit = nextSignoff ?? after;


  const sounds: EditManifest["sounds"] = [];
  m.sounds.forEach((s, i) => {
    const label = `الصوت #${i + 1} (${s.recipe} @${s.atFrame})`;
    if (removed(s.atFrame)) return void dropped.push({ kind: "sound", label, why: "وقع في الجزء المقصوص" });
    const at = point(s.atFrame);
    if (at >= limit) return void dropped.push({ kind: "sound", label, why: "بقى بعد الـ signoff أو نهاية الفيديو" });
    if (at !== s.atFrame) shifted++;
    sounds.push(at === s.atFrame ? s : { ...s, atFrame: at });
  });



  const camera: EditManifest["camera"] = [];
  const cameraAt = new Map<number, number>();
  m.camera.forEach((k, i) => {
    const label = `مفتاح الكاميرا #${i + 1} (@${k.atFrame})`;
    const wasCut = removed(k.atFrame);
    const at = wasCut ? a : point(k.atFrame);
    if (at >= after) return void dropped.push({ kind: "camera", label, why: "بقى بعد نهاية الفيديو" });
    const key = at === k.atFrame ? k : { ...k, atFrame: at };
    const existing = cameraAt.get(at);
    if (existing !== undefined) {
      dropped.push({ kind: "camera", label: `مفتاح الكاميرا (@${camera[existing].atFrame})`, why: "اتغطّى بمفتاح تاني وصل لنفس الفريم بعد القص" });
      camera[existing] = key;
    } else {
      cameraAt.set(at, camera.length);
      camera.push(key);
    }
    if (wasCut) adjusted.push({ kind: "camera", label, why: "اتنقل لنقطة القص" });
    if (at !== k.atFrame) shifted++;
  });



  const startsScene = (frame: number) => m.scenes.find((s) => s.fromFrame === frame);
  const transitions: NonNullable<EditManifest["transitions"]> = [];
  for (const t of m.transitions ?? []) {
    const kind = t.kind ?? "whiteout";
    const label = `الـ transition ${kind} @${t.atFrame}`;
    const tail = (duration: number) => (kind === "whiteout" ? duration / 2 : duration);
    const old = startsScene(t.atFrame);
    if (old) {
      const ns = survivor.get(old.id);
      if (!ns) {
        dropped.push({ kind: "transition", label, why: "المشهد بتاعه اتشال" });
        continue;
      }
      const duration = isSceneAnchoredKind(kind) ? Math.min(t.durationInFrames, ns.durationInFrames) : t.durationInFrames;
      if (duration !== t.durationInFrames) adjusted.push({ kind: "transition", label, why: `اتقصّر لـ ${duration} فريم عشان يناسب المشهد` });
      if (ns.fromFrame + tail(duration) > limit) {
        dropped.push({ kind: "transition", label, why: "مبقاش فيه مساحة قبل نهاية الفيديو أو الـ signoff" });
        continue;
      }
      if (ns.fromFrame !== t.atFrame) shifted++;
      transitions.push(ns.fromFrame === t.atFrame && duration === t.durationInFrames ? t : { ...t, atFrame: ns.fromFrame, durationInFrames: duration });
      continue;
    }
    if (removed(t.atFrame)) {
      dropped.push({ kind: "transition", label, why: "وقع في الجزء المقصوص" });
      continue;
    }
    const at = point(t.atFrame);
    if (at >= after || at + tail(t.durationInFrames) > limit) {
      dropped.push({ kind: "transition", label, why: "مبقاش فيه مساحة قبل نهاية الفيديو أو الـ signoff" });
      continue;
    }
    if (at !== t.atFrame) shifted++;
    transitions.push(at === t.atFrame ? t : { ...t, atFrame: at });
  }

  const layoutTransitions: NonNullable<EditManifest["layoutTransitions"]> = [];
  for (const t of m.layoutTransitions ?? []) {
    const label = `الـ layout transition ${t.kind} @${t.atFrame}`;
    const old = startsScene(t.atFrame);
    if (old) {
      const ns = survivor.get(old.id);
      if (!ns) {
        dropped.push({ kind: "layoutTransition", label, why: "المشهد بتاعه اتشال" });
        continue;
      }
      if (ns.fromFrame !== t.atFrame) shifted++;
      layoutTransitions.push(ns.fromFrame === t.atFrame ? t : { ...t, atFrame: ns.fromFrame });
      continue;
    }
    const to = t.atFrame + t.durationInFrames;
    const hit = delta.kind === "remove" ? t.atFrame < b && to > a : t.atFrame < a && to > a;
    if (hit) {
      dropped.push({ kind: "layoutTransition", label, why: delta.kind === "remove" ? "القص بيعدّي عليه" : "الإضافة وقعت جواه" });
      continue;
    }
    const at = point(t.atFrame);
    if (at !== t.atFrame) shifted++;
    layoutTransitions.push(at === t.atFrame ? t : { ...t, atFrame: at });
  }


  let next: EditManifest = { ...m, segments, scenes: nextScenes, sounds, camera };
  if (signoff !== undefined) next = { ...next, signoffFromFrame: nextSignoff };
  if (m.transitions !== undefined) next = { ...next, transitions };
  if (m.layoutTransitions !== undefined) next = { ...next, layoutTransitions };


  const pip = m.footage?.pip;
  if (pip) {
    const ids = pip.sceneIds.filter((id) => survivor.has(id));
    if (ids.length !== pip.sceneIds.length) {
      if (ids.length) next = { ...next, footage: { ...m.footage!, pip: { ...pip, sceneIds: ids } } };
      else {
        const { pip: _pip, ...footage } = m.footage!;
        next = { ...next, footage };
        dropped.push({ kind: "pip", label: "الـ PiP", why: "المشاهد اللي كان عليها اتشالت" });
      }
    }
  }


  if (next.transitions?.length) {
    const ok = next.transitions.filter((t) => {
      const problems = graphicsTransitionIssues([{ ...t, kind: t.kind ?? "whiteout" }], next.scenes);
      if (problems.length) dropped.push({ kind: "transition", label: `الـ transition ${t.kind} @${t.atFrame}`, why: explainEnglish(problems[0]) ?? problems[0] });
      return problems.length === 0;
    });
    if (ok.length !== next.transitions.length) next = { ...next, transitions: ok };
  }
  if (next.layoutTransitions?.length) {
    const ok = next.layoutTransitions.filter((t) => {
      const problems = layoutTransitionIssues({ ...next, layoutTransitions: [t] }, after, next.signoffFromFrame);
      if (problems.length) dropped.push({ kind: "layoutTransition", label: `الـ layout transition ${t.kind} @${t.atFrame}`, why: explainEnglish(problems[0]) ?? problems[0] });
      return problems.length === 0;
    });
    if (ok.length !== next.layoutTransitions.length) next = { ...next, layoutTransitions: ok };
  }


  const repaired = repairForegrounds(next);
  next = repaired.manifest;
  for (const id of repaired.failed) dropped.push({ kind: "foreground", label: `الـ foreground بتاع "${id}"`, why: "الملف مش هيغطي المدى الجديد" });

  const report: RippleReport = {
    delta: { ...delta },
    durationBefore: before,
    durationAfter: after,
    shifted,
    adjusted,
    dropped,
    words: { newlyCut: 0, newlyOmitted: 0 },
  };
  if (dropped.length && !options.confirmDrops) {
    return { ok: false, needsConfirm: true, reason: `التعديل ده هيشيل: ${dropped.map((d) => d.label).join("، ")}.`, report };
  }
  if (repaired.failed.length) next = dropForegrounds(next, repaired.failed);
  report.words = wordsReport(m, next);
  return finalize(m, next, { report }, notes);
}

const missing = (index: number) => refuse(`مفيش قطعة رقم ${index + 1}.`);






export function trimSegment(m: EditManifest, index: number, edge: "in" | "out", deltaFrames: number, options: CutOptions = {}): OpResult<{ report: RippleReport }> {
  const seg = m.segments[index];
  if (!seg) return missing(index);
  if (!Number.isFinite(deltaFrames)) return refuse("القيمة لازم تبقى رقم.");
  const d = Math.round(deltaFrames);
  if (d === 0) return refuse("مفيش تغيير.");
  const range = segmentEditedRanges(m)[index];
  const length = seg.toFrame - seg.fromFrame;
  const notes: string[] = [];
  let segment = seg;
  let delta: Delta;
  if (edge === "in" ? d > 0 : d < 0) {
    const cut = Math.abs(d);
    if (cut >= length) return refuse("التقصير ده هيشيل القطعة كلها. استخدم «حذف القطعة».");
    if (edge === "in") {
      segment = { ...seg, fromFrame: seg.fromFrame + cut };
      delta = { kind: "remove", at: range.fromFrame, count: cut };
    } else {
      segment = { ...seg, toFrame: seg.toFrame - cut };
      delta = { kind: "remove", at: range.toFrame - cut, count: cut };
    }
  } else {
    const wanted = Math.abs(d);
    const room = edge === "in" ? seg.fromFrame - (index > 0 ? m.segments[index - 1].toFrame : 0) : (index < m.segments.length - 1 ? m.segments[index + 1].fromFrame : m.source.totalFrames) - seg.toFrame;
    const grow = Math.min(wanted, room);
    if (grow <= 0) return refuse(edge === "in" ? "مفيش فوتيج قبل القطعة دي (لمست اللي قبلها أو بداية الفيديو)." : "مفيش فوتيج بعد القطعة دي (لمست اللي بعدها أو نهاية الفيديو).");
    if (grow < wanted) notes.push(`الزيادة اتقصّت لـ ${grow} فريم لأنه آخر الفوتيج المتاح.`);
    if (edge === "in") {
      segment = { ...seg, fromFrame: seg.fromFrame - grow };
      delta = { kind: "insert", at: range.fromFrame, count: grow };
    } else {
      segment = { ...seg, toFrame: seg.toFrame + grow };
      delta = { kind: "insert", at: range.toFrame, count: grow };
    }
  }
  return ripple(m, delta, m.segments.map((s, i) => (i === index ? segment : s)), options, notes);
}


export function deleteSegment(m: EditManifest, index: number, options: CutOptions = {}): OpResult<{ report: RippleReport }> {
  const seg = m.segments[index];
  if (!seg) return missing(index);
  if (m.segments.length === 1) return refuse("دي آخر قطعة. مينفعش تتشال.");
  const range = segmentEditedRanges(m)[index];
  return ripple(m, { kind: "remove", at: range.fromFrame, count: range.toFrame - range.fromFrame }, m.segments.filter((_, i) => i !== index), options, []);
}





export function splitSegmentAt(m: EditManifest, editedFrame: number): OpResult<{ report: RippleReport; index: number }> {
  if (!Number.isFinite(editedFrame)) return refuse("الفريم لازم يبقى رقم.");
  const f = Math.round(editedFrame);
  const range = segmentEditedRanges(m).find((r) => f > r.fromFrame && f < r.toFrame);
  if (!range) return refuse("الفريم ده على حدّ قطعة أو برّه الفيديو. حرّك الـ playhead لنص قطعة.");
  const seg = m.segments[range.index];
  const at = seg.fromFrame + (f - range.fromFrame);
  const segments = m.segments.slice(0, range.index).concat([{ ...seg, toFrame: at }, { ...seg, fromFrame: at }], m.segments.slice(range.index + 1));
  const next = { ...m, segments };
  const total = totalFrames(m);
  const report: RippleReport = { delta: null, durationBefore: total, durationAfter: total, shifted: 0, adjusted: [], dropped: [], words: wordsReport(m, next) };
  return finalize(m, next, { report, index: range.index });
}


export function mergeSegments(m: EditManifest, index: number): OpResult<{ report: RippleReport }> {
  const a = m.segments[index];
  const b = m.segments[index + 1];
  if (!a) return missing(index);
  if (!b) return refuse("دي آخر قطعة. مفيش بعدها قطعة تتدمج معاها.");
  if (a.toFrame !== b.fromFrame) return refuse("القطعتين مش ماسكين في بعض في الفيديو الأصلي. فيه فوتيج مقصوص بينهم.");
  const segments = m.segments.slice(0, index).concat([{ ...a, toFrame: b.toFrame }], m.segments.slice(index + 2));
  const next = { ...m, segments };
  const total = totalFrames(m);
  const report: RippleReport = { delta: null, durationBefore: total, durationAfter: total, shifted: 0, adjusted: [], dropped: [], words: wordsReport(m, next) };
  return finalize(m, next, { report });
}


export function describeReport(report: RippleReport, fps: number, done = false): string[] {
  const lines: string[] = [];
  const secs = (n: number) => `${(n / fps).toFixed(2)} ث`;
  const will = (planned: string, past: string) => (done ? past : planned);
  if (report.delta) {
    lines.push(report.delta.kind === "remove"
      ? `${will("هيتشال", "اتشال")} ${report.delta.count} فريم (${secs(report.delta.count)}) من الـ timeline.`
      : `${will("هيتضاف", "اتضاف")} ${report.delta.count} فريم (${secs(report.delta.count)}) للـ timeline.`);
  }
  if (report.shifted) lines.push(`${report.shifted} عنصر ${will("هيتحرّك", "اتحرّك")} مع الصورة (نفس اللحظة).`);
  for (const i of report.adjusted) lines.push(`${i.label}: ${i.why}.`);
  for (const i of report.dropped) lines.push(`${will("هيتشال", "اتشال")}، ${i.label}: ${i.why}.`);
  if (report.words.newlyCut) lines.push(`${report.words.newlyCut} كلمة في الكابشن القص ${will("بيقطعها", "بيقطعها")}.`);
  if (report.words.newlyOmitted) lines.push(`${report.words.newlyOmitted} كلمة في الكابشن ${will("هتختفي", "اختفت")} بالقص.`);
  return lines;
}
