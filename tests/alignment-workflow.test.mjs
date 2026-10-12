import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={id:'alignment-test',source:{path:'Projects/alignment-test/source.wav',sha256:'a'.repeat(64),fps:30,totalFrames:300},
  captions:{status:'reviewed',reviewer:'Creator',words:[{text:'كلام AI مراجع',startMs:100,endMs:900,confidence:null}]}};
test('forced alignment preserves reviewed text and reports unresolved timing without interpolation',async()=>{
  const {buildAlignmentRequest,buildAlignmentDraft}=await import('../scripts/lib/alignment-contract.mjs');
  assert.throws(()=>buildAlignmentRequest({...manifest,captions:{...manifest.captions,status:'draft'}}),/reviewed/);
  const request=buildAlignmentRequest(manifest);
  const draft=buildAlignmentDraft(request,{segments:[{words:[{word:'كلام',start:.12,end:.3,score:.91},
    {word:'AI'},{word:'مراجع',start:.5,end:.8,score:.42}]}]});
  assert.equal(draft.status,'draft');assert.equal(draft.review.reviewed,false);
  assert.deepEqual(draft.words.map(w=>w.text),['كلام','AI','مراجع']);
  assert.equal(draft.words[1].startMs,null);assert.equal(draft.coverage.resolvedWords,2);
  assert.equal(draft.coverage.unresolvedWords,1);assert.equal(draft.coverage.lowConfidenceWords,1);
  assert.equal(manifest.captions.status,'reviewed');
});
test('alignment workflow verifies source bytes, protects input collision and reuses verified draft cache',async()=>{
  const {runAlignmentWorkflow}=await import('../scripts/lib/alignment-pipeline.mjs');
  const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'alignment-parity-'));
  const out=`Projects/alignment-test/${path.basename(dir)}`,source=path.join(dir,'source.bin'),edit=path.join(dir,'edit.json');
  const bytes=Buffer.from(path.basename(dir));let calls=0;
  const relative=file=>path.relative(ROOT,file).replaceAll(path.sep,'/');
  const value={...manifest,source:{...manifest.source,path:relative(source),sha256:sha(bytes)}};
  const dependencies={inspectRuntime:async()=>({ready:true,runtime:{whisperx:'3.8.6',python:'3.13',device:'cpu'},modelInspection:{manifest:{model:{repository:'fixture/model',revision:'b'.repeat(40)}}}}),
    extractAudio:async({output})=>fs.writeFile(output,'synthetic audio fixture'),invokeAlignment:async()=>{calls++;return {segments:[{words:[{word:'كلام',start:.1,end:.3,score:.9},{word:'AI'},{word:'مراجع',start:.6,end:.8,score:.9}]}]};}};
  let result;
  try {
    await fs.writeFile(source,bytes);await fs.writeFile(edit,JSON.stringify(value));
    result=await runAlignmentWorkflow({edit,out},dependencies);
    assert.equal(result.cacheHit,false);assert.equal(result.outputs.draft.status,'draft');
    assert.equal((await runAlignmentWorkflow({edit,out},dependencies)).cacheHit,true);assert.equal(calls,1);
    const cachedDraft=path.join(ROOT,out,'alignment-draft.json');await fs.writeFile(cachedDraft,JSON.stringify(value));
    await assert.rejects(()=>runAlignmentWorkflow({edit:cachedDraft,out},dependencies),/overwrite|collid/);
    await fs.writeFile(source,'changed');await assert.rejects(()=>runAlignmentWorkflow({edit,out},dependencies),/hash/);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});await fs.rm(path.join(ROOT,out),{recursive:true,force:true});
    if(result)await fs.rm(result.cacheDirectory,{recursive:true,force:true});
  }
});
test('optional alignment help and inspect work without Python/model installation',async()=>{
  const {stdout:help}=await exec(process.execPath,['scripts/align-captions.mjs','--help'],{cwd:ROOT,windowsHide:true});
  assert.match(help,/reviewed|draft/);assert.match(help,/install/);
  const {stdout}=await exec(process.execPath,['scripts/align-captions.mjs','inspect'],{cwd:ROOT,windowsHide:true});
  const result=JSON.parse(stdout);assert.equal(typeof result.ready,'boolean');assert.ok(result.paths.root.startsWith(ROOT));
  const {alignmentEnvironment}=await import('../scripts/lib/alignment-install.mjs');
  const env=alignmentEnvironment({PATH:'fixture',HF_TOKEN:'private'});
  assert.equal(env.HF_TOKEN,undefined);
  for(const name of ['HF_HOME','TORCH_HOME','PIP_CACHE_DIR','TEMP','NLTK_DATA'])assert.ok(env[name].startsWith(path.join(ROOT,'Tools','alignment')));
});
