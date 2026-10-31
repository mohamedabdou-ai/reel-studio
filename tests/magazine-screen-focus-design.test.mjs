import test from 'node:test';
import assert from 'node:assert/strict';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {bundleEngine} from './helpers/engine-bundle.mjs';

const module='engine/src/styles/magazine-interview/designs/screen-focus.tsx';
const scene=structuredClone(ARABIC_SCENES.find(s=>s.family==='screen-focus'));
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#x27;',"'");
const attrs=(html,name)=>[...html.matchAll(new RegExp('(?:^|\\s)'+name+'="([^"]*)"','g'))].map(m=>decode(m[1]));
const render=(s,frame)=>renderFamilyDesign({module,exportName:'ScreenFocus',scene:s,frame});
const api=await bundleEngine(`
export {SCREEN_STACK,imagePose} from './${module}';
export {focusGeometry,FOCUS_VIEWPORT} from './engine/src/motion-library/geometry';
export {capturePose,cursorAt,calloutState,captureIssues} from './engine/src/motion-library/capture';
export {boundedData,sceneTiming} from './engine/src/style-kit/design-safety';
export {EASE,clamp01} from './engine/src/core/motion';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {SmallNumeral} from './engine/src/styles/magazine-interview/system/numerals';
import {DigitsProvider} from './engine/src/creative-kit/digits';
export const numeral=(text,digits,width)=>renderToStaticMarkup(<DigitsProvider digits={digits}><SmallNumeral text={text} width={width}/></DigitsProvider>);
`,{ssr:true});

for(const frame of [0,30,60,239])test(`screen-focus frame ${frame}: real designSet and exact camera`,async()=>{
  const html=await render(scene,frame),step=scene.data.steps[0];
  assert.match(html,/data-style-system="magazine-interview"/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
  const expected=api.focusGeometry({width:step.sourceWidth,height:step.sourceHeight},step.focus,api.FOCUS_VIEWPORT,step.zoom,api.EASE.land(api.clamp01((frame-step.focusFrame)/step.settleFrames)));
  assert.deepEqual(attrs(html,'data-focus-box').map(JSON.parse),[expected.box]);assert.deepEqual(api.imagePose(step,frame),expected);
});

test('approved plate, 44px cursor and conditional progress retain the 350..1148.4 stack',async()=>{
  const html=await render(scene,60),s=api.SCREEN_STACK;
  assert.equal(s.bottom,1148.4);assert.equal(s.scale,.95);assert.equal(s.plateWidth-32,840);assert.equal(s.plateHeight-32,560);
  assert.ok(s.label-s.plate-s.plateHeight*s.scale>=16-1e-9);
  const shell=html.slice(html.indexOf('data-screen-plate='),html.indexOf('data-focus-viewport='));
  assert.doesNotMatch(shell,/rotate\(45deg\)/);assert.match(shell,/x="0.75" y="0.75" width="870.5" height="590.5"/);assert.match(shell,/x="7" y="7" width="858" height="578"/);
  const cursor=html.match(/<svg data-p2-cursor=""[^>]*>/)[0];
  assert.ok(Math.abs(Number(attrs(cursor,'height')[0])*s.scale-44)<1e-9);assert.equal(attrs(cursor,'viewBox')[0],'4 2 16 19');
  assert.match(html,/stroke-width="2" vector-effect="non-scaling-stroke"/);assert.doesNotMatch(html,/data-p2-progress/);
  const multiple=structuredClone(scene);multiple.data.steps.push({...multiple.data.steps[0],atFrame:100,focusFrame:110});assert.match(await render(multiple,150),/data-p2-progress/);
});

test('English is left aligned; numeral face follows mapped characters at 40, floor 28',async()=>{
  const english=structuredClone(scene);english.data.kicker='SCREEN';Object.assign(english.data.steps[0],{title:'Focus on the next step',label:'Choose this area 1'});
  assert.match(await render(english,60),/direction:ltr;text-align:left/);
  for(const text of [' / 01',' / ٠١'])for(const digits of ['arabic-indic','latin']){
    const html=api.numeral(text,digits,150);
    assert.match(html,/data-numeral-size="40"/);assert.match(html,/font-variant-numeric:tabular-nums/);
    assert.match(html,digits==='arabic-indic'?/data-numeral-face="Alexandria"/ : /data-numeral-face="[^\"]*IBM Plex Mono/);
    assert.match(html,new RegExp('data-numeral-weight="'+(digits==='arabic-indic'?600:500)+'"'));
  }
  assert.match(api.numeral('12','latin',32),/data-numeral-size="28"/);
});

test('video timing helpers keep source-relative trim 300, camera keys, cursor and callout timing',()=>{
  const data={steps:[{kind:'video',atFrame:0,title:'Screen',label:'Area',src:'capture.mp4',sourceWidth:1920,sourceHeight:1080,trimBeforeFrame:300,moveFrames:20,
    keys:[{atFrame:0,focus:{x:0,y:0,width:1,height:1},zoom:1},{atFrame:60,focus:{x:.3,y:.3,width:.4,height:.4},zoom:1.4}],
    cursor:[{atFrame:0,x:.4,y:.4},{atFrame:90,x:.5,y:.5,click:true}],callouts:[{kind:'rect',rect:{x:.3,y:.3,width:.1,height:.1},atFrame:80,untilFrame:100}]}]};
  const bounded=api.boundedData(data,api.sceneTiming(240,'magazine-interview')),step=bounded.steps[0];
  assert.equal(step.trimBeforeFrame,300);assert.deepEqual(step.keys,data.steps[0].keys);assert.deepEqual(api.captureIssues({...scene,data:bounded}),[]);
  assert.deepEqual(api.capturePose(step,80),api.capturePose(step,239));
  assert.equal(api.cursorAt(step.cursor,90,30).click,1/12);
  assert.equal(api.calloutState(step.callouts[0],79,30,false),null);assert.ok(api.calloutState(step.callouts[0],80,30,false));assert.equal(api.calloutState(step.callouts[0],100,30,false),null);
});
