import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
import {HEAD_GUIDE_FAMILIES} from '../engine/src/creative-kit/head-clear.ts';
import {needsHeadGuide,padChinBottom} from '../scripts/lib/head-guide.mjs';
import {headGuideSchema,headBoxForScene} from '../engine/src/prepared-edit/head-guide.ts';
import {classifyHeadFrame} from '../scripts/lib/head-envelope.mjs';
import {bundleEngine,setSsrFrame} from './helpers/engine-bundle.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('kinetic-hook preparation requests a head guide and retains chin/status contracts',()=>{
 assert.deepEqual([...HEAD_GUIDE_FAMILIES],['statement','creator-cta','layered-speaker','kinetic-hook']);
 assert.equal(needsHeadGuide({scenes:[{family:'kinetic-hook'}]}),true);
 const box=padChinBottom({x:340,y:450,width:400,height:300},{windowTop:0,windowHeight:1920});
 assert.equal(box.height,336);
 for(const [status,reason]of [['ok',null],['unknown','no-envelope'],['hidden',null]]){
  const guide=headGuideSchema.parse({version:1,sourceSha256:'a'.repeat(64),method:status==='ok'?'blazeface':'none',scenes:[{id:'hook',status,box:status==='ok'?box:null,visibleFrames:status==='hidden'?0:240,reason}]});
  assert.deepEqual(headBoxForScene(guide,'hook'),status==='ok'?box:null);
 }
 assert.equal(classifyHeadFrame({visible:true,box,headRect:box,paintedPx2:0,minAreaPx2:16}).status,'PASS');
 assert.equal(classifyHeadFrame({visible:true,box:null,boxReason:'no-envelope',paintedPx2:0,minAreaPx2:16}).status,'NEEDS-REVIEW');
});

const tags=html=>[...html.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*>/g)];
const attr=(tag,key)=>tag.match(new RegExp('(?:^|\\s)'+key+'="([^"]*)"'))?.[1];
const css=tag=>Object.fromEntries((attr(tag,'style')??'').split(';').filter(Boolean).map(s=>{const i=s.indexOf(':');return [s.slice(0,i),s.slice(i+1)];}));
const visibleNodes=html=>{
 const result=[],stack=[],voids=new Set(['img','link','input','br','hr','source','meta']);
 for(const match of tags(html)){
  const name=match[2].toLowerCase();
  if(match[1]){while(stack.length&&stack.pop().name!==name){}continue;}
  const style=css(match[0]),hidden=stack.at(-1)?.hidden||style.visibility==='hidden'||style.display==='none'||style.opacity==='0';
  const node={tag:match[0],name,style,hidden,parent:stack.at(-1)};result.push(node);
  if(!voids.has(name)&&!match[0].endsWith('/>'))stack.push(node);
 }
 return result.filter(n=>!n.hidden);
};
const keepOut={x:0,y:380,width:1080,height:620};
const heads=[padChinBottom({x:340,y:450,width:400,height:300},{windowTop:0,windowHeight:1920}),{x:300,y:300,width:400,height:650},null,{x:320,y:240,width:400,height:1250},{x:0,y:0,width:1080,height:1920}];
const clear=(top,bottom,head,label)=>assert.ok(bottom<=head.y-8||top>=head.y+head.height+8,`${label} [${top},${bottom}] overlaps head clearance [${head.y-8},${head.y+head.height+8}]`);

for(const family of ['kinetic-hook','creator-cta','statement'])for(const [i,headBox]of heads.entries())test(`${family} never paints a band, title or panel over head ${i}`,async()=>{
 const scene=structuredClone(ARABIC_SCENES.find(s=>s.family===family)),head=headBox??keepOut;
 for(const frame of [0,30,120,scene.durationInFrames-1]){
  const html=await renderFamilyDesign({module:`engine/src/styles/magazine-interview/designs/${family}.tsx`,exportName:{'kinetic-hook':'KineticHook','creator-cta':'CreatorCta',statement:'Statement'}[family],scene,frame,headBox,seam:1080});
  assert.doesNotMatch(html,/NaN|Infinity|undefined/);
  const nodes=visibleNodes(html);
  for(const node of nodes){
   const box=attr(node.tag,'data-p1-box'),top=Number.parseFloat(node.style.top??'0'),height=Number.parseFloat(node.style.height??'0');
   if(node.style.background?.startsWith('linear-gradient('))clear(top,top+height,head,`${family}/${frame}/band`);
   if(['hook','stamp','backed-title','cta-panel'].includes(box)&&Number(attr(node.tag,'data-bottom'))>Number(attr(node.tag,'data-top')))clear(Number(attr(node.tag,'data-top')),Number(attr(node.tag,'data-bottom')),head,`${family}/${frame}/${box}`);
   if(attr(node.tag,'data-p1-title')!==undefined)clear(top,top+height,head,`${family}/${frame}/title`);
   if(attr(node.tag,'data-statement-placement')==='lower')clear(Number(attr(node.tag,'data-statement-top')),Number(attr(node.tag,'data-statement-bottom')),head,`${family}/${frame}/statement`);
  }
  if(family==='kinetic-hook'&&i===0&&frame===120)assert.ok(nodes.some(n=>attr(n.tag,'data-p1-box')==='hook'),'a measured ordinary head must retain a visible hook below it');
 }
});

const folioApi=await bundleEngine(`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import {DigitsProvider} from './engine/src/creative-kit/digits';
 import {KineticText} from './engine/src/styles/magazine-interview/designs/kinetic-text';
 import {Paper} from './engine/src/styles/magazine-interview/designs/concepts/frozen-parts';
 import {Canvas} from './engine/src/styles/magazine-interview/designs/concepts/own-drawing';
 import {Sheet} from './engine/src/styles/magazine-interview/designs/concepts/sheet-parts';
 import {SceneLayer} from './engine/src/prepared-edit/PreparedEdit';
 import {screensToCompose} from './engine/src/creative-kit/compose/adapters/kinetic';
 import {pickScale} from './engine/src/creative-kit/compose/layout';
 import {magazineZones} from './engine/src/styles/magazine-interview/system/zones';
 import {MediaPart} from './engine/src/styles/magazine-interview/system/parts/media';
 import {MagazineScope,NAVY} from './engine/src/styles/magazine-interview/system/base';
 import {MagazineComposePage} from './engine/src/styles/magazine-interview/system/compose';
 const components={parts:Paper,own:Canvas,more:Sheet};
 export const folio=(kind,digits,index)=>{
  const C=components[kind];const scene={id:'folio',family:'kinetic-text',layout:'takeover',motion:'land',fromFrame:0,durationInFrames:240,data:{sourceIndices:[0],lang:'ar',enter:'rise'}};
  const node=kind==='kinetic'?<KineticText scene={scene} words={[{sourceIndex:0,text:'نص',fromFrame:0,toFrame:60}]} seam={1080} sectionIndex={index}/>:<C rtl sectionIndex={index} backdrop="canvas"><div/></C>;
  return renderToStaticMarkup(<DigitsProvider digits={digits}>{node}</DigitsProvider>);
 };
 export const otherHook=(style,scene,headBox)=>renderToStaticMarkup(<SceneLayer scene={scene} style={style} headBox={headBox} seam={1080} geometry={{windowTop:1080,windowHeight:840,videoWidth:486,videoLeft:297,videoTop:1080}} aspect={1}/>);
 export const broll=(layout,steps)=>{
  const data=screensToCompose({id:'broll',layout,motion:'land',durationInFrames:300,data:{look:'broll',steps}}),part=data.parts[0],zone=magazineZones(1080)[layout],plan=pickScale(data,zone,'rtl'),box=plan.placed.boxes[part.id];
  const html=renderToStaticMarkup(<MagazineScope data={{text:'لقطات'}}><MediaPart part={part} box={box} at={part.at.frame} th={NAVY} fps={30} scale={plan.scale}/></MagazineScope>);
  return {html,box,data,zone};
 };
 export const mediaPage=(layout,twoParts=false,arrangement='hero')=>{
  const scene={id:'solo',family:'screens',layout,motion:'land',fromFrame:0,durationInFrames:300,data:{look:'broll',steps:[{atFrame:0,src:'projects/demo/landscape.mp4',sha256:'a'.repeat(64),width:2554,height:1436,trimBeforeFrame:0,fit:'contain'}]}};
  const data=screensToCompose(scene);data.arrangement=arrangement;
  if(twoParts)data.parts.unshift({id:'kicker',kind:'kicker',at:{frame:0},text:'لقطات'});
  return renderToStaticMarkup(<MagazineComposePage scene={scene} data={data} style="magazine-interview" seam={1080} geometry={{}} aspect={1}/>);
 };
`,{ssr:true,media:true,timeline:true,plateStub:true});

test('other styles that ignore hook headBox retain the same markup',()=>{
 setSsrFrame(120);const scene=ARABIC_SCENES.find(s=>s.family==='kinetic-hook');
 for(const style of ['section-deck','kinetic-paper','liquid-glass','paper-collage','calligraphic-receipts'])assert.equal(folioApi.otherHook(style,scene,null),folioApi.otherHook(style,scene,heads[0]),style);
});

for(const kind of ['kinetic','parts','own','more'])test(`${kind} folios are padded before/with the chosen digit mapping`,()=>{
 setSsrFrame(200);
 for(const digits of ['latin','arabic-indic'])for(const index of [0,1,6,13]){
  const html=folioApi.folio(kind,digits,index),page=html.match(/<div[^>]*style="[^"]*top:1436px[^"]*"[^>]*>([^<]*)<\/div>/)?.[1];
  const expected=String(index+1).padStart(2,'0').replace(/\d/g,d=>digits==='arabic-indic'?'٠١٢٣٤٥٦٧٨٩'[Number(d)]:d);
  assert.equal(page,expected,`${kind}/${digits}/${index}`);
 }
});

const clips=[{width:1080,height:1920},{width:2554,height:1436},{width:1440,height:1920}].map((s,i)=>({...s,src:`projects/demo/clip-${i}.mp4`,sha256:'a'.repeat(64),trimBeforeFrame:12,fit:'contain',atFrame:i*60}));
for(const layout of ['split','takeover'])for(const [i,clip]of clips.entries())test(`broll ${layout} step ${i} follows its clip aspect and fills the available zone`,()=>{
  setSsrFrame(clip.atFrame+40);const result=folioApi.broll(layout,clips);
  assert.deepEqual(result.data.parts[0].source.steps.map(s=>[s.clip.width,s.clip.height]),clips.map(c=>[c.width,c.height]));
  const plate=result.html.match(/data-adapter-plate="sequence" style="[^"]*left:([^;]+);top:([^;]+);width:([\d.]+)px;height:([\d.]+)px/);
  assert.ok(plate);const w=+plate[3],h=+plate[4],ratio=clip.height/clip.width;
  assert.ok(Math.abs(h/w-ratio)<1e-9,`${layout}/step ${i}: frame aspect ${h/w}, clip ${ratio}`);
  assert.ok(Math.abs(w-Math.min(result.box.width,result.box.height/ratio))<1e-7,`${layout}/step ${i}: frame did not use the zone`);
  assert.ok(result.box.y+h<=result.zone.y+result.zone.height+1e-7);
});

test('broll still rejects clips above CLIP_MAX_ENLARGEMENT',()=>{
 setSsrFrame(40);assert.throws(()=>folioApi.broll('takeover',[{...clips[0],width:20,height:20}]),/limit 1.25x/);
});

// Start with an already measured mask; SSR does not run the browser raster effect.
const videoPath='engine/src/arabic-type/moves/video-in-letters.tsx';
const videoSource=await readFile(videoPath,'utf8');
const seededVideo=videoSource.replace("useState<{url:string;x:number;y:number;size:number}|null>(null)","useState<{url:string;x:number;y:number;size:number}|null>({url:'mask.png',x:540,y:1120,size:50})");
assert.notEqual(seededVideo,videoSource,'the mask state seam moved');
const focusApi=await bundleEngine(`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import * as video from './engine/src/arabic-type/moves/video-in-letters';
 export const offset=(...args)=>video.videoFocusOffset(...args);
 export const render=(frame,focus)=>renderToStaticMarkup(<video.VideoInLetters text="صورة" font="Alexandria" accent="#F3C776" ink="#F5F3EC" frame={frame} fps={30} durationInFrames={180} width={1080} height={1920} media="projects/demo/portrait.mp4" {...(focus===undefined?{}:{look:{videoFocusY:focus}})}/>);
`,{ssr:true,media:true,plateStub:true,sourceOverrides:{[videoPath]:seededVideo}});

test('videoFocusY holds the selected source height behind the word and eases out during the dive',()=>{
 assert.equal(focusApi.offset(undefined,1120,1920,1.2),0);
 const expected=1120-1920*0.33;
 assert.equal(focusApi.offset(0.33,1120,1920,1.2),expected);
 assert.equal(focusApi.offset(0.33,1120,1920,2.2),expected);
 const diving=focusApi.offset(0.33,1120,1920,2.8);assert.ok(diving>0&&diving<expected);
 for(const t of [3,3.4,5])assert.equal(focusApi.offset(0.33,1120,1920,t),0);
});

test('video focus changes only the footage behind the mask; the full-frame end is unchanged',()=>{
 for(const frame of [36,66,84]){
  const html=focusApi.render(frame,0.33);
  const shift=Number(html.match(/data-video-focus-offset="([^"]+)"/)?.[1]);
  assert.ok(shift>0,`${frame}: missing positive video focus offset`);assert.match(html,/translateY\(/);
 }
 for(const frame of [90,102,179])assert.equal(focusApi.render(frame,0.33),focusApi.render(frame,undefined));
});

test('video-in-letters without videoFocusY retains its original masked/full markup',t=>{
 const hashes=[0,36,66,84,90,102,179].map(frame=>({frame,sha256:createHash('sha256').update(focusApi.render(frame,undefined)).digest('hex')}));
 assert.deepEqual(hashes,[{"frame":0,"sha256":"3a4021b3f4e3afdd5e6417697c795bbc62ec7212748cd6a30f89cb57c9d3da72"},{"frame":36,"sha256":"6601e85acfaf2d22c7e971c7b72305523e261b5d59f0c138afbb64973a1b1ac9"},{"frame":66,"sha256":"6601e85acfaf2d22c7e971c7b72305523e261b5d59f0c138afbb64973a1b1ac9"},{"frame":84,"sha256":"fec43b1e722597c1ff02148786dfde40625cf80da40b2de753abb7124aa369df"},{"frame":90,"sha256":"008e6b9d87aba96a1a10a72c2824d8628a292355f456c8ffb82a886c57b716ae"},{"frame":102,"sha256":"008e6b9d87aba96a1a10a72c2824d8628a292355f456c8ffb82a886c57b716ae"},{"frame":179,"sha256":"008e6b9d87aba96a1a10a72c2824d8628a292355f456c8ffb82a886c57b716ae"}]);
 t.diagnostic(JSON.stringify({defaultVideo:hashes}));
});

const actualHook={id:'kinetic-hook-presenter',family:'kinetic-hook',fromFrame:558,durationInFrames:180,layout:'presenter',motion:'stagger',data:{label:'مثال عنوان',firstTitle:'فكرة',secondTitle:'صورة',swapFrame:45,stamp:'توضيح بصري',stampFrame:80}};
const round2Heads=[{x:381,y:268,width:477,height:674},null,{x:340,y:150,width:400,height:450},{x:340,y:300,width:400,height:700}];
for(const [i,headBox]of round2Heads.entries())test(`round2 hook remains visible and clear of required head ${i}`,async t=>{
 for(const frame of [30,80,120,179]){
  const html=await renderFamilyDesign({module:'engine/src/styles/magazine-interview/designs/kinetic-hook.tsx',exportName:'KineticHook',scene:actualHook,frame,headBox,seam:1080});
  const nodes=visibleNodes(html),head=headBox??keepOut,hook=nodes.find(n=>attr(n.tag,'data-p1-box')==='hook'),stamp=nodes.find(n=>attr(n.tag,'data-p1-box')==='stamp');
  assert.ok(hook,`head ${i}/${frame}: hook hidden`);assert.ok(stamp,`head ${i}/${frame}: stamp hidden`);
  const title=nodes.find(n=>attr(n.tag,'data-swap-frame')!==undefined);assert.ok(Number(attr(title.tag,'data-p1-size'))>=72);
  assert.ok(html.includes(actualHook.data.label)&&html.includes(actualHook.data.stamp));
  for(const node of [hook,stamp]){
   const top=Number(attr(node.tag,'data-top')),bottom=Number(attr(node.tag,'data-bottom'));
   clear(top,bottom,head,`round2/${i}/${frame}`);assert.ok(bottom<=1150);
  }
  if(attr(hook.tag,'data-hook-form')==='compact'){
   const label=nodes.find(n=>attr(n.tag,'data-p1-label')==='compact');assert.ok(label);
   assert.equal(Number(attr(stamp.tag,'data-top')),Number(attr(hook.tag,'data-top')),'stamp shares the label row');
   const stampClip=nodes.find(n=>n.parent===stamp&&n.style.top===label.style.top);
   assert.ok(stampClip);assert.equal(label.style.right,'65px');assert.equal(stampClip.style.left,'65px');
  }
  if(frame===120){assert.ok(nodes.some(n=>attr(n.tag,'data-p1-stamp')!==undefined));t.diagnostic(JSON.stringify({round2Hook:{case:i,form:attr(hook.tag,'data-hook-form')??'full',top:Number(attr(hook.tag,'data-top')),bottom:Number(attr(hook.tag,'data-bottom')),titleSize:Number(attr(title.tag,'data-p1-size')),stampTop:Number(attr(stamp.tag,'data-top')),stampBottom:Number(attr(stamp.tag,'data-bottom'))}}));}
 }
});

test('round2 hook last resort below a chin past 1000 hides and warns',async()=>{
 const warnings=[],warn=console.warn;let html;
 try{console.warn=(...a)=>warnings.push(a.join(' '));html=await renderFamilyDesign({module:'engine/src/styles/magazine-interview/designs/kinetic-hook.tsx',exportName:'KineticHook',scene:{...actualHook,data:{...actualHook.data,firstTitle:'خارج الحيز'}},frame:120,headBox:{x:381,y:268,width:477,height:733},seam:1080});}finally{console.warn=warn;}
 assert.ok(!visibleNodes(html).some(n=>attr(n.tag,'data-p1-box')==='hook'));
 assert.ok(warnings.some(w=>w.includes('fit-warning')));
});

test('round2 solo takeover media is vertically centred, including stack arrangement',()=>{
 setSsrFrame(120);
 for(const arrangement of ['hero','stack']){
  const nodes=visibleNodes(folioApi.mediaPage('takeover',false,arrangement));
  const plate=nodes.find(n=>attr(n.tag,'data-adapter-plate')==='sequence');assert.ok(plate);
  const top=parseFloat(plate.parent.style.top)+parseFloat(plate.style.top??0),height=parseFloat(plate.style.height);
  assert.ok(Math.abs(top+height/2-750)<1e-7,`${arrangement}: plate centre ${top+height/2}, expected zone centre 750`);
 }
});

test('round2 preserves approved upper hook and non-solo/split media markup',async t=>{
 const audit=[];
 for(const frame of [0,30,120,179]){
  const html=await renderFamilyDesign({module:'engine/src/styles/magazine-interview/designs/kinetic-hook.tsx',exportName:'KineticHook',scene:actualHook,frame,headBox:{x:340,y:640,width:400,height:400},seam:1080});
  audit.push({kind:'upper-hook',frame,sha256:createHash('sha256').update(html).digest('hex')});
 }
 setSsrFrame(120);
 for(const [layout,twoParts]of [['split',false],['split',true],['takeover',true]])audit.push({kind:`${layout}/${twoParts?'two':'solo'}`,sha256:createHash('sha256').update(folioApi.mediaPage(layout,twoParts)).digest('hex')});
 assert.deepEqual(audit,[{"kind":"upper-hook","frame":0,"sha256":"ba5f33603b94241eee1cfeb053f6d032729f3ae03d4ab7704082c947d4a6767f"},{"kind":"upper-hook","frame":30,"sha256":"8e802f1e1265128c99958fbfb80987d315f6ce7c1caf50dd8cf472be6c918c1c"},{"kind":"upper-hook","frame":120,"sha256":"7c97de56b9fbfb9e7fcdb7976c6fb23b057ac3d45a373150b77b83034da5f335"},{"kind":"upper-hook","frame":179,"sha256":"7c97de56b9fbfb9e7fcdb7976c6fb23b057ac3d45a373150b77b83034da5f335"},{"kind":"split/solo","sha256":"ad91ab1504494bf7148caef2516337cd7b029b405fec8d56db3ba2a58f78d6db"},{"kind":"split/two","sha256":"44012cd75c4ccc56d43893c44c6683246ebea33d8674d77e08e0f7f630b20534"},{"kind":"takeover/two","sha256":"c6d8d44b0d6d08b7936578c96180c8f1a995ace8110c40d1880a113e4900b0ee"}]);
 t.diagnostic(JSON.stringify({round2Preserved:audit}));
});
