import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeProfile, profileToBrief} from '../scripts/lib/branding.mjs';
import {defaultPreferences} from '../engine/src/core/preference-options.ts';
import {buildEditorPlan, recommendEditorStyle} from '../scripts/lib/editor-director.mjs';
import {editSceneSchema, editManifestSchema} from '../engine/src/prepared-edit/schema.ts';
import {resolvePalette, planSfxEvents} from '../scripts/lib/sfx-events.mjs';
import {sceneCues} from '../scripts/lib/scene-cues.mjs';
import {verifyKineticAssets} from '../scripts/lib/prepared-props.mjs';

const baseProfile = JSON.parse(await readFile(new URL('../PROFILE.example.json', import.meta.url), 'utf8'));
const source = {path:'Raw/example.mp4', sha256:'a'.repeat(64), fps:30, width:1080, height:1920, totalFrames:180};
const palettes = JSON.parse(await readFile(new URL('../Sound-Kits/style-palettes.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../Sound-Kits/catalog.json', import.meta.url), 'utf8'));
export const samples = {
  'token-lens': {kicker:'LANGUAGE', title:'One sentence, smaller pieces', groups:[{label:'English', tokens:['read','ing'], atFrame:8},{label:'عربي', tokens:['كتاب','ة'], atFrame:30}], lens:{groupIndex:1, tokenIndex:0, atFrame:45}, footer:'Illustration of grouping only'},
  'meter-receipt': {kicker:'COMPARISON', title:'Measure before choosing', rows:[{label:'Option A', value:25, atFrame:10},{label:'Option B', value:60, atFrame:36}], maximum:100, unit:'units', source:'Example values, not a product claim'},
  'ticket-offer': {kicker:'INVITATION', title:'A practical workshop', ticket:{label:'WORKSHOP', value:'One session', detail:'Bring a question', atFrame:12}, footer:'Details from the authored brief'},
  'comment-stack': {kicker:'DISCUSSION', title:'Questions from the audience', comments:[{author:'Viewer A', text:'Where do I start?', atFrame:10},{author:'مشاهد', text:'إيه الخطوة الجاية؟', atFrame:35}], keyword:'guide', prompt:'Ask for the guide'},
  'chapter-quote': {chapter:'01', title:'Start with the question', quote:'A clear question makes the next step easier.', speaker:'Example speaker', role:'Host', quoteFrame:25},
  'route-stops': {kicker:'THE ROUTE', title:'Follow the learning journey', stops:[{label:'Start', detail:'Choose the question', atFrame:10},{label:'Explore', detail:'Compare the options', atFrame:35},{label:'Review', detail:'Check the result', atFrame:60}], footer:'One useful step at a time'},
};
const styleFor = {'token-lens':'liquid-glass','meter-receipt':'liquid-glass','ticket-offer':'campaign-tickets','comment-stack':'campaign-tickets','chapter-quote':'magazine-interview','route-stops':'scrapbook-route'};
const scene = (family, data=samples[family]) => ({id:'example', family, layout:'split', motion:'land', fromFrame:0, durationInFrames:90, data:structuredClone(data)});
function brief(family='intro', style) {
  return {version:1,id:'style-v2',source:source.path, transcript:'Projects/style-v2/words.json',purpose:'explainer',tone:'calm',
    ...profileToBrief({...baseProfile,schemaVersion:3,preferences:defaultPreferences()}), ...(style?{style}:{}),
    beats:[{id:'example',fromSec:0,toSec:3,intent:family,data:family==='intro'?{kicker:'Example',title:'A clear idea',subtitle:'Review the meaning',caption:'Example'}:structuredClone(samples[family])}]};
}

test('four fixed style preferences reach validated manifests with editable semantic data', () => {
  for (const [family, style] of Object.entries(styleFor)) {
    const profile = {...baseProfile,schemaVersion:3,preferences:defaultPreferences()};
    profile.preferences.style={mode:'fixed',value:style};
    const normalized=normalizeProfile(profile);
    const plan=buildEditorPlan({...brief(family),...profileToBrief(normalized)},source,[]);
    assert.equal(plan.manifest.style,style);
    assert.equal(plan.manifest.scenes[0].family,family);
    assert.deepEqual(plan.manifest.scenes[0].data,samples[family]);
    assert.equal(editManifestSchema.safeParse(plan.manifest).success,true);
  }
});

test('semantic beats qualify new recommendations while old automatic and explicit choices persist', () => {
  for(const [family,style] of Object.entries(styleFor)) assert.equal(recommendEditorStyle(brief(family)).style,style);
  assert.equal(recommendEditorStyle(brief()).style,'section-deck');
  for(const style of ['split-canvas','section-deck','kinetic-paper','calligraphic-receipts','paper-collage','judgment-board','stepped-editorial']) {
    assert.equal(recommendEditorStyle(brief('token-lens',style)).style,style);
  }
});

test('semantic inputs reject impossible lens positions, misleading meter ranges and unsafe assets', () => {
  assert.equal(editSceneSchema.safeParse(scene('token-lens')).success,true);
  const lens=scene('token-lens'); lens.data.lens.tokenIndex=99;
  assert.equal(editSceneSchema.safeParse(lens).success,false);
  const meter=scene('meter-receipt'); meter.data.rows[1].value=101;
  assert.equal(editSceneSchema.safeParse(meter).success,false);
  const unbounded=scene('meter-receipt'); unbounded.data.maximum=1e300; unbounded.data.rows[1].value=1e299;
  assert.equal(editSceneSchema.safeParse(unbounded).success,false,'Values that cannot fit a readable receipt must be refused before rendering');
  const route=scene('route-stops'); route.data.stops[0].image='../private.png';
  assert.equal(editSceneSchema.safeParse(route).success,false);
});

test('authored semantic reveals stay ordered and inside each scene', () => {
  for(const family of Object.keys(samples)) assert.equal(editSceneSchema.safeParse(scene(family)).success,true);
  const late=brief('route-stops'); late.beats[0].data.stops[2].atFrame=90;
  assert.throws(()=>buildEditorPlan(late,source,[]),/inside its scene/);
  const reversed=brief('comment-stack'); reversed.beats[0].data.comments[1].atFrame=5;
  assert.throws(()=>buildEditorPlan(reversed,source,[]),/ordered/);
});

test('new semantic families default to a full visual canvas and keep explicit split layouts', () => {
  for(const family of Object.keys(samples)) {
    assert.equal(buildEditorPlan(brief(family,styleFor[family]),source,[]).manifest.scenes[0].layout,'takeover');
    const split=brief(family,styleFor[family]); split.beats[0].layout='split';
    assert.equal(buildEditorPlan(split,source,[]).manifest.scenes[0].layout,'split');
  }
});

test('semantic sound cues land on authored beats with a resolved palette for every new style', () => {
  const input=scene('route-stops'); input.fromFrame=20;
  const cues=sceneCues(input);
  assert.deepEqual(cues,[{frame:20,kind:'transition',sceneId:'example'},{frame:30,kind:'reveal',sceneId:'example'},{frame:55,kind:'reveal',sceneId:'example'},{frame:80,kind:'reveal',sceneId:'example'}]);
  for(const style of new Set(Object.values(styleFor))) {
    const palette=resolvePalette(palettes,catalog,style);
    const result=planSfxEvents(cues,palette,{fps:30,durationInFrames:180,signoffFromFrame:160});
    assert.equal(result.style,style);
    assert.ok(result.events.length>0);
    assert.ok(result.events.every(event=>event.atFrame<160));
  }
});

test('route photos pass through the actual prepared asset verifier', async () => {
  const photo=scene('route-stops'); photo.data.stops[0].image='_missing-style-v2-photo.png';
  await assert.rejects(()=>verifyKineticAssets({source,scenes:[photo]}),/missing|ENOENT|exist|not found/i);
});
