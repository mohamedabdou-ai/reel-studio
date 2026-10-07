import type { EditManifest } from "../../prepared-edit/schema.ts";
import { CAPTION_EMPHASIS_KINDS, STATIC_CAPTION_STYLES, type CaptionEmphasis, type CaptionEmphasisKind } from "../../prepared-edit/caption-emphasis.ts";
import { finalize, refuse, unchanged, type OpResult } from "./result.ts";
import { ceil3, clamp, floor3, frameMs, removeAt, replaceAt, round3, sourceTotalMs, type Word } from "./util.ts";

type Emphasis = CaptionEmphasis[];
export type Nudge = { ms?: number; frames?: number };
export type WordEdge = "start" | "end" | "both";

const MAX_TEXT = 200;
const noWord = (index: number) => refuse(`مفيش كلمة رقم ${index + 1}.`);
const nudgeMs = (m: EditManifest, by: Nudge): number => (by.ms ?? 0) + ((by.frames ?? 0) * 1000) / m.source.fps;


function withCaptions(m: EditManifest, words: Word[], emphasis: Emphasis | null | "keep" = "keep"): EditManifest {
  const captions: EditManifest["captions"] = { ...m.captions, words };
  if (emphasis !== "keep") {
    if (emphasis === null || (emphasis.length === 0 && m.captions.emphasis === undefined)) delete captions.emphasis;
    else captions.emphasis = emphasis;
  }
  return { ...m, captions };
}




export function editWordText(m: EditManifest, index: number, text: string): OpResult {
  const w = m.captions.words[index];
  if (!w) return noWord(index);
  const next = String(text).replace(/[\r\n\t]+/g, " ").trim();
  if (!next) return refuse("النص مينفعش يبقى فاضي. لو عايز تشيل الكلمة استخدم زرار الحذف.");
  if (next.length > MAX_TEXT) return refuse(`النص أطول من ${MAX_TEXT} حرف.`);
  if (next === w.text) return unchanged(m);
  return finalize(m, withCaptions(m, replaceAt(m.captions.words, index, { ...w, text: next })));
}








export function nudgeWord(m: EditManifest, index: number, edge: WordEdge, by: Nudge): OpResult {
  const words = m.captions.words;
  const w = words[index];
  if (!w) return noWord(index);
  const d = nudgeMs(m, by);
  if (!Number.isFinite(d)) return refuse("القيمة لازم تبقى رقم.");
  if (d === 0) return unchanged(m);
  const prevEnd = index > 0 ? words[index - 1].endMs : 0;
  const nextStart = index < words.length - 1 ? words[index + 1].startMs : sourceTotalMs(m);
  const minLen = ceil3(frameMs(m));
  let start = w.startMs;
  let end = w.endMs;
  if (edge === "start") {
    const lo = ceil3(prevEnd);
    const hi = floor3(w.endMs - minLen);
    if (lo > hi) return refuse("مفيش مساحة لتحريك بداية الكلمة دي.");
    start = clamp(round3(w.startMs + d), lo, hi);
  } else if (edge === "end") {
    const lo = ceil3(w.startMs + minLen);
    const hi = floor3(nextStart);
    if (lo > hi) return refuse("مفيش مساحة لتحريك نهاية الكلمة دي.");
    end = clamp(round3(w.endMs + d), lo, hi);
  } else {
    const span = w.endMs - w.startMs;
    const lo = ceil3(prevEnd);
    const hi = floor3(nextStart - span);
    if (lo > hi) return refuse("مفيش مساحة لتحريك الكلمة دي.");
    start = clamp(round3(w.startMs + d), lo, hi);
    end = round3(start + span);
  }

  start = Math.max(start, prevEnd);
  end = Math.min(end, nextStart);
  if (!(end > start)) return refuse("مفيش مساحة لتحريك الكلمة دي.");
  const moved = edge === "end" ? end - w.endMs : start - w.startMs;
  const notes = Math.abs(moved - d) > 0.01 ? ["اتحركت لحد ما لمست الكلمة اللي جنبها (أو حدّ الفيديو)."] : [];
  if (start === w.startMs && end === w.endMs) return unchanged(m, undefined, notes);
  return finalize(m, withCaptions(m, replaceAt(words, index, { ...w, startMs: start, endMs: end })), undefined, notes);
}







export function setWordTiming(m: EditManifest, index: number, to: { startMs?: number; endMs?: number }): OpResult {
  const words = m.captions.words;
  const w = words[index];
  if (!w) return noWord(index);
  const wantStart = to.startMs;
  const wantEnd = to.endMs;
  if ((wantStart !== undefined && !Number.isFinite(wantStart)) || (wantEnd !== undefined && !Number.isFinite(wantEnd))) return refuse("القيمة لازم تبقى رقم.");
  if (wantStart === undefined && wantEnd === undefined) return unchanged(m);
  const prevEnd = index > 0 ? words[index - 1].endMs : 0;
  const nextStart = index < words.length - 1 ? words[index + 1].startMs : sourceTotalMs(m);
  const minLen = ceil3(frameMs(m));
  let start = w.startMs;
  let end = w.endMs;
  if (wantStart !== undefined) {
    const lo = ceil3(prevEnd);
    const endCap = wantEnd === undefined ? w.endMs : Math.min(round3(wantEnd), nextStart);
    const hi = floor3(endCap - minLen);
    if (lo > hi) return refuse("مفيش مساحة لتحريك بداية الكلمة دي.");
    start = clamp(round3(wantStart), lo, hi);
  }
  if (wantEnd !== undefined) {
    const lo = ceil3(start + minLen);
    const hi = floor3(nextStart);
    if (lo > hi) return refuse("مفيش مساحة لتحريك نهاية الكلمة دي.");
    end = clamp(round3(wantEnd), lo, hi);
  }

  start = Math.max(start, prevEnd);
  end = Math.min(end, nextStart);
  if (!(end > start)) return refuse("مفيش مساحة لتحريك الكلمة دي.");
  const clamped = (wantStart !== undefined && Math.abs(start - wantStart) > 0.01) || (wantEnd !== undefined && Math.abs(end - wantEnd) > 0.01);
  const notes = clamped ? ["اتحركت لحد ما لمست الكلمة اللي جنبها (أو حدّ الفيديو)."] : [];
  if (start === w.startMs && end === w.endMs) return unchanged(m, undefined, notes);
  return finalize(m, withCaptions(m, replaceAt(words, index, { ...w, startMs: start, endMs: end })), undefined, notes);
}


export function shiftAllCaptions(m: EditManifest, by: Nudge): OpResult {
  const words = m.captions.words;
  if (!words.length) return refuse("مفيش كلمات في الكابشن.");
  const d = nudgeMs(m, by);
  if (!Number.isFinite(d)) return refuse("القيمة لازم تبقى رقم.");
  if (d === 0) return unchanged(m);
  const lo = -words[0].startMs;
  const hi = sourceTotalMs(m) - words[words.length - 1].endMs;
  if (lo > hi) return refuse("الكابشن أطول من الفيديو الأصلي.");
  const shift = clamp(d, lo, hi);
  if (shift === 0) return refuse("الكابشن واصل لحدّ الفيديو من الناحية دي.");
  const moved = words.map((w) => ({ ...w, startMs: Math.max(0, round3(w.startMs + shift)), endMs: round3(w.endMs + shift) }));
  return finalize(m, withCaptions(m, moved), undefined, Math.abs(shift - d) > 0.01 ? ["الإزاحة اتقصّت عشان الكابشن يفضل جوّه الفيديو."] : []);
}



const visibleLength = (s: string) => s.replace(/\s/g, "").length;






export function splitWord(m: EditManifest, index: number, at: number): OpResult<{ index: number; nextIndex: number }> {
  const words = m.captions.words;
  const w = words[index];
  if (!w) return noWord(index);
  const cut = Math.round(at);
  if (!Number.isFinite(cut) || cut < 1 || cut >= w.text.length) return refuse("حط المؤشر جوّه النص عشان تقسمه.");
  const left = w.text.slice(0, cut).trim();
  const right = w.text.slice(cut).trim();
  if (!left || !right) return refuse("التقسيم ده هيطلّع نص فاضي. حرّك المؤشر لمكان فيه كلام على الناحيتين.");
  const wl = visibleLength(left);
  const wr = visibleLength(right);
  const mid = round3(w.startMs + ((w.endMs - w.startMs) * wl) / (wl + wr));
  if (!(mid > w.startMs && mid < w.endMs)) return refuse("الكلمة قصيرة أوي على التقسيم.");
  const first: Word = { ...w, text: left, endMs: mid };
  const second: Word = { ...w, text: right, startMs: mid };
  const out = words.slice(0, index).concat([first, second], words.slice(index + 1));
  const emphasis = m.captions.emphasis;
  let nextEmphasis: Emphasis | "keep" = "keep";
  if (emphasis) {
    nextEmphasis = [];
    for (const e of emphasis) {
      if (e.sourceIndex < index) nextEmphasis.push(e);
      else if (e.sourceIndex === index) nextEmphasis.push(e, { ...e, sourceIndex: index + 1 });
      else nextEmphasis.push({ ...e, sourceIndex: e.sourceIndex + 1 });
    }
  }
  return finalize(m, withCaptions(m, out, nextEmphasis), { index, nextIndex: index + 1 });
}


export function mergeWords(m: EditManifest, index: number): OpResult<{ index: number }> {
  const words = m.captions.words;
  const a = words[index];
  const b = words[index + 1];
  if (!a) return noWord(index);
  if (!b) return refuse("دي آخر كلمة. مفيش بعدها كلمة تتدمج معاها.");
  const text = `${a.text.trim()} ${b.text.trim()}`;
  if (text.length > MAX_TEXT) return refuse(`النص بعد الدمج أطول من ${MAX_TEXT} حرف.`);
  const confidence = a.confidence !== null && b.confidence !== null ? Math.min(a.confidence, b.confidence) : null;
  const merged: Word = { ...a, text, endMs: b.endMs, confidence };
  const out = words.slice(0, index).concat([merged], words.slice(index + 2));
  const emphasis = m.captions.emphasis;
  let nextEmphasis: Emphasis | "keep" = "keep";
  if (emphasis) {
    nextEmphasis = [];
    const own = emphasis.find((e) => e.sourceIndex === index) ?? emphasis.find((e) => e.sourceIndex === index + 1);
    for (const e of emphasis) {
      if (e.sourceIndex < index) nextEmphasis.push(e);
      else if (e.sourceIndex === index) nextEmphasis.push(own!);
      else if (e.sourceIndex === index + 1) {
        if (!emphasis.some((x) => x.sourceIndex === index)) nextEmphasis.push({ ...e, sourceIndex: index });
      } else nextEmphasis.push({ ...e, sourceIndex: e.sourceIndex - 1 });
    }
  }
  return finalize(m, withCaptions(m, out, nextEmphasis), { index });
}


export function deleteWord(m: EditManifest, index: number): OpResult {
  const w = m.captions.words[index];
  if (!w) return noWord(index);
  const emphasis = m.captions.emphasis;
  let nextEmphasis: Emphasis | null | "keep" = "keep";
  if (emphasis) {
    const kept = emphasis.filter((e) => e.sourceIndex !== index).map((e) => (e.sourceIndex > index ? { ...e, sourceIndex: e.sourceIndex - 1 } : e));
    nextEmphasis = kept.length ? kept : emphasis.some((e) => e.sourceIndex === index) ? null : kept;
  }
  return finalize(m, withCaptions(m, removeAt(m.captions.words, index), nextEmphasis));
}



export function setEmphasis(m: EditManifest, index: number, kind: CaptionEmphasisKind): OpResult {
  if (!m.captions.words[index]) return noWord(index);
  if (!(CAPTION_EMPHASIS_KINDS as readonly string[]).includes(kind)) return refuse(`نوع الـ emphasis لازم يكون واحد من: ${CAPTION_EMPHASIS_KINDS.join(" / ")}.`);
  if (kind === "pop" && (STATIC_CAPTION_STYLES as readonly string[]).includes(m.style)) return refuse(`الـ pop مش مسموح في ستايل ${m.style}: الكابشن فيه ثابت.`);
  const list = m.captions.emphasis ?? [];
  const at = list.findIndex((e) => e.sourceIndex >= index);
  if (at >= 0 && list[at].sourceIndex === index) {
    if (list[at].kind === kind) return unchanged(m);
    return finalize(m, withCaptions(m, m.captions.words, replaceAt(list, at, { sourceIndex: index, kind })));
  }
  const copy = list.slice();
  copy.splice(at < 0 ? list.length : at, 0, { sourceIndex: index, kind });
  return finalize(m, withCaptions(m, m.captions.words, copy));
}

export function clearEmphasis(m: EditManifest, index: number): OpResult {
  const list = m.captions.emphasis;
  if (!list || !list.some((e) => e.sourceIndex === index)) return unchanged(m);
  const kept = list.filter((e) => e.sourceIndex !== index);
  return finalize(m, withCaptions(m, m.captions.words, kept.length ? kept : null));
}




export function setCaptionReview(m: EditManifest, review: { status: "draft" | "reviewed"; reviewer?: string }): OpResult {
  const reviewer = review.reviewer?.trim();
  if (review.status === "reviewed" && !(reviewer || m.captions.reviewer?.trim())) return refuse("اكتب اسم الـ reviewer الأول.");
  if (reviewer && reviewer.length > 200) return refuse("اسم الـ reviewer أطول من ٢٠٠ حرف.");
  const captions: EditManifest["captions"] = { ...m.captions, status: review.status };
  if (reviewer) captions.reviewer = reviewer;
  if (captions.status === m.captions.status && captions.reviewer === m.captions.reviewer) return unchanged(m);
  return finalize(m, { ...m, captions });
}
