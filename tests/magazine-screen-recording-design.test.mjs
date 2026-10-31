import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {bundleEngine} from './helpers/engine-bundle.mjs';

const module='engine/src/styles/magazine-interview/designs/screen-recording.tsx';
const api=await bundleEngine(`
export {getPreviewDefinition} from './engine/src/library-preview/fixtures';
export {recordingPose,visibleCaptureRect} from './${module}';
export {screenTrackPose} from './engine/src/screen-recording/pose';
export {screenRecordingIssues} from './engine/src/screen-recording/schema';
export {calloutState,CLICK_RIPPLE_SEC} from './engine/src/motion-library/capture';
`,{ssr:true});
const scene=structuredClone(api.getPreviewDefinition('scene:screen-recording').fixture.scene);
const plate={src:'examples/evidence-before.svg',width:1920,height:1080};
const decode=s=>s.replaceAll('&quot;','"');
const attrs=(html,name)=>[...html.matchAll(new RegExp('(?:^|\\s)'+name+'="([^"]*)"','g'))].map(m=>decode(m[1]));
const render=frame=>renderFamilyDesign({module,exportName:'ScreenRecording',scene,frame,plate});

for(const frame of [0,30,120,scene.durationInFrames-1])test(`screen-recording frame ${frame}: real plate provider, unchanged camera and clipped edge rules`,async()=>{
  const html=await render(frame),pose=api.screenTrackPose(frame,scene.data.keys,plate),rect=api.visibleCaptureRect(pose);
  assert.match(html,/data-style-system="magazine-interview"/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
  assert.deepEqual(attrs(html,'data-recording-pose').map(JSON.parse),JSON.parse(JSON.stringify([pose])));
  assert.deepEqual(attrs(html,'data-recording-rule'),['top','bottom']);assert.deepEqual(attrs(html,'data-visible-capture').map(JSON.parse),[rect,rect]);
  const rules=[...html.matchAll(/<div data-recording-rule="[^"]*"[^>]*>/g)].map(m=>attrs(m[0],'style')[0]);
  assert.ok(rules.every(style=>style.includes('height:2px')&&style.includes(`width:${rect.width}px`)&&!style.includes('border')));
  assert.ok(rules[0].includes(`top:${rect.y}px`)&&rules[1].includes(`top:${rect.y+rect.height-2}px`));
  assert.doesNotMatch(html,/data-recording-frame/);assert.match(html,/top:250px;width:1080px;height:1220px;overflow:hidden/);
});

test('missing prepared plate fails explicitly without demo substitution',async()=>{
  await assert.rejects(renderFamilyDesign({module,exportName:'ScreenRecording',scene,frame:0}),/requires PreparedPlateProvider/);
});

test('recording has no visible language copy; geometry is neutral and source schema stays unchanged',async()=>{
  // This schema has no title/label/lang field. Do not invent an English text contract.
  assert.deepEqual(Object.keys(scene.data).sort(),['callouts','clicks','keys']);
  const html=await render(120);assert.doesNotMatch(html,/>\s*(?:ISSUE|العدد)/);
  assert.deepEqual(api.screenRecordingIssues(scene,plate),[]);
});

test('pure camera/click/callout contract and edge geometry across the full scene',()=>{
  for(let f=0;f<scene.durationInFrames;f++){
    assert.deepEqual(api.recordingPose(f,scene.data.keys,plate),api.screenTrackPose(f,scene.data.keys,plate));
    const pose=api.recordingPose(f,scene.data.keys,plate),rect=api.visibleCaptureRect(pose),x=Math.max(0,pose.left),y=Math.max(0,pose.top);
    assert.deepEqual(rect,{x,y:y+250,width:Math.max(0,Math.min(1080,pose.left+pose.width)-x),height:Math.max(0,Math.min(1220,pose.top+pose.height)-y)});
  }
  assert.equal(api.CLICK_RIPPLE_SEC,.4);
  const callout={atFrame:80,untilFrame:100,kind:'rect',rect:{x:.3,y:.3,width:.1,height:.1}};
  assert.equal(api.calloutState(callout,79,30,false),null);assert.ok(api.calloutState(callout,80,30,false));assert.equal(api.calloutState(callout,100,30,false),null);
  assert.deepEqual(api.visibleCaptureRect({left:200,top:-50,width:500,height:1400}),{x:200,y:250,width:500,height:1220});
  assert.equal(api.visibleCaptureRect({left:1100,top:0,width:20,height:50}).width,0);
});
