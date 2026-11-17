import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {exactPcmSilence} from '../scripts/lib/breakdown-pcm.mjs';
import {createRunTiming} from '../scripts/lib/breakdown-timing.mjs';
import {collectSpeech} from '../scripts/breakdown.mjs';

function pcm() {
  const b = Buffer.alloc(44 + 3200); b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(16000,24); b.writeUInt32LE(32000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(3200,40); return b;
}
test('digital silence skips ASR, but one least-significant nonzero sample still transcribes', async t => {
  const dir = await fs.mkdtemp(path.join(PROJECT_TMP,'breakdown-silence-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'audio.wav'); await fs.writeFile(file,pcm());
  let calls=0;
  const prepared={wav:{path:file},source:{path:'named.mp4'},workDir:dir,probe:{hasAudio:true,durationSec:.1}};
  const options={transcribe:async()=>{calls++;return {cached:false};},read:async()=>[]};
  const silent=await collectSpeech(prepared,options);
  assert.deepEqual(silent.captions,[]); assert.equal(silent.skipped,true); assert.match(silent.reason,/digitally silent/); assert.equal(calls,0);
  const quiet=pcm();quiet.writeInt16LE(1,100);await fs.writeFile(file,quiet);
  assert.equal(await exactPcmSilence(file),false); await collectSpeech(prepared,options);assert.equal(calls,1);
  await assert.rejects(exactPcmSilence(file,'f'.repeat(64)),/PCM changed/);
  const empty=pcm().subarray(0,44);empty.writeUInt32LE(36,4);empty.writeUInt32LE(0,40);
  for (const malformed of [pcm().subarray(0,43),Buffer.from('not a wav'),empty]) {
    await fs.writeFile(file,malformed);assert.equal(await exactPcmSilence(file),false);
    const before=calls;await collectSpeech(prepared,options);assert.equal(calls,before+1);
    await assert.rejects(collectSpeech({...prepared,cache:{wavSha256:'f'.repeat(64)}},options),/PCM changed/);
    assert.equal(calls,before+1);
  }
  const wrong=pcm();wrong.writeUInt16LE(32,34);await fs.writeFile(file,wrong);assert.equal(await exactPcmSilence(file),false);
});
test('timing records cold, warm, mixed, skipped and failed stages without altering results',async()=>{
  let now=0;const timer=createRunTiming({clock:()=>now});
  const value={kept:true};assert.equal(await timer.stage('shots',async()=>{now+=100;return value;},()=>({cacheHit:false})),value);
  await timer.stage('text',async()=>{now+=20;},()=>({cacheHit:true}));
  await timer.stage('asr',async()=>{now+=5;},()=>({cacheHit:false,skipped:true,reason:'silence'}));
  await assert.rejects(timer.stage('failure',async()=>{now+=10;throw new Error('broken');}),/broken/);
  const snapshot=timer.snapshot();assert.equal(snapshot.wallSec,.135);assert.equal(snapshot.cacheState,'mixed');
  assert.deepEqual(snapshot.stages.map(s=>s.state),['cold','warm','skipped','failed']);
  assert.equal(snapshot.stages[0].wallSec,.1);snapshot.stages.pop();assert.equal(timer.snapshot().stages.length,4);
});
test('unknown cache provenance never qualifies as cold, and force reaches ASR',async()=>{
  const timer=createRunTiming();await timer.stage('prepare',async()=>{},()=>({cacheHit:false}));
  await timer.stage('presenter',async()=>{});assert.equal(timer.snapshot().cacheState,'unknown');
  let args;
  await collectSpeech({source:{path:'named-reference.mp4'},workDir:path.join(PROJECT_TMP,'cold-asr-contract'),probe:{hasAudio:true,durationSec:1}},
    {force:true,transcribe:async a=>{args=a;return {cached:false};},read:async()=>[]});
  assert.equal(args.force,true);
});
