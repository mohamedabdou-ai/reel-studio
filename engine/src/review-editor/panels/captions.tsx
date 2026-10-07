import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SourceWord } from "../../prepared-edit/schema.ts";
import { STATIC_CAPTION_STYLES, emphasisBySource, type CaptionEmphasisKind } from "../../prepared-edit/caption-emphasis.ts";
import { sourceMsToEditFrame } from "../../prepared-edit/timeline.ts";
import type { PanelProps } from "../panels.ts";
import * as ops from "../ops/index.ts";
import { formatTimecode, tryCompile } from "../time.ts";
import type { Selection } from "../types.ts";
import { Badge, Empty, NoticeBar, NumInput, Section, TextInput, useNotice, useRunner } from "./kit.tsx";

type Runner = ReturnType<typeof useRunner>;
const EMPHASIS: { kind: CaptionEmphasisKind; label: string; title: string }[] = [
  { kind: "accent", label: "لون", title: "تلوين الكلمة بلون الـ accent" },
  { kind: "underline", label: "خط", title: "خط تحت الكلمة" },
  { kind: "pop", label: "نبضة", title: "الكلمة بتنبض أول ما تظهر (pop)" },
];
const PAGE = 60;
const HIDDEN_PAGE = 40;



type RowProps = {
  word: SourceWord;
  index: number;
  fps: number;
  emphasis: CaptionEmphasisKind | undefined;
  staticStyle: boolean;

  editedFrom: number | null;
  selected: boolean;
  playing: boolean;
  isLast: boolean;
  run: Runner;
  seek: (frame: number) => void;
  select: (s: Selection) => void;
  onMessage: (text: string) => void;
};

const WordRow = memo(function WordRow({ word, index, fps, emphasis, staticStyle, editedFrom, selected, playing, isLast, run, seek, select, onMessage }: RowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameMs = 1000 / fps;
  const nudge = (edge: ops.WordEdge, frames: number) =>
    run(`تحريك كلمة #${index + 1}`, (m) => ops.nudgeWord(m, index, edge, { frames }), { coalesce: `word:${index}:${edge}` });

  const typed = (edge: "start" | "end", ms: number) =>
    run(`توقيت كلمة #${index + 1}`, (m) => ops.setWordTiming(m, index, edge === "start" ? { startMs: ms } : { endMs: ms }), { coalesce: `word:${index}:${edge}:ms` }).ok;
  const split = () => {

    const input = inputRef.current;
    if (input && input.value !== word.text) return onMessage("احفظ تعديل النص الأول (Enter) وبعدين قسّم.");
    const at = input?.selectionStart ?? 0;
    const r = run(`تقسيم كلمة #${index + 1}`, (m) => ops.splitWord(m, index, at), { coalesce: false });
    if (r.ok) select({ kind: "word", index: r.index });
  };
  return (
    <div className={`cp-word${selected ? " on" : ""}${playing ? " playing" : ""}${editedFrom === null ? " hidden" : ""}`} id={`cp-word-${index}`}>
      <div className="cp-line">
        <button type="button" className="cp-no" dir="ltr" title={editedFrom === null ? "الكلمة دي مقصوصة بالكامل من الفيديو" : "روح لأول الكلمة"}
          onClick={() => { select({ kind: "word", index }); if (editedFrom !== null) seek(editedFrom); }}>{index + 1}</button>
        <TextInput
          value={word.text}
          inputRef={inputRef}
          className="cp-text"
          label={`نص الكلمة ${index + 1}`}
          onFocus={() => select({ kind: "word", index })}
          onCommit={(text) => {
            const r = run(`تعديل نص كلمة #${index + 1}`, (m) => ops.editWordText(m, index, text), { coalesce: `word:${index}:text` });
            return r.ok ? null : r.reason;
          }}
        />
        <span className="cp-actions">
          <button type="button" title="قسّم الكلمة عند المؤشر (الوقت بيتقسم بالتناسب)" onClick={split}>قسّم</button>
          <button type="button" title="ادمج مع الكلمة اللي بعدها" disabled={isLast} onClick={() => run(`دمج كلمة #${index + 1}`, (m) => ops.mergeWords(m, index), { coalesce: false })}>ادمج</button>
          <button type="button" className="danger" title="شيل الكلمة دي من الكابشن (Ctrl+Z يرجّعها)" onClick={() => run(`حذف كلمة #${index + 1}`, (m) => ops.deleteWord(m, index), { coalesce: false })}>حذف</button>
        </span>
      </div>
      <div className="cp-line cp-timing" dir="ltr">
        <span className="cp-group-label">start</span>
        <button type="button" title="ابدأ أبكر بفريم" onClick={() => nudge("start", -1)}>−f</button>
        <NumInput value={word.startMs} decimals={1} width={72} label="بداية الكلمة بالـ ms" onCommit={(n) => typed("start", n)} />
        <button type="button" title="ابدأ أبعد بفريم" onClick={() => nudge("start", 1)}>+f</button>
        <span className="cp-group-label">end</span>
        <button type="button" title="خلّصها أبكر بفريم" onClick={() => nudge("end", -1)}>−f</button>
        <NumInput value={word.endMs} decimals={1} width={72} label="نهاية الكلمة بالـ ms" onCommit={(n) => typed("end", n)} />
        <button type="button" title="خلّصها أبعد بفريم" onClick={() => nudge("end", 1)}>+f</button>
        <span className="cp-group-label">move</span>
        <button type="button" title="حرّك الكلمة كلها بفريم للورا" onClick={() => nudge("both", -1)}>◀</button>
        <button type="button" title="حرّك الكلمة كلها بفريم لقدّام" onClick={() => nudge("both", 1)}>▶</button>
        <span className="cp-dur" title="مدة الكلمة">{Math.round((word.endMs - word.startMs) / frameMs)}f</span>
      </div>
      <div className="cp-line cp-emph">
        {EMPHASIS.map((e) => {
          const blocked = e.kind === "pop" && staticStyle;
          return (
            <button key={e.kind} type="button" className={`cp-chip${emphasis === e.kind ? " on" : ""}`} disabled={blocked}
              title={blocked ? "الـ pop مش مسموح في الستايل ده (الكابشن فيه ثابت)" : e.title} aria-pressed={emphasis === e.kind}
              onClick={() => run(`تأكيد كلمة #${index + 1}`, (m) => (emphasis === e.kind ? ops.clearEmphasis(m, index) : ops.setEmphasis(m, index, e.kind)), { coalesce: false })}>
              {e.label}
            </button>
          );
        })}
        {word.confidence !== null ? <Badge text={`ثقة ${Math.round(word.confidence * 100)}%`} tone={word.confidence < 0.6 ? "warn" : undefined} title="ثقة التفريغ الصوتي" /> : null}
      </div>
    </div>
  );
});



type ViewGroup = {
  n: number;
  fromFrame: number;
  toFrame: number;
  indices: number[];
  words: SourceWord[];
  editedFrom: (number | null)[];
  emphasis: (CaptionEmphasisKind | undefined)[];
};

type GroupProps = {
  g: ViewGroup;
  fps: number;
  active: boolean;
  activeWord: number;
  selectedWord: number;
  staticStyle: boolean;
  lastIndex: number;
  run: Runner;
  seek: (frame: number) => void;
  select: (s: Selection) => void;
  onMessage: (text: string) => void;
};

const GroupCard = memo(function GroupCard({ g, fps, active, activeWord, selectedWord, staticStyle, lastIndex, run, seek, select, onMessage }: GroupProps) {
  return (
    <div className={`cp-group${active ? " active" : ""}`} data-active={active || undefined}>
      <button type="button" className="cp-group-head" dir="ltr" title="روح لأول الجملة دي" onClick={() => { select({ kind: "word", index: g.indices[0] }); seek(g.fromFrame); }}>
        <span>{formatTimecode(g.fromFrame, fps)}</span><span>→</span><span>{formatTimecode(g.toFrame, fps)}</span>
        <span className="cp-len">{g.toFrame - g.fromFrame}f</span>
      </button>
      {g.indices.map((sourceIndex, k) => (
        <WordRow
          key={sourceIndex} word={g.words[k]} index={sourceIndex} fps={fps} emphasis={g.emphasis[k]} staticStyle={staticStyle}
          editedFrom={g.editedFrom[k]} selected={selectedWord === sourceIndex} playing={activeWord === sourceIndex} isLast={sourceIndex === lastIndex}
          run={run} seek={seek} select={select} onMessage={onMessage}
        />
      ))}
    </div>
  );
});



export const CaptionsPanel: React.FC<PanelProps> = ({ manifest, apply, playhead, seek, selection, select, issues }) => {
  const { notice, show, clear } = useNotice();
  const run = useRunner(apply, show);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [hiddenLimit, setHiddenLimit] = useState(HIDDEN_PAGE);
  const [follow, setFollow] = useState(true);
  const [reviewer, setReviewer] = useState(manifest.captions.reviewer ?? "");
  const listRef = useRef<HTMLDivElement>(null);
  const fps = manifest.source.fps;
  const words = manifest.captions.words;
  const compiled = tryCompile(manifest);
  const staticStyle = (STATIC_CAPTION_STYLES as readonly string[]).includes(manifest.style);
  const emphasis = useMemo(() => emphasisBySource(manifest.captions.emphasis), [manifest.captions.emphasis]);
  const q = query.trim().toLowerCase();
  const message = useCallback((text: string) => show({ kind: "error", text }), [show]);


  const groups = useMemo<ViewGroup[]>(() => {
    const raw: { fromFrame: number; toFrame: number; indices: number[]; edited: (number | null)[] }[] = [];
    if (compiled.ok) {
      for (const g of compiled.compiled.captionGroups) {
        raw.push({ fromFrame: g.fromFrame, toFrame: g.toFrame, indices: g.words.map((w) => w.sourceIndex), edited: g.words.map((w) => w.fromFrame as number | null) });
      }
    } else {
      for (let i = 0; i < words.length; i += 4) {
        const idx = words.slice(i, i + 4).map((_, k) => i + k);
        const start = sourceMsToEditFrame(words[i].startMs, manifest) ?? 0;
        raw.push({ fromFrame: start, toFrame: start + 1, indices: idx, edited: idx.map((j) => sourceMsToEditFrame(words[j].startMs, manifest)) });
      }
    }
    return raw.map((g, n) => ({ n, fromFrame: g.fromFrame, toFrame: g.toFrame, indices: g.indices, words: g.indices.map((k) => words[k]), editedFrom: g.edited, emphasis: g.indices.map((k) => emphasis.get(k)) }));
  }, [compiled, words, manifest, emphasis]);
  const hidden = compiled.ok ? compiled.compiled.omittedWordIndices : [];

  const shown = useMemo(() => (q ? groups.filter((g) => g.indices.some((i) => words[i].text.toLowerCase().includes(q))) : groups), [groups, q, words]);
  const activeGroup = groups.findIndex((g) => playhead >= g.fromFrame && playhead < g.toFrame);
  const selectedWord = selection?.kind === "word" ? selection.index : -1;




  const activePos = follow && !q && activeGroup >= 0 ? shown.findIndex((g) => g.n === activeGroup) : -1;
  const selectedPos = selectedWord >= 0 ? shown.findIndex((g) => g.indices.includes(selectedWord)) : -1;
  useEffect(() => {
    const next = ops.growLimit(limit, PAGE, activePos, selectedPos);
    if (next !== limit) setLimit(next);
  }, [activePos, selectedPos, limit]);



  const scrolledTo = useRef(-1);
  useEffect(() => {
    if (!follow || activeGroup < 0 || q) {
      scrolledTo.current = -1;
      return;
    }
    if (scrolledTo.current === activeGroup) return;
    const root = listRef.current;
    if (!root || root.contains(document.activeElement)) return;
    const row = root.querySelector<HTMLElement>("[data-active]");
    if (!row) return;
    scrolledTo.current = activeGroup;
    row.scrollIntoView({ block: "nearest" });
  }, [activeGroup, follow, q, limit]);

  const selectionScrolled = useRef(-1);
  useEffect(() => {
    if (selectedWord < 0) {
      selectionScrolled.current = -1;
      return;
    }
    if (selectionScrolled.current === selectedWord) return;
    const root = listRef.current;
    if (!root) return;
    if (root.contains(document.activeElement)) {
      selectionScrolled.current = selectedWord;
      return;
    }
    const row = root.querySelector<HTMLElement>(`#cp-word-${selectedWord}`);
    if (!row) return;
    selectionScrolled.current = selectedWord;
    row.scrollIntoView({ block: "nearest" });
  }, [selectedWord, limit]);

  const captionIssues = issues.filter((i) => i.path === "captions" || i.path.startsWith("captions."));
  const reviewed = manifest.captions.status === "reviewed";
  const activeWordIndex = (g: ViewGroup) => {
    if (!compiled.ok) return -1;
    const hit = compiled.compiled.words.find((w) => g.indices.includes(w.sourceIndex) && playhead >= w.fromFrame && playhead < w.toFrame);
    return hit ? hit.sourceIndex : -1;
  };

  if (!words.length) {
    return <div className="pad cp"><Empty>مفيش كلمات في الكابشن لسه. الكابشن بيتحط من تفريغ الصوت (transcript) وقت التحضير، مش من هنا.</Empty></div>;
  }

  return (
    <div className="cp" dir="rtl">
      <div className="cp-top">
        <input className="cp-search" type="search" dir="auto" value={query} placeholder="ابحث في الكابشن…" aria-label="بحث في الكابشن"
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        <span className="pk-muted" dir="ltr">{q ? `${shown.length} جملة` : `${words.length} كلمة · ${groups.length} جملة`}</span>
        <label className="cp-follow"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> تابع الـ playhead</label>
        <NoticeBar notice={notice} onClose={clear} />
      </div>

      <Section title="المراجعة والإزاحة">
        <div className="cp-review">
          <Badge text={reviewed ? `reviewed · ${manifest.captions.reviewer ?? ""}` : "draft"} tone={reviewed ? undefined : "warn"} />
          <input dir="auto" placeholder="اسم الـ reviewer" value={reviewer} aria-label="اسم الـ reviewer" onChange={(e) => setReviewer(e.target.value)} />
          <button type="button" disabled={!reviewer.trim()} title="علّم الكابشن إنك راجعته بنفسك (ده شرط للتصدير النهائي)"
            onClick={() => run("مراجعة الكابشن", (m) => ops.setCaptionReview(m, { status: "reviewed", reviewer }), { coalesce: false })}>علّمه reviewed</button>
          {reviewed ? <button type="button" onClick={() => run("رجوع الكابشن draft", (m) => ops.setCaptionReview(m, { status: "draft" }), { coalesce: false })}>رجّعه draft</button> : null}
        </div>
        <div className="cp-shift" dir="ltr">
          <span title="بيحرّك كل كلمات الكابشن مع بعض">إزاحة الكل</span>
          <button type="button" onClick={() => run("إزاحة الكابشن", (m) => ops.shiftAllCaptions(m, { frames: -5 }), { coalesce: "captions:shift" })}>−5f</button>
          <button type="button" onClick={() => run("إزاحة الكابشن", (m) => ops.shiftAllCaptions(m, { frames: -1 }), { coalesce: "captions:shift" })}>−1f</button>
          <button type="button" onClick={() => run("إزاحة الكابشن", (m) => ops.shiftAllCaptions(m, { frames: 1 }), { coalesce: "captions:shift" })}>+1f</button>
          <button type="button" onClick={() => run("إزاحة الكابشن", (m) => ops.shiftAllCaptions(m, { frames: 5 }), { coalesce: "captions:shift" })}>+5f</button>
        </div>
        {captionIssues.length ? (
          <ul className="cp-issues">
            {captionIssues.slice(0, 4).map((i, n) => <li key={`${i.code}-${n}`} className={i.severity}>{i.where}: {i.message}</li>)}
            {captionIssues.length > 4 ? <li className="pk-muted">و {captionIssues.length - 4} كمان…</li> : null}
          </ul>
        ) : null}
        {!compiled.ok ? <div className="pk-notice error">توقيت الكابشن بعد القص فيه مشكلة ({compiled.error}). صلّح توقيت الكلمات أو حدود القص.</div> : null}
      </Section>

      <div className="cp-list" ref={listRef}>
        {shown.length === 0 ? <Empty>مفيش نتيجة لـ «{query}».</Empty> : null}
        {shown.slice(0, limit).map((g) => (
          <GroupCard
            key={g.indices[0]} g={g} fps={fps} active={g.n === activeGroup} activeWord={g.n === activeGroup ? activeWordIndex(g) : -1}
            selectedWord={g.indices.includes(selectedWord) ? selectedWord : -1} staticStyle={staticStyle} lastIndex={words.length - 1}
            run={run} seek={seek} select={select} onMessage={message}
          />
        ))}
        {shown.length > limit ? <button type="button" className="cp-more" onClick={() => setLimit(limit + PAGE)}>اعرض {Math.min(PAGE, shown.length - limit)} جملة كمان ({shown.length - limit} متبقية)</button> : null}
      </div>

      {hidden.length ? (
        <details className="cp-hidden">
          <summary>{hidden.length} كلمة مقصوصة بالكامل (مش ظاهرة في الفيديو)</summary>
          <p className="pk-muted">دي كلمات لسه في الكابشن بس القص شالها من الفيديو. لو رجّعت الجزء ده هترجع.</p>
          {hidden.slice(0, hiddenLimit).map((i) => (
            <WordRow
              key={i} word={words[i]} index={i} fps={fps} emphasis={emphasis.get(i)} staticStyle={staticStyle} editedFrom={null}
              selected={selectedWord === i} playing={false} isLast={i === words.length - 1} run={run} seek={seek} select={select} onMessage={message}
            />
          ))}
          {hidden.length > hiddenLimit ? <button type="button" className="cp-more" onClick={() => setHiddenLimit(hiddenLimit + HIDDEN_PAGE)}>اعرض {Math.min(HIDDEN_PAGE, hidden.length - hiddenLimit)} كلمة كمان ({hidden.length - hiddenLimit} متبقية)</button> : null}
        </details>
      ) : null}
    </div>
  );
};
