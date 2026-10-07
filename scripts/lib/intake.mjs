import {run} from './media.mjs';

export const DELIVERY_MIN_FPS = 30;
export const DELIVERY_MAX_FPS = 60;
export const MOVING_GAP_SEC = 0.1;
export const MIN_MOTION_GAPS = 10;
export const DUPLICATE_SHARE = 0.9;
const HDR = Object.freeze({'arib-std-b67': 'hlg', smpte2084: 'pq'});

export const BT709_TAGS = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
const ratio = (value) => { const [n, d] = String(value ?? '0/1').split('/').map(Number); return d ? n / d : 0; };


export function describeSource(probe) {
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  if (!video) throw new Error('Intake needs a video stream.');
  const avgFps = ratio(video.avg_frame_rate), taggedFps = ratio(video.r_frame_rate);
  return {codec: video.codec_name, pixFmt: video.pix_fmt ?? null, transfer: video.color_transfer ?? null,
    hdr: HDR[video.color_transfer] ?? null, avgFps, taggedFps,
    vfr: !(avgFps > 0) || !(taggedFps > 0) || Math.abs(avgFps - taggedFps) / taggedFps > 0.005, driftFps: Math.abs(avgFps - taggedFps),
    hasAudio: (probe.streams ?? []).some((stream) => stream.codec_type === 'audio'), durationSec: Number(probe.format?.duration) || null};
}


export function divisorRates(rate) {
  const whole = Math.round(rate), out = [];
  for (let d = 1; whole / d >= 10; d++) if (whole % d === 0) out.push(whole / d);
  return out;
}


export function motionGaps(keptTimes) {
  return keptTimes.slice(1).map((time, i) => time - keptTimes[i]).filter((gap) => gap > 0 && gap <= MOVING_GAP_SEC + 1e-9);
}






export function realMotionFps({keptTimes, taggedFps, avgFps, vfr}) {
  const gaps = motionGaps(keptTimes);
  if (vfr) {
    if (gaps.length < MIN_MOTION_GAPS) return (avgFps > 0 ? avgFps : taggedFps) >= 40 ? 60 : 30;
    return gaps.filter((gap) => gap < 1 / 40).length >= 0.25 * gaps.length ? 60 : 30;
  }
  const tagged = Math.round(taggedFps);
  if (tagged <= DELIVERY_MIN_FPS || gaps.length < MIN_MOTION_GAPS) return tagged;
  const steps = gaps.map((gap) => Math.round(gap * tagged));
  for (const rate of divisorRates(tagged).slice(1).reverse()) {
    const k = tagged / rate;
    if (steps.filter((step) => step % k === 0).length >= DUPLICATE_SHARE * steps.length) return rate;
  }
  return tagged;
}


export function fpsPlan(realFps) {
  if (!(realFps >= 1)) throw new Error(`Real motion rate must be at least 1 fps, got ${realFps}.`);
  let plateFps = Math.round(realFps);
  if (plateFps > DELIVERY_MAX_FPS) plateFps = divisorRates(plateFps).find((rate) => rate <= DELIVERY_MAX_FPS) ?? DELIVERY_MAX_FPS;
  const repeat = plateFps >= DELIVERY_MIN_FPS ? 1 : Math.ceil(DELIVERY_MIN_FPS / plateFps);
  return {realFps, plateFps, deliveryFps: plateFps * repeat, repeat};
}


export function toneMapFilter(hdr) {
  const transfer = hdr === 'hlg' ? 'arib-std-b67' : 'smpte2084';
  return `zscale=tin=${transfer}:pin=bt2020:min=bt2020nc:rin=tv:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv`;
}


export function intakePlan(source, keptTimes) {
  const realFps = realMotionFps({keptTimes, taggedFps: source.taggedFps, avgFps: source.avgFps, vfr: source.vfr});
  const plan = fpsPlan(realFps);
  const reasons = [];
  if (source.hdr) reasons.push(`HDR ${source.hdr.toUpperCase()} to BT.709 SDR`);
  if (source.vfr) reasons.push(`variable frame rate to a constant ${plan.deliveryFps} fps`);
  else if (source.driftFps > 0.01 || Math.abs(source.taggedFps - plan.deliveryFps) > 0.01) reasons.push(`real motion ${realFps} fps (tagged ${Math.round(source.taggedFps * 1000) / 1000}) delivered at ${plan.deliveryFps} fps`);
  if (!source.hdr && source.pixFmt !== 'yuv420p') reasons.push(`pixel format ${source.pixFmt} to yuv420p`);
  const filters = [`fps=${plan.plateFps}`, ...(plan.repeat > 1 ? [`fps=${plan.deliveryFps}`] : []), ...(source.hdr ? [toneMapFilter(source.hdr)] : []), 'format=yuv420p', BT709_TAGS];
  return {...plan, hdr: source.hdr, vfr: source.vfr, transcode: reasons.length > 0, reasons, filter: filters.join(',')};
}


export function transcodeArgs({input, output, plan, hasAudio}) {
  return ['-hide_banner', '-nostats', '-v', 'error', '-y', '-i', input, '-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0'] : []),
    '-vf', plan.filter, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-g', String(plan.deliveryFps * 2),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '320k', '-ar', '48000'] : []), '-movflags', '+faststart', output];
}


export async function measureKeptTimes(file, {maxSec = 20} = {}) {
  const {stderr} = await run('ffmpeg', ['-hide_banner', '-nostats', '-t', String(maxSec), '-i', file, '-map', '0:v:0',
    '-vf', 'mpdecimate,showinfo', '-fps_mode', 'passthrough', '-f', 'null', '-']);
  return [...stderr.matchAll(/Parsed_showinfo_\d+[^\r\n]*\bpts_time:([-+0-9.eE]+)/g)].map((match) => Number(match[1]));
}
