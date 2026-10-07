import { createRequire } from 'node:module';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ROOT, ffprobeJson, run } from './media.mjs';

const require = createRequire(import.meta.url);
export const SPEC_PATH = path.join(ROOT, 'engine', 'src', 'core', 'platform', 'instagram-reels.json');
export const SPEC = require(SPEC_PATH);



export const profileIds = () => Object.keys(SPEC.profiles);
export const zone = (id = SPEC.defaultProfile) => {
  const z = SPEC.profiles[id];
  if (!z) throw new Error(`Unknown safe-zone profile "${id}". Known: ${profileIds().join(', ')}`);
  return z;
};


export const zoneTests = (z) => [
  { id: 'TOP', why: `platform header / status bar (y < ${z.top})`, test: (x, y) => y < z.top },
  { id: 'BOTTOM', why: `username / caption / audio block (y >= ${z.bottom})`, test: (x, y) => y >= z.bottom },
  { id: 'LEFT', why: `edge margin (x < ${z.left})`, test: (x, y) => x < z.left },
  { id: 'RIGHT', why: `edge margin (x >= ${z.right})`, test: (x, y) => x >= z.right },
  ...(z.rail
    ? [{ id: 'RAIL', why: `like / comment / share / audio column (x >= ${z.rail.x} && y >= ${z.rail.y})`, test: (x, y) => x >= z.rail.x && y >= z.rail.y }]
    : []),
];

export const inDeadZone = (x, y, z) => zoneTests(z).some((t) => t.test(x, y));



export const levelFor = (fps) => (fps > 30 ? SPEC.video.codec.level.above30fps : SPEC.video.codec.level.upTo30fps);
export const gopFrames = (fps) => Math.round(fps * SPEC.video.gop.minSec);



export const VUI_BSF = 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0';




export async function inspectAtoms(file) {
  const fh = await fs.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const readBox = async (pos) => {
      const b = Buffer.alloc(16);
      const { bytesRead } = await fh.read(b, 0, 16, pos);
      if (bytesRead < 8) return null;
      let len = b.readUInt32BE(0);
      const type = b.toString('latin1', 4, 8);
      let header = 8;
      if (len === 1) { len = Number(b.readBigUInt64BE(8)); header = 16; }
      if (len === 0) len = size - pos;
      return { type, len, header };
    };
    const top = [];
    let pos = 0;
    let moov = null;
    while (pos + 8 <= size) {
      const box = await readBox(pos);
      if (!box || box.len < 8) break;
      top.push(box.type);
      if (box.type === 'moov') moov = { pos, ...box };
      pos += box.len;
    }

    let editLists = 0;
    const CONTAINERS = new Set(['moov', 'trak', 'edts']);
    const walk = async (start, end) => {
      let p = start;
      while (p + 8 <= end) {
        const box = await readBox(p);
        if (!box || box.len < 8) break;
        if (box.type === 'elst') editLists++;
        else if (CONTAINERS.has(box.type)) await walk(p + box.header, p + box.len);
        p += box.len;
      }
    };
    if (moov) await walk(moov.pos + moov.header, moov.pos + moov.len);
    const moovIdx = top.indexOf('moov');
    const mdatIdx = top.indexOf('mdat');
    return { atoms: top, faststart: moovIdx !== -1 && mdatIdx !== -1 && moovIdx < mdatIdx, editLists };
  } finally {
    await fh.close();
  }
}



export async function keyframeStats(file, durationSec = null) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file,
  ]);
  const keys = [];
  let lastPts = 0;
  for (const line of stdout.split(/\r?\n/)) {
    const [pts, flags] = line.split(',');
    if (!pts) continue;
    lastPts = Math.max(lastPts, Number(pts));
    if (flags && flags.includes('K')) keys.push(Number(pts));
  }
  keys.sort((a, b) => a - b);
  let maxGap = keys.length ? 0 : Infinity;
  for (let i = 1; i < keys.length; i++) maxGap = Math.max(maxGap, keys[i] - keys[i - 1]);
  if (keys.length) maxGap = Math.max(maxGap, Math.max(lastPts, durationSec ?? 0) - keys[keys.length - 1]);
  return { keyframes: keys.length, maxGapSec: Number.isFinite(maxGap) ? +maxGap.toFixed(3) : null, firstKeySec: keys[0] ?? null, lastPacketSec: +lastPts.toFixed(3) };
}


export async function loudness(file) {
  const { stderr, ok } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { allowFail: true });
  if (!ok) throw new Error(`Loudness measurement failed: ${stderr.slice(-1200)}`);


  const num = (re) => { const all = stderr.match(new RegExp(re.source, 'g')); if (!all) return null; const m = all[all.length - 1].match(re); return m ? Number(m[1]) : null; };
  const result = {
    integratedLUFS: num(/I:\s+(-?\d+(?:\.\d+)?) LUFS/),
    LRA: num(/LRA:\s+(\d+(?:\.\d+)?) LU/),
    truePeakDBTP: num(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/),
  };
  const silent = /Peak:\s+-inf\s+dBFS/.test(stderr) && result.integratedLUFS <= -69;
  if (result.integratedLUFS === null || result.LRA === null || (result.truePeakDBTP === null && !silent)) throw new Error('Loudness measurement incomplete: ebur128 summary is missing');
  return { ...result, silent };
}



const fpsOf = (s) => {
  const [n, d] = (s || '0/1').split('/').map(Number);
  return d ? n / d : 0;
};






export const CHANNELS = ['organic', 'ads', 'api'];

export async function igCheck(file, { channel = 'organic', withLoudness = true } = {}) {
  if (!CHANNELS.includes(channel)) throw new Error(`channel must be one of ${CHANNELS.join('|')}, got "${channel}"`);
  const V = SPEC.video;
  const probe = await ffprobeJson(file);
  const v = (probe.streams || []).find((s) => s.codec_type === 'video');
  const a = (probe.streams || []).find((s) => s.codec_type === 'audio');
  const fmt = probe.format || {};
  const checks = [];
  const add = (id, pass, level, actual, expected) => checks.push({ id, pass: !!pass, level: pass ? 'pass' : level, actual, expected });

  let dur = 0, mb = 0, mbps = 0, kf = null, loud = null;

  if (!v) { add('video-stream', false, 'fail', 'none', 'one H.264 video stream'); return finish(); }

  const fps = fpsOf(v.r_frame_rate);
  const avg = fpsOf(v.avg_frame_rate);
  add('codec', v.codec_name === 'h264', 'fail', v.codec_name, 'h264');
  add('profile', v.profile === 'High', 'warn', v.profile, 'High');
  const lvl = Number(v.level);
  add('level', lvl > 0 && lvl <= 42, 'warn', v.level, `<= 42 (${levelFor(fps)} target)`);
  add('resolution', v.width === V.resolution.width && v.height === V.resolution.height, 'fail', `${v.width}x${v.height}`, `${V.resolution.width}x${V.resolution.height}`);
  add('fps-range', fps >= V.fps.apiMin && fps <= V.fps.max, 'fail', +fps.toFixed(3), `${V.fps.apiMin}-${V.fps.max}`);
  add('fps-organic-min', fps >= V.fps.organicMin, channel === 'organic' ? 'fail' : 'warn', +fps.toFixed(3), `>= ${V.fps.organicMin}`);
  add('fps-constant', Math.abs(fps - avg) < 0.01, 'fail', `r=${fps.toFixed(3)} avg=${avg.toFixed(3)}`, 'constant frame rate');
  add('pix_fmt', v.pix_fmt === V.pixelFormat.pixFmt, 'fail', v.pix_fmt, V.pixelFormat.pixFmt);
  add('color_range', (v.color_range ?? 'unknown') === V.pixelFormat.range, 'fail', v.color_range ?? 'unknown', V.pixelFormat.range);
  add('color_space', v.color_space === V.pixelFormat.colorSpace, 'fail', v.color_space ?? 'unknown', V.pixelFormat.colorSpace);
  add('color_transfer', v.color_transfer === V.pixelFormat.colorTransfer, 'fail', v.color_transfer ?? 'unknown', V.pixelFormat.colorTransfer);
  add('color_primaries', v.color_primaries === V.pixelFormat.colorPrimaries, 'fail', v.color_primaries ?? 'unknown', V.pixelFormat.colorPrimaries);
  mbps = Number(v.bit_rate || fmt.bit_rate || 0) / 1e6;
  add('bitrate-max', mbps > 0 && mbps <= V.bitrate.maxMbps, 'fail', +mbps.toFixed(2), `<= ${V.bitrate.maxMbps} Mbps`);
  add('bitrate-target', mbps <= V.bitrate.targetMbps * 2, 'warn', +mbps.toFixed(2), `~${V.bitrate.targetMbps} Mbps (engine target)`);
  add('field_order', !v.field_order || v.field_order === 'progressive', 'fail', v.field_order ?? 'progressive', 'progressive');
  add('sar', !v.sample_aspect_ratio || v.sample_aspect_ratio === '1:1' || v.sample_aspect_ratio === 'N/A', 'fail', v.sample_aspect_ratio ?? '1:1', 'square pixels');

  if (!a) add('audio-stream', false, 'warn', 'none', 'AAC-LC stereo 48 kHz');
  else {
    add('audio-codec', a.codec_name === V.audio.codec, 'fail', a.codec_name, V.audio.codec);
    add('audio-profile', !a.profile || /LC/.test(a.profile), 'warn', a.profile ?? '?', 'LC');
    add('audio-samplerate', Number(a.sample_rate) <= V.audio.sampleRateHz && [44100, 48000].includes(Number(a.sample_rate)), 'fail', Number(a.sample_rate), `${V.audio.sampleRateHz} (or 44100)`);
    add('audio-channels', a.channels >= 1 && a.channels <= 2, 'fail', a.channels, '1-2');
    add('audio-bitrate', Number(a.bit_rate || 0) / 1000 >= V.audio.minKbps, 'warn', Math.round(Number(a.bit_rate || 0) / 1000), `>= ${V.audio.minKbps} kbps`);
  }

  dur = Number(fmt.duration || 0);
  const durMax = channel === 'organic' ? V.durationSec.organicMax : V.durationSec.adsMax;
  add('duration-max', dur <= durMax, 'fail', +dur.toFixed(2), `<= ${durMax} s (${channel})`);
  add('duration-min', dur >= V.durationSec.apiMin, 'warn', +dur.toFixed(2), `>= ${V.durationSec.apiMin} s`);
  add('duration-reach', dur <= V.durationSec.reachSoftCap, 'warn', +dur.toFixed(2), `<= ${V.durationSec.reachSoftCap} s (recommended to new audiences)`);
  mb = Number(fmt.size || 0) / 1048576;
  add('filesize-api', mb <= V.fileSize.apiMaxMB, channel === 'api' ? 'fail' : 'warn', +mb.toFixed(1), `<= ${V.fileSize.apiMaxMB} MB (API)`);
  add('filesize-ads', mb <= V.fileSize.adsMaxGB * 1024, 'fail', +mb.toFixed(1), `<= ${V.fileSize.adsMaxGB} GB`);
  add('container', /mp4|mov/.test(fmt.format_name || ''), 'fail', fmt.format_name, 'mp4/mov');

  const atoms = await inspectAtoms(file);
  add('faststart', atoms.faststart, 'fail', atoms.atoms.join(' '), 'moov before mdat');
  add('edit-lists', atoms.editLists === 0, channel === 'api' ? 'fail' : 'warn', atoms.editLists, '0 (API requirement; AAC priming elst is tolerated by the app)');

  kf = await keyframeStats(file, dur);
  add('keyframes', kf.keyframes > 0, 'fail', kf.keyframes, '>= 1 keyframe');
  add('gop-max', kf.maxGapSec != null && kf.maxGapSec <= V.gop.maxSec, 'fail', kf.maxGapSec, `<= ${V.gop.maxSec} s between keyframes (tail included)`);
  add('gop-target', kf.maxGapSec != null && kf.maxGapSec <= V.gop.minSec + 0.5, 'warn', kf.maxGapSec, `~${V.gop.minSec} s`);

  add('complete', dur === 0 || kf.lastPacketSec >= dur - 0.5, 'fail', kf.lastPacketSec, `last packet within 0.5 s of ${dur.toFixed(2)} s`);

  if (withLoudness && a) {
    try {
      loud = await loudness(file);
      add('loudness-measured', true, 'fail', 'complete', 'successful ebur128 measurement');
      add('loudness', Math.abs(loud.integratedLUFS - V.loudness.integratedLUFS) <= 2, 'warn', loud.integratedLUFS, `${V.loudness.integratedLUFS} ± 2 LUFS`);
      add('true-peak', loud.silent || (loud.truePeakDBTP != null && loud.truePeakDBTP <= V.loudness.truePeakDBTP), 'warn', loud.silent ? '-inf (digital silence)' : loud.truePeakDBTP, `<= ${V.loudness.truePeakDBTP} dBTP`);
    } catch (error) {
      add('loudness-measured', false, 'fail', error.message, 'successful ebur128 measurement');
    }
  }

  return finish();

  function finish() {
    const fails = checks.filter((c) => c.level === 'fail');
    const warns = checks.filter((c) => c.level === 'warn');
    return {
      file: path.resolve(file),
      channel,
      ok: fails.length === 0,
      fails: fails.map((c) => c.id),
      warnings: warns.map((c) => c.id),
      checks,
      summary: { width: v?.width, height: v?.height, fps: v ? +fpsOf(v.r_frame_rate).toFixed(3) : null, durationSec: +dur.toFixed(3), sizeMB: +mb.toFixed(1), mbps: +mbps.toFixed(2), keyframes: kf?.keyframes, maxKeyGapSec: kf?.maxGapSec, loudness: loud },
    };
  }
}
