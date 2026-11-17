// tests/breakdown-python.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {runAnalyser} from '../scripts/lib/breakdown-python.mjs';

test('runAnalyser writes the request, runs python -m breakdown and reads the result', async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-py-'));
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const seen = [];
  const exec = async (command, args, options) => {
    seen.push({command, args, label: options.label});
    const output = args[args.indexOf('--output') + 1];
    const request = JSON.parse(await fsp.readFile(args[args.indexOf('--input') + 1], 'utf8'));
    await fsp.writeFile(output, JSON.stringify({shots: [], cuts: [], transitions: [], echo: request.value, analyser: {name: 'shots', version: '1.0.0'}}), 'utf8');
  };
  const result = await runAnalyser('shots', {value: 7}, {workDir: dir, exec, paths: {python: 'py.exe'}});
  assert.equal(result.echo, 7);
  assert.equal(seen[0].command, 'py.exe');
  assert.deepEqual(seen[0].args.slice(0, 3), ['-m', 'breakdown', 'shots']);
  assert.equal(seen[0].label, 'Breakdown shots');
});

test('analyser caches by source bytes, request and implementation and never accepts stale output', async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-cache-')); t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const proxy = path.join(dir, 'proxy.mp4'); await fsp.writeFile(proxy, 'first'); let calls = 0;
  const exec = async (_command, args) => { calls++; await fsp.writeFile(args[args.indexOf('--output') + 1], JSON.stringify({text: [], analyser: {name:'text',version:'1.0.0'}})); };
  const timings = [];
  const options = {workDir:dir,exec,paths:{python:'fake'}, onTiming: t => timings.push(t)};
  await runAnalyser('text',{proxy},options); await runAnalyser('text',{proxy},options); assert.equal(calls,1);
  assert.deepEqual(timings.map(t => [t.cacheHit,t.state]), [[false,'cold'],[true,'warm']]);
  assert.ok(timings.every(t => t.wallSec >= 0 && t.stage === 'text'));
  await fsp.writeFile(proxy,'second'); await runAnalyser('text',{proxy},options); assert.equal(calls,2);
  await assert.rejects(() => runAnalyser('../outside',{},options), /Unknown/);
  await assert.rejects(() => runAnalyser('text',{proxy},{...options,force:true,exec:async()=>{}}), /ENOENT/);
});

test('thread counts only partition caches for parallel CV or ONNX, not pure DSP',async t=>{
  const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-execution-cache-'));t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
  const wav=path.join(dir,'audio.wav');await fsp.writeFile(wav,'fixture');let calls=0;
  const exec=async(_command,args)=>{calls++;const name=args[2];await fsp.writeFile(args[args.indexOf('--output')+1],JSON.stringify({[name]:{},analyser:{name,version:'1.0.0'}}));};
  exec.cacheIdentity={vision:1,onnx:1};
  const options={workDir:dir,exec,paths:{python:'fake'}};
  await runAnalyser('sound',{wav},options);
  exec.cacheIdentity={vision:8,onnx:8};await runAnalyser('sound',{wav},options);assert.equal(calls,1);
  await runAnalyser('look',{proxy:wav},options);
  exec.cacheIdentity={vision:4,onnx:4};await runAnalyser('look',{proxy:wav},options);assert.equal(calls,3);
});
