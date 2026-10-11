import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CATALOG,catalogDemo,getCatalogEntry} from '../engine/src/motion-concepts/catalog.ts';
import {minFramesAtFps} from '../engine/src/motion-concepts/timeline.ts';
import {buildEditorPlan} from '../scripts/lib/editor-director.mjs';
import {profileToBrief} from '../scripts/lib/branding.mjs';
import {editManifestSchema} from '../engine/src/prepared-edit/schema.ts';
import {addSceneFromTemplate} from '../engine/src/review-editor/ops/scenes.ts';
import {reviewManifest} from './helpers/review-manifest.mjs';

const profile=JSON.parse(await readFile(new URL('../PROFILE.example.json',import.meta.url),'utf8'));
const source={path:'Raw/example.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:300};
const brief=(data,intent='motion-concept')=>({version:1,id:'concept-recording',source:source.path,transcript:'Projects/concept-recording/words.json',...profileToBrief(profile),purpose:'explainer',tone:'calm',
  beats:[{id:'example',fromSec:0,toSec:8,intent,data}]});

test('all fifteen original concept configurations reach normal recording plans through the discriminated union',()=>{
  for(const concept of CATALOG){
    let plan;assert.doesNotThrow(()=>{plan=buildEditorPlan(brief({concept:concept.id,config:catalogDemo(concept.id)}),source,[]);},concept.id);
    assert.equal(plan.manifest.scenes[0].family,'motion-concept');
    assert.deepEqual(plan.manifest.scenes[0].data,{concept:concept.id,config:catalogDemo(concept.id)});
  }
  assert.throws(()=>buildEditorPlan(brief({concept:'panel-reveal',config:catalogDemo('panel-reveal'),unexpected:true}),source,[]),/unrecognized|Unrecognized/i);
  assert.throws(()=>buildEditorPlan(brief({kicker:'Example',title:'A supplied idea',subtitle:'A supplied detail',caption:'Example',unexpected:true},'intro'),source,[]),/unrecognized|Unrecognized/i);
});
const collapsedManifest=()=>{
  const m=reviewManifest();m.captions.grouping='single';m.captions.words=[{text:'أول',startMs:0,endMs:10,confidence:1},{text:'تاني',startMs:10,endMs:20,confidence:1}];
  m.scenes=[{id:'kinetic',family:'kinetic-text',fromFrame:0,durationInFrames:60,layout:'takeover',motion:'land',data:{kicker:'Example',title:'Recorded words',sourceIndices:[0,1],lang:'ar',enter:'rise'}}];
  return m;
};
test('short ASR timestamps return a caption review issue instead of escaping safeParse',()=>{
  const m=collapsedManifest(),before=JSON.stringify(m.captions.words);let result;
  assert.doesNotThrow(()=>{result=editManifestSchema.safeParse(m);});
  assert.equal(result.success,false);
  assert.ok(result.error.issues.some(issue=>issue.path[0]==='captions'&&/timing|review|frame/i.test(issue.message)));
  assert.equal(JSON.stringify(m.captions.words),before,'Invalid timing must never rewrite the supplied words');
});
test('adding kinetic text to collapsed ASR timing reports a review problem without crashing the UI',()=>{
  const m=collapsedManifest();m.scenes=[];let result;
  assert.doesNotThrow(()=>{result=addSceneFromTemplate(m,'kinetic-text',{durationInFrames:60});});
  assert.equal(result.ok,false);
});
test('default concept templates fit their minimum choreography at 50 and 60 fps',()=>{
  for(const fps of [50,60]){
    const m=reviewManifest();m.source.fps=fps;m.source.totalFrames=900;m.segments=[{fromFrame:0,toFrame:900}];m.scenes=[];
    const result=addSceneFromTemplate(m,'motion-concept');
    assert.equal(result.ok,true,`${fps}fps template should preserve readable choreography`);
    const scene=result.manifest.scenes[0];
    assert.ok(scene.durationInFrames>=minFramesAtFps(getCatalogEntry(scene.data.concept).minFrames,fps));
    assert.equal(editManifestSchema.safeParse(result.manifest).success,true);
  }
});
