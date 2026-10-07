import './lib/project-tmp.mjs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, run } from './lib/media.mjs';
import { validateMotionPlan } from './lib/motion-plan.mjs';

const args = parseArgs(process.argv.slice(2), { every: '5', floor: '0.6', minRun: '1.0', w: '160' });
const video = args.video ? path.resolve(String(args.video)) : null;
const every = Number(args.every);
const floor = Number(args.floor);
const minRun = Number(args.minRun);
const W = Number(args.w);
if (!args.video || !Number.isInteger(every) || every < 1 || !Number.isFinite(floor) || floor < 0 || !(minRun > 0) || !Number.isInteger(W) || W < 2) throw new Error('Invalid motion-check arguments');

const probe = () => new Promise((res, rej) => {
  const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=nb_frames,r_frame_rate,width,height', '-of', 'json', video], {windowsHide:true});
  let out = '';
  p.stdout.on('data', (c) => (out += c));
  p.on('error', rej);
  p.on('close', (c) => (c === 0 ? res(JSON.parse(out).streams[0]) : rej(new Error('ffprobe failed'))));
});

const crop = args.crop ? String(args.crop) : null;
const st = await probe();
const [num, den] = String(st.r_frame_rate).split('/').map(Number);
const fps = num / den;
if (args.plan) {
  if(crop || args['from-frame']!==undefined || args['to-frame']!==undefined) throw new Error('--plan cannot be combined with a single crop/range');
  const plan=validateMotionPlan(JSON.parse(await readFile(path.resolve(String(args.plan)),'utf8')),{width:st.width,height:st.height,frames:Number(st.nb_frames),fps});
  const segments=[];
  for(const segment of plan.segments) {
    if(segment.kind==='graphics') {segments.push({...segment,checked:false});continue;}
    const measured=await run(process.execPath,[fileURLToPath(import.meta.url),'--video',video,'--crop',segment.crop,'--from-frame',String(segment.from),'--to-frame',String(segment.to),'--every',String(every),'--floor',String(floor),'--minRun',String(minRun),'--w',String(W)],{allowFail:true});
    let result;
    try {result=JSON.parse(measured.stdout);} catch {throw new Error(`Presenter measurement failed: ${measured.stderr.slice(-1500)}`);}
    if(typeof result.ok!=='boolean' || (!measured.ok && result.ok)) throw new Error('Incomplete presenter measurement');
    segments.push({...segment,checked:true,result});
  }
  const checkedFrames=segments.filter(s=>s.checked).reduce((sum,s)=>sum+s.to-s.from,0);
  const result={ok:segments.every(s=>!s.checked || s.result.ok),video,plan:path.resolve(String(args.plan)),fps,totalFrames:Number(st.nb_frames),presenterFramesChecked:checkedFrames,presenterSecondsChecked:checkedFrames/fps,visibility:'Editorially declared and visually reviewed; no automated face-visibility claim',segments};
  console.log(JSON.stringify(result,null,2));
  process.exit(result.ok?0:3);
}
const ranged=args['from-frame']!==undefined || args['to-frame']!==undefined;
const from=ranged?Number(args['from-frame']):0;
const to=ranged?Number(args['to-frame']):Number(st.nb_frames);
if(ranged && (!Number.isInteger(from) || !Number.isInteger(to) || from<0 || to<=from || to>Number(st.nb_frames))) throw new Error('Motion frame range is outside the video');
if (crop && !/^\d+:\d+:\d+:\d+$/.test(crop)) throw new Error('--crop must be w:h:x:y');
if (crop) {
  const [cw, ch, cx, cy] = crop.split(':').map(Number);
  if (cw < 2 || ch < 2 || cx + cw > st.width || cy + ch > st.height) throw new Error('Motion crop is outside the video frame');
}
const srcW = crop ? Number(crop.split(':')[0]) : st.width;
const srcH = crop ? Number(crop.split(':')[1]) : st.height;
const H = Math.round((srcH / srcW) * W / 2) * 2;



const frames = await new Promise((res, rej) => {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video,
    '-vf', `${ranged?`trim=start_frame=${from}:end_frame=${to},`:''}select='not(mod(n\\,${every}))'${crop ? `,crop=${crop}` : ''},scale=${W}:${H},format=gray`, '-vsync', '0',
    '-f', 'rawvideo', '-'], {windowsHide:true});
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.on('error', rej);
  p.on('close', (c) => (c === 0 ? res(Buffer.concat(chunks)) : rej(new Error('ffmpeg failed'))));
});

const size = W * H;
const count = Math.floor(frames.length / size);
if (count < 2) throw new Error('Motion measurement incomplete: fewer than two sampled frames');
if (ranged && count!==Math.ceil((to-from)/every)) throw new Error('Motion measurement incomplete: sampled frame count does not match the declared range');
const diffs = [];
for (let i = 1; i < count; i++) {
  const a = frames.subarray((i - 1) * size, i * size);
  const b = frames.subarray(i * size, (i + 1) * size);
  let s = 0;
  for (let k = 0; k < size; k++) s += Math.abs(a[k] - b[k]);
  diffs.push({ t: +((from+i * every) / fps).toFixed(3), d: +(s / size).toFixed(3) });
}


const runs = [];
let cur = null;
for (const s of diffs) {
  if (s.d < floor) {
    if (!cur) cur = { from: s.t, to: s.t, peak: s.d };
    else { cur.to = s.t; cur.peak = Math.max(cur.peak, s.d); }
  } else if (cur) { runs.push(cur); cur = null; }
}
if (cur) runs.push(cur);

const sampleStep = every / fps;
const frozen = runs
  .map((r) => ({ ...r, sec: +(r.to - r.from + sampleStep).toFixed(2) }))
  .filter((r) => r.sec >= minRun);

const all = diffs.map((d) => d.d);
const result = {
  ok: frozen.length === 0,
  video,
  crop: crop ?? 'full frame',
  ...(ranged?{frameRange:{from,to},startSec:from/fps,endSec:to/fps}:{}),
  sampledFrames: count,
  everyNthFrame: every,
  motion: {
    min: Math.min(...all),
    median: all.slice().sort((a, b) => a - b)[Math.floor(all.length / 2)],
    max: Math.max(...all),
  },
  floor,
  frozenRuns: frozen,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  console.error(`FROZEN: ${frozen.map((f) => `${f.from}s–${f.to}s (${f.sec}s)`).join(', ')}`);
  process.exit(3);
}
