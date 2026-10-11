import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {mixDelivery} from '../scripts/lib/mix-run.mjs';

const exec = promisify(execFile), ffmpeg = path.join(ROOT, 'Tools', 'bin', 'ffmpeg.exe');
const command = async args => exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], {cwd: ROOT, env: process.env, windowsHide: true, timeout: 90000, maxBuffer: 4 * 1024 * 1024});
let fixtures;
async function audioFixtures(t) {
  if (fixtures) return fixtures;
  const directory = await fs.mkdtemp(path.join(PROJECT_TMP, 'graphics-audio-'));
  t.after(async () => { assert.equal(path.dirname(directory), PROJECT_TMP); await fs.rm(directory, {recursive: true, force: true}); fixtures = null; });
  const base = path.join(directory, 'base.mp4'), recorded = path.join(directory, 'recorded.mp4');
  const silence = path.join(directory, 'silence.wav'), tone = path.join(directory, 'tone.wav');
  await command(['-f', 'lavfi', '-i', 'color=c=black:s=64x96:r=30:d=3', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', base]);
  await command(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '3', '-c:a', 'pcm_s24le', silence]);
  await command(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=3', '-ac', '2', '-c:a', 'pcm_s24le', tone]);
  await command(['-i', base, '-i', tone, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-t', '3', recorded]);
  fixtures = {directory, base, recorded, silence, tone};
  return fixtures;
}
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const mix = (video, out, extra = {}) => mixDelivery({video, out, ...extra}, {onProgress: () => {}});

test('absent or silent graphics effects produce verified intentional silence without fake LUFS', async t => {
  const f = await audioFixtures(t), original = await hash(f.base);
  for (const [name, sfx] of [['absent', null], ['silent', f.silence]]) {
    const result = await mix(f.base, path.join(f.directory, `${name}.mp4`), {'graphics-audio': true, ...(sfx ? {sfx} : {})});
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.audio.mode, 'graphics');
    assert.equal(result.audio.expectedSilence, true);
    assert.equal(result.audio.verifiedSilence, true);
    assert.equal(result.delivered.LUFS, null);
    assert.equal(result.delivered.truePeakDb, null);
    assert.equal(result.delivered.digitalPeak, '-inf');
    assert.equal(result.voice.applicable, false);
  }
  assert.equal(await hash(f.base), original);
});

test('audible graphics effects retain normal mastering and copied video', async t => {
  const f = await audioFixtures(t);
  const result = await mix(f.base, path.join(f.directory, 'audible.mp4'), {'graphics-audio': true, sfx: f.tone});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.audio.expectedSilence, false);
  assert.equal(result.voice.applicable, false);
  assert.ok(Math.abs(result.delivered.LUFS + 14) <= 1);
  assert.ok(result.delivered.truePeakDb <= -0.7);
  const videoHash = async file => (await command(['-i', file, '-map', '0:v:0', '-c:v', 'copy', '-f', 'hash', '-hash', 'sha256', '-'])).stdout.trim();
  assert.equal(await videoHash(result.out), await videoHash(f.base));
  t.diagnostic(JSON.stringify({mode: result.audio.mode, expectedSilence: result.audio.expectedSilence, LUFS: result.delivered.LUFS, truePeakDb: result.delivered.truePeakDb}));
});

test('recording silence and audible graphics bases are still refused without publishing', async t => {
  const f = await audioFixtures(t);
  for (const [name, video, extra] of [['recording-silence', f.base, {}], ['audible-graphics-base', f.recorded, {'graphics-audio': true, sfx: f.tone}]]) {
    const out = path.join(f.directory, `${name}.mp4`), result = await mix(video, out, extra);
    assert.equal(result.ok, false);
    assert.equal(result.published, false);
    assert.match(result.errors[0].message, /voice|silent|silence/i);
    assert.equal(await fs.stat(out).catch(() => null), null);
  }
});

test('ordinary recorded audio keeps its existing loudness and peak gates', async t => {
  const f = await audioFixtures(t);
  const result = await mix(f.recorded, path.join(f.directory, 'recording.mp4'));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.audio.mode, 'dialogue');
  assert.equal(result.audio.expectedSilence, false);
  assert.ok(Math.abs(result.delivered.LUFS + 14) <= 1);
  assert.ok(result.delivered.truePeakDb <= -0.7);
});

test('a 20-second graphics timeline trims padded AAC without dropping video or short audio coverage', async t => {
  const f = await audioFixtures(t), padded = path.join(f.directory, 'padded-20.mp4');
  await command(['-f', 'lavfi', '-i', 'color=c=black:s=64x96:r=30:d=20', '-f', 'lavfi', '-t', '20.053', '-i', 'anullsrc=r=48000:cl=stereo',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', padded]);
  const result = await mix(padded, path.join(f.directory, 'trimmed-20.mp4'), {'graphics-audio': true, sfx: f.silence});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.audio.expectedSilence, true);
  assert.ok(Math.abs(result.durationSec - 20) <= 1 / 48000, `measured audio ${result.durationSec}s must match the true 20s video`);
  const {stdout} = await exec(path.join(ROOT, 'Tools', 'bin', 'ffprobe.exe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration,nb_frames', '-of', 'json', result.out], {windowsHide: true});
  const video = JSON.parse(stdout).streams[0];
  assert.equal(Number(video.nb_frames), 600);
  assert.equal(Number(video.duration), 20);
});
