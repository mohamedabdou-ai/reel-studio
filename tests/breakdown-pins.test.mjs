import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {sha256File} from '../scripts/lib/studio-download.mjs';
import {PINS_FILE,validatePins,loadPins,LicensePolicyError,breakdownPaths,inspectBreakdownRuntime,runtimeTestSkip} from '../scripts/lib/breakdown-runtime.mjs';
const pins=JSON.parse(await fsp.readFile(PINS_FILE,'utf8'));
test('actual lock passes the scoped owner-approved audit and excludes the removed dependencies',()=>{
  assert.equal(validatePins(pins),pins);
  assert.equal(pins.audit.status,'approved');assert.deepEqual(pins.audit.blockers,[]);
  assert.equal(loadPins().audit.status,'approved');
  assert.equal(pins.wheels.length,pins.packages.length);
  const removed=['rapidocr','requests','certifi','tqdm','charset-normalizer','idna','urllib3','pillow','shapely','pyclipper','omegaconf','pyyaml','colorlog','colorama','six','opencv-python'];
  assert.ok(!pins.packages.some(p=>removed.includes(p.split('==')[0])));
  assert.equal(pins.ocr.backend,'local-onnx');
  const runtime=pins.wheels.find(w=>w.name==='onnxruntime');
  assert.equal(runtime.version,'1.23.2');
  assert.equal(runtime.bundledLicenses.find(c=>c.name==='Eigen').license,'MPL-2.0');
  assert.ok(pins.licenseException.components.some(c=>c.package==='onnxruntime' && c.name==='Eigen' && c.license==='MPL-2.0'));
});
test('Eigen permission never authorizes another MPL component, runtime version, artifact or binary',()=>{
  const mutations=[
    (_p,w,c)=>c.name='Another MPL library',
    (_p,w,c)=>c.license='MPL-1.1',
    (p,w,c)=>{w.version='1.23.3';p.packages[p.packages.findIndex(s=>s.startsWith('onnxruntime=='))]='onnxruntime==1.23.3';},
    (_p,w,c)=>w.sha256='a'.repeat(64),
    (_p,w,c)=>w.file='onnxruntime-1.23.2-cp312-cp312-win_amd64.whl',
    (_p,w,c)=>c.binaryFiles=c.binaryFiles.filter(f=>f!=='onnxruntime/capi/onnxruntime.dll'),
    (_p,w,c)=>c.binaryEvidence.find(e=>e.binary==='onnxruntime/capi/onnxruntime.dll').sha256='b'.repeat(64),
    (_p,w,c)=>c.binaryEvidence.find(e=>e.binary==='onnxruntime/capi/onnxruntime.dll').markers=[],
    (_p,w,c)=>c.source='modified-build',
    (_p,w,c)=>w.license='MPL-2.0',
    (_p,w,c)=>w.bundledLicenses.push({...c,name:'Unapproved MPL component'}),
    (p,w,c)=>{w.bundledLicenses=[];p.wheels.find(w=>w.name==='opencv-python-headless').bundledLicenses.push(c);},
  ];
  for(const mutate of mutations){const p=structuredClone(pins),w=p.wheels.find(w=>w.name==='onnxruntime'),c=w.bundledLicenses.find(c=>c.name==='Eigen');mutate(p,w,c);assert.throws(()=>validatePins(p),LicensePolicyError);}
});

const installed=breakdownPaths(),readiness=await inspectBreakdownRuntime();
test('installed OCR models match the lock; wheel cache is optional after verified installation',{skip:runtimeTestSkip(readiness)},async()=>{
  for(const a of Object.values(pins.models).filter(Boolean)){const file=path.join(installed.models,a.file);assert.equal((await fsp.stat(file)).size,a.bytes);assert.equal(await sha256File(file),a.sha256);}
  if(fs.existsSync(installed.wheels))for(const a of pins.wheels){const file=path.join(installed.wheels,a.file);assert.equal(await sha256File(file),a.sha256);}
  else {const {inspectBreakdownRuntime}=await import('../scripts/lib/breakdown-runtime.mjs');assert.equal((await inspectBreakdownRuntime()).ready,true);}
});
test('every named licence exception records its approval date and a neutral scope statement',()=>{
 for(const w of pins.wheels)for(const c of w.bundledLicenses){
  if(!['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','CC0-1.0'].includes(c.license)){
   assert.equal(c.approval.date,'2026-11-15');assert.equal(typeof c.approval.statement,'string');assert.ok(c.approval.statement.includes('Approved'));assert.ok(c.approval.statement.includes(c.name==='GCC runtime library'?'GCC':c.name));
  }
 }
});

test('published licence metadata contains only neutral approval statements and public symbol evidence',async()=>{
 const audit=JSON.parse(await fsp.readFile(path.join(ROOT,'scripts/python/breakdown/license-audit.json'),'utf8'));
 function check(value){
  if(typeof value==='string'){
   assert.ok(!/(?:^|[\s"'=])[a-z]:[\\/]/i.test(value),'Absolute filesystem path in metadata');
   assert.ok(!/(?:^|[\\/])\.[a-z][^\\/]*[\\/]/i.test(value),'Hidden directory reference in metadata');
  }else if(Array.isArray(value))value.forEach(check);else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){assert.notEqual(key,'sourceFile');check(key);check(item);}
 }
 check(pins);check(audit);
});
