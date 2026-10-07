import path from 'node:path';

export const REDACT_VERSION = 1;
export const REDACT_MODES = Object.freeze(['pixelize', 'blur']);
export const MAX_RECTS = 32;
export const MAX_KEYS = 240;
export const MIN_SIDE = 8;

export const REDACTED_MAX_RATIO = 0.35;

export const FLAT_GRADIENT = 2;
export const REDACT_OUTPUT_LABEL = 'vout';
export const REDACT_ENCODE = Object.freeze({codec: 'libx264', preset: 'medium', crf: 10, pixFmt: 'yuv420p'});

const RECT_FIELDS = new Set(['x', 'y', 'width', 'height', 'fromSec', 'toSec', 'mode', 'keys', 'label']);
const KEY_FIELDS = new Set(['t', 'x', 'y']);
const floor2 = (v) => 2 * Math.floor(v / 2);
const ceil2 = (v) => 2 * Math.ceil(v / 2);
const round6 = (v) => { const r = Number(v.toFixed(6)); return Object.is(r, -0) ? 0 : r; };


export function exprNumber(value) {
  const r = round6(value);
  return r < 0 ? `(${r})` : String(r);
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

export function validateVideo(video) {
  const {width, height, fps} = video ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width % 2 || height % 2) {
    throw new Error(`Source frame must have even integer dimensions of at least 16 px (got ${width}x${height}).`);
  }
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0 || fps > 240) throw new Error(`video.fps must be in (0, 240] (got ${fps}).`);
  return {width, height, fps};
}

function normalizeRect(rect, index, video) {
  const at = `rects[${index}]`;
  if (!rect || typeof rect !== 'object' || Array.isArray(rect)) throw new Error(`${at} must be an object.`);
  for (const key of Object.keys(rect)) if (!RECT_FIELDS.has(key)) throw new Error(`${at} has unknown field "${key}".`);
  const x = round6(finite(rect.x, `${at}.x`));
  const y = round6(finite(rect.y, `${at}.y`));
  const width = finite(rect.width, `${at}.width`);
  const height = finite(rect.height, `${at}.height`);
  if (width <= 0 || height <= 0) throw new Error(`${at} width and height must be positive.`);
  const fromSec = round6(finite(rect.fromSec, `${at}.fromSec`));
  const toSec = round6(finite(rect.toSec, `${at}.toSec`));
  if (fromSec < 0 || toSec <= fromSec) throw new Error(`${at} needs 0 <= fromSec < toSec.`);
  if (!REDACT_MODES.includes(rect.mode)) throw new Error(`${at}.mode must be one of ${REDACT_MODES.join(', ')}.`);
  if (rect.label !== undefined && (typeof rect.label !== 'string' || !rect.label.trim() || rect.label.length > 80)) {
    throw new Error(`${at}.label must be a non-empty string of at most 80 characters.`);
  }
  const path = [{t: fromSec, x, y}];
  if (rect.keys !== undefined) {
    if (!Array.isArray(rect.keys) || rect.keys.length < 1 || rect.keys.length > MAX_KEYS) throw new Error(`${at}.keys must hold 1-${MAX_KEYS} keyframes.`);
    rect.keys.forEach((key, k) => {
      const kat = `${at}.keys[${k}]`;
      if (!key || typeof key !== 'object' || Array.isArray(key)) throw new Error(`${kat} must be an object.`);
      for (const field of Object.keys(key)) if (!KEY_FIELDS.has(field)) throw new Error(`${kat} has unknown field "${field}".`);
      const point = {t: round6(finite(key.t, `${kat}.t`)), x: round6(finite(key.x, `${kat}.x`)), y: round6(finite(key.y, `${kat}.y`))};
      if (point.t <= path[path.length - 1].t || point.t > toSec) throw new Error(`${kat}.t must increase strictly after fromSec and stay <= toSec.`);
      path.push(point);
    });
  }
  let size;
  let fixed = null;
  if (path.length === 1) {
    const x0 = Math.max(0, floor2(x));
    const y0 = Math.max(0, floor2(y));
    size = {width: Math.min(video.width, ceil2(x + width)) - x0, height: Math.min(video.height, ceil2(y + height)) - y0};
    fixed = {x: x0, y: y0};
  } else {
    if (!path.some((p) => p.x < video.width && p.x + width > 0 && p.y < video.height && p.y + height > 0)) {
      throw new Error(`${at} never overlaps the ${video.width}x${video.height} frame.`);
    }
    size = {width: Math.min(video.width, ceil2(width) + 2), height: Math.min(video.height, ceil2(height) + 2)};
  }
  if (size.width < MIN_SIDE || size.height < MIN_SIDE) {
    throw new Error(`${at} covers less than ${MIN_SIDE}x${MIN_SIDE} px inside the ${video.width}x${video.height} frame.`);
  }
  const pad = 0.5 / video.fps;
  return {
    index, mode: rect.mode, label: rect.label ?? null, fromSec, toSec,
    window: {from: round6(Math.max(0, fromSec - pad)), to: round6(toSec + pad)},
    size, fixed, path,
    limit: {x: video.width - size.width, y: video.height - size.height},
  };
}

export function validateRects(rects, video) {
  const v = validateVideo(video);
  if (!Array.isArray(rects) || rects.length < 1 || rects.length > MAX_RECTS) throw new Error(`rects must hold 1-${MAX_RECTS} redaction rectangles.`);
  return rects.map((rect, index) => normalizeRect(rect, index, v));
}


function pathPoint(path, t) {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (t < b.t) {
      const tt = i === 0 ? Math.max(t, a.t) : t;
      return {x: a.x + (b.x - a.x) * (tt - a.t) / (b.t - a.t), y: a.y + (b.y - a.y) * (tt - a.t) / (b.t - a.t)};
    }
  }
  const last = path[path.length - 1];
  return {x: last.x, y: last.y};
}


export function rectAt(rect, t) {
  const {width, height} = rect.size;
  if (rect.fixed) return {x: rect.fixed.x, y: rect.fixed.y, width, height};
  const p = pathPoint(rect.path, t);
  return {
    x: Math.max(0, Math.min(rect.limit.x, floor2(p.x))),
    y: Math.max(0, Math.min(rect.limit.y, floor2(p.y))),
    width, height,
  };
}

function axisExpr(rect, axis) {
  const p = rect.path;
  let inner = exprNumber(p[p.length - 1][axis]);
  for (let i = p.length - 2; i >= 0; i--) {
    const a = p[i];
    const b = p[i + 1];
    const tv = i === 0 ? `max(t,${exprNumber(a.t)})` : 't';
    inner = `if(lt(t,${exprNumber(b.t)}),${exprNumber(a[axis])}+(${exprNumber(b[axis])}-${exprNumber(a[axis])})*(${tv}-${exprNumber(a.t)})/(${exprNumber(b.t)}-${exprNumber(a.t)}),${inner})`;
  }
  return `max(0,min(${rect.limit[axis]},2*floor((${inner})/2)))`;
}

function effectFilter(rect) {
  const side = Math.min(rect.size.width, rect.size.height);
  if (rect.mode === 'pixelize') {
    const block = Math.min(48, Math.max(8, 2 * Math.floor(side / 4)));
    return `pixelize=width=${block}:height=${block}:mode=avg`;
  }

  const luma = Math.min(32, Math.floor(side / 2) - 1);
  const chroma = Math.max(1, Math.min(16, Math.floor(side / 4) - 1));
  return `boxblur=luma_radius=${luma}:luma_power=3:chroma_radius=${chroma}:chroma_power=3`;
}


export function buildRedactFilter(rects, video) {
  const list = validateRects(rects, video);
  const parts = [`[0:v]split=${list.length + 1}[rb]${list.map((_, i) => `[rs${i}]`).join('')}`];
  list.forEach((rect, i) => {
    const x = rect.fixed ? String(rect.fixed.x) : `'${axisExpr(rect, 'x')}'`;
    const y = rect.fixed ? String(rect.fixed.y) : `'${axisExpr(rect, 'y')}'`;
    parts.push(`[rs${i}]crop=w=${rect.size.width}:h=${rect.size.height}:x=${x}:y=${y},${effectFilter(rect)}[rp${i}]`);
    const main = i === 0 ? '[rb]' : `[ro${i - 1}]`;
    const out = i === list.length - 1 ? `[${REDACT_OUTPUT_LABEL}]` : `[ro${i}]`;
    parts.push(`${main}[rp${i}]overlay=x=${x}:y=${y}:format=auto:enable='between(t,${exprNumber(rect.window.from)},${exprNumber(rect.window.to)})'${out}`);
  });
  return parts.join(';');
}


export function verificationPoint(rect, fps) {
  const frame = Math.round(((rect.fromSec + rect.toSec) / 2) * fps);
  const box = rectAt(rect, frame / fps);
  return {
    frame, t: round6(frame / fps), seekSec: round6(Math.max(0, (frame - 0.5) / fps)),
    box: {x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4},
  };
}


export function meanAbsGradient(pixels, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new Error('Gradient needs a region of at least 2x2 pixels.');
  if (!pixels || pixels.length < width * height) throw new Error(`Gray frame has ${pixels?.length ?? 0} bytes; expected ${width * height}.`);
  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = pixels[y * width + x];
      if (x + 1 < width) { sum += Math.abs(pixels[y * width + x + 1] - p); count++; }
      if (y + 1 < height) { sum += Math.abs(pixels[(y + 1) * width + x] - p); count++; }
    }
  }
  return sum / count;
}

export function redactionVerdict(sourceGradient, outputGradient) {
  for (const [name, value] of [['sourceGradient', sourceGradient], ['outputGradient', outputGradient]]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
  }
  if (sourceGradient < FLAT_GRADIENT) return {verdict: 'NEEDS-REVIEW', ratio: null, reason: 'The source region is flat at the checked frame; open the verification PNG.'};
  const ratio = round6(outputGradient / sourceGradient);
  return ratio <= REDACTED_MAX_RATIO
    ? {verdict: 'REDACTED', ratio, reason: 'Detail inside the region was destroyed.'}
    : {verdict: 'NOT-REDACTED', ratio, reason: 'Readable detail survives inside the region.'};
}

export function redactOutputPath(relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.startsWith('/')
    || relative.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Use a project-relative output path with forward slashes: ${String(relative)}`);
  }
  if (!relative.toLowerCase().endsWith('.mp4')) throw new Error('Redacted plates are written as .mp4.');
  if (!/^Projects\/[a-z0-9][a-z0-9-]{0,63}\/.+/.test(relative) && !/^engine\/public\/_redacted\/.+/.test(relative)) {
    throw new Error('Redacted plates go under Projects/<slug>/ or engine/public/_redacted/.');
  }
  return relative;
}












export function classifyInputPath(value, root) {
  if (typeof value !== 'string' || !value) throw new Error('--in must be a non-empty path.');
  if (typeof root !== 'string' || !root) throw new Error('classifyInputPath needs a root.');
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved).split(path.sep).join('/');
  if (relative === '') throw new Error(`Path must be inside the project: ${value}`);
  const insideRoot = relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative) && !path.win32.isAbsolute(relative);
  if (insideRoot) return {external: false, relative};
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) return {external: true, absolute: resolved};
  throw new Error(`Path must be inside the project: ${value}`);
}

export function parseRectsDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document) || document.version !== 1 || !Array.isArray(document.rects)) {
    throw new Error('Rects file must be {"version": 1, "rects": [...]}.');
  }
  for (const key of Object.keys(document)) if (!['version', 'rects'].includes(key)) throw new Error(`Rects file has unknown field "${key}".`);
  return document.rects;
}


export function sameCadence(source, output) {
  const seconds = ({timeBase, pts}, label) => {
    const [num, den] = String(timeBase).split('/').map(Number);
    if (!(num > 0) || !(den > 0) || !Array.isArray(pts) || !pts.length || pts.some((p) => !Number.isFinite(p))) {
      throw new Error(`${label} packet timing is unreadable.`);
    }
    const sorted = [...pts].sort((a, b) => a - b);
    return sorted.map((p) => ((p - sorted[0]) * num) / den);
  };
  const a = seconds(source, 'Source');
  const b = seconds(output, 'Output');
  if (a.length !== b.length) return {ok: false, frames: b.length, maxDriftSec: null, reason: `frame count ${b.length} != source ${a.length}`};
  let maxDriftSec = 0;
  for (let i = 0; i < a.length; i++) maxDriftSec = Math.max(maxDriftSec, Math.abs(a[i] - b[i]));
  return maxDriftSec <= 1e-6
    ? {ok: true, frames: a.length, maxDriftSec, reason: 'same frame count and timestamps'}
    : {ok: false, frames: a.length, maxDriftSec, reason: `timestamps drift by up to ${maxDriftSec}s`};
}
