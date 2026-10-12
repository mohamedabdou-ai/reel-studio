import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {profileToBrief} from '../scripts/lib/branding.mjs';
import {buildEditorPlan, validateEditorBrief} from '../scripts/lib/editor-director.mjs';
import {assertEditionManifest} from '../scripts/lib/edit-project.mjs';
import {manifestFrameState, mapHeadRect, headWindowCut, classifyHeadFrame} from '../scripts/lib/head-envelope.mjs';

const profile=JSON.parse(await readFile(new URL('../PROFILE.example.json',import.meta.url),'utf8'));
const source={path:'Raw/synthetic.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:720};
const words=[{text:'12',startMs:6000,endMs:6400,confidence:1}];
const proposal={wordIndex:0,atFrame:180,kind:'punch-step',scale:1.05,anchor:{x:.5,y:.3},reason:'Reviewed acoustic emphasis',status:'proposed'};
const pip={x:50,y:100,width:260,height:260,radius:30,plate:{left:-50,top:-20,width:360,height:640},sceneIds:['hook']};
const window={windowTop:0,windowHeight:1920,videoWidth:1080,videoLeft:0,videoTop:0};
const brief=()=>({version:1,id:'performance-test',source:source.path,transcript:'Projects/performance-test/words.json',
  ...profileToBrief(profile),purpose:'explainer',tone:'calm',style:'split-canvas',captionsReviewedBy:'Creator',
  beats:[{id:'hook',fromSec:0,toSec:2,intent:'intro',layout:'takeover',data:{kicker:'Example',title:'One idea',subtitle:'Review',caption:'Example'}}]});
const withEmphasis=()=>({...brief(),emphasisFile:'Projects/performance-test/emphasis.json',emphasisApprovedBy:'Creator'});

test('reviewed emphasis enters the normal brief route and camera follows the retained source word',()=>{
  const input={...withEmphasis(),segments:[{fromFrame:0,toFrame:90},{fromFrame:150,toFrame:720}]};
  assert.equal(validateEditorBrief(input).emphasisApprovedBy,'Creator');
  const plan=buildEditorPlan(input,source,words,{emphasis:{version:1,proposals:[proposal]}});
  assert.deepEqual(plan.manifest.camera.map(k=>k.atFrame),[119,120,164,165]);
  assert.deepEqual(plan.manifest.captions.words,words,'Recorded words and source times stay unchanged');
});

test('camera proposals cannot land in removed words, cross cuts, or run beyond the edit end',()=>{
  for(const segments of [[{fromFrame:0,toFrame:100}], [{fromFrame:0,toFrame:185},{fromFrame:240,toFrame:720}],
    [{fromFrame:150,toFrame:210}]]) {
    const fromSec=segments[0].fromFrame/source.fps;
    assert.throws(()=>buildEditorPlan({...withEmphasis(),segments,beats:[{...brief().beats[0],fromSec,toSec:fromSec+.5}]},source,words,{emphasis:{version:1,proposals:[proposal]}}),/removed|cut|edit end|retained/i);
  }
  assert.throws(()=>validateEditorBrief({...withEmphasis(),emphasisApprovedBy:''}),/approver/);
  assert.throws(()=>validateEditorBrief({...withEmphasis(),emphasisFile:source.path}),/differ/);
  assert.throws(()=>buildEditorPlan(withEmphasis(),source,words,{emphasis:{version:1,proposals:[{...proposal,status:'NEEDS-REVIEW'}]}}),/NEEDS-REVIEW/);
  assert.throws(()=>buildEditorPlan({...withEmphasis(),captionsReviewedBy:undefined},source,words,{emphasis:{version:1,proposals:[proposal]}}),/reviewed/);
  assert.throws(()=>buildEditorPlan(withEmphasis(),source,words,{emphasis:{version:1,proposals:[{...proposal,atFrame:181}]}}),/does not match/);
});

test('camera keys stop before this video\'s supplied recorded signoff after source cuts',()=>{
  const input=withEmphasis();input.creator.ending.signOff='goodbye';
  const endingWords=[...words,{text:'goodbye',startMs:7000,endMs:7500,confidence:1}];
  assert.throws(()=>buildEditorPlan(input,source,endingWords,{emphasis:{version:1,proposals:[proposal]}}),/signoff/);
});

test('PiP planning preserves supported geometry while retaining style, caption and aspect checks',()=>{
  const input={...brief(),footage:{full:window,split:{...window,windowTop:800,windowHeight:1120},pip}};
  const {manifest}=buildEditorPlan(input,source,words);
  assert.deepEqual(assertEditionManifest(manifest).footage.pip,pip);
  for(const bad of [{style:'section-deck'}, {footage:{...input.footage,pip:{...pip,y:1300}}},
    {footage:{...input.footage,pip:{...pip,plate:{...pip.plate,height:360}}}},
    {footage:{...input.footage,pip:{...pip,sceneIds:['missing']}}}]) assert.throws(()=>buildEditorPlan({...input,...bad},source,words));
});

test('PiP head checks use the actual small rounded window and the retained source frame',()=>{
  const input={...brief(),segments:[{fromFrame:0,toFrame:30},{fromFrame:150,toFrame:720}],
    beats:[{...brief().beats[0],fromSec:5,toSec:7}],footage:{full:window,split:window,pip}};
  const edit=buildEditorPlan(input,source,words).manifest;
  const state=manifestFrameState(edit,40,{aspect:1920/1080});
  assert.equal(state.visible,true);
  assert.equal(state.sourceFrame,160);
  const safe={x:.4,y:.1,width:.25,height:.2};
  assert.deepEqual(mapHeadRect(safe,state.geo,{sourceAspect:1920/1080}),{x:144,y:144,width:90,height:128});
  assert.equal(headWindowCut(safe,state.geo,{sourceAspect:1920/1080}),null);
  assert.ok(headWindowCut({x:0,y:0,width:.1,height:.1},state.geo,{sourceAspect:1920/1080}),'Head cropped by the PiP boundary must fail');
  const outside={x:0,y:.8,width:.1,height:.1};
  assert.equal(classifyHeadFrame({visible:true,box:outside,headRect:mapHeadRect(outside,state.geo,{sourceAspect:1920/1080}),
    windowCut:headWindowCut(outside,state.geo,{sourceAspect:1920/1080}),minAreaPx2:16}).status,'FAIL','A head completely cropped out of a required PiP must not count as harmless offscreen footage');
});
