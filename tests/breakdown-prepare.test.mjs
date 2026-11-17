// tests/breakdown-prepare.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {run, ffprobeJson, summarizeProbe} from '../scripts/lib/media.mjs';
import {assertSlug, referenceIdFor, cropFromDetect, prepareReference, analysisRate, outDirFor, guardedFile} from '../scripts/lib/breakdown-prepare.mjs';

test('slugs and reference ids are safe', () => {
  assert.equal(assertSlug('my-reel-1'), 'my-reel-1');
  assert.throws(() => assertSlug('../x'), /project name/u);
  assert.equal(referenceIdFor('a'.repeat(64)), 'ref-aaaaaaaaaaaa');
});

test('cropdetect output becomes a crop only when bars exist', () => {
  assert.deepEqual(cropFromDetect('crop=540:700:0:130\ncrop=540:704:0:128', 540, 960), {x: 0, y: 128, w: 540, h: 704});
  assert.equal(cropFromDetect('crop=540:960:0:0', 540, 960), null);
});

test('prepare crops bars and writes a proxy and a 16 kHz wav', {timeout: 120000}, async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-prepare-'));
  const slug = `breakdown-test-${path.basename(dir).slice(-6).toLowerCase()}`;
  t.after(async () => { await fsp.rm(dir, {recursive: true, force: true}); await fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}); });
  const source = path.join(dir, 'bars.mp4');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=540x700:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2',
    '-vf', 'pad=540:960:0:130:black', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
  const prepared = await prepareReference({reference: source, project: slug});
  assert.match(prepared.referenceId, /^ref-[0-9a-f]{12}$/u);
  assert.ok(prepared.crop && Math.abs(prepared.crop.h - 700) <= 4);
  const proxy = summarizeProbe(prepared.proxy.path, await ffprobeJson(prepared.proxy.path));
  assert.equal(proxy.width, 540);
  assert.ok(Math.abs(proxy.durationSec - 2) < 0.1);
  assert.equal(summarizeProbe(prepared.wav.path, await ffprobeJson(prepared.wav.path)).audioSampleRate, 16000);
  assert.ok(prepared.outDir.endsWith(path.join('style-analysis', prepared.referenceId)));
  const again = await prepareReference({reference: source, project: slug});
  assert.deepEqual(again, prepared);
});

test('paths reject traversal and invalid reference ids; rates preserve 60 and fractional fps', () => {
  for (const ref of ['../ref-123456789abc','ref-abc','ref-123456789abc/../../x','REF-123456789abc']) assert.throws(()=>outDirFor('safe',ref),/reference/);
  assert.throws(()=>guardedFile(path.join(ROOT,'Projects','safe'),'../../../../escape'),/Unsafe/);
  assert.deepEqual(analysisRate({streams:[{codec_type:'video',avg_frame_rate:'30000/1001',r_frame_rate:'30000/1001'}]}),{rate:'30000/1001',fps:30000/1001,fallback:false});
  assert.equal(analysisRate({streams:[{codec_type:'video',avg_frame_rate:'45/1',r_frame_rate:'60/1'}]}).fps,60);
  assert.equal(analysisRate({streams:[]}).fallback,true);
});
test('short silent source is intact and an incomplete audio cache is rebuilt', {timeout:120000}, async t => {
  const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-cache-')), slug='breakdown-test-'+path.basename(dir).slice(-6).toLowerCase();
  t.after(async()=>{await fsp.rm(dir,{recursive:true,force:true});await fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true});});
  const silent=path.join(dir,'silent.mp4');
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=blue:s=128x224:r=60:d=0.05','-c:v','libx264',silent]);
  const before=await fsp.readFile(silent), prepared=await prepareReference({reference:silent,project:slug});
  assert.equal(prepared.wav,null);assert.equal(prepared.probe.hasAudio,false);assert.equal(prepared.proxy.fps,60);assert.deepEqual(await fsp.readFile(silent),before);
  const audio=path.join(dir,'audio.mp4');await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=red:s=128x224:r=30:d=0.5','-f','lavfi','-i','sine=f=1000:d=0.5','-c:v','libx264','-c:a','aac','-shortest',audio]);
  const first=await prepareReference({reference:audio,project:slug});await fsp.rm(first.wav.path);const second=await prepareReference({reference:audio,project:slug});assert.ok((await fsp.stat(second.wav.path)).size>44);
  const cache=JSON.parse(await fsp.readFile(path.join(first.workDir,'prepare.json'),'utf8'));cache.cache.settings.version=0;await fsp.writeFile(path.join(first.workDir,'prepare.json'),JSON.stringify(cache));
  assert.notEqual((await prepareReference({reference:audio,project:slug})).cache.settings.version,0);
});
test('VFR 60fps source produces CFR proxy while video event and audio keep source time', {timeout:120000}, async t => {
  const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-vfr-')),slug='breakdown-test-'+path.basename(dir).slice(-6).toLowerCase();
  t.after(async()=>{await fsp.rm(dir,{recursive:true,force:true});await fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true});});
  const source=path.join(dir,'vfr.mp4');
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=blue:s=128x224:r=60:d=2','-f','lavfi','-i','sine=f=1000:r=16000:d=2',
    '-vf',"drawbox=c=red:t=fill:enable='gte(t,1)',select='if(lt(t,0.5),not(mod(n,2)),1)'",'-af',"volume=enable='lt(t,1)':volume=0",'-fps_mode','vfr','-c:v','libx264','-c:a','aac',source]);
  const original=await ffprobeJson(source);const video=original.streams.find(s=>s.codec_type==='video');assert.notEqual(video.avg_frame_rate,video.r_frame_rate);
  const p=await prepareReference({reference:source,project:slug});assert.equal(p.proxy.fps,60);
  const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',p.proxy.path]);
  const times=JSON.parse(stdout).frames.map(f=>Number(f.best_effort_timestamp_time));assert.ok(times.slice(1).every((v,i)=>Math.abs(v-times[i]-1/60)<.000002));
  const {stderr}=await run('ffmpeg',['-hide_banner','-i',p.proxy.path,'-vf',"select='eq(n,59)+eq(n,60)',scale=1:1,showinfo",'-fps_mode','passthrough','-f','null','-']);
  const means=stderr.split('\n').filter(l=>l.includes(' mean:[')).map(l=>l.split('mean:[')[1].split(']')[0].split(' ').map(Number));assert.equal(means.length,2);assert.ok(means[0][2]<150 && means[1][2]>200,JSON.stringify(means));
  const wav=await fsp.readFile(p.wav.path);const data=wav.indexOf(Buffer.from('data'));assert.ok(data>0);const start=data+8;let peakBefore=0,peakAfter=0;
  for(let i=0;i<16000*1.5;i++){const sample=Math.abs(wav.readInt16LE(start+i*2));if(i<15000)peakBefore=Math.max(peakBefore,sample);if(i>16200)peakAfter=Math.max(peakAfter,sample);}
  assert.ok(peakBefore<80 && peakAfter>1000,JSON.stringify({peakBefore,peakAfter}));
});

test('overstated VFR tags are bounded relative to average without a 30fps cap',()=>{
 const raw=(avg,tag)=>({streams:[{codec_type:'video',avg_frame_rate:avg,r_frame_rate:tag}]});
 const capped=analysisRate(raw('30/1','120/1'));assert.equal(capped.fps,30);assert.match(capped.limitation,/2x/);
 assert.equal(analysisRate(raw('30/1','60/1')).fps,60);assert.equal(analysisRate(raw('60000/1001','60000/1001')).fps,60000/1001);
});
test('audio 0.3 seconds longer than video is aligned to the video timeline with a limitation',{timeout:120000},async t=>{
 const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-tail-')),slug='breakdown-test-'+path.basename(dir).slice(-6).toLowerCase();
 t.after(async()=>{await fsp.rm(dir,{recursive:true,force:true});await fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true});});
 const source=path.join(dir,'audio-tail.mp4');await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=blue:s=128x224:r=30:d=1','-f','lavfi','-i','sine=f=440:d=1.3','-c:v','libx264','-c:a','aac',source]);
 const p=await prepareReference({reference:source,project:slug});assert.ok(p.probe.containerDurationSec-p.probe.videoDurationSec>.25);
 assert.ok(Math.abs(p.probe.durationSec-1)<.04);assert.ok(p.limitations.some(s=>s.includes('differs from video')));
 const wav=summarizeProbe(p.wav.path,await ffprobeJson(p.wav.path));assert.ok(Math.abs(wav.durationSec-1)<.03);
 const {mergeBreakdown}=await import('../scripts/lib/breakdown-merge.mjs');
 const b=mergeBreakdown({prepare:p,shots:{durationSec:p.proxy.durationSec,cuts:[],transitions:[],shots:[{id:'S01',start:0,end:p.proxy.durationSec,len:p.proxy.durationSec}]},camera:{camera:[]},overlays:{overlays:[]},look:{look:{label:'natural',score:.6}},text:{text:[]},sound:null});
 assert.equal(b.durationSec,p.proxy.durationSec);
});

test('delayed video stream keeps the shared audio/video origin without a duration failure',{timeout:120000},async t=>{
 const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-offset-')),slug='breakdown-test-'+path.basename(dir).slice(-6).toLowerCase();
 t.after(async()=>{await fsp.rm(dir,{recursive:true,force:true});await fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true});});
 const source=path.join(dir,'delayed.mp4');
 await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-itsoffset','0.4','-f','lavfi','-i','color=blue:s=128x224:r=30:d=1','-f','lavfi','-i','sine=f=440:d=1.4','-fps_mode','passthrough','-c:v','libx264','-c:a','aac',source]);
 const raw=await ffprobeJson(source);assert.ok(Number(raw.streams.find(s=>s.codec_type==='video').start_time)>.3);
 const p=await prepareReference({reference:source,project:slug});assert.ok(p.probe.videoStartSec>.3);assert.ok(Math.abs(p.proxy.durationSec-1.4)<.07);assert.ok(p.limitations.some(s=>s.includes('input origin')));
 const audio=summarizeProbe(p.wav.path,await ffprobeJson(p.wav.path));assert.ok(Math.abs(audio.durationSec-p.proxy.durationSec)<.07);
});
