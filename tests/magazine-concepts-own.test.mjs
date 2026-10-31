import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bundleEngine} from './helpers/engine-bundle.mjs';
import {renderConceptDesign} from './helpers/magazine-design-ssr.mjs';

const BASE = 'engine/src/styles/magazine-interview/designs/concepts/';
const DESIGNS = {'system-layers':'SystemLayers','headline-to-system':'HeadlineToSystem','conditional-branching':'ConditionalBranching','identity-filtering':'IdentityFiltering','data-morph':'DataMorph'};
const api = await bundleEngine(`
  export {catalogDemo, conceptSettledFrame} from './engine/src/motion-concepts/catalog';
  export {NAVY} from './engine/src/styles/magazine-interview/system/base';
  export {smallNumeralStyle} from './engine/src/styles/magazine-interview/system/numerals';
  export {getBoundingBox, getLength, getPointAtLength} from '@remotion/paths';
  export {intersectRect} from './engine/src/motion-concepts/geometry';
  export {beatsFor, MIN_FRAMES as BRANCH_MIN} from './engine/src/motion-concepts/conditional-branching/math';
  export {evaluateFiltering, MIN_FRAMES as FILTER_MIN} from './engine/src/motion-concepts/identity-filtering/math';
`);
const propsFor = (id, durationInFrames = 240) => ({config:structuredClone(api.catalogDemo(id)),durationInFrames,seam:1080,th:api.NAVY,sectionIndex:0,mode:'once',backdrop:'canvas'});
const render = (id,props,frame) => renderConceptDesign({module:BASE+id+'.tsx',exportName:DESIGNS[id],props,frame});
const decode = s => s.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const attrs = s => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])]));
const css = s => Object.fromEntries(s.split(';').filter(Boolean).map(x=>{const i=x.indexOf(':');return [x.slice(0,i),x.slice(i+1)];}));
const tags = (html,key,value) => [...html.matchAll(/<[A-Za-z][^>]*>/g)].map(m=>attrs(m[0])).filter(a=>key in a&&(value===undefined||a[key]===value));
const tag = (html,key,value) => {const a=tags(html,key,value)[0];assert.ok(a,`missing ${key}=${value}`);return a;};
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const num = v => parseFloat(v);
function soundMarkup(html) {assert.match(html,/data-style-system="magazine-interview"/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);}
function measuredText(html) {
  for(const a of tags(html,'data-text-box')) {
    assert.ok(Number(a['data-font-size'])>=Number(a['data-text-floor']));
    assert.ok(Number(a['data-text-floor'])>=28);
    assert.equal(a['data-text-fits'],'true');
    assert.equal(css(a.style).overflow,'hidden');
  }
  for(const a of tags(html,'data-numeral-text')) {
    const s=css(a.style), expected=api.smallNumeralStyle(a['data-numeral-text']);
    assert.equal(s['font-family'],expected.fontFamily);assert.equal(Number(s['font-weight']),expected.fontWeight);
    assert.equal(s['font-variant-numeric'],'tabular-nums');
  }
}
for(const id of Object.keys(DESIGNS)) test(`${id}: marker, finite markup and approved fitted text at the requested frames`,async()=>{
  const props=propsFor(id), settled=api.conceptSettledFrame(id,'once',240);
  if(id==='identity-filtering') {
    // The approved pilot rejects 240 because its unchanged MIN_FRAMES is 270.
    assert.equal(api.FILTER_MIN,270);
    for(const frame of [0,settled,239]) await assert.rejects(render(id,props,frame),/needs at least 270|minimum/);
    return;
  }
  let hold;
  for(const frame of [0,settled,239]) {
    const html=await render(id,props,frame);soundMarkup(html);measuredText(html);
    if(frame===settled)hold=html;if(frame===239)assert.equal(html,hold,'painted hold changed');
  }
});
test('identity-filtering: 300-frame approved case keeps identities, floors and frozen hold',async()=>{
  const props=propsFor('identity-filtering',300), settled=api.conceptSettledFrame('identity-filtering','once',300);
  let hold;
  for(const frame of [0,settled,299]) {
    const html=await render('identity-filtering',props,frame);soundMarkup(html);measuredText(html);
    assert.equal(tags(html,'data-card-id').length,6);
    if(frame===settled){hold=html;assert.deepEqual(tags(html,'data-card-id').filter(a=>a['data-status']==='retained').map(a=>a['data-card-id']),['A1','D4']);}
    if(frame===299)assert.equal(html,hold);
  }
  const counter=tag(hold,'data-numeral-text','٢ / ٦');assert.equal(Number(counter['data-font-size']),32);assert.equal(css(counter.style)['font-family'],'Alexandria');
  assert.deepEqual([...new Set(tags(hold,'data-number-kind','step').map(a=>Number(a['data-font-size'])))].sort(),[28,29]);
  for(const run of ['٦ → ٤','٤ → ٢','٢ / ٦','≥ ٧٥','= ✓'])assert.ok(hold.includes(`unicode-bidi:isolate-override;display:inline-block">${run}</bdi>`));
});
test('identity-filtering alternative outcome still comes from the existing typed predicates',async()=>{
  const props=propsFor('identity-filtering',300);props.config.cards.forEach(c=>{c.attributes.score=0;});
  assert.deepEqual(api.evaluateFiltering(props.config).retainedIds,[]);
  const html=await render('identity-filtering',props,299);soundMarkup(html);
  assert.equal(tags(html,'data-status','retained').length,0);assert.equal(tags(html,'data-status','rejected').length,6);
  assert.ok(html.includes('٠ / ٦'));
});
test('system-layers and headline-to-system keep the approved 40px chips/badges',async()=>{
  for(const [id,kind,count] of [['system-layers','chip',5],['headline-to-system','badge',4]]) {
    const html=await render(id,propsFor(id),api.conceptSettledFrame(id,'once',240));
    const chips=tags(html,'data-number-kind',kind);assert.equal(chips.length,count);
    for(const a of chips){assert.equal(Number(a['data-font-size']),40);assert.equal(css(a.style)['font-family'],'Alexandria');assert.equal(css(a.style)['font-weight'],'600');}
    if(id==='system-layers')for(const a of tags(html,'data-layer')){assert.equal(a.fill,api.NAVY.ground);assert.equal(a['stroke-width'],'2');near(Number(a['stroke-opacity']),1-Number(a['data-layer'])*.125);}
  }
});
test('data-morph keeps the exact thin KPI suffix ratio, weight, diamonds and gold line',async()=>{
  const html=await render('data-morph',propsFor('data-morph'),239), a=tag(html,'data-kpi-suffix'), s=css(a.style);
  near(num(s['font-size']),Number(a['data-kpi-size'])*.42);assert.equal(s['font-weight'],'200');assert.equal(s.color,api.NAVY.gold);
  assert.equal(tags(html,'data-bar').length,6);assert.match(html,/stroke="#F3C776" stroke-width="4"/);assert.doesNotMatch(html,/stroke-dasharray="4 12"/);
});
const englishBranch = () => {
  const data=structuredClone(api.catalogDemo('conditional-branching'));
  data.input.label='Sample request';data.condition.label='Score';data.branches={whenTrue:'Prepare proposal',whenFalse:'Review request'};return data;
};
function branchPaths(html) {
  return [...html.matchAll(/<g\b([^>]*data-route="[^>]*)>([\s\S]*?)<\/g>/g)].map(m=>({key:attrs(m[1])['data-route'],paths:[...m[2].matchAll(/<path\b[^>]*>/g)].map(p=>attrs(p[0])).filter(a=>a['stroke-width'])}));
}
test('conditional-branching dock stays readable and clear of both rows; routes stop at the card in Arabic and English',async()=>{
  for(const english of [false,true])for(const selectedTrue of [true,false]) {
    const props=propsFor('conditional-branching');if(english)props.config=englishBranch();props.config.input.value=selectedTrue?82:74;
    const html=await render('conditional-branching',props,239);soundMarkup(html);measuredText(html);
    const key=selectedTrue?'whenTrue':'whenFalse';assert.match(html,new RegExp(`data-selected-route="${key}"`));
    const card=tag(html,'data-outcome',key), c=css(card.style), dock=tag(html,'data-docked-token'), d=css(dock.style);
    const body={x:num(c.left)+num(d.left),y:num(c.top)+num(d.top),width:num(d.width),height:num(d.height)};
    const label=JSON.parse(card['data-label-row-rect']), outcome=JSON.parse(card['data-outcome-name-rect']);
    assert.ok(body.y-label.y-label.height>=12);assert.ok(outcome.y-body.y-body.height>=12);
    assert.equal(api.intersectRect(body,label),null);assert.equal(api.intersectRect(body,outcome),null);
    const name=css(tag(html,'data-docked-part','name').style), score=css(tag(html,'data-docked-part','score').style);
    assert.ok(num(name['font-size'])>=34);near(num(name['font-size']),num(score['font-size']));assert.equal(name['font-weight'],'600');
    assert.equal(score['font-family'],english?"'IBM Plex Mono', monospace":'Alexandria');assert.equal(score['font-weight'],english?'500':'600');
    assert.equal(score.color,api.NAVY.gold);assert.equal(name.color,api.NAVY.ink);
    assert.equal(Number(tag(html,'data-token-scale')['data-token-scale']),1);
    assert.equal(dock['data-docked-ellipsis'],'false');assert.equal(Number(dock['data-docked-lines']),english?1:2);
    const ids=tags(html,'data-docked-part','id');assert.equal(ids.length,english?1:0);
    if(ids.length){const s=css(ids[0].style);assert.equal(num(s['font-size']),28);assert.equal(s.color,api.NAVY.dim);}
    for(const group of branchPaths(html))for(const p of group.paths) {
      const cardTop=num(css(tag(html,'data-outcome',group.key).style).top), bounds=api.getBoundingBox(p.d);
      assert.ok(bounds.y2+Number(p['stroke-width'])/2<=cardTop+1e-7);
      const length=api.getLength(p.d);
      for(let i=0;i<=32;i++){const point=api.getPointAtLength(p.d,length*i/32);for(const a of tags(html,'data-outcome')){const s=css(a.style);assert.ok(!(point.x>num(s.left)&&point.x<num(s.left)+num(s.width)&&point.y>num(s.top)&&point.y<num(s.top)+num(s.height)));}}
    }
    for(const attr of ['data-token-fill-opacity','data-frame-opacity','data-travelling-copy-opacity'])near(num(css(tag(html,attr).style).opacity),0);
    for(const a of tags(html,'data-outcome-mark')) {
      const box=JSON.parse(a['data-mark-box']), branch=tag(html,'data-outcome',a['data-outcome-mark']);
      // The 28px MarkRing circle has radius .48*28 plus half its 2.2px stroke.
      const radius=.48*28+1.1;
      near(box.y+14-radius,12);
      near(english ? box.x+14-radius : JSON.parse(branch['data-mechanism-box']).width-box.x-14-radius,12);
    }
    near(num(d.opacity),1);
    if(english)assert.match(html,/direction:ltr;text-align:left/);
  }
});
test('conditional fit warns and ellipsizes at 34 without throwing or changing source data',async()=>{
  const props=propsFor('conditional-branching');props.config.input.label='W'.repeat(28);props.config.input.value=.12345678901234566;
  const before=structuredClone(props.config), warnings=[], old=console.warn;
  let html;
  try {console.warn=(...items)=>warnings.push(items.join(' '));html=await render('conditional-branching',props,239);}
  finally {console.warn=old;}
  soundMarkup(html);assert.equal(tag(html,'data-docked-ellipsis')['data-docked-ellipsis'],'true');
  assert.equal(num(css(tag(html,'data-docked-part','name').style)['font-size']),34);
  assert.ok(html.includes('…'));assert.ok(warnings.some(s=>s.includes('fit-warning')));assert.deepEqual(props.config,before);
});
test('conditional landing cross-fades on the original beat without scaling or changing the predicate',async()=>{
  const props=propsFor('conditional-branching'), B=api.beatsFor(240);
  for(const frame of [B.resolve.from,Math.floor((B.resolve.from+B.resolve.to)/2),B.resolve.to]) {
    const html=await render('conditional-branching',props,frame), out=num(css(tag(html,'data-travelling-copy-opacity').style).opacity), into=num(css(tag(html,'data-docked-token').style).opacity);
    near(out+into,1);for(const attr of ['data-token-fill-opacity','data-frame-opacity'])near(num(css(tag(html,attr).style).opacity),out);
    assert.equal(Number(tag(html,'data-token-scale')['data-token-scale']),1);
    if(frame===B.resolve.from)near(out,1);if(frame===B.resolve.to)near(out,0);
  }
});
test('every concept honours transparent backdrops and the default section index',async()=>{
  for(const id of Object.keys(DESIGNS)) {
    const props=propsFor(id,id==='identity-filtering'?300:240), frame=props.durationInFrames-1;
    const canvas=await render(id,props,frame), transparent=await render(id,{...props,backdrop:'none'},frame);
    assert.ok(canvas.includes('grain-navy'));assert.ok(!transparent.includes('grain-navy'));assert.ok(!transparent.includes('top:262px'));
    const {sectionIndex,...withoutIndex}=props;assert.equal(sectionIndex,0);assert.equal(await render(id,withoutIndex,frame),canvas);
  }
});
test('own concept modules are independent of pilot files and use the shared contract/numeral API',async()=>{
  const files=[...Object.keys(DESIGNS).map(id=>id+'.tsx'),'own-drawing.tsx','branching-landing.tsx','copy-own.ts'];
  for(const file of files){const s=await readFile(BASE+file,'utf8');assert.doesNotMatch(s,/from\s+['"][^'"]*docs\//);if(file in Object.fromEntries(Object.keys(DESIGNS).map(id=>[id+'.tsx',true])))assert.match(s,/React\.FC<ConceptDesignProps</);}
  const drawing=await readFile(BASE+'own-drawing.tsx','utf8');assert.match(drawing,/smallNumeralStyle/);assert.doesNotMatch(drawing,/smallNumeralFace/);
});
