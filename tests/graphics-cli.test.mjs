import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {writeFileSync} from 'node:fs';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {normalizeGraphicsSpec,initializeGraphicsProject} from '../scripts/lib/graphics-project.mjs';
import {validateManifest} from '../engine/src/review-editor/validate.ts';
import {assertDeliveryReady,editorRenderCommand} from '../scripts/lib/editor-director.mjs';

const spec = id => ({version:1,id,style:'paper-collage',fps:30,reviewedBy:'Approved illustrative copy',scenes:[{
  id:'idea',family:'intro',fromFrame:0,durationInFrames:90,layout:'takeover',motion:'quiet',
  data:{kicker:'ILLUSTRATIVE',title:'One clear idea',subtitle:'Authored graphic copy',caption:'Example'},
}]});

async function fixture(t, value, filename='graphics-spec.json') {
  const directory = path.join(ROOT,'Projects',value.id);
  await fs.mkdir(directory,{recursive:true});
  const file = `Projects/${value.id}/${filename}`;
  await fs.writeFile(path.join(ROOT,file),JSON.stringify(value));
  t.after(async()=>{
    assert.equal(path.dirname(directory),path.join(ROOT,'Projects'));
    await fs.rm(directory,{recursive:true,force:true});
  });
  return file;
}

const cli = (...args) => spawnSync(process.execPath,['scripts/editor.mjs','graphics',...args],{cwd:ROOT,encoding:'utf8',windowsHide:true});

test('graphics-only authoring has a normal editor schema-check route without creating media',async t=>{
  const value=spec('graphics-cli-check');
  const file=await fixture(t,value);
  const result=cli(file,'--check');
  assert.equal(result.status,0,`The normal editor must support approved-copy graphics: ${result.stderr}`);
  const output=JSON.parse(result.stdout);
  assert.equal(output.contentMode,'graphics');
  assert.equal(output.durationInFrames,90);
  assert.equal(output.copyStatus,'reviewed');
  await assert.rejects(fs.access(path.join(ROOT,'Projects',value.id,'edit.json')));
  await assert.rejects(fs.access(path.join(ROOT,'Projects',value.id,'graphics-source.mp4')));
});

test('graphics-only planning refuses presenter layouts and gaps instead of exposing a blank plate',async t=>{
  const split=spec('graphics-cli-invalid');split.scenes[0].layout='split';
  const file=await fixture(t,split);
  const result=cli(file,'--check');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/graphics|takeover/i);
  const gap=spec('graphics-cli-invalid');gap.scenes[0].fromFrame=30;
  await fs.writeFile(path.join(ROOT,file),JSON.stringify(gap));
  const gapResult=cli(file,'--check');
  assert.notEqual(gapResult.status,0);
  assert.match(gapResult.stderr,/cover|gap|graphics/i);
});

test('the live editor and delivery gate agree on reviewed source-free graphics',()=>{
  const edit=normalizeGraphicsSpec(spec('graphics-validation'),{delivery:true});
  assert.equal(assertDeliveryReady(edit).ok,true);
  const ui=validateManifest(edit);
  assert.equal(ui.deliveryReady,true,JSON.stringify(ui.issues));
  const recording={...edit};delete recording.contentMode;
  assert.equal(validateManifest(recording).deliveryReady,false,'Empty recording transcripts still block export');
});

test('graphics initialization reserves every output and preserves an input named like its origin record',async t=>{
  const value=spec('graphics-origin-alias');
  const file=await fixture(t,value,'graphics-origin.json');
  const original=await fs.readFile(path.join(ROOT,file),'utf8');
  await assert.rejects(()=>initializeGraphicsProject(file),/exists|reserved|input/i);
  assert.equal(await fs.readFile(path.join(ROOT,file),'utf8'),original);
  await assert.rejects(fs.access(path.join(ROOT,'Projects',value.id,'edit.json')));
});

test('graphics initialization preserves an unrelated existing origin record',async t=>{
  const value=spec('graphics-existing-origin');
  const file=await fixture(t,value);
  const origin=path.join(ROOT,'Projects',value.id,'graphics-origin.json');
  await fs.writeFile(origin,'keep existing project record');
  await assert.rejects(()=>initializeGraphicsProject(file),/exists|reserved/i);
  assert.equal(await fs.readFile(origin,'utf8'),'keep existing project record');
});

test('graphics initialization cannot replace a manifest created while its base plate is encoding',async t=>{
  const value=spec('graphics-init-race');
  const file=await fixture(t,value);
  const manifest=path.join(ROOT,'Projects',value.id,'edit.json');
  let created=false;
  await assert.rejects(()=>initializeGraphicsProject(file,{onProgress:()=>{
    if(!created){writeFileSync(manifest,'concurrent editor manifest');created=true;}
  }}),/EEXIST|exists|exclusive/i);
  assert.equal(await fs.readFile(manifest,'utf8'),'concurrent editor manifest');
});
