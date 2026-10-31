import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFamilyDesign,renderConceptDesign} from './helpers/magazine-design-ssr.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';

test('existing Group A Statement renders through designSet with the style marker',async()=>{
  const scene=structuredClone(ARABIC_SCENES.find(s=>s.family==='statement'));
  const markup=await renderFamilyDesign({module:'engine/src/styles/magazine-interview/designs/statement.tsx',exportName:'Statement',scene,frame:100});
  assert.match(markup,/data-style-system="magazine-interview"/);
  assert.doesNotMatch(markup,/NaN|Infinity|undefined/);
});
const module='tests/fixtures/magazine-ssr-probe.tsx';
test('family helper passes clock, source offsets, plate, head box and words through registration',async()=>{
  const scene={id:'probe',family:'screens',layout:'takeover',fromFrame:0,durationInFrames:240,data:{trimBeforeFrame:300,foreground:{sourceFromFrame:500},atFrame:400}};
  const headBox={x:100,y:500,width:300,height:400},words=[{text:'hello',fromFrame:0,toFrame:30}];
  const html=await renderFamilyDesign({module,exportName:'FamilyProbe',scene,frame:33,seam:900,headBox,words,plate:{src:'capture.mp4',width:1920,height:1080}});
  const probe=JSON.parse(html.match(/data-probe="([^"]+)"/)[1].replaceAll('&quot;','"'));
  assert.equal(probe.frame,33);assert.equal(probe.duration,240);assert.equal(probe.scene.data.trimBeforeFrame,300);
  assert.equal(probe.scene.data.foreground.sourceFromFrame,500);assert.equal(probe.scene.data.atFrame,239);
  assert.equal(probe.plate.src,'capture.mp4');assert.equal(probe.seam,900);assert.deepEqual(probe.headBox,headBox);assert.deepEqual(probe.words,words);
});
test('concept helper uses real frame/duration, defaults sectionIndex and marks the system',async()=>{
  const html=await renderConceptDesign({module,exportName:'ConceptProbe',props:{durationInFrames:180},frame:67});
  assert.match(html,/data-style-system="magazine-interview"/);assert.match(html,/data-frame="67"/);
  assert.match(html,/data-duration="180"/);assert.match(html,/data-section="0"/);
  assert.match(await renderConceptDesign({module,exportName:'ConceptProbe',props:{durationInFrames:180,sectionIndex:3},frame:0}),/data-section="3"/);
});
test('helper restores browser globals when a design throws',async()=>{
  const documentBefore=globalThis.document,storageBefore=globalThis.localStorage;
  await assert.rejects(renderConceptDesign({module,exportName:'ThrowProbe',props:{durationInFrames:180},frame:0}),/probe error/);
  assert.equal(globalThis.document,documentBefore);assert.equal(globalThis.localStorage,storageBefore);
});
test('loading a fresh bundle tolerates a document installed by another SSR helper',async()=>{
  const before=globalThis.document,sentinel={fromAnotherHarness:true};
  globalThis.document=sentinel;
  try {
    const html=await renderConceptDesign({module:new URL('./fixtures/magazine-ssr-probe.tsx',import.meta.url),exportName:'FreshProbe',props:{durationInFrames:240,sectionIndex:undefined},frame:0});
    assert.match(html,/data-style-system="magazine-interview"/);
    assert.match(html,/data-section="0"/);
    assert.equal(globalThis.document,sentinel);
  } finally {if(before===undefined)delete globalThis.document;else globalThis.document=before;}
});
