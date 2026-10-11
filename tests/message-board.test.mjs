import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {editSceneSchema,editManifestSchema} from '../engine/src/prepared-edit/schema.ts';
import {fieldsForFamily,validateData} from '../engine/src/review-editor/panels/form-schema.ts';
import {sceneCues} from '../scripts/lib/scene-cues.mjs';
import {semanticAssets} from '../engine/src/creative-kit/semantic/schema.ts';
import {addSceneFromTemplate} from '../engine/src/review-editor/ops/scenes.ts';

const data={initialTitle:'Several supplied messages',boardTitle:'One organised board',focusTitle:'Focus on this result',closingTitle:'Review the useful next step',
  items:[{id:'brief',label:'The brief',detail:'A supplied question'},{id:'plan',label:'The plan',detail:'A supplied step'},{id:'result',label:'The result',detail:'A supplied conclusion'}],
  focusIndex:2,gatherFrame:90,gatherDurationFrames:90,focusFrame:300,focusDurationFrames:90,closingFrame:480};
const scene=()=>({id:'example',family:'message-board',fromFrame:0,durationInFrames:600,layout:'takeover',motion:'land',data:structuredClone(data)});
const manifest=input=>({version:1,id:'example',purpose:'test',style:'paper-collage',source:{path:'Raw/example.mp4',sha256:'a'.repeat(64),width:1080,height:1920,fps:30,totalFrames:600},
  segments:[{fromFrame:0,toFrame:600}],captions:{status:'draft',words:[]},scenes:[input],sounds:[],camera:[]});

test('the normal editor accepts an authored continuous message-board without invented assets',()=>{
  assert.equal(editSceneSchema.safeParse(scene()).success,true);
  assert.equal(editManifestSchema.safeParse(manifest(scene())).success,true);
  assert.equal(validateData('message-board',data).ok,true);
  assert.ok(fieldsForFamily('message-board').some(field=>field.key==='items'));
  assert.deepEqual(semanticAssets(scene()),[]);
});
test('message-board refuses duplicate identity, impossible focus and presenter overlap',()=>{
  const duplicate=scene();duplicate.data.items[1].id=duplicate.data.items[0].id;
  assert.equal(editSceneSchema.safeParse(duplicate).success,false);
  const unknown=scene();unknown.data.focusIndex=3;
  assert.equal(editSceneSchema.safeParse(unknown).success,false);
  const overlap=scene();overlap.layout='split';
  assert.equal(editSceneSchema.safeParse(overlap).success,false);
});
test('gather, focus and closing must keep ordered readable holds inside the scene',()=>{
  const early=scene();early.data.focusFrame=early.data.gatherFrame+early.data.gatherDurationFrames;
  assert.equal(editManifestSchema.safeParse(manifest(early)).success,false);
  const late=scene();late.data.closingFrame=590;
  assert.equal(editManifestSchema.safeParse(manifest(late)).success,false);
  const abrupt=scene();delete abrupt.data.closingFrame;abrupt.data.focusFrame=500;abrupt.data.focusDurationFrames=90;
  assert.equal(editManifestSchema.safeParse(manifest(abrupt)).success,false);
});
test('the same card identities travel through scatter, board and focused result poses',async()=>{
  const url=new URL('../engine/src/creative-kit/semantic/message-board.ts',import.meta.url);
  await access(url).catch(()=>assert.fail('The deterministic message-board state function is missing'));
  const {messageBoardState}=await import(url);
  const box={x:100,y:500,width:800,height:700};
  const start=messageBoardState(data,0,box),middle=messageBoardState(data,135,box),board=messageBoardState(data,220,box),focused=messageBoardState(data,420,box),closing=messageBoardState(data,540,box);
  for(const state of [start,middle,board,focused,closing])assert.deepEqual(state.items.map(item=>item.id),data.items.map(item=>item.id));
  assert.equal(start.phase,'messages');assert.equal(middle.phase,'gathering');assert.equal(board.phase,'board');assert.equal(focused.phase,'focus');assert.equal(closing.phase,'closing');
  assert.notDeepEqual(start.items[0],board.items[0]);
  assert.ok(middle.items[0].x>=Math.min(start.items[0].x,board.items[0].x)&&middle.items[0].x<=Math.max(start.items[0].x,board.items[0].x));
  assert.ok(focused.items[2].width>board.items[2].width);
  assert.ok(focused.items.filter(item=>item.id!=='result').every(item=>item.opacity===0));
  assert.deepEqual(focused.items,closing.items,'The resolved result remains the same object at closing');
  assert.deepEqual(messageBoardState(data,135,box),middle,'Repeated frame evaluation cannot accumulate motion or random offsets');
  for(const item of [...start.items,...board.items,...focused.items]){
    assert.ok(item.x>=box.x && item.y>=box.y && item.x+item.width<=box.x+box.width && item.y+item.height<=box.y+box.height);
  }
});
test('sound cues are attached to authored gather and focus phases',()=>{
  assert.deepEqual(sceneCues(scene()),[{frame:0,kind:'transition',sceneId:'example'},{frame:90,kind:'reveal',sceneId:'example'},{frame:300,kind:'swap',sceneId:'example'},{frame:480,kind:'reveal',sceneId:'example'}]);
});
test('the live-editor template preserves readable timing at a different source frame rate',()=>{
  const available=manifest(scene());available.scenes=[];available.source.fps=50;
  const added=addSceneFromTemplate(available,'message-board');
  assert.equal(added.ok,true,'The template should retain its authored seconds at 50fps');
  assert.equal(added.manifest.scenes[0].data.gatherFrame,50);
  assert.equal(added.manifest.scenes[0].durationInFrames,300);
});
