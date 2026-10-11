// SPDX-License-Identifier: MIT
// Reusable primitive from the original Reel Studio editing engine.
export type RampSegment = { fromF: number; toF: number; rate: number };
export type FreezeSpec = { atFrame: number; durF: number };
export type FreezePush = { scale: number; ax?: number; ay?: number; pushF?: number };
export type Size = { width: number; height: number };
export type CropRect = { x: number; y: number; width: number; height: number };
export type FreezePhase = "before" | "hold" | "after";
export type BadgeRate = number | "hold";
export type BadgeState = { show: boolean; rate: BadgeRate; sinceFrame: number; fresh: boolean };
export type SpeedPlan = {
  src: string;
  segments: readonly RampSegment[];

  trimBefore?: number;

  speechPlates?: readonly string[];

  speechRanges?: readonly (readonly [number, number])[];

  allowSlow?: boolean;

  sourceStep?: number;

  realFps?: number;

  fps?: number;
};

export const MIN_RATE = 1;
export const MAX_RATE = 8;
export const SLOW_DENOMINATORS: readonly number[] = [2, 3, 4];
export const MAX_SEGMENTS = 64;
export const MAX_PUSH_SCALE = 1.3;
export const MAX_FREEZE_F = 300;

export const SLOW_REAL_FPS_TOLERANCE = 0.9;

export const SPEECH_PLATE_PATTERNS: readonly RegExp[] = [/^_prepared\//, /^_editor\//, /(^|\/)th-[^/]*$/, /(^|\/)fg-[^/]*$/];

export const normalizePlate = (src: string): string => src.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "");

export const isSpeechPlate = (src: string, speechPlates: readonly string[] = []): boolean => {
  const name = normalizePlate(src);
  return speechPlates.map(normalizePlate).includes(name) || SPEECH_PLATE_PATTERNS.some((re) => re.test(name));
};

export const formatRate = (rate: number): string => `x${Number.isInteger(rate) ? rate : Number(rate.toFixed(2))}`;

export const constantSegments = (rate: number, outFrames: number): RampSegment[] => [{ fromF: 0, toF: outFrames, rate }];

export const sourceFrameAt = (outFrame: number, segments: readonly RampSegment[]): number => {
  if (!segments.length) throw new Error("sourceFrameAt: no segments");
  const f = Math.max(0, outFrame);
  let acc = 0;
  for (const s of segments) {
    if (f < s.toF) return acc + (f - s.fromF) * s.rate;
    acc += (s.toF - s.fromF) * s.rate;
  }
  const last = segments[segments.length - 1];
  return acc + (f - last.toF) * last.rate;
};

export const segmentAt = (outFrame: number, segments: readonly RampSegment[]): RampSegment => {
  if (!segments.length) throw new Error("segmentAt: no segments");
  return segments.find((s) => outFrame < s.toF) ?? segments[segments.length - 1];
};

export const rampTotals = (segments: readonly RampSegment[]): { outFrames: number; sourceFrames: number } => {
  const outFrames = segments.length ? segments[segments.length - 1].toF : 0;
  return { outFrames, sourceFrames: segments.length ? sourceFrameAt(outFrames, segments) : 0 };
};

export const outFramesFor = (sourceFrames: number, rate: number): number => Math.ceil(sourceFrames / rate - 1e-9);

export const parseSegments = (spec: string): RampSegment[] => {
  const out: RampSegment[] = [];
  let at = 0;
  for (const token of spec.split(",").map((t) => t.trim()).filter(Boolean)) {
    const m = /^(\d+):(\d+)(?:\/(\d+))?$/.exec(token);
    if (!m || Number(m[1]) < 1 || Number(m[2]) < 1 || (m[3] !== undefined && Number(m[3]) < 1)) {
      throw new Error(`bad segment "${token}" — expected <outFrames>:<rate>, e.g. 30:4 or 45:1/2`);
    }
    const frames = Number(m[1]);
    const rate = m[3] === undefined ? Number(m[2]) : Number(m[2]) / Number(m[3]);
    out.push({ fromF: at, toF: at + frames, rate });
    at += frames;
  }
  if (!out.length) throw new Error("no segments — pass e.g. --segments 30:2,30:8,30:2");
  return out;
};

const rateErrors = (rate: number, i: number, plan: SpeedPlan): string[] => {
  if (!Number.isFinite(rate) || rate <= 0) return [`segment ${i}: rate must be a positive number (got ${rate})`];
  if (rate >= MIN_RATE) {
    if (!Number.isInteger(rate) || rate > MAX_RATE) {
      return [`segment ${i}: speed-ups are whole rates ${MIN_RATE}..${MAX_RATE} (got ${rate}) — a fractional rate picks source frames at an uneven step and reads as judder (rule 14)`];
    }
    return [];
  }
  const n = Math.round(1 / rate);
  if (Math.abs(1 / rate - n) > 1e-9 || !SLOW_DENOMINATORS.includes(n)) return [`segment ${i}: slow-downs are 1/2, 1/3 or 1/4 (got ${rate})`];
  if (!plan.allowSlow) {
    return [`segment ${i}: ${formatRate(rate)} slows the plate — speed-ups only by default; slowing 30-real footage just duplicates frames (rule 14)`];
  }
  const out: string[] = [];
  if (plan.sourceStep !== undefined && Number.isInteger(plan.sourceStep) && plan.sourceStep % n !== 0) {
    out.push(`segment ${i}: 1/${n} needs a plate with a multiple of ${n} source frames per output frame (this plate has ${plan.sourceStep})`);
  }
  if (plan.realFps !== undefined && plan.fps !== undefined && plan.realFps < SLOW_REAL_FPS_TOLERANCE * plan.fps * n) {
    out.push(`segment ${i}: 1/${n} at ${plan.fps} fps needs ${plan.fps * n} real frames per second; mpdecimate measured ${plan.realFps.toFixed(1)} (rule 14)`);
  }
  return out;
};

export const validateSpeedPlan = (plan: SpeedPlan): string[] => {
  const errors: string[] = [];
  const { segments } = plan;
  if (isSpeechPlate(plan.src, plan.speechPlates)) {
    errors.push(`${normalizePlate(plan.src)} is a speech/presenter plate — a retimed insert must never carry his speech or his on-camera delivery (CLAUDE.md rule 5)`);
  }
  if (!segments.length) errors.push("a speed plan needs at least one segment");
  if (segments.length > MAX_SEGMENTS) errors.push(`at most ${MAX_SEGMENTS} segments (got ${segments.length})`);
  let expect = 0;
  segments.forEach((s, i) => {
    if (!Number.isInteger(s.fromF) || !Number.isInteger(s.toF) || s.fromF !== expect || s.toF <= s.fromF) {
      errors.push(`segment ${i} must be whole frames starting at ${expect} with toF > fromF (got ${s.fromF}..${s.toF})`);
    }
    expect = s.toF;
    errors.push(...rateErrors(s.rate, i, plan));
  });
  if (plan.trimBefore !== undefined && (!Number.isInteger(plan.trimBefore) || plan.trimBefore < 0)) {
    errors.push(`trimBefore must be a whole frame >= 0 (got ${plan.trimBefore})`);
  }
  if (plan.sourceStep !== undefined && (!Number.isInteger(plan.sourceStep) || plan.sourceStep < 1)) {
    errors.push(`plate fps / composition fps must be a whole number (got ${plan.sourceStep}) — conform the plate first (rule 14)`);
  }
  if (!errors.length && plan.speechRanges?.length && plan.trimBefore !== undefined) {
    const from = plan.trimBefore;
    const to = from + rampTotals(segments).sourceFrames;
    for (const [a, b] of plan.speechRanges) {
      if (from < b && a < to) errors.push(`source frames ${from}..${to} overlap the speech range ${a}..${b} — he is on camera there (rule 5)`);
    }
  }
  return errors;
};

const onGrid = (v: number, what: string): number => {
  const r = Math.round(v);
  if (Math.abs(v - r) > 1e-6) throw new Error(`${what} lands between source frames (${v}) — the plan is not on the plate's frame grid`);
  return r;
};

export const sourceIndices = (segments: readonly RampSegment[], step = 1): number[] => {
  const { outFrames } = rampTotals(segments);
  const out: number[] = [];
  for (let k = 0; k < outFrames; k++) out.push(onGrid(step * sourceFrameAt(k, segments), `output frame ${k}`));
  return out;
};

export const rampSelectExpr = (segments: readonly RampSegment[], step = 1): string =>
  segments
    .map((s) => {
      const a = onGrid(step * sourceFrameAt(s.fromF, segments), `segment start ${s.fromF}`);
      const b = onGrid(step * sourceFrameAt(s.toF, segments), `segment end ${s.toF}`);
      const pick = onGrid(step * s.rate, `step of segment ${s.fromF}..${s.toF}`);
      return `between(n,${a},${b - 1})*not(mod(n-${a},${pick}))`;
    })
    .join("+");

export const freezeMap = (frame: number, atFrame: number, durF: number): { phase: FreezePhase; childFrame: number; holdElapsed: number } => {
  if (frame < atFrame) return { phase: "before", childFrame: frame, holdElapsed: 0 };
  if (frame < atFrame + durF) return { phase: "hold", childFrame: atFrame, holdElapsed: frame - atFrame };
  return { phase: "after", childFrame: frame - durF, holdElapsed: durF };
};

export const validateFreeze = (spec: FreezeSpec & { push?: FreezePush }, outFrames?: number): string[] => {
  const errors: string[] = [];
  if (!Number.isInteger(spec.atFrame) || spec.atFrame < 0) errors.push(`freeze atFrame must be a whole frame >= 0 (got ${spec.atFrame})`);
  if (outFrames !== undefined && spec.atFrame >= outFrames) errors.push(`freeze atFrame ${spec.atFrame} is past the insert's ${outFrames} frames`);
  if (!Number.isInteger(spec.durF) || spec.durF < 1 || spec.durF > MAX_FREEZE_F) errors.push(`freeze durF must be a whole frame count 1..${MAX_FREEZE_F} (got ${spec.durF})`);
  const p = spec.push;
  if (p) {
    if (!(p.scale >= 1 && p.scale <= MAX_PUSH_SCALE)) errors.push(`push scale must be 1..${MAX_PUSH_SCALE} (got ${p.scale})`);
    for (const [k, v] of [["ax", p.ax], ["ay", p.ay]] as const) if (v !== undefined && !(v >= 0 && v <= 1)) errors.push(`push ${k} must be 0..1 (got ${v})`);
    if (p.pushF !== undefined && (!Number.isInteger(p.pushF) || p.pushF < 1)) errors.push(`push pushF must be a whole frame count >= 1 (got ${p.pushF})`);
  }
  return errors;
};

export const speedInsertFrames = (segments: readonly RampSegment[], freeze?: FreezeSpec): number =>
  rampTotals(segments).outFrames + (freeze ? freeze.durF : 0);

const rawBadge = (frame: number, segments: readonly RampSegment[], freeze?: FreezeSpec): Omit<BadgeState, "fresh"> => {
  const m = freeze ? freezeMap(frame, freeze.atFrame, freeze.durF) : { phase: "before" as FreezePhase, childFrame: frame, holdElapsed: 0 };
  if (freeze && m.phase === "hold") return { show: true, rate: "hold", sinceFrame: freeze.atFrame };
  const seg = segmentAt(m.childFrame, segments);
  let since = !freeze || seg.fromF < freeze.atFrame ? seg.fromF : seg.fromF + freeze.durF;
  if (freeze && m.phase === "after") since = Math.max(since, freeze.atFrame + freeze.durF);
  return { show: seg.rate !== 1, rate: seg.rate, sinceFrame: since };
};

export const badgeStateAt = (frame: number, segments: readonly RampSegment[], freeze?: FreezeSpec): BadgeState => {
  const s = rawBadge(frame, segments, freeze);
  const prev = s.sinceFrame > 0 ? rawBadge(s.sinceFrame - 1, segments, freeze) : null;
  return { ...s, fresh: !prev || !prev.show };
};

export const insertGeometry = (win: Size, source: Size, crop: CropRect = { x: 0, y: 0, width: 1, height: 1 }) => {
  const bad = crop.width <= 0 || crop.height <= 0 || crop.x < 0 || crop.y < 0 || crop.x + crop.width > 1 + 1e-9 || crop.y + crop.height > 1 + 1e-9;
  if (bad) throw new Error(`insertGeometry: crop must lie inside the plate (0..1), got ${JSON.stringify(crop)}`);
  const scale = Math.max(win.width / (crop.width * source.width), win.height / (crop.height * source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const cx = (crop.x + crop.width / 2) * source.width * scale;
  const cy = (crop.y + crop.height / 2) * source.height * scale;
  const left = Math.round(Math.min(0, Math.max(win.width - width, win.width / 2 - cx)));
  const top = Math.round(Math.min(0, Math.max(win.height - height, win.height / 2 - cy)));
  return { left, top, width, height, scale };
};
