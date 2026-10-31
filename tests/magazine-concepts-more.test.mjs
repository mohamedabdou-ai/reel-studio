import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundleEngine} from './helpers/engine-bundle.mjs';
import {renderConceptDesign} from './helpers/magazine-design-ssr.mjs';

const ROOT='engine/src/styles/magazine-interview/designs/concepts/';
const CASES=[['button-to-window','ButtonToWindow'],['brief-to-workspace','BriefToWorkspace'],['magnetic-dock','MagneticDock'],['keyword-reveal','KeywordReveal'],['chaos-to-brand','ChaosToBrand']];
const api=await bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {DigitsProvider} from './engine/src/creative-kit/digits';
  import {MagazineScope,NAVY} from './engine/src/styles/magazine-interview/system/base';
  import {Text,Icon} from './engine/src/styles/magazine-interview/designs/concepts/sheet-parts';
  import * as B from './engine/src/motion-concepts/button-to-window/math';
  import * as W from './engine/src/motion-concepts/brief-to-workspace/math';
  import * as D from './engine/src/motion-concepts/magnetic-dock/math';
  import * as K from './engine/src/motion-concepts/keyword-reveal/math';
  import * as C from './engine/src/motion-concepts/chaos-to-brand/math';
  export {catalogDemo,conceptSettledFrame} from './engine/src/motion-concepts/catalog';
  export {assertHoldFrozen} from './engine/src/motion-concepts/timeline';
  export {NAVY};
  export const math={'button-to-window':B,'brief-to-workspace':W,'magnetic-dock':D,'keyword-reveal':K,'chaos-to-brand':C};
  export const numeral=(text,digits,lang,box)=>renderToStaticMarkup(<DigitsProvider digits={digits}><MagazineScope data={{lang}}><Text text={text} box={box} mono size={40} min={28} lines={1} color={NAVY.gold}/></MagazineScope></DigitsProvider>);
  export const initial=(name,digits)=>renderToStaticMarkup(<DigitsProvider digits={digits}><MagazineScope data={{lang:'en'}}><Icon name={name} box={{x:0,y:0,width:59,height:59}} size={40}/></MagazineScope></DigitsProvider>);
`,{ssr:true,media:true});
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&');
const attr=(tag,key)=>{const m=tag.match(new RegExp(' '+key+'="([^"]*)"'));assert(m,'missing '+key);return decode(m[1]);};
const json=(html,key)=>JSON.parse(attr(html,key));
const tags=html=>[...html.matchAll(/<div\b[^>]*data-p5-text="[^"]*"[^>]*>/g)].map(m=>m[0]);
const textTag=(html,text)=>{const tag=tags(html).find(t=>attr(t,'data-p5-text')===text);assert(tag,'missing '+text);return tag;};
const props=(id,extra={})=>({config:structuredClone(api.catalogDemo(id)),durationInFrames:240,seam:1080,th:api.NAVY,sectionIndex:0,mode:'once',backdrop:'canvas',...extra});
const render=(id,exportName,p,frame)=>renderConceptDesign({module:ROOT+id+'.tsx',exportName,props:p,frame});
function face(tag,indic,size=40){
  const style=attr(tag,'style');
  assert(style.includes('font-family:'+(indic?'Alexandria':"'IBM Plex Mono', monospace")));
  assert(style.includes('font-weight:'+(indic?600:500)));
  assert(style.includes('font-variant-numeric:tabular-nums'));
  assert.equal(+attr(tag,'data-size'),size);
}
function fitted(html){
  for(const t of tags(html)){
    const box=json(t,'data-box');
    assert(+attr(t,'data-size')>=+attr(t,'data-floor'));
    assert(+attr(t,'data-floor')>=28);
    assert.equal(attr(t,'data-fit'),'fit','default text clipped');
    assert(+attr(t,'data-lines') * +attr(t,'data-line-height')<=box.height);
    assert(attr(t,'style').includes('overflow:hidden'));
  }
}

for(const [id,exportName] of CASES)test(id+': marker, fit, frozen hold and approved geometry',async()=>{
  const p=props(id),original=structuredClone(p),settled=api.conceptSettledFrame(id,'once',240),seen=[];
  for(const frame of [0,settled,239]){
    const html=await render(id,exportName,p,frame);seen.push(html);
    assert.match(html,/data-style-system="magazine-interview"/);
    assert.doesNotMatch(html,/NaN|Infinity|undefined/);
    const params=json(html,'data-mechanism-params'),state=api.math[id].stateAt(frame,240,params);
    assert.deepEqual(json(html,'data-mechanism-rects'),state.rects);
    fitted(html);
    const hold=api.math[id].beatsFor('once',240).hold;
    api.assertHoldFrozen(f=>api.math[id].stateAt(f,240,params),hold);
  }
  assert.equal(seen[1],seen[2],'approved hold must stay frozen');
  assert.deepEqual(p,original,'drawing must not mutate scene data');
  const html=seen[1];
  if(id==='button-to-window'){
    face(textTag(html,'١٠٠٪'),true);
    const initial=textTag(html,'S');assert.equal(+attr(initial,'data-size'),40);assert(attr(initial,'style').includes('font-weight:800'));
    assert.match(html,/border:3px solid #F3C776;border-radius:50%/);
    assert.match(html,/border-radius:0/);
  }
  if(id==='brief-to-workspace'){
    for(const number of '١٢٣٤٥'){
      const t=textTag(html,number);face(t,true);assert.equal(+attr(t,'data-line-height'),48);assert.equal(json(t,'data-box').height,48);
    }
    assert.match(html,/height:4px;background:#F3C776/);
  }
  if(id==='magnetic-dock'){
    assert.match(html,/border-top:2px solid rgba\(243,199,118,0.34\);border-bottom:2px solid/);
    assert.equal([...html.matchAll(/data-p5-tag="solid"/g)].length,1);
    assert.match(html,/stroke-width="2" stroke-linecap="butt"/);
  }
  if(id==='keyword-reveal'){
    assert.match(html,/fill="none" stroke="#F3C776" stroke-width="3"/);
    assert.match(html,/stroke="#F5F3EC" stroke-width="2"/);
    assert.doesNotMatch(html,/<(?:linearGradient|radialGradient|mask)\b/);
    const t=tags(html)[0];assert.equal(+attr(t,'data-size'),40);assert.equal(json(t,'data-box').height,156);
  }
  if(id==='chaos-to-brand'){
    assert.doesNotMatch(html,/text-mark-rasterizer/);
    assert.match(html,/stroke-linecap="butt" stroke-linejoin="miter"/);
    assert.equal(+attr(textTag(html,p.config.brandName),'data-size'),90);
    assert.equal(+attr(textTag(html,p.config.tagline),'data-size'),40);
    const params=json(html,'data-mechanism-params');assert.equal(params.shape.points.length,120);
  }
});

test('numeral faces follow mapped glyphs, retain 40 px and fit only when constrained',()=>{
  for(const [source,digits,lang,shown,indic] of [
    ['100%','arabic-indic','en','١٠٠٪',true],['١٠٠٪','latin','ar','100%',false],
    ['2 / 6','arabic-indic','en','٢ / ٦',true],['٤ → ٢','latin','ar','4 → 2',false],
    ['٪١٠٠',null,'en','٪١٠٠',true],['12',null,'ar','12',false],
  ])face(textTag(api.numeral(source,digits,lang,{x:0,y:0,width:240,height:48}),shown),indic);
  face(textTag(api.numeral('١',null,'en',{x:0,y:0,width:64,height:36}),'١'),true,30);
  face(textTag(api.initial('١ Studio','latin'),'1'),false);
  face(textTag(api.initial('1 Studio','arabic-indic'),'١'),true);
});

test('long numeral fit warns and stays inside its own box at the floor',()=>{
  const before=console.warn,warnings=[];console.warn=(...args)=>warnings.push(args.join(' '));
  try{
    const html=api.numeral('12345678901234567890','latin','en',{x:0,y:0,width:80,height:48});
    const t=tags(html)[0];assert.equal(+attr(t,'data-size'),28);assert.equal(attr(t,'data-fit'),'clip');
    assert(attr(t,'style').includes('overflow:hidden'));assert(warnings.some(w=>w.includes('fit-warning')));
  }finally{console.warn=before;}
});

test('loop, transparent backdrop and sectionIndex preserve the approved contract',async()=>{
  for(const [id,exportName] of CASES){
    const html=await render(id,exportName,props(id,{mode:'loop',backdrop:'none',sectionIndex:3}),239);
    assert.doesNotMatch(html,/NaN|Infinity|undefined|grain-navy|top:1424px/);
    assert.equal(json(html,'data-mechanism-params').mode,'loop');
    const page=await render(id,exportName,props(id,{sectionIndex:3}),239);
    assert.match(page,/data-p5-folio="04"/);
    const defaulted=props(id);delete defaulted.sectionIndex;
    assert.match(await render(id,exportName,defaulted,239),/data-p5-folio="01"/);
  }
});

// Exercise the actual exported browser rasterizer through the real SSR helper.
// Prime each module first: the helper intentionally deletes document while loading a bundle.
async function withCanvas(factory,run){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');let value=globalThis.document;
  Object.defineProperty(globalThis,'document',{configurable:true,get:()=>value,set(next){
    value=next;if(next?.createElement){const create=next.createElement;next.createElement=(kind,...args)=>kind==='canvas'?factory():create(kind,...args);}
  }});
  try{return await run();}finally{delete globalThis.document;if(descriptor)Object.defineProperty(globalThis,'document',descriptor);}
}
function canvasFactory(log){
  const canvas={};let width=0,height=0,font='10px sans-serif';
  const ctx={get font(){return font;},set font(v){font=v;},measureText(text){
    const size=+(font.match(/([\d.]+)px/)?.[1]??40);log.push({kind:'measure',text,font});
    return {actualBoundingBoxLeft:0,actualBoundingBoxRight:size*.6*text.length,actualBoundingBoxAscent:size*.7,actualBoundingBoxDescent:size*.2};
  },fillText(text){log.push({kind:'raster',text,font});},getImageData(){
    const data=new Uint8ClampedArray(width*height*4);
    for(let y=24;y<height-24;y++)for(let x=24;x<width-24;x++)data[(y*width+x)*4+3]=255;
    return {data};
  }};
  Object.defineProperties(canvas,{width:{get:()=>width,set(v){width=v;font='10px sans-serif';}},height:{get:()=>height,set(v){height=v;font='10px sans-serif';}}});
  canvas.getContext=()=>ctx;return canvas;
}
test('chaos text mark uses exported native sampling and magazine drawing at start/hold/end',async()=>{
  const id='chaos-to-brand',name='ChaosToBrand',log=[],p=props(id);
  await render(id,name,p,0);p.config.mark={kind:'text',text:'RS'};
  const original=structuredClone(p),seen=[];
  await withCanvas(()=>canvasFactory(log),async()=>{
    for(const frame of [0,api.conceptSettledFrame(id,'once',240),239]){
      const html=await render(id,name,p,frame);seen.push(html);
      assert.match(html,/data-style-system="magazine-interview"/);assert.doesNotMatch(html,/NaN|Infinity|undefined|text-mark-rasterizer/);
      const params=json(html,'data-mechanism-params');assert.equal(params.shape.points.length,120);
      assert.deepEqual(json(html,'data-mechanism-rects'),api.math[id].stateAt(frame,240,params).rects);
      if(frame>0){assert.match(html,/data-mark-kind="text"/);assert.match(html,/<text[^>]*font-weight="800"[^>]*fill="#F3C776"[^>]*>RS<\/text>/);}
    }
  });
  assert(log.some(x=>x.kind==='raster'&&x.text==='RS'&&x.font.includes('800 220px')));
  assert.equal(seen[1],seen[2]);assert.deepEqual(p,original);
});
test('keyword exported ink measurement drives fitted rects when a canvas exists',async()=>{
  const id='keyword-reveal',name='KeywordReveal',p=props(id),log=[];
  const baseline=await render(id,name,p,134),fallback=json(baseline,'data-mechanism-params').metrics;
  let html;await withCanvas(()=>canvasFactory(log),async()=>{html=await render(id,name,p,134);});
  const measured=json(html,'data-mechanism-params').metrics;
  assert(log.some(x=>x.text===p.config.keyword&&x.font.includes('800')));
  assert.equal(measured.fontSize,fallback.fontSize);
  assert.equal(measured.ascent,Math.ceil(measured.fontSize*.7));assert.equal(measured.descent,Math.ceil(measured.fontSize*.2));
  assert.notDeepEqual(measured,fallback);fitted(html);
  assert.doesNotMatch(html,/NaN|Infinity|undefined/);
});
test('port ownership: no docs imports, generic text-mark delegation or local numeral-face clone',()=>{
  for(const file of [...CASES.map(([id])=>id+'.tsx'),'sheet-parts.tsx','copy-more.ts'])assert.doesNotMatch(readFileSync(ROOT+file,'utf8'),/from\s+['"][^'"]*docs\//);
  assert.doesNotMatch(readFileSync(ROOT+'chaos-to-brand.tsx','utf8'),/GenericChaosToBrand/);
  const shared=readFileSync(ROOT+'sheet-parts.tsx','utf8');assert.match(shared,/import \{smallNumeralStyle\} from '\.\.\/\.\.\/system\/numerals'/);assert.doesNotMatch(shared,/smallNumeralFace/);
});
