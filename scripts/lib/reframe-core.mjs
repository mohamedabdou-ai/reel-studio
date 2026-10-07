export const REFRAME_RATIOS = Object.freeze(['9:16', '4:5', '1:1', '16:9']);
export const DEFAULT_TRACKING = Object.freeze({
  minConfidence: 0.5, smoothingSeconds: 0.45, deadzone: 0.012,
  maxSpeed: 0.2, holdSeconds: 1, dominanceRatio: 1.8, trackRadius: 0.18,
  faceVerticalPosition: 0.5,
});
const bounded = (v, min, max) => Math.min(max, Math.max(min, v));
function number(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}; expected ${min}..${max}`);
  return value;
}
const center = (f) => ({ x: f.x + f.width / 2, y: f.y + f.height / 2 });
const distance = (a, b) => Math.hypot(center(a).x - center(b).x, center(a).y - center(b).y);
const weight = (f) => f.width * f.height * f.score;
const faceOrder = (a, b) => weight(b) - weight(a) || a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height || b.score - a.score;

export function displayGeometry(video) {
  number(video?.width, 2, 32768, 'source geometry width');
  number(video?.height, 2, 32768, 'source geometry height');
  if (['arib-std-b67', 'smpte2084'].includes(video.color_transfer)) throw new Error('HDR source requires an approved tone-mapped SDR plate before face reframing');
  if (video.tags?.alpha_mode === '1' || /yuva|rgba|bgra/.test(video.pix_fmt ?? '')) throw new Error('Reframing requires opaque source footage; alpha plates are not supported');
  const rawRotation = Number(video.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  const rotation = ((rawRotation % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) throw new Error('Unsupported display rotation; prepare a normalized source plate');
  const [n, d] = (video.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  const sampleAspectRatio = n > 0 && d > 0 ? n / d : 1;
  const w = Math.round(video.width * sampleAspectRatio / 2) * 2;
  const h = Math.round(video.height / 2) * 2;
  return { width: rotation % 180 ? h : w, height: rotation % 180 ? w : h, rotation, sampleAspectRatio };
}

function ratioUnits(ratio) {
  if (!REFRAME_RATIOS.includes(ratio)) throw new Error(`Unsupported ratio ${ratio}; use ${REFRAME_RATIOS.join(', ')}`);
  return ratio.split(':').map(Number);
}

export function cropGeometry(geometry, ratio) {
  const [w, h] = ratioUnits(ratio);
  const scale = Math.floor(Math.min(number(geometry.width, 2, 32768, 'display width') / w, number(geometry.height, 2, 32768, 'display height') / h) / 2) * 2;
  if (scale < 2) throw new Error('Source geometry is too small for the requested crop');
  return { width: w * scale, height: h * scale };
}

export function outputGeometry(ratio, shortEdge = 1080) {
  number(shortEdge, 120, 2160, 'output short edge');
  if (!Number.isInteger(shortEdge)) throw new Error('Output short edge must be an integer');
  const [w, h] = ratioUnits(ratio);
  const scale = Math.floor(shortEdge / Math.min(w, h) / 2) * 2;
  return { width: w * scale, height: h * scale };
}

export function trackingSettings(value = {}) {
  for (const name of Object.keys(value)) if (!Object.hasOwn(DEFAULT_TRACKING, name)) throw new Error(`Unknown tracking setting ${name}`);
  const result = { ...DEFAULT_TRACKING, ...value };
  number(result.minConfidence, 0.01, 1, 'face confidence');
  number(result.smoothingSeconds, 0.01, 10, 'smoothing');
  number(result.deadzone, 0, 0.1, 'deadzone');
  number(result.maxSpeed, 0.001, 1, 'camera speed');
  number(result.holdSeconds, 0, 10, 'missing-face hold');
  number(result.dominanceRatio, 1.01, 10, 'dominance ratio');
  number(result.trackRadius, 0.01, 0.5, 'track radius');
  number(result.faceVerticalPosition, 0.2, 0.8, 'face vertical position');
  return result;
}

function validFace(face) {
  for (const key of ['x', 'y', 'width', 'height', 'score']) number(face?.[key], 0, 1, `face ${key}`);
  if (!face.width || !face.height || face.x + face.width > 1.000001 || face.y + face.height > 1.000001) throw new Error('Invalid normalized face bounds');
  return { x: face.x, y: face.y, width: face.width, height: face.height, score: face.score };
}


function selectFace(faces, previous, settings) {
  if (!faces.length) return { face: null, status: 'no-face' };
  if (faces.length === 1) return { face: faces[0], status: 'single-face' };
  if (previous) {
    const nearest = [...faces].sort((a, b) => distance(a, previous) - distance(b, previous) || faceOrder(a, b));
    const firstDistance = distance(nearest[0], previous);
    if (firstDistance <= settings.trackRadius && distance(nearest[1], previous) > firstDistance + 0.04) return { face: nearest[0], status: 'tracked-multiple' };
  }
  if (weight(faces[0]) >= weight(faces[1]) * settings.dominanceRatio) return { face: faces[0], status: 'dominant-face' };
  return { face: null, status: 'ambiguous' };
}

export function planReframe({ geometry, ratio = '9:16', durationSec, samples, settings = {} }) {
  number(durationSec, 0.001, 12 * 3600, 'duration');
  const config = trackingSettings(settings);
  const crop = cropGeometry(geometry, ratio);
  if (!Array.isArray(samples) || !samples.length) throw new Error('At least one timestamped detection sample is required');
  const normalized = samples.map((sample, i) => {
    number(sample.timeSec, 0, durationSec, 'sample timestamp');
    if (i && sample.timeSec <= samples[i - 1].timeSec) throw new Error('Sample timestamps must be strictly increasing');
    if (!Array.isArray(sample.faces)) throw new Error('Sample faces must be an array');
    return { timeSec: sample.timeSec, faces: sample.faces.map(validFace).filter((f) => f.score >= config.minConfidence).sort(faceOrder) };
  });

  if (normalized[0].timeSec > 1e-6) normalized.unshift({ timeSec: 0, faces: [] });
  const middle = { x: (geometry.width - crop.width) / 2, y: (geometry.height - crop.height) / 2 };
  let current = middle;
  let selected = null;
  let lastFaceTime = -Infinity;
  const keyframes = [];
  const counts = { samples: normalized.length, detected: 0, noFace: 0, multipleFaces: 0, ambiguous: 0, faceClipped: 0 };
  for (const sample of normalized) {
    if (sample.faces.length > 1) counts.multipleFaces++;
    const selection = selectFace(sample.faces, sample.timeSec - lastFaceTime <= config.holdSeconds ? selected : null, config);
    let target = middle;
    let status = selection.status;
    if (selection.face) {
      selected = selection.face;
      lastFaceTime = sample.timeSec;
      counts.detected++;
      const c = center(selected);
      target = {
        x: bounded(c.x * geometry.width - crop.width / 2, 0, geometry.width - crop.width),
        y: bounded(c.y * geometry.height - crop.height * config.faceVerticalPosition, 0, geometry.height - crop.height),
      };
    } else {
      counts[status === 'ambiguous' ? 'ambiguous' : 'noFace']++;
      const hold = sample.timeSec - lastFaceTime <= config.holdSeconds;
      target = hold ? current : middle;
      status += hold ? '-hold' : '-center';
    }
    if (!keyframes.length) current = target;
    else {
      const dt = sample.timeSec - keyframes.at(-1).timeSec;
      let dx = (target.x - current.x) / geometry.width;
      let dy = (target.y - current.y) / geometry.height;
      if (Math.abs(dx) < config.deadzone) dx = 0;
      if (Math.abs(dy) < config.deadzone) dy = 0;
      const gain = 1 - Math.exp(-dt / config.smoothingSeconds);
      dx *= gain; dy *= gain;
      const norm = Math.hypot(dx, dy);
      const limit = Math.min(1, config.maxSpeed * dt / (norm || 1));
      current = { x: bounded(current.x + dx * limit * geometry.width, 0, geometry.width - crop.width), y: bounded(current.y + dy * limit * geometry.height, 0, geometry.height - crop.height) };
    }
    const f = selection.face;
    const faceClipped = !!f && (f.x * geometry.width < current.x || f.y * geometry.height < current.y
      || (f.x + f.width) * geometry.width > current.x + crop.width || (f.y + f.height) * geometry.height > current.y + crop.height);
    if (faceClipped) counts.faceClipped++;
    keyframes.push({ timeSec: sample.timeSec, x: current.x, y: current.y, status, faces: sample.faces.length, selectedFace: f, faceClipped });
  }
  if (keyframes.at(-1).timeSec < durationSec) keyframes.push({ ...keyframes.at(-1), timeSec: durationSec, status: 'end-hold' });
  return { version: 1, ratio, geometry, durationSec, crop, settings: config, keyframes, counts,
    reviewRequired: !!(counts.noFace || counts.multipleFaces || counts.ambiguous || counts.faceClipped),
    policy: 'Largest confident face, then spatial continuity; ambiguous/no-face holds briefly then recenters. No identity recognition. Sparse samples can miss brief events; visual review remains required.' };
}


export function cropCommands(plan) {
  const fixed = (value) => Number(value.toFixed(9)).toString();
  return plan.keyframes.slice(0, -1).map((current, i) => {
    const next = plan.keyframes[i + 1];
    const expression = (axis) => `${fixed(current[axis])}+(${fixed(next[axis] - current[axis])})*clip((t-${fixed(current.timeSec)})/${fixed(next.timeSec - current.timeSec)},0,1)`;
    return `${fixed(current.timeSec)} crop@face x '${expression('x')}', crop@face y '${expression('y')}';`;
  }).join('\n') + '\n';
}
