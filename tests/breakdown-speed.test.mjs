import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {run} from '../scripts/lib/media.mjs';
import {runAnalyser} from '../scripts/lib/breakdown-python.mjs';
import {analyserSession,resourceBudget,overlap,assertExecutionUnchanged,planSpeech} from '../scripts/lib/breakdown-session.mjs';
import {inspectBreakdownRuntime,runtimeTestSkip,modelPaths} from '../scripts/lib/breakdown-runtime.mjs';

test('resource budget and pool bound active work and wait for cancellation cleanup',async()=>{
  for(const cores of [1,2,3,4,8,32]){
    const b=resourceBudget(cores);assert.ok(b.asr<=4);assert.ok(b.pool===1 || b.asr+b.vision<=cores);
    let active=0,max=0;
    await overlap(Array.from({length:6},()=>async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;}),b.pool);
    assert.ok(max<=b.pool);
  }
  let cleaned=false;
  await assert.rejects(()=>overlap([async()=>{throw Error('failed');},async()=>{await new Promise(r=>setTimeout(r,10));cleaned=true;}],2),/failed/);
  assert.equal(cleaned,true);
});

test('budgets protect ASR while preserving full vision when it is inactive',()=>{
  for(const [cores,vision,pool] of [[4,1,1],[5,1,1],[8,1,2],[12,3,2],[16,3,2]]){
    assert.equal(resourceBudget(cores,true).vision,vision);assert.equal(resourceBudget(cores,true).pool,pool);
    for(const state of ['skipped','cached','off']){
      const b=resourceBudget(cores,false);assert.equal(b.vision,cores,state);assert.equal(b.pool,1,state);assert.equal(b.onnx,cores,state);
    }
  }
});

test('the ASR decision waits for cache/skip resolution but not a live encoder',async()=>{
  for(const state of ['skipped','cached','off']){
    const plan=planSpeech(async()=>({state}));assert.equal(await plan.running,false);assert.deepEqual(await plan.wait(),{state});
  }
  let finish;const plan=planSpeech(onRun=>{onRun();return new Promise(resolve=>{finish=resolve;});});
  assert.equal(await plan.running,true);finish({done:true});assert.deepEqual(await plan.wait(),{done:true});
  const failed=planSpeech(async()=>{throw Error('preflight failed');});assert.equal(await failed.running,false);await assert.rejects(()=>failed.wait(),/preflight failed/);
});

test('ASR may update captions without hiding a changed implementation, model or source',()=>{
  const before={source:'source',prepare:{proxySha256:'proxy'},hashes:[['code','old']],asr:'runtime',faces:['face'],transcript:'old captions'};
  assert.doesNotThrow(()=>assertExecutionUnchanged(before,{...before,transcript:'new captions'}));
  assert.doesNotThrow(()=>assertExecutionUnchanged({...before,execution:resourceBudget(8)},{...before,execution:resourceBudget(16)}));
  for(const changed of [{source:'other'},{hashes:[['code','new']]},{asr:'other runtime'},{faces:['changed model']},{prepare:{proxySha256:'other'}}]){
    assert.throws(()=>assertExecutionUnchanged(before,{...before,...changed,transcript:'new captions'}),/changed during analysis/);
  }
});

const skip=runtimeTestSkip(await inspectBreakdownRuntime());
test('one worker matches standalone analyser JSON, retains diagnostics, and aborts cleanly',{skip,timeout:180000},async t=>{
  const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'breakdown-speed-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const proxy=path.join(dir,'proxy.mp4');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x284:rate=10:duration=2','-vf',"drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='PARITY':fontsize=26:fontcolor=white:x=10:y=80:box=1:boxcolor=black",'-c:v','libx264','-g','1','-pix_fmt','yuv420p',proxy]);
  const old=path.join(dir,'worker-orphan'),unrelated=path.join(dir,'keep-me');
  await fs.mkdir(old);await fs.writeFile(path.join(old,'old.bgr'),'leftover');await fs.mkdir(unrelated);
  const session=await analyserSession(dir);
  await assert.rejects(()=>fs.stat(old),{code:'ENOENT'});assert.ok((await fs.stat(unrelated)).isDirectory());
  await session.configure(resourceBudget(undefined,false));
  try{
    const options={workDir:dir,force:true};
    const requests=[['shots',{proxy}],['look',{proxy}]];
    for(const [name,request] of requests){
      const before=await runAnalyser(name,request,options);
      const after=await runAnalyser(name,request,{...options,exec:session.exec});assert.deepEqual(after,before);
      if(name==='shots')requests.push(['camera',{proxy,shots:before.shots}]);
    }
    const models=modelPaths();const req={proxy,models:{det:models.det,rec:models.rec,keys:models.keys},visualOrder:true};
    const before=await runAnalyser('text',req,options);
    assert.ok(before.text.length>0,'parity must cover actual OCR readings and palette measurement');
    const after=await runAnalyser('text',req,{...options,exec:session.exec});assert.deepEqual(after,before);
    await assert.rejects(()=>runAnalyser('text',{proxy,models:{}},{...options,exec:session.exec}),/Breakdown text failed/);
    assert.match(await fs.readFile(path.join(dir,'logs','text.log'),'utf8'),/Traceback/);
  }finally{await session.close();}
  const controller=new AbortController(),cancelled=await analyserSession(dir,{signal:controller.signal});
  controller.abort(new Error('cancel test'));
  try{await assert.rejects(()=>runAnalyser('look',{proxy},{workDir:dir,force:true,exec:cancelled.exec}),/cancel test/);}
  finally{await cancelled.close();}
});
