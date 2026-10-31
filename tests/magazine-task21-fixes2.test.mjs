import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleEngine,setSsrFrame} from './helpers/engine-bundle.mjs';
import {footageFrameState,layoutCaptionOpacity} from '../engine/src/prepared-edit/footage.ts';

const api=await bundleEngine(`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import {PreparedEdit} from './engine/src/prepared-edit/PreparedEdit';
 import {SafeRoot} from './engine/src/core/safe';
 import {MagazineFlip} from './engine/src/core/transitions-v4/magazine-flip';
 export const render=props=>renderToStaticMarkup(<PreparedEdit {...props}/>);
 export const flip=(frame,probe)=>{globalThis.__SSR_FRAME__=frame;return renderToStaticMarkup(<SafeRoot probe={probe}><MagazineFlip atFrame={180} durationInFrames={14} fps={30}><aside>OLDPAGE</aside></MagazineFlip></SafeRoot>);};
`,{ssr:true,media:true,timeline:true});

function tree(html){
 const root={children:[]},stack=[root],nodes=[];
 for(const tag of html.matchAll(/<([^>]+)>/g)){
  if(tag[1].startsWith('/')){const n=stack.pop();n.html=html.slice(n.start,tag.index+tag[0].length);continue;}
  if(tag[1].startsWith('!'))continue;
  const name=tag[1].match(/^\S+/)[0],attrs=Object.fromEntries([...tag[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v.replaceAll('&quot;','"')]));
  const n={name,attrs,parent:stack.at(-1),children:[],start:tag.index};
  n.style=Object.fromEntries((attrs.style??'').split(';').filter(Boolean).map(s=>{const i=s.indexOf(':');return [s.slice(0,i),s.slice(i+1)];}));
  n.parent.children.push(n);nodes.push(n);
  if(!['link','meta','img','input','br','hr','audio','video','source'].includes(name)&&!tag[1].endsWith('/>'))stack.push(n);
  else if(['audio','video'].includes(name))stack.push(n);
 }
 return nodes;
}
const ancestors=n=>{const out=[];for(let p=n.parent;p?.parent;p=p.parent)out.push(p);return out;};
const visible=n=>![n,...ancestors(n)].some(p=>p.style.opacity==='0'||p.style.visibility==='hidden'||p.style.display==='none');
const page=(id,layout,fromFrame,durationInFrames=180)=>({id,family:'compose',layout,fromFrame,durationInFrames,motion:'land',data:{paper:id==='old'?'cream':'navy',arrangement:'stack',parts:[{id:'k',kind:'kicker',text:id==='old'?'OLDPAGE':'NEWPAGE',at:{frame:0}},{id:'c',kind:'card',title:id==='old'?'OUTGOING-CARD':'INCOMING-CARD',at:{frame:0}}]}});
const sample=(from='takeover',to='split')=>({version:1,id:'task21-transition',purpose:'test',style:'magazine-interview',source:{path:'Raw/example.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:360},segments:[{fromFrame:0,toFrame:360}],captions:{status:'draft',words:[]},sounds:[],camera:[],footage:{defaultLayout:'presenter',full:{windowTop:0,windowHeight:1920,videoWidth:1080,videoLeft:0,videoTop:0},split:{windowTop:1080,windowHeight:840,videoWidth:1080,videoLeft:0,videoTop:-88}},scenes:[page('old',from,0),page('new',to,180)],transitions:[{kind:'magazine-flip',atFrame:180,durationInFrames:14}]});
const draw=(edit,frame,probe)=>{setSsrFrame(frame);return api.render({edit,plate:{src:'sample.mp4',width:1080,height:1920},probe});};

for(const [from,to]of [['takeover','split'],['split','takeover']])test(`flip ${from} -> ${to} releases outgoing page under the probe`,()=>{
 const edit=sample(from,to);
 assert.match(draw(edit,179),/OLDPAGE/);
 for(const probe of [undefined,'#00FF00'])for(const frame of [187,188,210,359]){
  const html=draw(edit,frame,probe);
  assert.doesNotMatch(html,/OLDPAGE|OUTGOING-CARD/,`${probe}/${frame}: outgoing content must be unmounted`);
  assert.match(html,/NEWPAGE/);
  if(to==='split')assert.doesNotMatch(html,/top:1424px|top:1436px/,'outgoing takeover folio and bottom hairline are gone');
 }
});
test('MagazineFlip itself releases its child when the centred turn ends, including under probe',()=>{
 for(const probe of [undefined,'#00FF00']){
  assert.match(api.flip(186,probe),/OLDPAGE/);
  assert.doesNotMatch(api.flip(187,probe),/OLDPAGE/);
 }
});
test('probe uses the nominal page at both sides of the cut, without drawing pre-roll',()=>{
 const edit=sample();
 for(const frame of [165,179,180,183,186,187]){
  const html=draw(edit,frame,'#00FF00');
  assert.equal(html.includes('OLDPAGE'),frame<180,`frame ${frame}: outgoing probe lifetime`);
  assert.equal(html.includes('NEWPAGE'),frame>=180,`frame ${frame}: incoming probe lifetime`);
  assert.doesNotMatch(html,/data-magazine-incoming/);
 }
});
test('incoming split footage is visible throughout the exposed half of the turn',()=>{
 const edit=sample();
 for(const frame of [173,176,179,180,183,186]){
  const nodes=tree(draw(edit,frame)),videos=nodes.filter(n=>n.name==='video');
  assert.equal(videos.length,1,`frame ${frame}: incoming window has the continuous footage`);
  assert.equal(nodes.filter(n=>n.name==='audio').length,1);
  const win=videos[0].parent.parent;
  assert.equal(win.style.top,'1080px');assert.equal(win.style.height,'840px');
  assert.ok(!ancestors(videos[0]).some(n=>n.attrs['data-magazine-incoming']!==undefined),'footage remains under the turning sheet, not hidden by the graphics mask');
  const incoming=nodes.find(n=>n.attrs['data-magazine-incoming']!==undefined);
  const grounds=nodes.filter(n=>n.style.background==='#081321'&&n.style.height==='1920px'&&ancestors(n).includes(incoming));
  assert.equal(grounds.length,1);
  assert.ok(ancestors(grounds[0]).some(n=>n.style.height==='1080px'&&n.style.overflow==='hidden'),'incoming navy ground is clipped above the footage window');
 }
});
test('outgoing split footage remains mounted until the flip into takeover finishes',()=>{
 const edit=sample('split','takeover');
 for(const frame of [179,180,183,186])assert.equal(tree(draw(edit,frame)).filter(n=>n.name==='video').length,1);
 assert.equal(tree(draw(edit,187)).filter(n=>n.name==='video').length,0);
});

const layoutSample=(kind='curtain',from='presenter',to='split')=>{
 const edit=sample('split','split');delete edit.transitions;
 const hook={id:'hook',family:'kinetic-hook',fromFrame:from==='presenter'?0:180,durationInFrames:180,layout:'presenter',motion:'land',data:{label:'Example',firstTitle:'First',secondTitle:'Second',swapFrame:40,stamp:'Example',stampFrame:70}};
 edit.scenes=from==='presenter'?[hook,page('new','split',180)]:[page('old','split',0),hook];
 edit.captions={status:'draft',grouping:'single',words:[{text:'Speech',startMs:0,endMs:12000,confidence:1}]};
 edit.layoutTransitions=[{atFrame:180,durationInFrames:18,kind,from,to}];
 return edit;
};
for(const [kind,from,to]of [['curtain','presenter','split'],['window-morph','presenter','split'],['window-morph','split','presenter']])test(`${kind} ${from} -> ${to}: caption cannot cross the moving head`,()=>{
 const edit=layoutSample(kind,from,to),sourceHead={y:320,height:400};
 for(let frame=180;frame<204;frame++){
  const state=footageFrameState(edit,frame,{aspect:1920/1080,canvasHeight:1080});
  const top=state.geo.windowTop+state.geo.videoTop+sourceHead.y*state.geo.videoWidth/1080,bottom=top+sourceHead.height*state.geo.videoWidth/1080;
  const nodes=tree(draw(edit,frame));
  const lines=nodes.filter(n=>n.html?.includes('>Speech<')&&n.style['font-family']&&visible(n));
  for(const line of lines){
   const row=line.parent,y=Number.parseFloat(row.style.top)+Number.parseFloat(line.style['margin-top']??'0'),h=Number.parseFloat(line.style['line-height']);
   assert.ok(y+h<=top||y>=bottom,`frame ${frame}: caption [${y},${y+h}] intersects head [${top},${bottom}]`);
  }
 }
});
for(const skin of [undefined,'karaoke'])test(`magazine ${skin??'style caption'} is hidden in transit and returns in six landing frames`,()=>{
 const edit=layoutSample();if(skin)edit.captions.skin=skin;
 for(const probe of [undefined,'#00FF00']){
  for(let frame=180;frame<198;frame++)assert.doesNotMatch(draw(edit,frame,probe),/>Speech</,`moving frame ${frame}`);
  for(let frame=198;frame<204;frame++){
   const html=draw(edit,frame,probe),nodes=tree(html),fade=nodes.find(n=>n.attrs['data-layout-caption-fade']!==undefined);
   assert.match(html,/>Speech</,`landing frame ${frame}`);
   if(frame<203)assert.equal(Number(fade?.style.opacity),(frame-197)/6);
   else assert.equal(fade,undefined);
  }
 }
 const caption=html=>tree(html).find(n=>n.attrs['data-caption-layer']!==undefined).html;
 assert.equal(caption(draw(edit,204)),caption(draw({...edit,layoutTransitions:[]},204)),'resting caption is byte-identical to a hard cut');
});
test('curtain releases outgoing scene at the nominal boundary with no retained tail',()=>{
 const edit=layoutSample();
 for(const probe of [undefined,'#00FF00'])for(const frame of [180,197,198,210]){
  const html=draw(edit,frame,probe);
  assert.doesNotMatch(html,/data-p1-family="kinetic-hook"/);
  assert.match(html,/NEWPAGE/);
 }
 // The opacity policy also covers reverse curtains if that direction is ever
 // admitted by the schema; current authored reverse moves use window-morph.
 const reverse=[{atFrame:180,durationInFrames:18,kind:'curtain',from:'split',to:'presenter'}];
 for(let frame=180;frame<198;frame++)assert.equal(layoutCaptionOpacity(reverse,frame),0);
 for(let frame=198;frame<204;frame++)assert.equal(layoutCaptionOpacity(reverse,frame),(frame-197)/6);
});
