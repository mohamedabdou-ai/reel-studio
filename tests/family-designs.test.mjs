import {promises as fs} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {listMotionRecipes} from '../engine/src/motion-library/catalog.ts';
import {listMotionConcepts} from '../engine/src/motion-concepts/catalog.ts';
import {SCENE_FAMILIES, STYLE_IDS} from '../engine/src/styles/registry.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleEngine, setSsrFrame} from './helpers/engine-bundle.mjs';
import {getStyleMeta} from '../engine/src/styles/registry.ts';
import {recommendEditorStyle} from '../scripts/lib/editor-director.mjs';
import {recommendLibrary} from '../scripts/lib/library-selection.mjs';

const api=await bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {FAMILY_DESIGNS, familyDesign} from './engine/src/styles/family-designs';
  import {SceneLayer} from './engine/src/prepared-edit/PreparedEdit';
  import {ProofScene} from './engine/src/creative-kit/scenes';
  import {editManifestSchema, editSceneSchema} from './engine/src/prepared-edit/schema.ts';
  import {getStyleMeta, STYLE_METAS} from './engine/src/styles/registry.ts';
  import {templateFamiliesFor} from './engine/src/review-editor/ops/scenes.ts';
  import {previewDefinitions} from './engine/src/library-preview/fixtures.ts';
  import {SceneDemo} from './engine/src/library-preview/Preview';
  import {CreativeKitGallery} from './engine/src/creative-kit/Gallery';
  import {creativeGalleryDefaults} from './engine/src/creative-kit/schema.ts';
  export {FAMILY_DESIGNS, familyDesign, editManifestSchema, editSceneSchema, getStyleMeta, STYLE_METAS, templateFamiliesFor, previewDefinitions};
  export const render=(props)=>renderToStaticMarkup(<SceneLayer {...props}/>);
  export const shared=(scene,style)=>renderToStaticMarkup(<ProofScene style={style} layout={scene.layout} motion={scene.motion} showCaption={false} data={scene.data}/>);
  export const preview=(definition)=>renderToStaticMarkup(<SceneDemo definition={definition}/>);
  export const gallery=(style)=>renderToStaticMarkup(<CreativeKitGallery {...creativeGalleryDefaults} style={style}/>);
  export const stub=({scene,sectionIndex,style,geometry,aspect,seam,headBox,words})=><aside data-section={sectionIndex} data-design={style} data-family={scene.family} data-geometry={JSON.stringify(geometry)} data-aspect={aspect} data-seam={seam} data-head={JSON.stringify(headBox)} data-words={JSON.stringify(words)}>stub</aside>;
`,{ssr:true,media:true});
const scene=api.editSceneSchema.parse({id:'proof',family:'proof',layout:'takeover',motion:'land',fromFrame:0,durationInFrames:180,
  data:{label:'Sample',value:42,suffix:'',source:'Test fixture',caption:'Sample'}});
const props={scene,style:'section-deck',geometry:{windowTop:1040,windowHeight:880,videoWidth:1080,videoLeft:0,videoTop:-520},aspect:1920/1080,seam:1040,
  headBox:{left:300,top:1200,width:200,height:200},words:[]};
const manifest={version:1,id:'family-designs',purpose:'test',style:'section-deck',
  source:{path:'Projects/family-designs/source.mp4',sha256:'0'.repeat(64),fps:30,width:1080,height:1920,totalFrames:180},
  segments:[{fromFrame:0,toFrame:180}],captions:{status:'draft',words:[]},scenes:[scene],sounds:[],camera:[]};

test('section-deck and the five redesigned styles register designs; unported styles retain shared rendering',()=>{
  assert.deepEqual(Object.keys(api.FAMILY_DESIGNS['section-deck']).sort(),['chat-thread','checklist','comment','comparison','count','figures','follow','intro','process','proof','proof-screen','statement']);
  assert.equal(api.familyDesign('grid-glide','proof'),null);
  for(const style of ['kinetic-paper','magazine-interview','liquid-glass','calligraphic-receipts','paper-collage'])assert.equal(typeof api.familyDesign(style,'proof'),'function');
  for(const meta of api.STYLE_METAS)assert.deepEqual(meta.familiesOff,meta.id==='magazine-interview'?[]:['compose'],`${meta.id}: only magazine-interview has a design system for composed pages`);
  setSsrFrame(90);
  assert.equal(api.render({...props,style:'grid-glide'}),api.shared(scene,'grid-glide'));
  assert.notEqual(api.render(props),api.shared(scene,'section-deck'));
});

test('PreparedEdit and library dispatch a registered stub with their existing inputs',()=>{
  const before=api.render(props);
  const original=api.FAMILY_DESIGNS['section-deck'];
  api.FAMILY_DESIGNS['section-deck']={proof:api.stub};
  try {
    const markup=api.render(props);
    assert.match(markup,/data-design="section-deck"/);
    assert.match(markup,/data-family="proof"/);
    assert.match(markup,/data-seam="1040"/);
    assert.ok(markup.includes('1200'),'head geometry reaches the design');
    assert.ok(markup.includes('880'),'presenter geometry reaches the design');
    assert.match(api.preview(api.previewDefinitions().find(item=>item.key==='scene:proof')),/data-design="section-deck"/);
  } finally {api.FAMILY_DESIGNS['section-deck']=original;}
  assert.equal(api.render(props),before,'fallback is restored without a wrapper or markup change');
});

test('familiesOff rejects validation, hides editor templates and marks previews unsupported',()=>{
  assert.ok(api.templateFamiliesFor('section-deck').includes('proof'));
  assert.equal(api.editManifestSchema.safeParse(manifest).success,true);
  const off=api.getStyleMeta('section-deck').familiesOff;
  off.push('proof');
  try {
    const result=api.editManifestSchema.safeParse(manifest);
    assert.equal(result.success,false);
    assert.ok(result.error.issues.some(issue=>issue.message==='Style section-deck does not support family proof.'));
    assert.equal(api.templateFamiliesFor('section-deck').includes('proof'),false);
    assert.ok(api.templateFamiliesFor('kinetic-paper').includes('proof'),'opt-out stays local to the style');
    const preview=api.previewDefinitions().find(item=>item.key==='scene:proof');
    assert.equal(preview.status,'unsupported');
    assert.equal(preview.reason,'Style section-deck does not support family proof.');
    assert.ok(api.preview(preview).includes(preview.reason),'the real refusal reason reaches the preview');
  } finally {off.pop();}
});

test('the director excludes opted-out styles and refuses an incompatible pinned choice',()=>{
  const off=getStyleMeta('section-deck').familiesOff;
  const brief={version:1,id:'family-designs',source:'Raw/test.mp4',transcript:'Projects/family-designs/words.json',
    creator:{displayName:'Test',handle:null,ending:{cta:null,followCard:false,signOff:null}},purpose:'explainer',tone:'calm',
    beats:[{id:'proof',fromSec:0,toSec:6,intent:'proof',data:scene.data}]};
  assert.ok(recommendEditorStyle(brief).candidates.some(candidate=>candidate.style==='section-deck'));
  off.push('proof');
  try {
    assert.equal(recommendEditorStyle(brief).candidates.some(candidate=>candidate.style==='section-deck'),false);
    assert.throws(()=>recommendEditorStyle({...brief,style:'section-deck'}),/Style section-deck does not support family proof/);
  } finally {off.pop();}
});

test('the library planner excludes a style opt-out using the inventory policy',()=>{
  const style={nativeId:'section-deck',familiesOff:['proof']};
  const item={key:'scene:proof',nativeId:'proof',layer:'scene',layouts:['takeover'],editorial:{assessment:'current',role:'explanation',
    intents:['evidence'],modes:['graphics'],sourceKinds:['none'],requires:[],moods:[],energy:[]}};
  const result=recommendLibrary({styles:[style],items:[item]},{style:'section-deck',intent:'evidence',mode:'graphics'});
  assert.equal(result.candidates.length,0);
  assert.ok(result.excluded[0].reasons.includes('family-not-supported'));
});

test('the creative gallery dispatches registered designs with geometry and section order',()=>{
  const original=api.FAMILY_DESIGNS['section-deck'];
  api.FAMILY_DESIGNS['section-deck']={proof:api.stub};
  try {
    const html=api.gallery('section-deck');
    assert.match(html,/data-section="2" data-design="section-deck" data-family="proof"/);
    assert.match(html,/data-seam="1056"/);
  } finally {api.FAMILY_DESIGNS['section-deck']=original;}
});

test('motion catalogs exclude refused families for a selected style and in compatibleStyles',()=>{
  const off=getStyleMeta('section-deck').familiesOff;
  off.push('screen-focus','data-story','motion-concept');
  try {
    assert.deepEqual(listMotionRecipes({style:'section-deck'}).recipes,[]);
    assert.deepEqual(listMotionConcepts({style:'section-deck'}).concepts,[]);
    assert.ok(listMotionRecipes({style:'kinetic-paper'}).recipes.length>0);
    assert.ok(listMotionConcepts({style:'kinetic-paper'}).concepts.length>0);
    for(const recipe of listMotionRecipes().recipes)assert.ok(!recipe.compatibleStyles.includes('section-deck'));
    for(const concept of listMotionConcepts().concepts)assert.ok(!concept.compatibleStyles.includes('section-deck'));
  } finally {off.splice(-3);}
});

test('the Node-safe family vocabulary matches the actual parsed scene schemas',()=>{
  const families=api.editSceneSchema.def.left.options.map(schema=>schema.shape.family.value);
  assert.deepEqual([...SCENE_FAMILIES].sort(),families.sort());
});

test('registry load rejects unknown family opt-outs and overlap with owned scenes',async t=>{
  const base=path.join(ROOT,'state','tmp');await fs.mkdir(base,{recursive:true});
  const folder=await fs.mkdtemp(path.join(base,'family-policy-'));
  t.after(async()=>{assert.equal(path.dirname(folder),base);await fs.rm(folder,{recursive:true,force:true});});
  const files=['engine/src/styles/registry.ts','engine/src/styles/types.ts',...STYLE_IDS.map(id=>'engine/src/styles/'+id+'/meta.ts')];
  for(const file of files){await fs.mkdir(path.dirname(path.join(folder,file)),{recursive:true});await fs.copyFile(path.join(ROOT,file),path.join(folder,file));}
  const load=()=>spawnSync(process.execPath,['--input-type=module','-e','await import('+JSON.stringify(pathToFileURL(path.join(folder,'engine/src/styles/registry.ts')).href)+')'],{encoding:'utf8',windowsHide:true});
  assert.equal(load().status,0);
  const file=path.join(folder,'engine/src/styles/grid-glide/meta.ts');
  const original=await fs.readFile(file,'utf8');
  for(const [family,reason] of [['not-a-family','unknown family'],['glide-card','overlaps ownScenes']]) {
    const changed=original.replace("familiesOff: ['compose']",'familiesOff: ["'+family+'"]');
    assert.notEqual(changed,original);await fs.writeFile(file,changed);
    const result=load();assert.notEqual(result.status,0);assert.ok(result.stderr.includes(reason),result.stderr);
  }
});

test('a concept catalog alias is normalized once before evaluating family support',()=>{
  const previous=console.warn,notices=[];
  console.warn=message=>notices.push(message);
  try {assert.ok(listMotionConcepts({style:'split-canvas'}).concepts.length>0);assert.equal(notices.length,1);}
  finally {console.warn=previous;}
});
