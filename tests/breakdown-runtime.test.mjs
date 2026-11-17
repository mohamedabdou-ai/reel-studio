import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {breakdownPaths, breakdownEnvironment, validatePins, requirementsLock, verifyArtifacts, inspectBreakdownRuntime, runtimeTestSkip, installBreakdownRuntime, pruneBreakdownCache, APPROVAL_STATEMENTS} from '../scripts/lib/breakdown-runtime.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(PROJECT_TMP, 'breakdown-runtime-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const paths = breakdownPaths(root), sha = b => createHash('sha256').update(b).digest('hex');
  await fs.mkdir(paths.wheels,{recursive:true}); await fs.mkdir(paths.models,{recursive:true});
  const names = ['numpy','scipy','opencv-python-headless','onnxruntime'];
  const artifact = file => ({file,url:`https://files.pythonhosted.org/${file}`,bytes:1,sha256:sha('a'),license:'MIT',bundledLicenses:[],licenseUrl:'https://pypi.org/project/numpy/'});
  const pins = {schema:1,python:{min:'3.10',maxExclusive:'3.14'},packages:names.map(n => `${n}==1.0.0`),
    wheels:names.map(name => ({...artifact(`${name.replaceAll('-','_')}-1.0.0-py3-none-any.whl`),name,version:'1.0.0'})),
    models:{det:artifact('det.onnx'),rec:artifact('rec.onnx'),keys:null,yamnet:null,yamnetClassMap:null},ocr:{visualOrder:true}};
  for (const w of pins.wheels) await fs.writeFile(path.join(paths.wheels,w.file),'a');
  for (const m of Object.values(pins.models).filter(Boolean)) await fs.writeFile(path.join(paths.models,m.file),'a');
  const pinsFile=path.join(root,'pins.json'); await fs.writeFile(pinsFile,JSON.stringify(pins));
  const metadata={python:'3.11.9',breakdown:'1.0.0',packages:Object.fromEntries(names.map(n=>[n,'1.0.0']))};
  return {root,paths,pins,pinsFile,metadata};
}

test('pins enforce complete hashes, allowed licenses, model slots and PyPI wheels', async t => {
  const {pins}=await fixture(t); assert.equal(validatePins(pins),pins);
  for (const license of ['BSD-3-Clause-Attribution','0BSD','MIT-CMU']) {const variant=structuredClone(pins);variant.wheels[0].license=license;assert.throws(()=>validatePins(variant));} assert.match(requirementsLock(pins),/--hash=sha256:[0-9a-f]{64}/);
  for (const mutate of [p=>p.wheels[0].sha256='bad',p=>p.wheels[0].license='GPL-3.0',p=>p.wheels[0].bundledLicenses=[{name:'GEOS',license:'LGPL-2.1',licenseUrl:'https://libgeos.org/'}],p=>p.wheels[0].url='https://untrusted.example/w.whl',p=>p.wheels.pop(),p=>p.models.rec.file='../escape',p=>p.models.extra=p.models.rec,p=>p.packages.push('librosa==1.0.0')]) {
    const invalid=structuredClone(pins); mutate(invalid); assert.throws(()=>validatePins(invalid));
  }
});
test('only genuinely absent optional runtime can skip; corrupt pins and runtime fail', async t => {
  const {paths,pinsFile,metadata}=await fixture(t);
  const missing=await inspectBreakdownRuntime({paths,pinsFile:path.join(paths.root,'missing')}); assert.equal(missing.unavailable,'pins-missing'); assert.match(runtimeTestSkip(missing),/pins-missing/);
  const absent=await inspectBreakdownRuntime({paths,pinsFile}); assert.equal(absent.unavailable,'runtime-missing');
  await fs.writeFile(pinsFile,'broken'); await assert.rejects(()=>inspectBreakdownRuntime({paths,pinsFile}),/invalid/);
  await fs.mkdir(path.dirname(paths.python),{recursive:true}); await fs.writeFile(paths.python,'fake');
  await assert.rejects(()=>inspectBreakdownRuntime({paths,pinsFile:path.join(paths.root,'missing')}),/invalid/);
  const f=await fixture(t); await fs.mkdir(path.dirname(f.paths.python),{recursive:true});await fs.writeFile(f.paths.python,'fake');
  const corrupt=await inspectBreakdownRuntime({...f,inspectPython:async()=>({...metadata,packages:{}})}); assert.equal(corrupt.ready,false);assert.equal(corrupt.unavailable,null);assert.throws(()=>runtimeTestSkip(corrupt),/failed inspection/);
});
test('local artifacts are size and hash checked; cache reuse performs no download', async t => {
  const f=await fixture(t); await verifyArtifacts(f.pins,f.paths); await verifyArtifacts(f.pins,f.paths);
  await fs.writeFile(path.join(f.paths.models,f.pins.models.rec.file),'b'); await assert.rejects(()=>verifyArtifacts(f.pins,f.paths),/corrupt/);
});
test('offline installer command contract uses local wheels and hash lock and preserves verified models', async t => {
  const f=await fixture(t), calls=[];
  const run=async(command,args,options)=>{
    calls.push({command,args,options}); assert.equal(options.env.PIP_NO_INDEX,'1');
    if(args.includes('venv')) {await fs.mkdir(path.dirname(f.paths.python),{recursive:true});await fs.writeFile(f.paths.python,'fake');}
  };
  const result=await installBreakdownRuntime({...f,run,inspectPython:async()=>f.metadata}); assert.equal(result.ready,true);
  const install=calls.find(c=>c.args.includes('install')); for(const flag of ['--no-index','--find-links','--require-hashes','--only-binary=:all:']) assert.ok(install.args.includes(flag));
  assert.equal(install.args.some(arg=>/^https?:/u.test(arg)),false);
  const before=await fs.stat(path.join(f.paths.models,'rec.onnx')); await installBreakdownRuntime({...f,run,inspectPython:async()=>f.metadata}); const after=await fs.stat(path.join(f.paths.models,'rec.onnx'));
  assert.equal(before.mtimeMs,after.mtimeMs);
});
test('runtime environment strips secrets, isolates Python and disables package indexes', () => {
  const env=breakdownEnvironment({PATH:'local',HF_TOKEN:'secret',GEMINI_API_KEY:'secret',PYTHONHOME:'global',PIP_INDEX_URL:'secret'});
  for(const key of ['HF_TOKEN','GEMINI_API_KEY','PYTHONHOME','PIP_INDEX_URL'])assert.equal(env[key],undefined);
  assert.equal(env.PIP_NO_INDEX,'1');assert.equal(env.PYTHONNOUSERSITE,'1');assert.match(env.PYTHONPATH,/scripts[\\/]python$/);
});

test('LGPL exception is restricted to named bundles in official PyPI wheels',async t=>{
  const {pins}=await fixture(t),w=pins.wheels.find(w=>w.name==='opencv-python-headless');
  const component={approval:{date:'2026-11-15',statement:APPROVAL_STATEMENTS.FFmpeg},name:'FFmpeg',license:'LGPL-2.1-or-later',licenseUrl:'https://ffmpeg.org/legal.html',source:'official-pypi-wheel',binaryFiles:['cv2/ffmpeg.dll'],licenseFile:'cv2/LICENSE-3RD-PARTY.txt',licenseSha256:'a'.repeat(64)};
  w.bundledLicenses=[component];assert.equal(validatePins(pins),pins);
  for(const change of [c=>c.name='Unknown library',c=>c.license='GPL-3.0-only',c=>c.license='AGPL-3.0-only',c=>c.license='MPL-2.0',c=>c.source='custom-build',c=>c.binaryFiles=[]]){
    const p=structuredClone(pins);change(p.wheels.find(w=>w.name==='opencv-python-headless').bundledLicenses[0]);assert.throws(()=>validatePins(p));
  }
  const p=structuredClone(pins);p.wheels[0].license='GPL-3.0-or-later WITH GCC-exception-3.1';assert.throws(()=>validatePins(p),/GCC-exception/);
});

test('owner exceptions are exact package/name/licence triples with evidence',async t=>{
 const {pins}=await fixture(t);
 for(const [parent,name,license] of [['numpy','GCC runtime library','GPL-3.0-or-later WITH GCC-exception-3.1'],['scipy','LAPACK','BSD-3-Clause-Attribution'],['numpy','libdivide','Zlib'],['opencv-python-headless','Intel IPP ICV','LicenseRef-Intel-Simplified-Software-License'],['onnxruntime','Intel MKL','LicenseRef-Intel-Simplified-Software-License']]){
  const p=structuredClone(pins),w=p.wheels.find(w=>w.name===parent),component={approval:{date:'2026-11-15',statement:APPROVAL_STATEMENTS[name]},name,license,source:'official-pypi-wheel',licenseUrl:'https://pypi.org/',binaryFiles:['native.dll'],licenseFile:'LICENSE',licenseSha256:'b'.repeat(64),binaryEvidence:[{file:'native.dll',sha256:'c'.repeat(64),marker:'Intel MKL',offset:12}]};
  w.bundledLicenses=[component];assert.equal(validatePins(p),p);
  for(const invalid of ['GPL-3.0-or-later','AGPL-3.0-only','MPL-2.0']){component.license=invalid;assert.throws(()=>validatePins(p));}component.license=license;
  component.name='Unapproved name';assert.throws(()=>validatePins(p));
 }
 const bad=structuredClone(pins);bad.packages.push('rapidocr==3.10.0');assert.throws(()=>validatePins(bad),/unapproved/);
});

async function retainedFixture(f) {
  const directory=path.join(f.root,'retained-artifacts');
  for (const [from,to,items] of [[f.paths.wheels,path.join(directory,'cache/wheels'),f.pins.wheels],[f.paths.models,path.join(directory,'models'),Object.values(f.pins.models).filter(Boolean)]]) {
    await fs.mkdir(to,{recursive:true});for(const a of items)await fs.copyFile(path.join(from,a.file),path.join(to,a.file));
  }
  return directory;
}
function fakeInstall(f,calls=[]) {
  return async (_command,args)=>{
    calls.push(args);
    if(args.includes('venv')) {await fs.mkdir(path.dirname(f.paths.python),{recursive:true});await fs.writeFile(f.paths.python,'fake');}
    if(args.includes('install')) {
      assert.ok(args.includes('--no-compile'));assert.ok(args.includes('--no-cache-dir'));assert.ok(args.includes('--no-index'));
      for(const a of f.pins.wheels)assert.equal((await fs.readFile(path.join(f.paths.wheels,a.file),'utf8')),'a');
    }
  };
}
test('verified installs discard cache, stay idempotent, and repair only from explicit inputs',async t=>{
 const f=await fixture(t),staging=await retainedFixture(f),calls=[],run=fakeInstall(f,calls),inspectPython=async()=>f.metadata;
 const first=await installBreakdownRuntime({...f,artifactDirectory:staging,run,inspectPython});assert.equal(first.ready,true);assert.deepEqual(await fs.readdir(f.paths.cache),[]);
 const manifest=JSON.parse(await fs.readFile(f.paths.runtimeManifest,'utf8'));assert.equal(manifest.cachePolicy.mode,'discard-after-verified-install');assert.equal(manifest.cachePolicy.artifactDirectory,undefined);
 await installBreakdownRuntime({...f,run,inspectPython});assert.equal(calls.filter(a=>a.includes('install')).length,1);
 await fs.rm(f.paths.python);let downloads=0;
 await assert.rejects(()=>installBreakdownRuntime({...f,run,inspectPython,download:async()=>{downloads++;}}),/new user yes/);assert.equal(downloads,0);
 const repaired=await installBreakdownRuntime({...f,artifactDirectory:staging,run,inspectPython});assert.equal(repaired.ready,true);assert.equal(calls.filter(a=>a.includes('install')).length,2);
 await fs.rm(f.paths.python);
 await installBreakdownRuntime({...f,allowDownload:true,run,inspectPython,download:async({target})=>{downloads++;await fs.writeFile(target,'a');}});
 assert.equal(downloads,f.pins.wheels.length);assert.deepEqual(await fs.readdir(f.paths.cache),[]);
});
test('cleanup needs a healthy runtime, preserves other directories, and never stores a worktree backup',async t=>{
 const f=await fixture(t),inspectPython=async()=>f.metadata;
 await installBreakdownRuntime({...f,run:fakeInstall(f),inspectPython});await fs.mkdir(f.paths.wheels,{recursive:true});await fs.writeFile(path.join(f.paths.wheels,'discard.whl'),'cache');
 await assert.rejects(()=>pruneBreakdownCache({...f,inspectPython:async()=>{throw new Error('bad');}}),/verified installed/);
 assert.equal(await fs.readFile(path.join(f.paths.wheels,'discard.whl'),'utf8'),'cache');
 await assert.rejects(()=>pruneBreakdownCache({...f,paths:{...f.paths,cache:f.paths.models},inspectPython}),/other than/);
 const result=await pruneBreakdownCache({...f,inspectPython});assert.equal(result.ready,true);assert.equal(result.removedBytes,5);assert.equal(result.cachePolicy.artifactDirectory,undefined);
});
const realReadiness=await inspectBreakdownRuntime();
test('installed runtime stays ready without the wheel cache or generated bytecode',{skip:runtimeTestSkip(realReadiness),timeout:60000},async t=>{
  const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'breakdown-no-cache-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const cache=path.join(dir,'empty-cache'),temp=path.join(dir,'temp');await fs.mkdir(cache);await fs.mkdir(temp);
  const result=await inspectBreakdownRuntime({paths:{...realReadiness.paths,cache,temp,wheels:path.join(dir,'absent-wheels')}});
  assert.equal(result.ready,true,result.issues.join('; '));assert.deepEqual(await fs.readdir(cache),[]);
});


test('provenance-only revisions keep installed artifacts valid but artifact drift does not',{skip:runtimeTestSkip(realReadiness),timeout:60000},async t=>{
 const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'breakdown-identity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=JSON.parse(await fs.readFile(path.join(realReadiness.paths.packageRoot,'../data/breakdown-pins.json'),'utf8'));
 const file=path.join(dir,'pins.json');source.audit.reviewerNote='metadata-only';await fs.writeFile(file,JSON.stringify(source));
 assert.equal((await inspectBreakdownRuntime({pinsFile:file})).ready,true);
 source.wheels.find(w=>w.name==='coloredlogs').sha256='a'.repeat(64);await fs.writeFile(file,JSON.stringify(source));
 const drift=await inspectBreakdownRuntime({pinsFile:file});assert.equal(drift.ready,false);assert.ok(drift.issues.some(s=>s.includes('lock differs')));
});
