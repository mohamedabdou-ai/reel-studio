import test from 'node:test';
import assert from 'node:assert/strict';
import {hasStyleSystem, systemZones} from '../engine/src/style-kit/system/zones.ts';

test('only magazine-interview has a design system, and its zones respect the safe zone', () => {
  assert.equal(hasStyleSystem('magazine-interview'), true);
  assert.equal(hasStyleSystem('section-deck'), false);
  const zones = systemZones('magazine-interview');
  assert.deepEqual(zones.takeover, {x: 65, y: 350, width: 950, height: 800, railFromY: 1150, railMaxX: 853});
  assert.equal(zones.split.y + zones.split.height, 992);
  assert.equal(systemZones('magazine-interview', 1000).split.y + systemZones('magazine-interview', 1000).split.height, 912);
  assert.equal(systemZones('section-deck'), null);
});

import {layoutCompose, pickScale} from '../engine/src/creative-kit/compose/layout.ts';
import {SHRINK_FLOOR,estimatePartHeight} from '../engine/src/creative-kit/compose/budget.ts';
import {routeStopsToCompose} from '../engine/src/creative-kit/compose/adapters/semantic.ts';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
const zone = {x: 65, y: 250, width: 950, height: 1020, railFromY: 1150, railMaxX: 853};
const fixed = (h) => () => h;

test('stack places parts in order, with the block sitting slightly above centre', () => {
  const {boxes, overflow} = layoutCompose('stack', [{id: 'a', kind: 'headline'}, {id: 'b', kind: 'body'}], zone, fixed(100), 'rtl');
  assert.equal(overflow, 0);
  assert.ok(boxes.a.y < boxes.b.y);
  assert.equal(boxes.a.y, 250 + Math.round((1020 - 228) * 0.42));
  assert.equal(boxes.b.y, boxes.a.y + 100 + 28);
});

test('hero gives the emphasised part the remaining height', () => {
  const parts = [{id: 'k', kind: 'kicker'}, {id: 'n', kind: 'number', emphasis: true}, {id: 'l', kind: 'line'}];
  const {boxes} = layoutCompose('hero', parts, zone, fixed(60), 'rtl');
  assert.equal(boxes.n.height, 1020 - 60 - 60 - 2 * 28);
});

test('two columns put the first body part on the right in Arabic and on the left in English', () => {
  const parts = [{id: 'h', kind: 'headline'}, {id: 'a', kind: 'card'}, {id: 'b', kind: 'card'}];
  const rtl = layoutCompose('two-column', parts, zone, fixed(100), 'rtl').boxes;
  const ltr = layoutCompose('two-column', parts, zone, fixed(100), 'ltr').boxes;
  assert.ok(rtl.a.x > rtl.b.x);
  assert.ok(ltr.a.x < ltr.b.x);
  assert.equal(rtl.a.width, (950 - 28) / 2);
});

test('boxes that reach the rail are narrowed and overflow is reported', () => {
  const {boxes, overflow} = layoutCompose('stack', [{id: 'a', kind: 'body'}, {id: 'b', kind: 'body'}], zone, fixed(600), 'rtl');
  assert.equal(overflow, 600 * 2 + 28 - 1020);
  assert.ok(boxes.b.x + boxes.b.width <= 853);
});

test('pickScale grows short pages and shrinks plates only after minimum type', () => {
  const short = {arrangement: 'stack', parts: [{id: 'h', kind: 'headline', at: {frame: 0}, text: 'عنوان'}]};
  const split = systemZones('magazine-interview').split;
  const large = pickScale(short, split, 'rtl');
  assert.ok(large.scale > 1);
  assert.equal(large.shrink, 1);
  const full = {arrangement: 'stack', parts: [
    {id: 'k', kind: 'kicker', at: {frame: 0}, text: 'قبل وبعد'},
    {id: 'h', kind: 'headline', at: {frame: 4}, text: 'نفس الشاشة بعد الترتيب'},
    {id: 'm', kind: 'media', at: {frame: 16}, source: {kind: 'compare', revealFrames: 50,
      before: {src: 'projects/pilot/before.png', width: 960, height: 540, label: 'قبل'},
      after: {src: 'projects/pilot/after.png', width: 960, height: 540, label: 'بعد'}}, caption: 'صور توضيحية للمعاينة'},
  ]};
  const small = pickScale(full, split, 'rtl');
  assert.equal(small.scale, 1);
  assert.ok(small.shrink < 1);
  assert.equal(small.placed.overflow, 0);
});

test('steps stop at the larger of their text floor and 80 percent floor',()=>{
 const part={id:'steps',kind:'steps',at:{frame:0},items:[{title:'First',detail:'Detail',offsetFrames:0},{title:'Second',detail:'Detail',offsetFrames:20}]};
 const natural=estimatePartHeight(part,950,1,1);
 assert.equal(SHRINK_FLOOR.steps,0.8);
 assert.equal(estimatePartHeight(part,950,1,0.9),Math.max(Math.round(natural*0.9),2*(52+44+20)));
 assert.equal(estimatePartHeight(part,950,1,0.5),Math.max(Math.round(natural*0.8),2*(52+44+20)));
});

test('each author line budget includes its 12px gap before the comment',()=>{
 const part={kind:'chat',messages:[{from:'them',author:'First',text:'Text',offsetFrames:0},{from:'them',author:'Next',text:'Reply',offsetFrames:20}]};
 assert.equal(estimatePartHeight(part,950,1),2*(Math.round(46*1.06*1.34)+39+12)+34);
});

test('three and four stop split routes report overflow when their safe row floor cannot fit',t=>{
 const three=ARABIC_SCENES.find(s=>s.family==='route-stops');
 const four={...three,data:{...three.data,stops:[...three.data.stops,{label:'التسليم',detail:'انشر 4',atFrame:74}]}};
 for(const [name,sample]of [['arabic-three',three],['four',four]]){
  const data=routeStopsToCompose({...sample,layout:'split'}),plan=pickScale(data,systemZones('magazine-interview').split,'rtl');
  t.diagnostic(JSON.stringify({routeFinish:{name,data,plan}}));
  assert.equal(plan.placed.overflow,name==='arabic-three'?35:151,name);assert.equal(plan.scale,1);assert.equal(plan.shrink,0.5,name);
  assert.equal(plan.placed.boxes.route.height/(name==='arabic-three'?3:4),116);
 }
});
