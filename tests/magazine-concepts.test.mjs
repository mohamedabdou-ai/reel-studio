import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameRenderer} from '../scripts/lib/ssr-frames.mjs';
import {renderConceptDesign} from './helpers/magazine-design-ssr.mjs';
import {bundleEngine} from './helpers/engine-bundle.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';

const renderer=await createFrameRenderer();
const api=await bundleEngine(`
 export {CONCEPT_IDS} from './engine/src/motion-concepts/types';
 export {catalogDemo,getCatalogEntry,conceptSettledFrame} from './engine/src/motion-concepts/catalog';
 export {semanticSceneSchema} from './engine/src/creative-kit/semantic/schema';
 export {getPreviewDefinition,previewAuthoredWords} from './engine/src/library-preview/fixtures';
 export {localizeDesignData} from './engine/src/style-kit/digits';
 export {NAVY} from './engine/src/styles/magazine-interview/system/base';
 import * as copy from './engine/src/styles/magazine-interview/designs/copy';
 import {KINETIC_COPY} from './engine/src/styles/magazine-interview/designs/copy-kinetic';
 import {SCREENS_COPY} from './engine/src/styles/magazine-interview/designs/copy-screens';
 import {CONCEPT_PARTS_COPY} from './engine/src/styles/magazine-interview/designs/concepts/copy-parts';
 import {CONCEPT_OWN_COPY} from './engine/src/styles/magazine-interview/designs/concepts/copy-own';
 import {CONCEPT_MORE_COPY} from './engine/src/styles/magazine-interview/designs/concepts/copy-more';
 export const copies={base:copy.MAGAZINE_BASE_COPY??copy.MAGAZINE_COPY,KINETIC_COPY,SCREENS_COPY,CONCEPT_PARTS_COPY,CONCEPT_OWN_COPY,CONCEPT_MORE_COPY};
 export const mergedCopy=copy.MAGAZINE_COPY;
`,{ssr:true});
const names={'button-to-window':'ButtonToWindow','prompt-to-results':'PromptToResults','brief-to-workspace':'BriefToWorkspace','department-tabs':'DepartmentTabs','data-morph':'DataMorph','kpi-zoom':'KpiZoom','tool-stack-spread':'ToolStackSpread','magnetic-dock':'MagneticDock','keyword-reveal':'KeywordReveal','headline-to-system':'HeadlineToSystem','panel-reveal':'PanelReveal','system-layers':'SystemLayers','glass-lens':'GlassLens','automation-flow':'AutomationFlow','chaos-to-brand':'ChaosToBrand','conditional-branching':'ConditionalBranching','identity-filtering':'IdentityFiltering'};
const normalize=html=>html.replace(/<span hidden="" data-style-system="magazine-interview"><\/span>/g,'').replace(/\sdata-[\w-]+="[^"]*"/g,'');
const geometry=html=>[...html.matchAll(/\b(data-p3-rects|data-mechanism-rects|data-p5-rects|data-bar-box)="([^"]*)"/g)].map(m=>[m[1],m[2]]);
const conceptScene=id=>({id:'registered-concept',family:'motion-concept',layout:'takeover',motion:'land',fromFrame:0,durationInFrames:Math.max(240,api.getCatalogEntry(id).minFrames),data:{concept:id,config:structuredClone(api.catalogDemo(id))}});

test('copy source keys are unique and all six sources reach MAGAZINE_COPY',()=>{
 const seen=new Map();
 for(const [source,copy]of Object.entries(api.copies))for(const key of Object.keys(copy)){
  assert.ok(!seen.has(key),`${key} occurs in ${seen.get(key)} and ${source}`);seen.set(key,source);
 }
 assert.deepEqual(Object.keys(api.mergedCopy).sort(),[...seen.keys()].sort());
});

for(const id of api.CONCEPT_IDS)for(const digits of [null,'arabic-indic','latin'])test(`${id}: registered path equals the approved direct design (${digits??'default'})`,async t=>{
 const scene=conceptScene(id),frames=[0,api.conceptSettledFrame(id,'once',scene.durationInFrames),scene.durationInFrames-1];
 assert.ok(api.semanticSceneSchema.safeParse(scene).success,id);
 for(const frame of frames){
  const registered=renderer.renderScene({scene,style:'magazine-interview',frame,digits});
  assert.match(registered,/data-style-system="magazine-interview"/);assert.doesNotMatch(registered,/NaN|Infinity|undefined/);
  const props={config:api.localizeDesignData(scene.data.config,digits),durationInFrames:scene.durationInFrames,seam:renderer.geometry('magazine-interview','split').canvasHeight,th:api.NAVY,sectionIndex:0,mode:'once',backdrop:'canvas'};
  if(id==='chaos-to-brand'&&scene.data.config.mark.kind==='path')props.config={...props.config,mark:scene.data.config.mark};
  const direct=await renderConceptDesign({module:`engine/src/styles/magazine-interview/designs/concepts/${id}.tsx`,exportName:names[id],props,frame,digits});
  const a=normalize(registered),b=normalize(direct),at=[...a].findIndex((c,i)=>c!==b[i]);
  assert.ok(a===b,`${id}/${digits}/${frame} differs near ${at}: registered=${a.slice(Math.max(0,at-60),at+100)} direct=${b.slice(Math.max(0,at-60),at+100)}`);
  // Digit mapping may change visible glyphs, but never mechanism values or bar geometry.
  const original=await renderConceptDesign({module:`engine/src/styles/magazine-interview/designs/concepts/${id}.tsx`,exportName:names[id],props:{...props,config:scene.data.config},frame,digits});
  assert.ok(geometry(registered).length>0,`${id}: geometry comparison must not be empty`);
  assert.deepEqual(geometry(registered),geometry(original),`${id}: digit preference changed the mechanism`);
 }
 t.diagnostic(JSON.stringify({registeredConcept:{id,digits,frames,duration:scene.durationInFrames,identical:3}}));
});

test('chaos SVG decimals and coordinate commas survive registered Arabic-Indic mapping',async()=>{
 const scene=conceptScene('chaos-to-brand');scene.data.config.mark={kind:'path',d:'M0.5,0.5 L99.5,0.5 L99.5,99.5 L0.5,99.5 Z',viewBox:'0,0,100,100'};
 assert.ok(api.semanticSceneSchema.safeParse(scene).success);
 for(const digits of ['arabic-indic','latin'])for(const frame of [0,178,239]){
  const html=renderer.renderScene({scene,style:'magazine-interview',frame,digits});
  const config={...api.localizeDesignData(scene.data.config,digits),mark:scene.data.config.mark};
  const direct=await renderConceptDesign({module:'engine/src/styles/magazine-interview/designs/concepts/chaos-to-brand.tsx',exportName:'ChaosToBrand',props:{config,durationInFrames:240,seam:1080,th:api.NAVY,sectionIndex:0,mode:'once',backdrop:'canvas'},frame,digits});
  assert.equal(normalize(html),normalize(direct));assert.doesNotMatch(html,/NaN|Infinity|undefined/);
 }
});

test('registered digit mapping preserves machine field keys and authored asset paths',async()=>{
 const identity=conceptScene('identity-filtering');
 for(const card of identity.data.config.cards){card.attributes.score1=card.attributes.score;delete card.attributes.score;}
 identity.data.config.criteria[0].field='score1';
 assert.ok(api.semanticSceneSchema.safeParse(identity).success);
 for(const digits of ['arabic-indic','latin'])assert.doesNotThrow(()=>renderer.renderScene({scene:identity,style:'magazine-interview',frame:identity.durationInFrames-1,digits}));
 for(const id of ['button-to-window','panel-reveal','tool-stack-spread','magnetic-dock'])for(const path of ['examples/icon-2024.svg','icons/2024.svg'])for(const digits of ['arabic-indic','latin']){
  const scene=conceptScene(id);
  if(id==='button-to-window')scene.data.config.productIcon=path;
  else if(id==='panel-reveal')scene.data.config.visualSrc=path;
  else scene.data.config.tools[0].icon=path;
  assert.ok(api.semanticSceneSchema.safeParse(scene).success);
  const mapped=api.localizeDesignData(scene.data.config,digits);
  const source=id==='button-to-window'?mapped.productIcon:id==='panel-reveal'?mapped.visualSrc:mapped.tools[0].icon;
  assert.equal(source,path,`${id}/${digits}: digit mapping changed a machine asset path`);
  const html=renderer.renderScene({scene,style:'magazine-interview',frame:scene.durationInFrames-1,digits});
  assert.match(html,/data-style-system="magazine-interview"/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
 }
});

for(const family of ['kinetic-text','kinetic-hook','creator-cta','message-board','screen-focus','screen-recording','arabic-type'])test(`${family}: SceneLayer reaches the registered magazine design`,()=>{
 const preview=api.getPreviewDefinition(`scene:${family}`),scene=structuredClone(ARABIC_SCENES.find(s=>s.family===family)??preview.fixture.scene);
 const words=(preview.fixture.words??api.previewAuthoredWords()).filter(w=>family!=='kinetic-text'||scene.data.sourceIndices.includes(w.sourceIndex));
 const options=family==='screen-recording'?{plate:{src:'examples/evidence-before.svg',width:1920,height:1080}}:{};
 const html=renderer.renderScene({scene,style:'magazine-interview',frame:Math.min(120,scene.durationInFrames-1),words,...options});
 assert.match(html,/data-style-system="magazine-interview"/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
});

test('unknown concept ids fail the schema and warn without throwing in the dispatcher',async()=>{
 const api=await bundleEngine(`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MotionConcept} from './engine/src/styles/magazine-interview/designs/motion-concept';export const render=scene=>renderToStaticMarkup(<MotionConcept scene={scene} seam={1080} geometry={{}} style="magazine-interview" aspect={1}/>);`,{ssr:true});
 for(const concept of ['missing','toString','__proto__']){
  const scene={...conceptScene('panel-reveal'),data:{concept,config:{}}};assert.equal(apiSchema(scene),false);
  const warnings=[],warn=console.warn;let html;try{console.warn=(...args)=>warnings.push(args.join(' '));html=api.render(scene);}finally{console.warn=warn;}
  assert.equal(html,'');assert.ok(warnings.some(w=>w.includes('fit-warning')&&w.includes(concept)));
 }
});
const apiSchema=scene=>api.semanticSceneSchema.safeParse(scene).success;
