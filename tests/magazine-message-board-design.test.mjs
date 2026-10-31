import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {bundleEngine} from './helpers/engine-bundle.mjs';

const module='engine/src/styles/magazine-interview/designs/message-board.tsx';
const scene=structuredClone(ARABIC_SCENES.find(s=>s.family==='message-board'));
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&');
const attrs=(html,name)=>[...html.matchAll(new RegExp('(?:^|\\s)'+name+'="([^"]*)"','g'))].map(m=>decode(m[1]));
const render=(s,frame)=>renderFamilyDesign({module,exportName:'MessageBoard',scene:s,frame});
const api=await bundleEngine(`export {boardPose,BOARD_BOX} from './${module}'; export {messageBoardState} from './engine/src/creative-kit/semantic/message-board';`,{ssr:true});

for(const frame of [0,30,120,239])test(`message-board frame ${frame}: real designSet, finite markup, exact poses`,async()=>{
  const html=await render(scene,frame);
  assert.match(html,/data-style-system="magazine-interview"/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
  const expected=api.messageBoardState(scene.data,frame,api.BOARD_BOX);
  assert.deepEqual(attrs(html,'data-pose').map(JSON.parse),JSON.parse(JSON.stringify(expected.items)));
  assert.deepEqual(attrs(html,'data-message-id'),scene.data.items.map(item=>item.id));
});

test('focused card: 96px thin/heavy headline, rule 24 below, body 44 and centered block',async()=>{
  const html=await render(scene,120),layout=JSON.parse(attrs(html,'data-focus-layout')[0]);
  assert.equal(layout.titleSize,96);assert.deepEqual(attrs(html,'data-headline-weight'),['200','800']);
  assert.equal(layout.ruleY-layout.titleHeight,24);assert.equal(layout.bodyY-layout.ruleY,26);
  assert.equal(layout.top*2+layout.height,591);assert.equal(layout.top,129);
  assert.match(html,/left:27px;top:27px;width:826px;height:591px/);
  assert.match(html,/data-focus-rule="" style="[^"]*height:2px/);
  const body=[...html.matchAll(/<div data-p2-text=""[^>]+>/g)].map(m=>m[0]).at(-1);
  assert.match(body,/data-size="44"/);assert.match(body,/data-fits="true"/);
  const single=structuredClone(scene);single.data.items[2].label='Result';
  const one=await render(single,120);assert.deepEqual(attrs(one,'data-headline-weight'),['800']);
});

test('English copy aligns left and short two-word focus titles retain contrast',async()=>{
  const english=structuredClone(scene);
  Object.assign(english.data,{initialTitle:'Many messages',boardTitle:'One board',focusTitle:'One result',closingTitle:'Next step',items:english.data.items.map((item,i)=>({...item,label:i===2?'A result':'Step '+i,detail:item.detail?'A useful detail':undefined}))});
  const html=await render(english,120);
  assert.match(html,/direction:ltr;text-align:left/);assert.deepEqual(attrs(html,'data-headline-weight'),['200','800']);
});

test('board tiles retain 40/34 floors and hold is frozen; maximum copy clips without throwing',async()=>{
  const tile=await render(scene,80);assert.ok(!tile.includes('data-focus-content'));
  assert.ok(attrs(tile,'data-size').includes('40')&&attrs(tile,'data-size').includes('34'));
  assert.equal(await render(scene,120),await render(scene,239));
  const dense=structuredClone(scene);dense.data.items=Array.from({length:6},(_,i)=>({id:'long-'+i,label:'تفصيل '.repeat(12).slice(0,64),detail:'معلومة '.repeat(12).slice(0,80)}));
  const warnings=[],warn=console.warn;console.warn=(...args)=>warnings.push(args.join(' '));
  try {for(const frame of [0,60,105,120])assert.doesNotMatch(await render(dense,frame),/NaN|Infinity|undefined/);}finally{console.warn=warn;}
  assert.ok(warnings.length>0&&warnings.every(w=>w.includes('fit-warning')));
  for(const file of [module,'engine/src/styles/magazine-interview/designs/message-board-focus.tsx'])assert.doesNotMatch(readFileSync(file,'utf8'),/from\s+['"][^'"]*docs\//);
});
