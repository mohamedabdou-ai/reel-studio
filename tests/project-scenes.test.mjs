import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/job-paths.mjs';
import {projectScenePackSchema,valuesSchema,projectSceneAssets} from '../engine/src/project-scenes/schema.ts';
import {buildFields,formDataWithDefaults} from '../engine/src/review-editor/panels/form-schema.ts';
import {loadProjectScenePack,resolveProjectScenes,projectSceneBuild} from '../scripts/lib/project-scenes.mjs';
import {normalizeGraphicsSpec} from '../scripts/lib/graphics-project.mjs';
import {editManifestSchema} from '../engine/src/prepared-edit/schema.ts';
import {createReviewServer} from '../scripts/lib/review-editor-server.mjs';
import {createApiClient} from '../engine/src/review-editor/api-client.ts';

const contract={id:'diagram',label:'A continuous diagram',entry:'scenes/Diagram.tsx',fields:[
  {key:'title',type:'string',required:true,max:80},
  {key:'count',type:'number',required:true,min:1,max:9},
  {key:'accent',type:'color',required:true},
  {key:'items',type:'array',min:1,max:4,required:true,items:{key:'item',type:'object',fields:[{key:'label',type:'string',required:true,max:40}]}},
]};
const values={title:'Inputs become a result',count:3,accent:'#66ccaa',items:[{label:'One'}]};
async function fixture(t){
  const id=`scene-case-${Math.random().toString(16).slice(2)}`;
  const dir=path.join(ROOT,'Projects',id);
  await fs.mkdir(path.join(dir,'scenes'),{recursive:true});
  t.after(async()=>{assert.equal(path.dirname(dir),path.join(ROOT,'Projects'));await fs.rm(dir,{recursive:true,force:true});});
  await fs.writeFile(path.join(dir,'scene-pack.json'),JSON.stringify({version:1,scenes:[contract]}));
  await fs.writeFile(path.join(dir,'scenes','Diagram.tsx'),'import React from "react"; export default function Diagram({values}) { return <div>{values.title}</div>; }');
  return {id,dir,pack:`Projects/${id}/scene-pack.json`};
}
test('project scene values enforce declared fields, nested bounds and unknown-key rejection',()=>{
  const parsed=projectScenePackSchema.parse({version:1,scenes:[contract]});
  const schema=valuesSchema(parsed.scenes[0].fields);
  assert.deepEqual(schema.parse(values),values);
  for(const input of [{...values,count:10},{...values,accent:'red'},{...values,extra:'unreviewed'},{...values,items:[{label:'x'.repeat(41)}]},{...values,title:undefined}])assert.equal(schema.safeParse(input).success,false);
});
test('duplicate or dangerous scene/field names and recursive oversized contracts are refused',()=>{
  assert.equal(projectScenePackSchema.safeParse({version:1,scenes:[contract,contract]}).success,false);
  assert.equal(projectScenePackSchema.safeParse({version:1,scenes:[{...contract,fields:[{key:'__proto__',type:'string'}]}]}).success,false);
  assert.equal(projectScenePackSchema.safeParse({version:1,scenes:[{...contract,fields:[{key:'same',type:'string'},{key:'same',type:'number'}]}]}).success,false);
  assert.equal(projectScenePackSchema.safeParse({version:1,scenes:[{...contract,fields:[{key:'wrapper',type:'object',fields:[{key:'count',type:'number',default:'wrong-type'}]}]}]}).success,false);
  let nested={key:'leaf',type:'string'};for(let i=0;i<8;i++)nested={key:'group',type:'object',fields:[nested]};
  assert.equal(projectScenePackSchema.safeParse({version:1,scenes:[{...contract,fields:[nested]}]}).success,false);
});
test('project-local scenes hydrate graphics manifests without engine changes',async t=>{
  const f=await fixture(t),projectScenes=await loadProjectScenePack(f.pack,{id:f.id});
  const manifest=normalizeGraphicsSpec({version:1,id:f.id,fps:30,reviewedBy:'Synthetic fixture author',projectScenes,scenes:[{id:'explain',family:'project-scene',layout:'takeover',motion:'quiet',fromFrame:0,durationInFrames:180,data:{component:'diagram',values}}]});
  assert.equal(manifest.projectScenes.pack,f.pack);
  assert.equal(manifest.scenes[0].data.values.count,3);
  assert.throws(()=>normalizeGraphicsSpec({version:1,id:f.id,reviewedBy:'Fixture',projectScenes,scenes:[{...manifest.scenes[0],data:{component:'unknown',values}}]}),/unknown|declared|contract/i);
  const invalid=structuredClone(manifest);invalid.scenes[0].data.component='INVALID';
  assert.equal(editManifestSchema.safeParse(invalid).success,false);
  invalid.scenes[0].data.component='diagram';invalid.projectScenes.scenes[0].fields.push({key:'title',type:'number'});
  assert.equal(editManifestSchema.safeParse(invalid).success,false);
});
test('pack entries and paths cannot escape or borrow another project',async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.dir,'scene-pack.json'),JSON.stringify({version:1,scenes:[{...contract,entry:'../../outside.tsx'}]}));
  await assert.rejects(loadProjectScenePack(f.pack,{id:f.id}),/entry|project|relative|escape/i);
  await assert.rejects(loadProjectScenePack('Projects/other/scene-pack.json',{id:f.id}),/project/i);
});
test('registry fingerprints include imported helper changes and reject unapproved imports',async t=>{
  const f=await fixture(t),scene=path.join(f.dir,'scenes','Diagram.tsx'),helper=path.join(f.dir,'scenes','helper.ts');
  await fs.writeFile(helper,'export const text="First";');
  await fs.writeFile(scene,'import React from "react"; import {text} from "./helper"; export default function Diagram(){return <div>{text}</div>}');
  const projectScenes=await loadProjectScenePack(f.pack,{id:f.id}),edit={id:f.id,projectScenes};
  const first=await projectSceneBuild(edit);
  await fs.writeFile(helper,'export const text="Second";');
  const second=await projectSceneBuild(edit);
  assert.notEqual(first.hash,second.hash);
  assert.ok(first.files.some(file=>file.path.endsWith('helper.ts')));
  await fs.writeFile(scene,'import secret from "../../../PROFILE.json"; export default ()=>secret;');
  await assert.rejects(projectSceneBuild(edit),/import|project|outside|allowed/i);
  await fs.writeFile(scene,'const moduleName="./helper"; export default ()=>import(moduleName);');
  await assert.rejects(projectSceneBuild(edit),/literal.*module|imports/i);
  await fs.writeFile(scene,'export const NamedOnly=()=>null;');
  await assert.rejects(projectSceneBuild(edit),/default|export/i);
});
test('changing the pack contract requires rehydration rather than trusting stale manifest fields',async t=>{
  const f=await fixture(t),projectScenes=await loadProjectScenePack(f.pack,{id:f.id});
  await fs.writeFile(path.join(f.dir,'scene-pack.json'),JSON.stringify({version:1,scenes:[{...contract,label:'Changed contract'}]}));
  await assert.rejects(resolveProjectScenes({id:f.id,projectScenes}),/changed|contract|prepare|reload/i);
});
test('ordinary projects use the empty scene registry',async()=>{
  assert.equal(await projectSceneBuild({id:'plain'}),null);
});
test('nested defaults hydrate the same values and asset dependencies that the editor displays',()=>{
  const fields=[{key:'wrapper',type:'object',default:{},fields:[{key:'count',type:'number',default:3},{key:'photo',type:'asset',default:'example.png',label:'Illustration'}]}];
  assert.deepEqual(valuesSchema(fields).parse({}),{wrapper:{count:3,photo:'example.png'}});
  assert.deepEqual(projectSceneAssets({projectScenes:{pack:'Projects/example/scene-pack.json',scenes:[{...contract,fields}]},scenes:[{family:'project-scene',data:{component:'diagram',values:{}}}]}),['example.png']);
  const form=buildFields(valuesSchema(fields))[0].fields;
  assert.equal(form.find(field=>field.key==='photo').label,'Illustration');
  assert.equal(form.find(field=>field.key==='photo').asset,true);
  const withArray=[...fields,{key:'labels',type:'array',default:[{label:'An authored default'}],items:{key:'item',type:'object',fields:[{key:'label',type:'string',required:true}]}}];
  const parsed=formDataWithDefaults(valuesSchema(withArray),{});
  assert.deepEqual(parsed,{wrapper:{count:3,photo:'example.png'},labels:[{label:'An authored default'}]});
  const structure=buildFields(valuesSchema(withArray));
  assert.deepEqual(structure.find(field=>field.key==='wrapper').default,{});
  assert.deepEqual(structure.find(field=>field.key==='labels').default,[{label:'An authored default'}]);
});
test('the actual editor saves custom values, rejects invalid fields and warns after scene code changes',async t=>{
  const f=await fixture(t),projectScenes=await loadProjectScenePack(f.pack,{id:f.id});
  const manifest=normalizeGraphicsSpec({version:1,id:f.id,reviewedBy:'Synthetic fixture author',projectScenes,scenes:[{id:'explain',family:'project-scene',layout:'takeover',motion:'quiet',fromFrame:0,durationInFrames:180,data:{component:'diagram',values}}]});
  const manifestPath=`Projects/${f.id}/edit.json`;await fs.writeFile(path.join(f.dir,'edit.json'),JSON.stringify(manifest));
  const server=await createReviewServer({manifestPath});t.after(()=>server.close());
  const origin=new URL(server.url).origin,client=createApiClient({token:server.token,fetch:(url,options)=>fetch(origin+url,options)});
  const first=await client.project(),changed=structuredClone(manifest);changed.scenes[0].data.values.count=4;
  await client.save(changed,'Custom field edit',first.manifestRevision);
  assert.equal((await client.project()).manifest.scenes[0].data.values.count,4);
  const invalid=structuredClone(changed);invalid.scenes[0].data.values.count=99;
  await assert.rejects(client.save(invalid,'Invalid value',(await client.project()).manifestRevision));
  assert.equal(JSON.parse(await fs.readFile(path.join(f.dir,'edit.json'),'utf8')).scenes[0].data.values.count,4);
  await fs.appendFile(path.join(f.dir,'scenes','Diagram.tsx'),'\n// A revised authored component\n');
  assert.ok((await client.project()).warnings.some(warning=>warning.includes('كود المشهد')));
  await fs.writeFile(path.join(f.dir,'scene-pack.json'),JSON.stringify({version:1,scenes:[{...contract,label:'New contract'}]}));
  await assert.rejects(client.save(changed,'Stale contract',(await first).manifestRevision),/contract|changed|prepare/i);
});
