import './project-tmp.mjs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT, assertProjectOutput} from './project-paths.mjs';
import {run, ffprobeJson} from './media.mjs';
import {sha256File} from './studio-download.mjs';

const TYPES = ['pop', 'impact', 'ding', 'click', 'whoosh', 'riser', 'hit'];
const number = (v, name, lo, hi) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`Invalid ${name}: expected ${lo}..${hi}.`);
  return v;
};
const keys = (o, allowed, name) => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${name} must be an object.`);
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`Unknown ${name} field: ${k}`);
};
const color = value => {
  if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/iu.test(value)) throw new Error('Colors must be #rrggbb.');
  return value;
};
const box = value => {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('A box is [x,y,width,height] in normalized coordinates.');
  value.forEach(v => number(v, 'box', 0, 1));
  if (value[2] <= 0 || value[3] <= 0 || value[0] + value[2] > 1 || value[1] + value[3] > 1) throw new Error('Box must fit the canvas.');
  return value;
};
const frameTime = (value, reel) => {
  number(value, 'picture/caption time', 0, reel.durationSec);
  if (Math.abs(value * reel.fps - Math.round(value * reel.fps)) > 1e-6) throw new Error('Picture and caption boundaries must lie on video frames.');
  return value;
};
function assertSpeechRole(file) {
  const parts = path.relative(ROOT, file).split(path.sep);
  if (!((parts[0]?.toLowerCase() === 'raw' && parts.length >= 2)
    || (parts[0]?.toLowerCase() === 'projects' && parts.length >= 3 && parts[1])))
    throw new Error('Speech sources must be under Raw/ or Projects/<project>/.');
}

// Parameter files are read only when explicitly named by the caller. Relative
// speech.file paths are studio-root-relative; parameters are never discovered.
export function validateSuiteParameters(input) {
  keys(input, ['schema', 'reels'], 'suite');
  if (input.schema !== 1 || !Array.isArray(input.reels) || !input.reels.length || input.reels.length > 32) throw new Error('Expected schema 1 and 1..32 reels.');
  const names = new Set();
  const reels = input.reels.map(raw => {
    keys(raw, ['name', 'durationSec', 'fps', 'width', 'height', 'bpm', 'beatPhaseSec', 'gains', 'drumPattern', 'timbre', 'mode', 'effects', 'speech', 'picture', 'pictureSwaps', 'captions'], 'reel');
    const r = structuredClone(raw);
    if (typeof r.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(r.name) || names.has(r.name)) throw new Error('Reel names must be unique safe slugs.');
    names.add(r.name);
    number(r.durationSec, 'durationSec', 1, 180);
    r.fps ??= 30; r.width ??= 540; r.height ??= 960;
    for (const [k, hi] of [['fps', 120], ['width', 1080], ['height', 1920]]) {
      number(r[k], k, k === 'fps' ? 1 : 32, hi);
      if (!Number.isInteger(r[k]) || k !== 'fps' && r[k] % 2) throw new Error('Canvas sizes must be even integers and fps an integer.');
    }
    if (Math.abs(r.durationSec * r.fps - Math.round(r.durationSec * r.fps)) > 1e-6) throw new Error('Duration must contain a whole number of frames.');
    number(r.bpm, 'bpm', 40, 240);
    r.beatPhaseSec ??= 0; number(r.beatPhaseSec, 'beatPhaseSec', 0, 60 / r.bpm);
    // Silence describes the generated source waveform. reel.mp4 uses AAC, so
    // the resulting decoded samples exercise detection, not a promise of exact
    // PCM zeroes. breakdown-pcm.test.mjs pins the exact-silence ASR fast path.
    if (!['bed', 'dry', 'silence'].includes(r.mode)) throw new Error('mode must be bed, dry or silence.');
    keys(r.gains ?? {}, ['bed', 'kick', 'hat', 'snare', 'speech', 'sfx'], 'gains');
    r.gains = {bed: .025, kick: .3, hat: .04, snare: .08, speech: .35, sfx: .5, ...r.gains};
    Object.entries(r.gains).forEach(([k, v]) => number(v, `gain ${k}`, 0, 2));
    keys(r.timbre ?? {}, ['kickClickAmount','hatBrightness','snareToneHz'], 'timbre');
    // Defaults retain the exact arithmetic of the original parameter waveform.
    r.timbre = {kickClickAmount:0,hatBrightness:0,snareToneHz:190,...r.timbre};
    number(r.timbre.kickClickAmount,'kickClickAmount',0,1);
    number(r.timbre.hatBrightness,'hatBrightness',0,1);
    number(r.timbre.snareToneHz,'snareToneHz',80,1000);
    r.drumPattern ??= {kind: 'kick'};
    keys(r.drumPattern, ['kind', 'syncopation', 'cycleBeats', 'kickBeats', 'hatBeats', 'snareBeats'], 'drumPattern');
    if (!['none', 'kick', 'kit', 'kickless'].includes(r.drumPattern.kind)) throw new Error('drumPattern.kind must be none, kick, kit or kickless.');
    if (r.drumPattern.syncopation !== undefined && typeof r.drumPattern.syncopation !== 'boolean') throw new Error('syncopation must be boolean.');
    const d = r.drumPattern; d.cycleBeats ??= 4; number(d.cycleBeats, 'cycleBeats', 1, 16);
    d.kickBeats ??= d.kind === 'kickless' ? [] : d.syncopation ? [0, 1.5, 2.75] : [0, 1, 2, 3];
    if (d.kind === 'kickless' && d.kickBeats.length) throw new Error('A kickless groove cannot contain kick beats.');
    d.hatBeats ??= [0, .5, 1, 1.5, 2, 2.5, 3, 3.5]; d.snareBeats ??= [1, 3];
    for (const list of [d.kickBeats, d.hatBeats, d.snareBeats]) {
      if (!Array.isArray(list) || list.length > 64 || new Set(list).size !== list.length) throw new Error('Invalid drum event list.');
      list.forEach(v => { number(v, 'drum beat', 0, d.cycleBeats); if (v === d.cycleBeats) throw new Error('Drum beats must be inside the cycle.'); });
    }
    r.effects ??= [];
    if (!Array.isArray(r.effects) || r.effects.length > 256) throw new Error('Too many effects.');
    for (const e of r.effects) {
      keys(e, ['type', 'timeSec', 'gain', 'placement'], 'effect');
      if (!TYPES.includes(e.type)) throw new Error('Unknown effect type.');
      number(e.timeSec, 'effect timeSec', 0, r.durationSec);
      e.gain ??= 1; number(e.gain, 'effect gain', 0, 2); e.placement ??= 'exact';
      if (!['exact', 'on-beat', 'off-beat'].includes(e.placement)) throw new Error('Unknown effect placement.');
      const phase = (e.timeSec - r.beatPhaseSec) * r.bpm / 60;
      const placed = e.placement === 'exact' ? e.timeSec : r.beatPhaseSec + (Math.round(phase - (e.placement === 'off-beat' ? .5 : 0)) + (e.placement === 'off-beat' ? .5 : 0)) * 60 / r.bpm;
      e.timeSec = Math.round(placed * 48000) / 48000;
      if (e.timeSec < 0 || e.timeSec + lengths[e.type] > r.durationSec + 1e-9) throw new Error('Placed effect or its tail falls outside the reel.');
    }
    r.speech ??= [];
    if (!Array.isArray(r.speech) || r.speech.length > 16) throw new Error('speech must be a list of at most 16 overlays.');
    for (const s of r.speech) {
      keys(s, ['file', 'sourceStartSec', 'targetStartSec', 'durationSec', 'gain'], 'speech');
      if (typeof s.file !== 'string' || !s.file || /^(?:https?:|\\\\)/iu.test(s.file)) throw new Error('Speech must name a local file.');
      assertSpeechRole(path.resolve(ROOT, s.file));
      s.sourceStartSec ??= 0; s.targetStartSec ??= 0; s.gain ??= 1;
      number(s.sourceStartSec, 'sourceStartSec', 0, 86400); number(s.targetStartSec, 'targetStartSec', 0, r.durationSec);
      number(s.durationSec, 'speech durationSec', .001, r.durationSec); number(s.gain, 'speech gain', 0, 2);
      if (s.targetStartSec + s.durationSec > r.durationSec) throw new Error('Speech overlay exceeds the reel.');
    }
    if (r.mode === 'silence' && (r.effects.length || r.speech.length)) throw new Error('A silence reel cannot contain effects or speech.');
    r.picture ??= {background: '#202938', box: [.15, .2, .7, .45], color: '#e96942'};
    keys(r.picture, ['background', 'box', 'color'], 'picture'); color(r.picture.background); box(r.picture.box); color(r.picture.color);
    r.pictureSwaps ??= [];
    if (!Array.isArray(r.pictureSwaps) || r.pictureSwaps.length > 64) throw new Error('Invalid picture swaps.');
    for (const s of r.pictureSwaps) { keys(s, ['timeSec', 'box', 'color'], 'picture swap'); frameTime(s.timeSec, r); box(s.box); color(s.color); if (s.timeSec <= 0 || s.timeSec >= r.durationSec) throw new Error('A picture swap must be inside the reel.'); }
    r.pictureSwaps.sort((a, b) => a.timeSec - b.timeSec);
    if (new Set(r.pictureSwaps.map(s => s.timeSec)).size !== r.pictureSwaps.length) throw new Error('Duplicate picture swap time.');
    const pixels = b => b.map((v, i) => i < 2 ? Math.round(v * (i % 2 ? r.height : r.width)) : Math.max(1, Math.round(v * (i % 2 ? r.height : r.width))));
    for (const b of [r.picture.box, ...r.pictureSwaps.map(s => s.box)]) { const [x, y, w, h] = pixels(b); if (x + w > r.width || y + h > r.height) throw new Error('Box has no valid pixel footprint on this canvas.'); }
    let previous = {box: r.picture.box, color: r.picture.color};
    for (const s of r.pictureSwaps) { if (JSON.stringify(pixels(previous.box)) === JSON.stringify(pixels(s.box)) && previous.color.toLowerCase() === s.color.toLowerCase()) throw new Error('A picture swap must visibly change content.'); previous = s; }
    r.captions ??= [];
    if (!Array.isArray(r.captions) || r.captions.length > 128) throw new Error('Invalid caption list.');
    for (const c of r.captions) {
      keys(c, ['startSec', 'endSec', 'text', 'zone'], 'caption');
      frameTime(c.startSec, r); frameTime(c.endSec, r);
      if (c.endSec <= c.startSec || typeof c.text !== 'string' || !c.text.trim() || c.text.length > 200 || /[\r\n\0]/u.test(c.text)) throw new Error('Invalid caption interval or text.');
      c.zone ??= 'bottom'; if (!['top', 'bottom'].includes(c.zone)) throw new Error('Caption zone must be top or bottom.');
    }
    r.captions.sort((a, b) => a.startSec - b.startSec);
    if (r.captions.some((c, i) => i && c.startSec < r.captions[i - 1].endSec)) throw new Error('Caption intervals must not overlap.');
    return r;
  });
  return {schema: 1, reels};
}

const noise = (i, salt) => { let n = Math.imul(i + 1, 1664525) ^ Math.imul(salt + 1, 1013904223); n ^= n >>> 16; return ((n >>> 0) / 2147483648) - 1; };
const lengths = {pop: .08, impact: .45, ding: .5, click: .025, whoosh: .5, riser: .8, hit: .15};
function effect(type, t, i, salt) {
  if (type === 'pop') return .5 * Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-40 * t);
  if (type === 'impact') return .6 * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-8 * t);
  if (type === 'ding') return .35 * Math.sin(2 * Math.PI * 2500 * t) * Math.exp(-6 * t);
  if (type === 'click') return .4 * Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-180 * t);
  if (type === 'whoosh') return .3 * noise(i, salt) * Math.sin(Math.PI * t / .5) ** 2;
  if (type === 'riser') return .35 * Math.sin(2 * Math.PI * (250 * t + 1800 * t * t)) * (t / .8) ** 2;
  return .3 * noise(i, salt) * Math.exp(-35 * t);
}
export function parameterAudio(reel, overlays = []) {
  const sr = 48000, n = Math.round(reel.durationSec * sr), samples = new Float64Array(n);
  const add = (at, len, gain, fn) => { const start = Math.round(at * sr), count = Math.min(Math.ceil(len * sr), n - start); for (let i = 0; i < count; i++) samples[start + i] += gain * fn(i / sr, i); };
  if (reel.mode !== 'silence') {
    if (reel.mode === 'bed') for (let i = 0; i < n; i++) samples[i] += reel.gains.bed * (Math.sin(2 * Math.PI * 220 * i / sr) + Math.sin(2 * Math.PI * 277.18 * i / sr) + Math.sin(2 * Math.PI * 329.63 * i / sr));
    const period = 60 / reel.bpm, d = reel.drumPattern, timbre = reel.timbre ?? {kickClickAmount:0,hatBrightness:0,snareToneHz:190};
    if (d.kind !== 'none') for (let beat = 0; beat * period < reel.durationSec; beat += d.cycleBeats) {
      for (const k of d.kickBeats) add(reel.beatPhaseSec + (beat + k) * period, .3, reel.gains.kick, (t,i) => {
        const original = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-25 * t);
        return timbre.kickClickAmount === 0 ? original : original + timbre.kickClickAmount * noise(i,127) * Math.exp(-180*t);
      });
      if (['kit','kickless'].includes(d.kind)) {
        for (const k of d.hatBeats) add(reel.beatPhaseSec + (beat + k) * period, .06, reel.gains.hat, (t, i) => {
          const original = noise(i,31);
          return (timbre.hatBrightness === 0 ? original : (1-timbre.hatBrightness)*original + timbre.hatBrightness*(original-noise(i-1,31))*.5) * Math.exp(-65*t);
        });
        for (const k of d.snareBeats) add(reel.beatPhaseSec + (beat + k) * period, .16, reel.gains.snare, (t, i) => (.8 * noise(i, 79) + .2 * Math.sin(2 * Math.PI * timbre.snareToneHz * t)) * Math.exp(-25 * t));
      }
    }
    reel.effects.forEach((e, j) => add(e.timeSec, lengths[e.type], e.gain * reel.gains.sfx, (t, i) => effect(e.type, t, i, j)));
    overlays.forEach(({spec, pcm}) => { const start = Math.round(spec.targetStartSec * sr); for (let i = 0; i < pcm.length && start + i < n; i++) samples[start + i] += pcm[i] * spec.gain * reel.gains.speech; });
  }
  const wav = Buffer.alloc(44 + n * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { if (Math.abs(samples[i]) > 1) throw new Error('Parameterized mix clips; lower the supplied gains.'); wav.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2); }
  return wav;
}

export function parameterTruth(r, sources = []) {
  const drumsAudible = r.mode !== 'silence' && r.drumPattern.kind !== 'none' && (r.gains.kick > 0 && r.drumPattern.kickBeats.length || ['kit','kickless'].includes(r.drumPattern.kind) && (r.gains.hat > 0 && r.drumPattern.hatBeats.length || r.gains.snare > 0 && r.drumPattern.snareBeats.length));
  return {fps: r.fps, durationSec: r.durationSec, textScope: 'all-visible', source: 'parameter-fixture',
    cuts: r.pictureSwaps.map(s => ({t: s.timeSec, kind: 'cut'})), transitions: [], camera: [], overlays: [],
    text: r.captions.map(c => ({text: c.text, start: c.startSec, end: c.endSec, zone: c.zone, fill: '#ffffff', stroke: '#000000', box: null, entrance: 'cut'})),
    sound: {bed: r.mode === 'bed' && r.gains.bed > 0, bpm: drumsAudible ? r.bpm : null,
      sfx: r.effects.filter(e => e.gain * r.gains.sfx > 0).map(e => ({t: e.timeSec, type: e.type})).sort((a, b) => a.t - b.t)},
    speech: sources.filter(({spec}) => spec.gain * r.gains.speech > 0).map(({spec, sha256}) => ({start: spec.targetStartSec, end: spec.targetStartSec + spec.durationSec, sourceStartSec: spec.sourceStartSec, sourceSha256: sha256})),
  };
}

async function namedSpeech(spec, outputRoot) {
  const file = await fs.realpath(path.resolve(ROOT, spec.file)), relative = path.relative(await fs.realpath(ROOT), file);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Speech source must stay in the studio.');
  assertSpeechRole(file);
  const insideOutput = path.relative(outputRoot, file);
  if (!insideOutput || !insideOutput.startsWith('..' + path.sep) && insideOutput !== '..' && !path.isAbsolute(insideOutput)) throw new Error('Speech source cannot be inside generated suite outputs.');
  const sha256 = await sha256File(file);
  const p = await ffprobeJson(file), a = p.streams?.find(s => s.codec_type === 'audio'), duration = Number(a?.duration ?? p.format?.duration);
  if (!a || !Number.isFinite(duration) || spec.sourceStartSec + spec.durationSec > duration + .0001) throw new Error('Speech source range is outside the named audio.');
  return {spec, file, sha256};
}
export async function buildParameterizedSuite(root, paramsFile) {
  root = assertProjectOutput(path.resolve(root));
  let ancestor = root; const missing = [];
  for (;;) {
    try { root = assertProjectOutput(path.join(await fs.realpath(ancestor), ...missing.reverse())); break; }
    catch (e) { if (e.code !== 'ENOENT') throw e; missing.push(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  }
  const parameterPath = await fs.realpath(paramsFile), relativeParameters = path.relative(root, parameterPath);
  if (!relativeParameters || relativeParameters !== '..' && !relativeParameters.startsWith('..' + path.sep) && !path.isAbsolute(relativeParameters)) throw new Error('Parameters file cannot be inside generated suite outputs.');
  if ((await fs.stat(parameterPath)).size > 4 * 1024 * 1024) throw new Error('Parameters file exceeds 4 MiB.');
  const parameterBytes = await fs.readFile(parameterPath);
  const parametersSha256 = createHash('sha256').update(parameterBytes).digest('hex');
  const params = validateSuiteParameters(JSON.parse(parameterBytes.toString('utf8'))), sources = new Map();
  // Validate every named input before creating outputs; no directory discovery.
  for (const r of params.reels) sources.set(r.name, await Promise.all(r.speech.map(s => namedSpeech(s, root))));
  const built = [];
  for (const r of params.reels) {
    const dir = assertProjectOutput(path.join(root, r.name)); await fs.mkdir(dir, {recursive: true});
    const overlays = [];
    for (const s of sources.get(r.name)) {
      const {stdout} = await run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', s.file, '-ss', String(s.spec.sourceStartSec), '-t', String(s.spec.durationSec), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1'], {encoding: 'buffer'});
      const expected = Math.round(s.spec.durationSec * 48000);
      if (stdout.length % 2 || Math.abs(stdout.length / 2 - expected) > 1) throw new Error('Speech decoder did not return the requested sample range.');
      const pcm = new Float32Array(stdout.length / 2); for (let i = 0; i < pcm.length; i++) pcm[i] = stdout.readInt16LE(i * 2) / 32768;
      overlays.push({...s, pcm});
    }
    const audio = assertProjectOutput(path.join(dir, 'audio.wav')); await fs.writeFile(audio, parameterAudio(r, overlays));
    const filters = [], states = [{timeSec: 0, box: r.picture.box, color: r.picture.color}, ...r.pictureSwaps];
    states.forEach((s, i) => {
      const [x, y, w, h] = s.box, from = Math.round(s.timeSec * r.fps), to = Math.round((states[i + 1]?.timeSec ?? r.durationSec) * r.fps);
      filters.push(`drawbox=x=${Math.round(x * r.width)}:y=${Math.round(y * r.height)}:w=${Math.max(1, Math.round(w * r.width))}:h=${Math.max(1, Math.round(h * r.height))}:color=${s.color}:t=fill:enable='gte(n,${from})*lt(n,${to})'`);
    });
    for (const [i, c] of r.captions.entries()) {
      await fs.writeFile(assertProjectOutput(path.join(dir, `caption-${i}.txt`)), c.text, 'utf8');
      const size = Math.max(12, Math.round(r.height * .055)), from = Math.round(c.startSec * r.fps), to = Math.round(c.endSec * r.fps);
      filters.push(`drawtext=fontfile=arial.ttf:textfile=caption-${i}.txt:expansion=none:fontsize=${size}:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${c.zone === 'top' ? Math.round(r.height * .08) : Math.round(r.height * .82)}:enable='gte(n,${from})*lt(n,${to})'`);
    }
    if (r.captions.length) await fs.copyFile('C:/Windows/Fonts/arial.ttf', assertProjectOutput(path.join(dir, 'arial.ttf')));
    const video = assertProjectOutput(path.join(dir, 'reel.mp4'));
    await run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${r.picture.background}:s=${r.width}x${r.height}:r=${r.fps}:d=${r.durationSec}`, '-i', 'audio.wav', '-vf', filters.join(','), '-map', '0:v:0', '-map', '1:a:0', '-frames:v', String(Math.round(r.durationSec * r.fps)), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', String(r.durationSec), video], {cwd: dir});
    const p = await ffprobeJson(video), v = p.streams?.find(s => s.codec_type === 'video');
    if (v?.width !== r.width || v?.height !== r.height || Math.abs(Number(p.format?.duration) - r.durationSec) > 2 / r.fps) throw new Error('Generated fixture geometry or duration differs from its parameters.');
    for (const s of sources.get(r.name)) if (await sha256File(s.file) !== s.sha256) throw new Error('Named speech source changed during the build.');
    const truth = {...parameterTruth(r, sources.get(r.name)), parametersSha256}, truthFile = assertProjectOutput(path.join(dir, 'truth.json'));
    await fs.writeFile(truthFile, JSON.stringify(truth, null, 2) + '\n', 'utf8');
    built.push({name: r.name, video, truthFile, truth});
  }
  return built;
}
