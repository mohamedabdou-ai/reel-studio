import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundleEngine,setSsrFrame} from './helpers/engine-bundle.mjs';
import {sceneCues} from '../scripts/lib/scene-cues.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
import {getPreviewDefinition} from '../engine/src/library-preview/fixtures.ts';
const styles=['kinetic-paper','magazine-interview','liquid-glass','calligraphic-receipts','paper-collage'];
const api=await bundleEngine(`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import {FAMILY_DESIGNS} from './engine/src/styles/family-designs';
 import {TypographyProvider} from './engine/src/creative-kit/chapter-theme';
 import {PreparedPlateProvider} from './engine/src/screen-recording/ScreenRecordingScene';
 import {sceneTiming,countTiming,ownSceneCopy,displayWeight} from './engine/src/style-kit/design-safety';
 import {boardSlots} from './engine/src/styles/paper-collage/designs/message-board';
 import {tokGeo,tokLens} from './engine/src/styles/liquid-glass/designs/token-lens';
 import {planHeadline} from './engine/src/styles/magazine-interview/designs/kit';
 import {TEMPLATE_DATA} from './engine/src/review-editor/ops/demo';
 import {getSceneGeometry} from './engine/src/creative-kit/primitives';
 export {FAMILY_DESIGNS,sceneTiming,countTiming,ownSceneCopy,displayWeight,boardSlots,tokGeo,tokLens,planHeadline,TEMPLATE_DATA,getSceneGeometry};
 export const render=(style,scene,font=null,headBox=null)=>{const Design=FAMILY_DESIGNS[style][scene.family];const node=<Design scene={scene} style={style} headBox={headBox} seam={{'kinetic-paper':1056,'magazine-interview':1080,'liquid-glass':1080,'calligraphic-receipts':1000,'paper-collage':1030}[style]} sectionIndex={2} geometry={{windowTop:1056,windowHeight:864,videoWidth:1080,videoLeft:0,videoTop:0}} aspect={1}/>;return renderToStaticMarkup(<TypographyProvider fontFamily={font}>{scene.family==='screen-recording'?<PreparedPlateProvider plate={{src:'examples/evidence-before.svg',width:1920,height:1080}}>{node}</PreparedPlateProvider>:node}</TypographyProvider>);};
`,{ssr:true,media:true});
const fixture=family=>structuredClone(ARABIC_SCENES.find(s=>s.family===family)??getPreviewDefinition('scene:'+family).fixture.scene);
const at=(style,scene,frame)=>{setSsrFrame(frame);return api.render(style,scene);};
const tags=html=>[...html.matchAll(/<[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
const metric=(html,key,predicate=()=>true)=>{const node=tags(html).find(n=>n[key]!==undefined&&predicate(n));if(!node&&key==='data-count-progress')return 0;assert.ok(node,'missing '+key);return Number(node[key]);};
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const cue=(scene,frame,kind)=>assert.ok(sceneCues(scene).some(c=>c.frame===scene.fromFrame+frame&&c.kind===kind),JSON.stringify(sceneCues(scene)));
for(const style of styles)test(style+': count follows two authored roll frames and durations, including its actual digits',()=>{
 for(const rollFrame of [90,150]){const scene=fixture('count');scene.durationInFrames=300;Object.assign(scene.data,{value:100,rollFrame,rollDuration:12,unitFrame:rollFrame+15,badgeFrame:rollFrame+20});
  assert.equal(metric(at(style,scene,rollFrame-1),'data-count-progress'),0);assert.equal(metric(at(style,scene,rollFrame+12),'data-count-progress'),1);
  assert.match(at(style,scene,rollFrame+12),/data-count-progress="1">(?:<[^>]+>)*100</);assert.equal(metric(at(style,scene,52),'data-count-progress'),0);cue(scene,rollFrame,'count');cue(scene,rollFrame+15,'reveal');cue(scene,rollFrame+20,'stamp');
 }
});
for(const style of styles)test(style+': checklist uses both authored cue values',()=>{
 for(const frame of [90,150]){const scene=fixture('checklist');scene.durationInFrames=300;scene.data.variant='blueprint';scene.data.items=scene.data.items.slice(0,1).map(item=>({...item,atFrame:frame}));
 const before=at(style,scene,frame-1),after=at(style,scene,frame+40);
 if(style==='kinetic-paper'){assert.equal(metric(before,'data-event-progress',n=>Number(n['data-cue-at'])===frame),0);assert.ok(metric(after,'data-event-progress',n=>Number(n['data-cue-at'])===frame)>.95);}
 else if(style==='calligraphic-receipts'){const row=tags(before).find(n=>n['data-receipt-row-at']===String(frame));assert.ok(!row||row.style.includes('opacity:0'));assert.ok(tags(after).some(n=>n['data-receipt-row-at']===String(frame)&&n.style.includes('opacity:1')));}
 else if(style==='paper-collage'){assert.equal(metric(before,'data-event-progress',n=>n['data-paper-id']==='chk-check-0'),0);assert.ok(metric(after,'data-event-progress',n=>n['data-paper-id']==='chk-check-0')>.95);}
 else {assert.equal(metric(before,'data-event-progress',n=>Number(n['data-cue-at'])===frame),0);assert.ok(metric(after,'data-event-progress',n=>Number(n['data-cue-at'])===frame)>.95);assert.equal(metric(at(style,scene,40),'data-event-progress',n=>Number(n['data-cue-at'])===frame),0);}
 cue(scene,frame,'reveal');
 }
});
for(const [style,family,key,kind,pilot] of [
 ['kinetic-paper','ticket-offer','ticket','stamp',6],['kinetic-paper','comment-stack','comments','reveal',14],
 ['magazine-interview','chapter-quote','quoteFrame','reveal',20],['magazine-interview','verdict','rows','count',22],
 ['liquid-glass','token-lens','groups','reveal',6],['liquid-glass','meter-receipt','rows','count',18],
 ['calligraphic-receipts','meter-receipt','rows','count',18],['calligraphic-receipts','claim-proof','receiptFrame','reveal',14],
 ['paper-collage','message-board','gatherFrame','reveal',66],['paper-collage','evidence-wipe','revealFrame','swap',42],
])test(style+': '+family+' moves its visual event with two cue values',()=>{
 for(const frame of [90,150]){const scene=fixture(family);scene.durationInFrames=360;
 if(key==='ticket')scene.data.ticket.atFrame=frame;
 else if(['comments','rows','groups'].includes(key))scene.data[key].forEach((row,i)=>row.atFrame=frame+i*45);
 else scene.data[key]=frame;
 if(family==='verdict')scene.data.verdictFrame=frame+150;
 if(family==='claim-proof')scene.data.totalFrame=frame+40;
 if(family==='token-lens')scene.data.lens.atFrame=frame+120;
 if(family==='message-board'){scene.data.gatherDurationFrames=12;scene.data.focusFrame=frame+30;scene.data.focusDurationFrames=12;scene.data.closingFrame=frame+60;}
 if(family==='evidence-wipe')scene.data.revealDurationFrames=12;
 const before=at(style,scene,frame-1),after=at(style,scene,frame+35),old=at(style,scene,pilot+20);
 if(['ticket-offer','comment-stack'].includes(family)||family==='token-lens'){
  assert.equal(metric(before,'data-event-progress',n=>Number(n['data-cue-at'])===frame),0);
  assert.ok(metric(after,'data-event-progress',n=>Number(n['data-cue-at'])===frame)>.9);
  assert.equal(metric(old,'data-event-progress',n=>Number(n['data-cue-at'])===frame),0);
 }else if(family==='evidence-wipe'){assert.equal(metric(before,'data-evidence-reveal'),0);assert.equal(metric(after,'data-evidence-reveal'),1);assert.equal(metric(old,'data-evidence-reveal'),0);}
 else if(style==='liquid-glass'&&family==='meter-receipt'){assert.equal(metric(before,'data-meter-progress',n=>Number(n['data-meter-at'])===frame),0);assert.ok(metric(after,'data-meter-progress',n=>Number(n['data-meter-at'])===frame)>.99);assert.equal(metric(old,'data-meter-progress',n=>Number(n['data-meter-at'])===frame),0);}
 else if(family==='message-board'){assert.match(before,/data-board-heading="false"/);assert.match(after,/data-board-heading="true"/);assert.match(old,/data-board-heading="false"/);}
 else if(family==='claim-proof'){assert.equal(metric(before,'data-receipt-printed',n=>Number(n['data-receipt-start'])===frame),0);assert.ok(metric(after,'data-receipt-printed',n=>Number(n['data-receipt-start'])===frame)>0);}
 else if(family==='meter-receipt'){assert.ok(tags(after).some(n=>n['data-receipt-row-at']===String(frame)&&n.style.includes('opacity:1')));assert.ok(!tags(before).some(n=>n['data-receipt-row-at']===String(frame)&&n.style.includes('opacity:1')));}
 else {assert.equal(metric(before,'data-event-progress',n=>Number(n['data-cue-at'])===frame),0);assert.ok(metric(after,'data-event-progress',n=>Number(n['data-cue-at'])===frame)>.95);assert.equal(metric(old,'data-event-progress',n=>Number(n['data-cue-at'])===frame),0);}
 cue(scene,frame,kind);
 }
});
for(const style of styles)test(style+': statement stays visible under null/high head and upper with complete clearance',()=>{
 const scene=fixture('statement');for(const head of [null,{x:300,y:300,width:400,height:600}]){setSsrFrame(100);const html=api.render(style,scene,'Cairo',head);assert.match(html,/data-statement-placement="lower"/);assert.ok(metric(html,'data-statement-top')>=924);assert.ok(metric(html,'data-statement-bottom')<=1150);for(const word of scene.data.title.split(/\s+/))assert.ok(text(html).includes(word));assert.doesNotMatch(html,/visibility:hidden/);}
 setSsrFrame(100);const upper=api.render(style,scene,null,{x:300,y:1000,width:400,height:500});assert.doesNotMatch(upper,/data-statement-placement="lower"/);
});
test('message-board represents all cards, details, heading and focus; slots stay in the safe zone',()=>{
 for(const count of [2,3,4,5,6]){const scene=fixture('message-board');scene.data.items=Array.from({length:count},(_,i)=>({id:'item-'+i,label:'Supplied message '+i,detail:'Supplied detail '+i}));scene.data.focusIndex=count-1;scene.data.focusFrame=90;scene.data.focusDurationFrames=12;
 const before=at('paper-collage',scene,89),after=at('paper-collage',scene,110);for(const item of scene.data.items){assert.ok(text(after).includes(item.label));assert.ok(text(after).includes(item.detail));}assert.ok(text(after).includes(scene.data.boardTitle));assert.equal(metric(before,'data-focus',n=>n['data-focus']==='0'),0);assert.ok(tags(after).some(n=>Number(n['data-focus'])===1));
 for(const p of api.boardSlots(count)){assert.ok(p.x-12>=65&&p.x+p.w+12<=1015);assert.ok(p.y+p.h+12<=1150);}
 }
});
for(const style of ['liquid-glass','calligraphic-receipts'])test(style+': long unit, percent and low/full vial values stay separate from the big total',()=>{
 for(const unit of ['وحدة توضيحية','%'])for(const value of [3,60,100]){const scene=fixture('meter-receipt');scene.durationInFrames=300;Object.assign(scene.data,{unit,maximum:100,rows:[{label:'Before',value:3,atFrame:20},{label:'After',value,atFrame:60}]});const html=at(style,scene,200);assert.ok(text(html).includes(unit));assert.doesNotMatch(html,/>[+−-]?\d+وحدة توضيحية</);assert.doesNotMatch(html,/NaN|Infinity/);}
});
test('long lens groups fit the lens diagonal and its badge reports the actual factor',()=>{
 const d={...fixture('token-lens').data,font:'Cairo',copy:api.ownSceneCopy({title:'رتب العناصر'}),groups:[{label:'مثال',text:'رتب العناصر',atFrame:20}],lens:{groupIndex:0,tokenIndex:0,atFrame:30}};
  const g=api.tokGeo(d),lens=api.tokLens(100,d);assert.ok(lens.zoom*Math.hypot(g.pos[0].w,g.pos[0].h)<=lens.r*2*.86+.01);assert.ok(lens.zoom>=1.25);
});
test('primary copy decides direction independently of side captions; explicit lang wins',()=>{
 assert.equal(api.ownSceneCopy({title:'From idea to a clear story.',caption:'شرح عربي',lang:'ar'}).dir,'rtl');assert.equal(api.ownSceneCopy({title:'خمسة Skills',caption:'English'}).dir,'rtl');
 for(const style of styles)for(const title of ['From idea to a clear story.','خمسة Skills']){const scene=fixture('intro');scene.data={...scene.data,title,caption:'شرح عربي'};const html=at(style,scene,100);assert.match(html,title.startsWith('From')?/direction:ltr/:/direction:rtl/);for(const w of title.split(' '))assert.ok(text(html).includes(w));}
});
test('creator display weights match shipped Cairo 900 and Tajawal 800',()=>{assert.equal(api.displayWeight('Cairo','Lalezar',400),900);assert.equal(api.displayWeight('Tajawal','Lalezar',400),800);assert.equal(api.displayWeight('Lalezar','Lalezar',400),400);});
for(const style of styles)test(style+': every family renders library and editor copy in native/Cairo/Tajawal without invalid geometry',()=>{
 for(const family of Object.keys(api.FAMILY_DESIGNS[style])){const base=fixture(family);for(const data of [base.data,api.TEMPLATE_DATA[family]??base.data])for(const font of [null,'Cairo','Tajawal']){const scene={...base,data,durationInFrames:360};setSsrFrame(200);const html=api.render(style,scene,font);assert.doesNotMatch(html,/NaN|Infinity|undefined/);assert.ok(html.length>300);for(const n of tags(html).filter(n=>n['data-content-bottom']))assert.ok(Number(n['data-content-bottom'])<=1150);}}
});
test('invalid timing is clamped with warnings, never an exception or invalid number',()=>{
 const warnings=[],old=console.warn;console.warn=m=>warnings.push(m);try{for(const style of styles){const scene=fixture('count');scene.durationInFrames=12;Object.assign(scene.data,{rollFrame:-30,rollDuration:1000,unitFrame:Infinity,badgeFrame:999});assert.doesNotMatch(at(style,scene,10),/NaN|Infinity/);}assert.ok(warnings.length>0);}finally{console.warn=old;}
});
test('count defaults retain each pilot delay relative to the authored roll end',()=>{
 const t=api.sceneTiming(300);const a=api.countTiming({rollFrame:100,rollDuration:20},t,{roll:26,duration:34,unit:56,badge:70});assert.equal(a.unit,116);assert.equal(a.badge,130);
});
test('magazine does not isolate a short connector between contrasting lines',()=>{for(const title of ['One idea in clear steps','فكرة واحدة في خطوات واضحة']){const p=api.planHeadline(title,{drop:true,max:150,min:64,lines:4,maxHeight:650});assert.ok(!p.rows.some(r=>r.text&&!r.text.includes(' ')&&[...r.text].length<=3));}});
test('ticket and comment stack preserve every supplied heading, condition, label and CTA',()=>{
 for(const family of ['ticket-offer','comment-stack']){
  const scene=fixture(family),html=at('kinetic-paper',scene,200),copy=text(html);
  const strings=family==='ticket-offer'?[scene.data.title,scene.data.footer,...['label','value','detail'].map(k=>scene.data.ticket[k])]:[scene.data.title,scene.data.keyword,scene.data.prompt];
  for(const str of strings)for(const word of str.split(/\s+/))assert.ok(copy.includes(word),family+' '+word);
  if(family==='ticket-offer'){assert.doesNotMatch(html,/rotate\(-90deg\)/);assert.match(copy,/No\. 02/);}
 }
});
test('liquid vial digits fit their real inner width and bottom edge for all requested values/units',()=>{
 for(const unit of ['وحدة توضيحية','%'])for(const value of [3,60,100]){
  const scene=fixture('meter-receipt');scene.durationInFrames=300;Object.assign(scene.data,{unit,maximum:100,rows:[{label:'Before',value:3,atFrame:20},{label:'After',value,atFrame:60}]});
  const html=at('liquid-glass',scene,200),numbers=tags(html).filter(n=>n['data-vial-number-top']);
  assert.ok(numbers.length>=2);
  for(const n of numbers){const size=Number(n['data-vial-number-size']);assert.ok(size<=112);assert.ok(Number(n['data-vial-number-top'])+1.1*size<=Number(n['data-vial-inner-height'])-16);}
 }
});
test('English calligraphic comment underline uses local box coordinates',()=>{
 const scene=fixture('comment');scene.data={keyword:'GUIDE',promise:'A supplied guide'};
 const html=at('calligraphic-receipts',scene,200),stroke=tags(html).find(n=>n['data-brush-local']==='true');
 assert.ok(stroke);assert.match(stroke.style,/left:40px/);assert.ok(parseFloat(stroke.style.match(/width:([\d.]+)px/)[1])<=650);
});
test('lens visibility, verdict stamp and claim total use their separate authored cues',()=>{
 for(const frame of [90,150]){
  const token=fixture('token-lens');token.durationInFrames=360;token.data.groups.forEach((g,i)=>g.atFrame=10+i*10);token.data.lens.atFrame=frame;
  assert.doesNotMatch(at('liquid-glass',token,frame-1),/data-lens-visibility/);
  assert.ok(metric(at('liquid-glass',token,frame+40),'data-lens-visibility')>.95);cue(token,frame,'swap');
  const verdict=fixture('verdict');verdict.durationInFrames=360;verdict.data.verdictFrame=frame;
  assert.equal(metric(at('magazine-interview',verdict,frame-1),'data-event-progress',n=>Number(n['data-cue-at'])===frame),0);
  assert.equal(metric(at('magazine-interview',verdict,frame+20),'data-event-progress',n=>Number(n['data-cue-at'])===frame),1);cue(verdict,frame,'stamp');
  const claim=fixture('claim-proof');claim.durationInFrames=360;claim.data.totalFrame=frame;
  assert.equal(metric(at('calligraphic-receipts',claim,frame-1),'data-count-progress'),0);
  assert.equal(metric(at('calligraphic-receipts',claim,frame+22),'data-count-progress'),1);cue(claim,frame,'count');
 }
});
test('gather, focus, closing and evidence durations control the matching visible motions',()=>{
 for(const frame of [90,150])for(const duration of [12,30]){
  const board=fixture('message-board');board.durationInFrames=360;Object.assign(board.data,{gatherFrame:frame,gatherDurationFrames:duration,focusFrame:frame+45,focusDurationFrames:duration,focusIndex:0,closingFrame:frame+100});
  assert.equal(metric(at('paper-collage',board,frame-1),'data-track-progress',n=>n['data-paper-id']==='mb-0'),0);
  assert.equal(metric(at('paper-collage',board,frame+duration),'data-track-progress',n=>n['data-paper-id']==='mb-0'),1);
  assert.equal(metric(at('paper-collage',board,frame+44),'data-focus'),0);
  assert.equal(metric(at('paper-collage',board,frame+45+duration),'data-focus'),1);
  assert.ok(text(at('paper-collage',board,frame+101)).includes(board.data.closingTitle));
  cue(board,frame+45,'swap');cue(board,frame+100,'reveal');
  const evidence=fixture('evidence-wipe');evidence.durationInFrames=360;Object.assign(evidence.data,{revealFrame:frame,revealDurationFrames:duration});
  assert.equal(metric(at('paper-collage',evidence,frame-1),'data-evidence-reveal'),0);
  assert.equal(metric(at('paper-collage',evidence,frame+duration),'data-evidence-reveal'),1);
  assert.ok(Math.abs(metric(at('paper-collage',evidence,frame+duration/2),'data-evidence-reveal')-.5)<.001);
 }
});
for(const style of styles)test(style+': supplied footage check props are readable and never rendered here',()=>{const p=JSON.parse(readFileSync('Projects/v4-style-check/'+style+'.props.json'));assert.equal(p.edit.style,style);assert.equal(p.edit.fontFamily,'Cairo');});
