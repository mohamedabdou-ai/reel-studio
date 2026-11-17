import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {collectSpeech} from '../scripts/breakdown.mjs';
const prepared = {source:{path:'named-reference.mp4'},workDir:path.join(PROJECT_TMP,'speech-gate-contract'),probe:{hasAudio:true,durationSec:2}};
const evidence = hasVoicing => ({schema:1,hasVoicing,independentSpans:hasVoicing?[{start:0,end:1,confidence:.8}]:[]});

test('ASR starts before the deferred voice getter and preserves defensive limitation text',async()=>{
  let releaseVoice,started;
  const ready=new Promise(resolve=>{releaseVoice=resolve;}),began=new Promise(resolve=>{started=resolve;});
  let calls=0,gets=0;
  const work=collectSpeech(prepared,{voiceEvidence:async()=>{gets++;return ready;},transcribe:async()=>{
    calls++;started();return {cached:false,report:{runtime:{vad:calls===1}}};
  },read:async()=>[{text:'word',startMs:100,endMs:500}]});
  await began;releaseVoice(evidence(true));
  const result=await work;
  assert.equal(gets,1);assert.equal(calls,2);assert.equal(result.limitation,null);
  assert.deepEqual(result.captions,[{text:'word',startMs:100,endMs:500}]);
});

test('execution decision, cancellation and thread cap reach plain ASR and defensive retries',async()=>{
  const signal=new AbortController().signal;let started=0,calls=0;
  await collectSpeech(prepared,{threads:3,signal,onRun:()=>started++,transcribe:async(options,hooks)=>{
    assert.equal(options.threads,3);assert.equal(hooks.signal,signal);hooks.onRun();calls++;
    return {cached:false,report:{runtime:{vad:calls===1}}};
  },read:async()=>[]});
  assert.equal(calls,2);assert.equal(started,2);
});
test('VAD stays default-off even without DSP voicing until unseen voice-over-music recall is validated',async()=>{
  for(const hasVoicing of [true,false]) {
    let args;
    const got=await collectSpeech(prepared,{voiceEvidence:evidence(hasVoicing),transcribe:async a=>{args=a;return {cached:false};},read:async()=>[]});
    assert.equal(args.vad,false);assert.deepEqual(got.captions,[]);
  }
  let args;await collectSpeech(prepared,{transcribe:async a=>{args=a;},read:async()=>[]});assert.equal(args.vad,false);
  await collectSpeech(prepared,{voiceEvidence:{...evidence(false),possibleVoicing:true},transcribe:async a=>{args=a;},read:async()=>[]});assert.equal(args.vad,false);
});
test('speech found by VAD only is recorded and plain ASR is rerun',async()=>{
  const calls=[];let reads=0;
  const got=await collectSpeech(prepared,{voiceEvidence:evidence(false),transcribe:async a=>{
    calls.push(a);return {cached:false,report:{runtime:{vad:calls.length===1}}};
  },read:async()=>++reads===1?[{text:'unexpected',startMs:100,endMs:500}]:[]});
  assert.equal(calls.length,2);assert.equal(calls[1].vad,false);assert.equal(calls[1].force,true);
  assert.match(got.limitation,/speech found by VAD only/);assert.deepEqual(got.captions,[]);
});
test('a VAD zero-word response conflicting with voice evidence retries plain ASR without cache',async()=>{
  const calls=[];let reads=0;
  const captions=[{text:'word',startMs:100,endMs:500}];
  const got=await collectSpeech(prepared,{voiceEvidence:evidence(true),transcribe:async a=>{
    calls.push(a);return {cached:false,report:{runtime:{vad:calls.length===1}}};
  },read:async()=>++reads===1?[]:captions});
  assert.equal(calls.length,2);assert.equal(calls[1].vad,false);assert.equal(calls[1].force,true);assert.deepEqual(got.captions,captions);
});
