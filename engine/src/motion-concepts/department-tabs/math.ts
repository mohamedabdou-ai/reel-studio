import { EASE, clamp01, mix } from "../../core/motion.ts";
import { SURFACE_INSET, mainBottom, mirrorX, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, seg, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



export const TABS_MIN = 3;
export const TABS_MAX = 5;
export const EXAMPLES_MIN = 2;
export const EXAMPLES_MAX = 3;


export const PILL_INSET = 8;




const ENTER = 0.12;
const HOLD_ONCE = 0.24;

const HOLD_LOOP = 0.22;

const STEP = 0.09;

const assertTabCount = (n: number): void => {
  if (!Number.isInteger(n) || n < TABS_MIN || n > TABS_MAX) {
    throw new RangeError(`department-tabs: ${TABS_MIN}..${TABS_MAX} tabs, got ${String(n)}`);
  }
};


export const specFor = (mode: ConceptMode, n: number): BeatSpec<string> => {
  assertTabCount(n);
  const spec: Record<string, readonly [number, number]> = {};
  if (mode === "once") {
    const holdFrom = 1 - HOLD_ONCE;

    const free = (1 - ENTER - HOLD_ONCE) / (n - 1) - STEP;
    spec.enter = [0, ENTER];
    for (let k = 1; k < n; k++) {
      if (k === n - 1) spec[`step${k}`] = [holdFrom - STEP, holdFrom];
      else {
        const from = ENTER + free + (k - 1) * (free + STEP);
        spec[`step${k}`] = [from, from + STEP];
      }
    }
    spec.hold = [holdFrom, 1];
  } else {

    const free = (1 - HOLD_LOOP - n * STEP) / (n - 1);
    spec.hold = [0, HOLD_LOOP];
    for (let k = 1; k <= n; k++) {
      if (k === n) spec.wrap = [1 - STEP, 1];
      else {
        const from = HOLD_LOOP + (k - 1) * (free + STEP);
        spec[`step${k}`] = [from, from + STEP];
      }
    }
  }
  return spec;
};


export const rulesFor = (mode: ConceptMode, n: number): BeatRules<string> => {
  const forward = Array.from({ length: n - 1 }, (_, i) => `step${i + 1}`);
  return mode === "once"
    ? { hold: "hold", holdAtEnd: true, order: ["enter", ...forward, "hold"] }
    : { hold: "hold", holdAtEnd: false, order: ["hold", ...forward, "wrap"] };
};

export type BeatSet = Beats<string>;


export const beatsFor = (mode: ConceptMode, duration: number, n: number): BeatSet => beatFrames(specFor(mode, n), duration);






export const modeIssues = (mode: ConceptMode, duration: number, n: number): string[] => {
  const beats = beatsFor(mode, duration, n);
  const issues = beatIssues(beats, duration, rulesFor(mode, n));
  const stepNames = Object.keys(beats).filter((k) => k.startsWith("step") || k === "wrap");
  const ordered = stepNames.map((k) => beats[k]);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].from < ordered[i - 1].to) issues.push(`${stepNames[i]} overlaps ${stepNames[i - 1]}`);
  }
  if (mode === "once") {
    if (beats.enter.to > ordered[0].from) issues.push("the first step starts before the entrance ends");
    if (ordered[ordered.length - 1].to !== beats.hold.from) issues.push("the last step must end where the hold starts");
  } else {
    if (ordered[0].from !== beats.hold.to) issues.push("the first step must start where the hold ends");
    if (beats.wrap.to !== duration) issues.push("the wrap must end on the last frame");
  }
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number, n: number): number => beatsFor(mode, duration, n).hold.from;


const validFrom = (mode: ConceptMode, n: number): number => {
  let d = 1500;
  while (d > 30 && modeIssues(mode, d - 1, n).length === 0) d -= 1;
  return d;
};

export const MIN_VALID_FRAMES = Math.max(
  ...(["once", "loop"] as const).flatMap((mode) => Array.from({ length: TABS_MAX - TABS_MIN + 1 }, (_, i) => validFrom(mode, TABS_MIN + i))),
);






export const minFramesFor = (n: number): number => {
  assertTabCount(n);
  return 30 * n + 30;
};

export const MIN_FRAMES = minFramesFor(TABS_MAX);
export const DEFAULT_FRAMES = 240;



export type RowLayout = {

  card: Rect;
  icon: Rect;
  text: Rect;

  divider: Rect | null;
};

export type Layout = {

  window: Rect;

  strip: Rect;

  cells: Rect[];
  labels: Rect[];
  dots: Rect[];
  body: Rect;
  rows: Record<number, RowLayout[]>;
  rowH: number;

  track: { x: number; y: number; cellW: number; height: number };
};


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean; tabCount: number }): Layout => {
  assertTabCount(opts.tabCount);
  const n = opts.tabCount;
  const left = box.left + SURFACE_INSET;
  const top = box.top + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;

  const bottom = mainBottom(box) - SURFACE_INSET;
  const win: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  const W = win.width;
  const H = win.height;

  const at = (r: Rect): Rect => (opts.rtl ? mirrorX(roundRect(r), W) : roundRect(r));

  const pad = Math.round(W * 0.027);
  const stripH = Math.round(H * 0.158);
  const stripW = W - 2 * pad;
  const strip = { x: pad, y: pad, width: stripW, height: stripH };


  const cellW = stripW / n;
  const xs = Array.from({ length: n + 1 }, (_, i) => Math.round(pad + i * cellW));
  const cellsLtr = Array.from({ length: n }, (_, i): Rect => ({ x: xs[i], y: pad, width: xs[i + 1] - xs[i], height: stripH }));
  const labelH = Math.round(stripH * 0.56);
  const labelTop = pad + Math.round(stripH * 0.105);
  const dotS = Math.round(stripH * 0.167);
  const dotTop = pad + stripH - PILL_INSET - 8 - dotS;
  const labelsLtr = cellsLtr.map((c): Rect => ({ x: c.x + PILL_INSET, y: labelTop, width: c.width - 2 * PILL_INSET, height: labelH }));
  const dotsLtr = cellsLtr.map((c): Rect => ({ x: c.x + Math.round((c.width - dotS) / 2), y: dotTop, width: dotS, height: dotS }));

  const bodyTop = pad + stripH + Math.round(H * 0.038);
  const bodyBottom = H - pad;
  const body: Rect = { x: pad, y: bodyTop, width: stripW, height: bodyBottom - bodyTop };

  const rowH = Math.round(H * 0.24);
  const rowX = pad + Math.round(W * 0.018);
  const iconS = Math.round(rowH * 0.32);
  const textX = rowX + iconS + 28;
  const textPad = Math.round(rowH * 0.09);
  const rows: Record<number, RowLayout[]> = {};
  for (let count = EXAMPLES_MIN; count <= EXAMPLES_MAX; count++) {

    const groupTop = Math.round(bodyTop + (body.height - count * rowH) / 2);
    rows[count] = Array.from({ length: count }, (_, j): RowLayout => {
      const y = groupTop + j * rowH;
      return {
        card: at({ x: rowX, y, width: W - 2 * rowX, height: rowH }),
        icon: at({ x: rowX, y: y + (rowH - iconS) / 2, width: iconS, height: iconS }),
        text: at({ x: textX, y: y + textPad, width: W - rowX - textX, height: rowH - 2 * textPad }),
        divider: j < count - 1 ? at({ x: rowX, y: y + rowH - 2, width: W - 2 * rowX, height: 2 }) : null,
      };
    });
  }

  return {
    window: win,
    strip: at(strip),
    cells: cellsLtr.map(at),
    labels: labelsLtr.map(at),
    dots: dotsLtr.map(at),
    body: at(body),
    rows,
    rowH,
    track: { x: pad, y: pad + PILL_INSET, cellW, height: stripH - 2 * PILL_INSET },
  };
};




const SLIDE = 0.55;
const WRAP_SLIDE = 0.7;
const TRAIL_DELAY = 0.09;
const OUT_END = 0.22;
const SWAP = 0.25;
const STEP_ROWS = 0.28;
const CLEAR_END = 0.45;

const ENTER_ROWS = 0.36;
const ROW_DY = 28;
const OUT_DY = 16;
const WINDOW_SCALE_FROM = 0.94;


const LINEAR = (p: number): number => p;

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`department-tabs stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};


const localU = (frame: number, beat: Beat): number => seg(frame, beat.from, beat.to, LINEAR);


const rowIn = (rowU: number, j: number): RowState => {
  const presence = seg(rowU, 0.11 * j, 0.11 * j + 0.47, EASE.land);
  const check = seg(rowU, 0.11 * j + 0.36, 0.11 * j + 0.69, EASE.inOut);
  return { presence, dy: mix(ROW_DY, 0, presence), check };
};



export type DepartmentTabsParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  counts: readonly number[];
};

export type TabState = {

  presence: number;

  dy: number;

  cover: number;

  dot: number;
};

export type RowState = {

  presence: number;

  dy: number;

  check: number;
};

export type DepartmentTabsState = {

  built: number;
  scale: number;

  left: number;
  right: number;

  active: number;

  pill: Rect;
  pillOpacity: number;
  tabs: TabState[];

  content: { tab: number; rows: RowState[] };

  window: Rect;

  rects: Rect[];
};

type Step = { beat: Beat; prev: number; next: number; wrap: boolean };

const stepsOf = (mode: ConceptMode, n: number, beats: BeatSet): Step[] => {
  const steps: Step[] = [];
  for (let k = 1; k < n; k++) steps.push({ beat: beats[`step${k}`], prev: k - 1, next: k, wrap: false });
  if (mode === "loop") steps.push({ beat: beats.wrap, prev: n - 1, next: 0, wrap: true });
  return steps;
};

export const stateAt = (frame: number, duration: number, params: DepartmentTabsParams): DepartmentTabsState => {
  finiteFrame(frame);
  const n = params.counts.length;
  assertTabCount(n);
  for (const c of params.counts) {
    if (!Number.isInteger(c) || c < EXAMPLES_MIN || c > EXAMPLES_MAX) {
      throw new RangeError(`department-tabs: ${EXAMPLES_MIN}..${EXAMPLES_MAX} examples per tab, got ${String(c)}`);
    }
  }
  const L = layoutFor(params.box, { rtl: params.rtl, tabCount: n });
  const B = beatsFor(params.mode, duration, n);
  const steps = stepsOf(params.mode, n, B);
  const once = params.mode === "once";


  const uE = once ? localU(frame, B.enter) : 1;
  const built = once ? seg(uE, 0, 0.5, EASE.land) : 1;
  const pillOpacity = once ? seg(uE, 0.3, 0.6, EASE.land) : 1;


  let left = 0;
  let right = 1;
  let clear = 0;
  const trails: number[] = [];
  for (const s of steps) {
    const u = localU(frame, s.beat);
    const span = s.wrap ? WRAP_SLIDE : SLIDE;
    const lead = seg(u, 0, span, EASE.inOut);
    const trail = seg(u, TRAIL_DELAY, span + TRAIL_DELAY, EASE.inOut);
    if (s.wrap) {

      left -= (n - 1) * lead;
      right -= (n - 1) * trail;
      clear = seg(u, 0, CLEAR_END, EASE.inOut);
    } else {
      left += trail;
      right += lead;
      trails.push(trail);
    }
  }

  const tabs: TabState[] = Array.from({ length: n }, (_, i) => {
    const presence = once ? seg(uE, 0.1 + 0.05 * i, 0.4 + 0.05 * i, EASE.land) : 1;
    const cover = clamp01(Math.min(right, i + 1) - Math.max(left, i));

    const raw = i < n - 1 ? trails[i] : 0;
    return { presence, dy: mix(14, 0, presence), cover, dot: raw * (1 - clear) * (1 - cover) };
  });


  let started: Step | null = null;
  for (const s of steps) if (frame >= s.beat.from) started = s;
  let tab = 0;
  let rows: RowState[];
  if (started === null) {
    const rowU = once ? seg(uE, ENTER_ROWS, 1, LINEAR) : 1;
    rows = [0, 1, 2].map((j) => rowIn(rowU, j));
  } else {
    const u = localU(frame, started.beat);
    if (u < SWAP) {

      tab = started.prev;
      const out = seg(u, 0, OUT_END, EASE.out);
      rows = [0, 1, 2].map(() => ({ presence: 1 - out, dy: mix(0, -OUT_DY, out), check: 1 }));
    } else {
      tab = started.next;
      const rowU = seg(u, STEP_ROWS, 1, LINEAR);
      rows = [0, 1, 2].map((j) => rowIn(rowU, j));
    }
  }


  const pl = Math.round(L.track.x + left * L.track.cellW + PILL_INSET);
  const pr = Math.round(L.track.x + right * L.track.cellW - PILL_INSET);
  const pillLtr: Rect = { x: pl, y: L.track.y, width: pr - pl, height: L.track.height };
  const pill = params.rtl ? mirrorX(pillLtr, L.window.width) : pillLtr;
  const active = Math.min(n - 1, Math.max(0, Math.round((left + right) / 2 - 0.5)));


  const scale = built >= 1 ? 1 : mix(WINDOW_SCALE_FROM, 1, built);
  const cx = L.window.x + L.window.width / 2;
  const cy = L.window.y + L.window.height / 2;
  const win = roundRect({ x: cx - (L.window.width * scale) / 2, y: cy - (L.window.height * scale) / 2, width: L.window.width * scale, height: L.window.height * scale });

  const abs = (r: Rect, dy = 0): Rect => ({ x: L.window.x + r.x, y: L.window.y + r.y + dy, width: r.width, height: r.height });
  const rects: Rect[] = [win];
  L.cells.forEach((c, i) => {
    if (tabs[i].presence > 0) rects.push(abs(c, tabs[i].dy));
  });
  if (pillOpacity > 0) rects.push(abs(pill));
  L.rows[params.counts[tab]].forEach((r, j) => {
    if (rows[j].presence > 0) rects.push(abs(r.card, rows[j].dy));
  });

  return { built, scale, left, right, active, pill, pillOpacity, tabs, content: { tab, rows }, window: win, rects };
};
