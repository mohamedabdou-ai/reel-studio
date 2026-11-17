// scripts/lib/breakdown-fixture.mjs
import './project-tmp.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {run} from './media.mjs';
import {assertProjectOutput} from './project-paths.mjs';

export const FIXTURE_TRUTH = Object.freeze({
  fps: 30, durationSec: 14.6,
  cuts: [{t: 2.0, kind: 'cut'}, {t: 4.0, kind: 'cut'}, {t: 6.5, kind: 'cut'}, {t: 8.5, kind: 'jump'}],
  transitions: [{start: 10.5, end: 11.0, kind: 'dissolve', direction: null}, {start: 12.6, end: 13.0, kind: 'slide', direction: 'left'}],
  overlays: [],
  camera: [{start: 4.0, end: 6.5, label: 'zoom-in'}],
  text: [
    {text: 'سر النجاح', start: 0.5, end: 3.0, zone: 'bottom', fill: '#ffffff', stroke: '#000000', box: null, entrance: 'cut'},
    {text: 'خطوة واحدة', start: 5.0, end: 8.0, zone: 'top', fill: '#ffd60a', stroke: null, box: '#000000', entrance: 'fade'},
  ],
  sound: {bed: true, bpm: 120, sfx: [{t: 3.25, type: 'pop'}, {t: 6.75, type: 'impact'}, {t: 9.25, type: 'ding'}]},
});

const DEFAULT_SFX = FIXTURE_TRUTH.sound.sfx;
const BURSTS = {
  pop: {len: 0.08, fn: x => 0.5 * Math.sin(2 * Math.PI * 1200 * x) * Math.exp(-40 * x)},
  impact: {len: 0.45, fn: x => 0.6 * Math.sin(2 * Math.PI * 70 * x) * Math.exp(-8 * x)},
  ding: {len: 0.5, fn: x => 0.35 * Math.sin(2 * Math.PI * 2500 * x) * Math.exp(-6 * x)},
};
export const offBeat = (target, bpm) => +(((Math.round((target * bpm) / 60 - 0.5) + 0.5) * 60) / bpm).toFixed(3);
const variant = (name, bpm, bed, texts) => Object.freeze({name, bpm, bed, texts: Object.freeze(texts),
  sfx: Object.freeze([['pop', 3.25], ['impact', 6.75], ['ding', 9.25]].map(([type, t]) => Object.freeze({t: offBeat(t, bpm), type})))});
export const SYNTH_VARIANTS = Object.freeze([
  variant('bpm120-bed', 120, true, ['سر النجاح', 'خطوة واحدة']),
  variant('bpm72-bed', 72, true, ['ابدأ اليوم', 'فكرة بسيطة']),
  variant('bpm96-dry', 96, false, ['اعرف السبب', 'النتيجة الآن']),
  variant('bpm140-bed', 140, true, ['أول درس', 'آخر نصيحة']),
  variant('bpm160-dry', 160, false, ['جرب بنفسك', 'وفر وقتك']),
  variant('bpm174-bed', 174, true, ['قصة قصيرة', 'نهاية سعيدة']),
]);
export function truthFor(v) {
  return {...FIXTURE_TRUTH, text: FIXTURE_TRUTH.text.map((t, i) => ({...t, text: v.texts[i]})),
    sound: {bed: v.bed, bpm: v.bpm, sfx: v.sfx.map(s => ({t: s.t, type: s.type}))}};
}

export function synthAudio(duration, sampleRate = 48000, {bpm = 120, bed = true, sfx = DEFAULT_SFX} = {}) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Invalid synthetic audio duration or sample rate.');
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240 || sfx.some(s => !BURSTS[s.type])) throw new Error('Invalid synthetic audio tempo or effect type.');
  const n = Math.round(duration * sampleRate), period = 60 / bpm;
  const data = Buffer.alloc(44 + n * 2);
  const burst = (t, start, length, fn) => (t >= start && t < start + length ? fn(t - start) : 0);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const tau = t % period;
    let v = bed ? 0.05 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.18 * t) + Math.sin(2 * Math.PI * 329.63 * t)) : 0;
    v += 0.5 * Math.sin(2 * Math.PI * 55 * tau) * Math.exp(-25 * tau);
    for (const s of sfx) v += burst(t, s.t, BURSTS[s.type].len, BURSTS[s.type].fn);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
  }
  data.write('RIFF', 0, 'ascii'); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8, 'ascii');
  data.write('fmt ', 12, 'ascii'); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36, 'ascii'); data.writeUInt32LE(n * 2, 40);
  return data;
}

const GRAPH = [
  '[0:v]drawgrid=w=60:h=60:t=2:c=white@0.4,setsar=1,format=yuv420p,fps=30[v0]',
  '[1:v]drawgrid=w=60:h=60:t=2:c=white@0.4,setsar=1,format=yuv420p,fps=30[v1]',
  "[2:v]zoompan=z='1+0.25*on/75':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=540x960:fps=30,trim=duration=2.5,setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v2]",
  '[3:v]drawbox=x=100:y=420:w=120:h=120:c=white:t=fill,setsar=1,format=yuv420p,fps=30[v3]',
  '[4:v]drawbox=x=300:y=420:w=120:h=120:c=white:t=fill,setsar=1,format=yuv420p,fps=30[v4]',
  '[5:v]drawgrid=w=90:h=90:t=3:c=0x1d3557@0.5,setsar=1,format=yuv420p,fps=30[v5]',
  '[6:v]drawgrid=w=45:h=45:t=2:c=white@0.4,setsar=1,format=yuv420p,fps=30[v6]',
  '[v4][v5]xfade=transition=dissolve:duration=0.5:offset=2.0[x1]',
  '[x1][v6]xfade=transition=slideleft:duration=0.4:offset=4.1,fps=30[x2]',
  '[v0][v1][v2][v3][x2]concat=n=5:v=1:a=0[base]',
  "[base]drawtext=fontfile=arial.ttf:textfile=t1.txt:fontsize=56:fontcolor=white:borderw=6:bordercolor=black:x=(w-text_w)/2:y=760:enable='between(t,0.5,3.0)'[t1]",
  "[t1]drawtext=fontfile=arial.ttf:textfile=t2.txt:fontsize=56:fontcolor=0xffd60a:box=1:boxcolor=black:boxborderw=20:x=(w-text_w)/2:y=150:alpha='if(lt(t,5.3),(t-5.0)/0.3,1)':enable='between(t,5.0,8.0)'[out]",
].join(';');

export async function buildSyntheticReel(dir, v = SYNTH_VARIANTS[0]) {
  dir = assertProjectOutput(path.resolve(dir));
  const font = 'C:/Windows/Fonts/arial.ttf';
  if (!fs.existsSync(font)) throw new Error('fixture font missing');
  await fsp.mkdir(dir, {recursive: true});
  for (const name of ['arial.ttf', 't1.txt', 't2.txt', 'audio.wav', 'still.png', 'reel.mp4', 'truth.json']) assertProjectOutput(path.join(dir, name));
  await fsp.copyFile(font, path.join(dir, 'arial.ttf'));
  await fsp.writeFile(path.join(dir, 't1.txt'), v.texts[0], 'utf8');
  await fsp.writeFile(path.join(dir, 't2.txt'), v.texts[1], 'utf8');
  await fsp.writeFile(path.join(dir, 'audio.wav'), synthAudio(FIXTURE_TRUTH.durationSec, 48000, v));
  const opts = {cwd: dir};
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'mandelbrot=s=1080x1920', '-frames:v', '1', 'still.png'], opts);
  const color = (hex, d) => ['-f', 'lavfi', '-i', `color=c=${hex}:s=540x960:r=30:d=${d}`];
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    ...color('0x1d3557', 2), ...color('0xe63946', 2),
    '-loop', '1', '-framerate', '30', '-t', '2.5', '-i', 'still.png',
    ...color('0x457b9d', 2), ...color('0x457b9d', 2.5), ...color('0xf1faee', 2.5), ...color('0x2a9d8f', 2),
    '-i', 'audio.wav',
    '-filter_complex', GRAPH, '-map', '[out]', '-map', '7:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '192k', '-t', String(FIXTURE_TRUTH.durationSec), 'reel.mp4'], opts);
  const truthFile = path.join(dir, 'truth.json');
  await fsp.writeFile(truthFile, `${JSON.stringify(truthFor(v), null, 2)}\n`, 'utf8');
  return {name: v.name, video: path.join(dir, 'reel.mp4'), truthFile, truth: truthFor(v)};
}

export async function buildSyntheticSuite(root, {paramsFile} = {}) {
  if (paramsFile !== undefined) return (await import('./breakdown-parameter-fixture.mjs')).buildParameterizedSuite(root, paramsFile);
  const built = [];
  for (const v of SYNTH_VARIANTS) built.push(await buildSyntheticReel(path.join(root, v.name), v));
  return built;
}
