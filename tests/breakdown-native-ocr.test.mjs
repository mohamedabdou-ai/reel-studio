import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {sha256File} from '../scripts/lib/studio-download.mjs';
import {inspectBreakdownRuntime,breakdownPaths} from '../scripts/lib/breakdown-runtime.mjs';
import {buildSyntheticReel} from '../scripts/lib/breakdown-fixture.mjs';
import {prepareReference} from '../scripts/lib/breakdown-prepare.mjs';
import {runAnalyser} from '../scripts/lib/breakdown-python.mjs';
import {scoreBreakdown} from '../scripts/lib/breakdown-score.mjs';
const execute=promisify(execFile),pins=JSON.parse(await fsp.readFile(path.join(ROOT,'scripts/data/breakdown-pins.json'),'utf8'));
const readiness=await inspectBreakdownRuntime();
if(readiness.installed && !readiness.ready)throw new Error(readiness.issues.join('; '));
const modelDir=breakdownPaths().models;
const python=readiness.ready?breakdownPaths().python:process.platform==='win32'?'python':'python3';
let runtime=null,skip=false;
if(!fs.existsSync(path.join(modelDir,pins.models.rec.file)))skip='Pinned OCR models are absent; no download or install is attempted.';
else {
 try {const {stdout}=await execute(python,['-c','import json,cv2,numpy,onnxruntime; print(json.dumps({"numpy":numpy.__version__,"cv2":cv2.__version__,"onnxruntime":onnxruntime.__version__}))'],{windowsHide:true,timeout:30000});runtime=JSON.parse(stdout);}
 catch(error){if(readiness.ready)throw error;skip='Neither the add-on nor an existing local Python with the OCR core modules is available.';}
}
test('native OCR meets CER, recall and timing gates on the entire authored fixture',{skip,timeout:300000},async t=>{
 const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-native-ocr-')),slug='breakdown-test-'+path.basename(dir).slice(-6).toLowerCase();
 t.after(async()=>{await fsp.rm(dir,{recursive:true,force:true});await fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true});});
 const fixture=await buildSyntheticReel(dir),prepared=await prepareReference({reference:fixture.video,project:slug});
 const models=Object.fromEntries(['det','rec','keys'].map(key=>[key,pins.models[key]?path.join(modelDir,pins.models[key].file):null]));
 for(const key of ['det','rec'])assert.equal(await sha256File(models[key]),pins.models[key].sha256);
 const temp=path.join(dir,'python-tmp'),cache=path.join(dir,'python-cache');await fsp.mkdir(temp);await fsp.mkdir(cache);
 const started=performance.now();
 const result=await runAnalyser('text',{proxy:prepared.proxy.path,models,visualOrder:pins.ocr.visualOrder},{workDir:prepared.workDir,force:true,paths:{python,temp,cache}});
 const breakdown={cuts:[],transitions:[],shots:[],text:result.text,sound:{sfx:[]}};
 const rows=scoreBreakdown(breakdown,fixture.truth).rows.filter(r=>['textRecall','textCer','textTimingMedianSec','textEntranceAccuracy'].includes(r.measure));
 const receipt={schema:1,backend:'local-onnx',sourceSha256:prepared.source.sha256,models:pins.models,environment:runtime,
  dedicatedRuntime:readiness.ready,durationSec:fixture.truth.durationSec,elapsedSec:(performance.now()-started)/1000,rows,text:result.text};
 const receiptDir=path.join(PROJECT_TMP,'breakdown-artifacts');await fsp.mkdir(receiptDir,{recursive:true});await fsp.writeFile(path.join(receiptDir,'native-ocr-gate.json'),JSON.stringify(receipt,null,2)+'\n','utf8');
 console.log(JSON.stringify({nativeOcrGate:rows,dedicatedRuntime:receipt.dedicatedRuntime,elapsedSec:receipt.elapsedSec}));
 assert.deepEqual(rows.filter(r=>r.pass===false),[],JSON.stringify(receipt));
 assert.equal(result.text.length,fixture.truth.text.length,'Nested word fragments must not create extra cues.');
 for(const expected of fixture.truth.text){
  const cue=result.text.find(c=>c.text===expected.text);assert.ok(cue,JSON.stringify(result.text));
  assert.ok(Math.abs(cue.start-expected.start)<=.15 && Math.abs(cue.end-expected.end)<=.15,JSON.stringify(cue));
  assert.equal(cue.entrance,expected.entrance);assert.equal(cue.zone,expected.zone);
  for (const key of ['fill','stroke','box']) {
    const actual=cue.style[key],wanted=expected[key];
    if(wanted===null)assert.equal(actual,null,key);
    else {assert.match(actual,/^#[0-9a-f]{6}$/i);const distance=Math.hypot(...[1,3,5].map(i=>parseInt(actual.slice(i,i+2),16)-parseInt(wanted.slice(i,i+2),16)));assert.ok(distance<=40,key+': '+actual+' vs '+wanted);}
  }
 }
});
