import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bundleEngine} from './helpers/engine-bundle.mjs';
import {renderConceptDesign} from './helpers/magazine-design-ssr.mjs';

const BASE='engine/src/styles/magazine-interview/designs/concepts';
const concepts=[['prompt-to-results','PromptToResults'],['department-tabs','DepartmentTabs'],['tool-stack-spread','ToolStackSpread'],['glass-lens','GlassLens'],['kpi-zoom','KpiZoom'],['automation-flow','AutomationFlow'],['panel-reveal','PanelReveal']];
const api=await bundleEngine(`
 import React from 'react';
 import {renderToStaticMarkup} from 'react-dom/server';
 import {DigitsProvider} from './engine/src/creative-kit/digits';
 import {Text} from './${BASE}/frozen-parts';
 export {CONCEPT_PARTS_COPY} from './${BASE}/copy-parts';
 export {catalogDemo,conceptSettledFrame} from './engine/src/motion-concepts/catalog';
 export {NAVY,wid} from './engine/src/styles/magazine-interview/system/base';
 ${concepts.map(([id],i)=>`import * as P${i} from './${BASE}/${id}';import * as M${i} from './engine/src/motion-concepts/${id}/math';`).join('\n')}
 const modules={${concepts.map(([id],i)=>`'${id}':{pilot:P${i},math:M${i}}`).join(',')}};
 export function geometry(id,config,frame,duration=240,mode='once'){
  const {pilot,math}=modules[id],params=pilot.paramsFor(config,mode);
  const layout=id==='department-tabs'?math.layoutFor(params.box,{...params,tabCount:config.tabs.length}):math.layoutFor(params.box,params);
  const state=math.stateAt(frame,duration,params);
  const beats=id==='department-tabs'?math.beatsFor(mode,duration,config.tabs.length):math.beatsFor(mode,duration);
  const rects=id==='tool-stack-spread'?pilot.stateFor(frame,duration,params).cards.map(c=>c.rect):state.rects;
  return {layout,state,beats,rects,minimum:math.MIN_FRAMES};
 }
 export function numeral(text,digits,box={x:0,y:0,width:68,height:44}){
  return renderToStaticMarkup(<DigitsProvider digits={digits}><Text text={text} box={box} size={40} min={28} lh={1} mono color="#F3C776"/></DigitsProvider>);
 }
`,{ssr:true});
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
const attrs=(html,name)=>[...html.matchAll(new RegExp(name+'="([^"]*)"','g'))].map(m=>JSON.parse(decode(m[1])));
const css=s=>Object.fromEntries(decode(s).split(';').filter(Boolean).map(p=>{const i=p.indexOf(':');return [p.slice(0,i),p.slice(i+1)];}));
const propsFor=(id,extra={})=>({config:api.catalogDemo(id),durationInFrames:240,seam:1080,th:api.NAVY,sectionIndex:0,mode:'once',backdrop:'canvas',...extra});
async function render(id,frame,extra={}){
 return renderConceptDesign({module:`${BASE}/${id}.tsx`,exportName:concepts.find(([key])=>key===id)[1],props:propsFor(id,extra),frame});
}
function valid(html){
 assert.match(html,/data-style-system="magazine-interview"/);
 assert.doesNotMatch(html,/NaN|Infinity|undefined/);
 for(const t of attrs(html,'data-p3-text')){
  assert.ok(t.size>=t.min&&t.min>=28,'approved type floor');assert.ok(t.ok,'catalog text fits');
  assert.ok(t.height<=t.box.height,'text stays in its own box');
 }
}

for(const [id] of concepts)test(`${id}: marked finite engine design at start, settled and last frame`,async()=>{
 const config=api.catalogDemo(id),settled=api.conceptSettledFrame(id,'once',240);
 let hold;
 for(const frame of [0,settled,239]){
  const html=await render(id,frame);valid(html);
  assert.deepEqual(attrs(html,'data-p3-rects')[0],api.geometry(id,config,frame).rects,'original mechanism geometry');
  if(frame===settled)hold=html;if(frame===239)assert.equal(html,hold,'frozen hold');
 }
});

test('small numeral faces follow mapped characters, retain 40px badges and fit only down to 28',()=>{
 for(const text of ['12','١٢','۱۲'])for(const digits of ['latin','arabic-indic']){
  const html=api.numeral(text,digits),[t]=attrs(html,'data-p3-text');
  assert.equal(t.size,40);assert.equal(t.family,digits==='arabic-indic'?'Alexandria':"'IBM Plex Mono', monospace");
  assert.equal(t.weight,digits==='arabic-indic'?600:500);assert.equal(t.color,api.NAVY.gold);
  assert.match(html,/font-variant-numeric:tabular-nums/);
 }
 const narrow=attrs(api.numeral('123','latin',{x:0,y:0,width:48,height:44}),'data-p3-text')[0];
 assert.equal(narrow.requestedSize,40);assert.ok(narrow.size>=28&&narrow.size<40);
});

test('prompt results and tool cards retain the approved compact three/two-line boxes',async()=>{
 const prompt=await render('prompt-to-results',239),tools=await render('tool-stack-spread',239);
 for(const html of [prompt,tools])for(const t of attrs(html,'data-p3-text').filter(t=>t.numeric)){
  assert.equal(t.size,40);assert.equal(t.weight,600);assert.equal(t.family,'Alexandria');
 }
 const details=attrs(prompt,'data-p3-text').filter(t=>t.color===api.NAVY.dim);
 assert.equal(details.length,3);for(const t of details){assert.equal(t.size,34);assert.equal(t.box.height,117);}
 const functions=attrs(tools,'data-p3-text').filter(t=>t.color===api.NAVY.dim);
 assert.equal(functions.length,5);for(const t of functions){assert.equal(t.size,34);assert.equal(t.box.height,82);}
});

test('department tabs stay one line at a shared size, centred on slots, with >=40px demo gaps',async()=>{
 const id='department-tabs',config=api.catalogDemo(id);
 for(const frame of [0,30,110,182,239]){
  const html=await render(id,frame),labels=attrs(html,'data-p3-tab-label'),text=attrs(html,'data-p3-text').slice(0,labels.length);
  const tags=[...html.matchAll(/data-p3-tab-label="[^"]*" style="[^"]*"><div data-p3-text="[^"]*" style="([^"]+)"/gu)];
  const {layout:L,state:S}=api.geometry(id,config,frame);assert.equal(tags.length,config.tabs.length);
  assert.equal(new Set(labels.map(t=>t.size)).size,1);
  const runs=text.map((t,i)=>{
   assert.equal(t.size,28);assert.equal(t.lineCount,1);
   const style=css(tags[i][1]),center=parseFloat(style.left)+parseFloat(style.width)/2;
   assert.equal(style['text-align'],'center');assert.ok(Math.abs(center-L.cells[i].x-L.cells[i].width/2)*S.scale<=1);
   assert.ok(Math.abs(center-L.dots[i].x-L.dots[i].width/2)*S.scale<=1);
   const width=api.wid(t.text,t.size,t.weight,t.family);return {left:center-width/2,right:center+width/2};
  }).sort((a,b)=>a.left-b.left);
  for(let i=1;i<runs.length;i++)assert.ok((runs[i].left-runs[i-1].right)*S.scale>=40);
 }
});

test('glass lock keeps its 36+16px reservation with no backing, including alternative focus and English',async()=>{
 for(const english of [false,true])for(const keyIndex of [0,2,4]){
  const config=structuredClone(api.catalogDemo('glass-lens'));config.keyIndex=keyIndex;
  if(english)config.rows=config.rows.map((r,i)=>({...r,label:`Metric ${i+1}`}));
  const start=await render('glass-lens',0,{config}),html=await render('glass-lens',187,{config});valid(html);
  const rows=attrs(html,'data-p3-lock-row');assert.deepEqual(rows,attrs(start,'data-p3-lock-row'));
  const r=rows[keyIndex],{layout:L,state:S}=api.geometry('glass-lens',config,187),R=L.rows[keyIndex];
  assert.equal(r.reserved,52);assert.equal(r.valueBox.width,205);
  const valueEdge=R.rect.x+R.rect.width/2+((english?r.valueBox.x+r.valueBox.width:r.valueBox.x)-R.rect.width/2)*S.rows[keyIndex].scale;
  const ringEdge=english?S.lens.rect.x+S.lens.rect.width-(2+S.lock)-8-36:S.lens.rect.x+(2+S.lock)+8+36;
  assert.ok((english?ringEdge-valueEdge:valueEdge-ringEdge)>=16);
  const ring=html.match(/<div data-p3-lock-check="" style="([^"]+)">(<svg[\s\S]*?<\/svg>)/u);assert.ok(ring);
  assert.ok(!Object.keys(css(ring[1])).some(k=>k.startsWith('background')));assert.doesNotMatch(ring[2],/<rect\b/);
  assert.match(html,new RegExp(`dir="${english?'ltr':'rtl'}"`));
 }
});

test('KPI hero uses the approved 40px label/change and NumberPart suffix, including alternative focus',async()=>{
 for(const focusIndex of [0,2]){
  const config=structuredClone(api.catalogDemo('kpi-zoom'));config.focusIndex=focusIndex;
  const html=await render('kpi-zoom',239,{config});valid(html);
  const texts=attrs(html,'data-p3-text'),label=texts.find(t=>t.text===config.tiles[focusIndex].name);
  assert.equal(label.size,40);assert.equal(label.weight,600);assert.equal(label.color,api.NAVY.ink);
  const changes=texts.filter(t=>/^[+-]?[0-9٠-٩]+[.٫][0-9٠-٩]+[%٪]$/u.test(t.text??''));
  assert.equal(changes.length,5);for(const t of changes)assert.equal(t.size,40);
  const [suffix]=attrs(html,'data-p3-suffix');
  const oracle=await renderConceptDesign({module:'engine/src/styles/magazine-interview/system/parts/number.tsx',exportName:'NumberPart',props:{durationInFrames:240,th:api.NAVY,part:{value:4.8,suffix:'٪'},box:{x:0,y:0,width:1000,height:1000},at:-100000,scale:suffix.numberSize/200},frame:239});
  const reference=oracle.match(/data-count-progress[^>]*>[^<]*<\/div><div style="([^"]+)"/u);assert.ok(reference);
  const drawn=html.match(/<span data-p3-suffix="[^"]*" style="([^"]+)"/u);assert.ok(drawn);
  for(const key of ['font-size','font-weight','line-height','margin-top','margin-left'])assert.equal(css(drawn[1])[key],css(reference[1])[key]);
 }
});

test('automation preserves 40px numeral badges, 34px steps and the lit output gold surface',async()=>{
 const config=api.catalogDemo('automation-flow'),html=await render('automation-flow',239);
 const texts=attrs(html,'data-p3-text'),badges=texts.filter(t=>t.numeric);
 assert.equal(badges.length,4);for(const t of badges){assert.equal(t.size,40);assert.equal(t.weight,600);}
 for(const label of config.steps)assert.equal(texts.find(t=>t.text===label).size,34);
 assert.equal(texts.find(t=>t.text===config.output).color,api.NAVY.tagInk);
 assert.match(html,/stroke-width="2"/);assert.match(html,/stroke-width="3"/);assert.match(html,/stroke-width="4"/);
});

test('panel title retains its approved thin/heavy plan and outlined CTA',async()=>{
 const html=await render('panel-reveal',239),texts=attrs(html,'data-p3-text');
 assert.equal(texts[0].size,70);assert.equal(texts[0].min,56);
 assert.match(html,/font-weight:200/);assert.match(html,/font-weight:800/);
 assert.equal(texts.find(t=>t.text===api.catalogDemo('panel-reveal').cta).color,api.NAVY.gold);
 assert.match(html,/stroke="#F3C776" stroke-width="2"/);
});

test('minimum-duration once/loop holds, transparent backdrops and section numbering stay exact',async()=>{
 for(const [id] of concepts){
  const config=api.catalogDemo(id),minimum=api.geometry(id,config,0).minimum;
  for(const mode of ['once','loop']){
   const {beats}=api.geometry(id,config,0,minimum,mode),extra={durationInFrames:minimum,mode};
   assert.equal(await render(id,beats.hold.from,extra),await render(id,beats.hold.to-1,extra),`${id} ${mode} hold`);
  }
  const clear=await render(id,239,{backdrop:'none'});assert.doesNotMatch(clear,/grain-navy|top:262px|top:1424px/);
  assert.equal(await render(id,239,{sectionIndex:undefined}),await render(id,239,{sectionIndex:0}));
  assert.match(await render(id,239,{sectionIndex:3}),/top:1436px[^>]*>04<\/div>/);
 }
});

test('extreme valid copy keeps floors and warns/clips locally instead of throwing',async()=>{
 const config=structuredClone(api.catalogDemo('prompt-to-results'));
 config.prompt='Workflow details for the service team '.repeat(3).slice(0,90);
 config.results=config.results.map(()=>({title:'Workflow details for the service',detail:'Workflow details for the service team '.repeat(3).slice(0,76)}));
 const html=await render('prompt-to-results',239,{config});assert.doesNotMatch(html,/NaN|Infinity|undefined/);
 const text=attrs(html,'data-p3-text');assert.ok(text.some(t=>!t.ok));
 for(const t of text)assert.ok(t.size>=t.min&&t.min>=28);
});

test('ports use engine modules, the shared numeral helper and an empty data-only copy dictionary',async()=>{
 assert.deepEqual(api.CONCEPT_PARTS_COPY,{});
 for(const file of [...concepts.map(([id])=>`${id}.tsx`),'frozen-parts.tsx','copy-parts.ts']){
  const source=await readFile(`${BASE}/${file}`,'utf8');assert.doesNotMatch(source,/(?:from\s+|import\s*\()["'][^"']*(?:docs\/|@rs\/)/);
  assert.notEqual(source.charCodeAt(0),0xfeff);
 }
 const source=await readFile(`${BASE}/frozen-parts.tsx`,'utf8');
 assert.match(source,/import \{smallNumeralStyle\} from '\.\.\/\.\.\/system\/numerals'/);
 assert.doesNotMatch(source,/smallNumberFace/);
});
