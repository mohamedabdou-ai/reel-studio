import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {ROOT,run,writeJson,ffprobeJson} from '../scripts/lib/media.mjs';
import {renderChunks,validateChunk,assembleChunks,contentHash,mediaContract} from '../scripts/lib/render-chunks.mjs';
import {buildAudioTimeline,reviseAudio,streamSignature} from '../scripts/lib/audio-revision.mjs';
import {spliceRevision} from '../scripts/lib/segment-revision.mjs';
import {VUI_BSF} from '../scripts/lib/ig.mjs';

const videoArgs=['-c:v','libx264','-preset','veryfast','-crf','20','-profile:v','high','-pix_fmt','yuv420p','-g','60','-keyint_min','60','-sc_threshold','0','-color_range','tv','-colorspace','bt709','-color_trc','bt709','-color_primaries','bt709','-bsf:v',VUI_BSF];
const scratch=async(t)=>{const dir=await fs.mkdtemp(path.join(ROOT,'state/tmp/runtime-media-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;};

test('real 44.1 kHz cuts use the same samples as full resample then cut',async(t)=>{
  const dir=await scratch(t),source=path.join(dir,'source.wav'),resampled=path.join(dir,'full.raw'),cut=path.join(dir,'cut.wav'),decoded=path.join(dir,'cut.raw');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=713:sample_rate=44100:duration=4','-c:a','pcm_s16le',source]);
  await run('ffmpeg',['-v','error','-y','-i',source,'-af','aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo','-f','f32le',resampled]);
  const manifest={version:1,fps:30,durationInFrames:30,tracks:[{kind:'voice',src:source,fromFrame:0,sourceFromFrame:15,durationInFrames:30}]};
  const plan=buildAudioTimeline(manifest);
  await run('ffmpeg',['-v','error','-y','-i',source,'-filter_complex',plan.filter,'-map','[outa]','-c:a','pcm_f32le',cut]);
  await run('ffmpeg',['-v','error','-y','-i',cut,'-f','f32le',decoded]);
  const full=await fs.readFile(resampled),actual=await fs.readFile(decoded),expected=full.subarray(24000*8,72000*8);
  assert.equal(actual.length,48000*8);assert.deepEqual(actual,expected);
});

test('chunk scanning rejects unapproved black frames and accepts explicitly authored black intervals',async(t)=>{
  const dir=await scratch(t),file=path.join(dir,'black.mp4');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=black:s=320x240:r=30:d=1',...videoArgs,'-an',file]);
  const expected={width:320,height:240,fps:30,codec:'h264',profile:'High',pixelFormat:'yuv420p'};
  await assert.rejects(validateChunk(file,[0,29],expected),/black frames/);
  const checked=await validateChunk(file,[0,29],{...expected,allowBlackRanges:[[0,29]]});
  assert.ok(checked.scan.blackRanges.length>0);
});

test('actual ultrafast preview chunks validate their Baseline profile while delivery remains High',async(t)=>{
  const {chunkProfile}=await import('../scripts/lib/render-chunks.mjs'),dir=await scratch(t),file=path.join(dir,'preview.mp4');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=180x320:r=30:d=1','-c:v','libx264','-preset','ultrafast','-profile:v','high','-crf','28','-pix_fmt','yuv420p','-an',file]);
  const actual=await mediaContract(file);assert.equal(actual.profile,'Constrained Baseline');
  assert.equal(chunkProfile('slow'),'High');
  await validateChunk(file,[0,29],{width:180,height:320,fps:30,codec:'h264',profile:chunkProfile('ultrafast'),pixelFormat:'yuv420p'});
  await assert.rejects(validateChunk(file,[0,29],{width:180,height:320,fps:30,codec:'h264',profile:chunkProfile('slow'),pixelFormat:'yuv420p'}),/profile/);
});

test('real chunk resume, audio-only revision and exact range splice retain their media contracts',async(t)=>{
  const dir=await scratch(t),base=path.join(dir,'base.mp4'),voice=path.join(dir,'voice.wav'),replacement=path.join(dir,'replacement.mp4');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=1080x1920:r=30:d=3','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3',...videoArgs,'-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-movflags','+faststart+negative_cts_offsets',base]);
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=880:sample_rate=44100:duration=3','-c:a','pcm_s16le',voice]);
  const normalizedSource=path.join(dir,'normalized-source.mp4');await fs.copyFile(base,normalizedSource);
  const fixtureProps={edit:{id:'synthetic',style:'paper-collage',source:{fps:30,path:path.relative(ROOT,normalizedSource).replaceAll('\\','/')},segments:[{fromFrame:0,toFrame:90}],captions:{words:[]},scenes:[]},plate:{src:'synthetic.mp4'}};
  await writeJson(`${base}.qc.json`,{comp:'PreparedEdit',mode:'deliver',outputSha256:await contentHash(base),inputProps:fixtureProps});
  const expected={width:1080,height:1920,fps:30,codec:'h264',profile:'High',pixelFormat:'yuv420p'};
  let interrupted=true,rendered=[];
  const render=async({range,out})=>{rendered.push(range[0]);if(range[0]===30&&interrupted)throw Error('simulated stop');await run('ffmpeg',['-v','error','-y','-i',base,'-vf',`trim=start_frame=${range[0]}:end_frame=${range[1]+1},setpts=PTS-STARTPTS`,'-an',...videoArgs,out]);};
  const opts={cacheRoot:path.join(dir,'cache'),key:'d'.repeat(64),frames:90,chunkFrames:30,jobs:1,render,validate:(file,range)=>validateChunk(file,range,expected)};
  await assert.rejects(renderChunks(opts),/simulated stop/);interrupted=false;rendered=[];
  const resumed=await renderChunks(opts);assert.equal(resumed.reused,1);assert.deepEqual(rendered,[30,60]);
  const assembled=path.join(dir,'assembled.mp4');
  await assembleChunks({parts:resumed.parts,audio:voice,out:assembled,fps:30,frames:90});
  assert.equal((await mediaContract(assembled)).frames,90);
  const manifest={version:1,fps:30,durationInFrames:90,tracks:[{kind:'voice',src:path.relative(ROOT,voice).replaceAll('\\','/'),fromFrame:0,sourceFromFrame:0,durationInFrames:90}]};
  const audioOut=path.join(dir,'audio-revised.mp4'),audioResult=await reviseAudio({base,manifest,out:audioOut});
  assert.equal(audioResult.igCheck.file,audioOut);
  assert.equal(audioResult.ok,true);assert.deepEqual(await streamSignature(base),await streamSignature(audioOut));
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=red:s=1080x1920:r=30:d=1',...videoArgs,'-an',replacement]);
  await writeJson(`${replacement}.range.json`,{version:1,range:[30,59],totalFrames:90,fps:30,sha256:await contentHash(replacement),props:fixtureProps});
  const originalSourceHash=await contentHash(normalizedSource);
  await assert.rejects(spliceRevision({base:audioOut,replacement,out:normalizedSource,range:[30,59],pictureGate:async()=>({fixture:'synthetic picture'}),motionGate:async()=>({fixture:'synthetic colors'})}),/source input/);
  assert.equal(await contentHash(normalizedSource),originalSourceHash);
  const output=path.join(dir,'picture-revised.mp4');
  const result=await spliceRevision({base:audioOut,replacement,out:output,range:[30,59],pictureGate:async()=>({fixture:'synthetic picture'}),motionGate:async()=>({fixture:'synthetic colors'})});
  assert.equal(result.ok,true);assert.equal((await mediaContract(output)).frames,90);
  assert.equal(result.igCheck.file,output);
  assert.deepEqual(await streamSignature(audioOut,'audio'),await streamSignature(output,'audio'));
  // Inspect all three ranges, including immediately either side of both joins.
  const pixels=path.join(dir,'samples.rgb');
  await run('ffmpeg',['-v','error','-y','-i',output,'-vf',"select='eq(n,29)+eq(n,30)+eq(n,59)+eq(n,60)',scale=1:1",'-fps_mode','vfr','-f','rawvideo','-pix_fmt','rgb24',pixels]);
  const rgb=await fs.readFile(pixels);assert.equal(rgb.length,12);
  for(const index of [0,3])assert.ok(rgb[index*3+2]>rgb[index*3]+100);
  for(const index of [1,2])assert.ok(rgb[index*3]>rgb[index*3+2]+100);
  const probe=await ffprobeJson(output);assert.equal(probe.streams.find(s=>s.codec_type==='audio').sample_rate,'48000');
});
