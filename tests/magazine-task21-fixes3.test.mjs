import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleEngine,setSsrFrame} from './helpers/engine-bundle.mjs';
import {composeDataSchema} from '../engine/src/creative-kit/compose/schema.ts';
import {fontCoverageSync} from '../scripts/lib/font-coverage.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
import {sceneCaptionOpacity} from '../engine/src/prepared-edit/graphics-transitions.ts';

const api=await bundleEngine(`
 import React from 'react';import{renderToStaticMarkup}from'react-dom/server';
 import{ownSceneCopy}from'./engine/src/style-kit/design-safety';
 import{CAPTION_DESIGNS}from'./engine/src/styles/caption-designs';
 import{MagazineScope,NAVY,CREAM}from'./engine/src/styles/magazine-interview/system/base';
 import{CardPart}from'./engine/src/styles/magazine-interview/system/parts/card';
 import{FAMILY_DESIGNS}from'./engine/src/styles/family-designs';
 import{PreparedEdit}from'./engine/src/prepared-edit/PreparedEdit';
 export{ownSceneCopy,NAVY,CREAM};
 export const caption=text=>renderToStaticMarkup(<CAPTION_DESIGNS.magazine text={text} center={1300}/>);
 export const family=(style,scene)=>{const C=FAMILY_DESIGNS[style][scene.family];return renderToStaticMarkup(<C scene={scene} style={style} seam={1080} sectionIndex={1} words={[]} geometry={{windowTop:0,windowHeight:1920,videoWidth:1080,videoLeft:0,videoTop:0}} aspect={1920/1080}/>);};
 export const card=(paper,emphasis,extra={})=>renderToStaticMarkup(<MagazineScope data={{title:'A payoff'}}><CardPart part={{id:'card',kind:'card',title:'A payoff',body:'The supplied detail',at:{frame:60},...extra}} at={60} box={{x:65,y:350,width:461,height:400}} th={paper==='cream'?CREAM:NAVY} scale={1} emphasis={emphasis} fps={30} dir="ltr"/></MagazineScope>);
 export const prepared=edit=>renderToStaticMarkup(<PreparedEdit edit={edit} plate={{src:'sample.mp4',width:1080,height:1920}}/>);
`,{ssr:true,media:true,timeline:true});
setSsrFrame(120);

for(const [data,dir]of [
 [{text:'"Skills" فإنك حرفياً'},'rtl'],[{text:'front-end design'},'ltr'],[{title:'Claude يبني لك'},'rtl'],[{lang:'en',title:'كلام عربي'},'ltr'],[{lang:'ar',title:'English title'},'rtl'],
 [{title:'English title',caption:'شرح عربي'},'ltr'],[{title:'English title',src:'projects/مثال.png'},'ltr'],
])test(`ownSceneCopy ${JSON.stringify(data)} -> ${dir}`,()=>assert.equal(api.ownSceneCopy(data).dir,dir));
test('Latin-first Arabic caption is rtl and Latin-only caption stays ltr',()=>{
 assert.match(api.caption('"Skills" فإنك حرفياً'),/direction:rtl/);
 assert.match(api.caption('front-end design'),/direction:ltr/);
});
for(const style of ['kinetic-paper','liquid-glass','calligraphic-receipts','paper-collage','magazine-interview'])test(`${style} title Claude يبني لك uses rtl through its registered design`,()=>{
 const scene=structuredClone(ARABIC_SCENES.find(s=>s.family==='intro'));scene.layout='takeover';scene.data.title='Claude يبني لك';
 setSsrFrame(120);const html=api.family(style,scene);assert.match(html,/direction:rtl/);assert.match(html,/Claude/);
});

const page=(id,layout,fromFrame)=>({id,family:'compose',fromFrame,durationInFrames:180,layout,motion:'land',data:{paper:layout==='takeover'?'cream':'navy',arrangement:'stack',parts:[{id:'h',kind:'headline',text:'A clear example',at:{frame:0}}]}});
const editFor=(from,to)=>({version:1,id:'task21-r3',purpose:'test',style:'magazine-interview',source:{path:'Raw/example.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:360},segments:[{fromFrame:0,toFrame:360}],captions:{status:'draft',grouping:'single',words:[{text:'Speech',startMs:0,endMs:12000,confidence:1}]},sounds:[],camera:[],scenes:[page('old',from,0),page('new',to,180)],transitions:[{kind:'magazine-flip',atFrame:180,durationInFrames:14}],footage:{defaultLayout:'presenter',full:{windowTop:0,windowHeight:1920,videoWidth:1080,videoLeft:0,videoTop:0},split:{windowTop:1080,windowHeight:840,videoWidth:1080,videoLeft:0,videoTop:-88}}});
for(const [from,to]of [['split','takeover'],['takeover','split']])test(`flip ${from} -> ${to} hides speech during the visible presenter strip and restores it in six frames`,()=>{
 const edit=editFor(from,to);
 for(let frame=173;frame<187;frame++){
  setSsrFrame(frame);const html=api.prepared(edit);
  assert.match(html,/<video\b/,`frame ${frame}: actual visible presenter plate`);
  assert.doesNotMatch(html,/>Speech</,`frame ${frame}: caption must not cross the visible head`);
 }
 for(let frame=187;frame<193;frame++){
  setSsrFrame(frame);const html=api.prepared(edit);assert.match(html,/>Speech</);
  const fade=html.match(/data-layout-caption-fade="" style="opacity:([\d.]+)"/);
  if(frame<192)assert.equal(Number(fade?.[1]),(frame-186)/6);else assert.equal(fade,null);
 }
});

test('hook stamp retains tanwin and no longer widens the clipping mask',()=>{
 const scene={id:'hook',family:'kinetic-hook',layout:'presenter',motion:'land',fromFrame:0,durationInFrames:180,data:{label:'Claude Code',firstTitle:'بدون 5 Skills',secondTitle:'تستخدم 10% منها',swapFrame:40,stamp:'حرفياً',stampFrame:60}};
 setSsrFrame(120);const html=api.family('magazine-interview',scene);
 assert.ok(fontCoverageSync('engine/public/fonts/Alexandria-arabic-var.woff2').has(0x064b));
 assert.match(html,/>حرفياً</u);
 assert.match(html,/data-p1-stamp=""[^>]*overflow:hidden/,'compact frame owns the clip');
 assert.doesNotMatch(html,/clip-path:inset\(-11px/,'round 3 clip widening is removed');
});

const luminance=hex=>{const a=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};
for(const paper of ['cream','navy'])test(`${paper} emphasized card inverts its fill and title/body ink with safe contrast`,()=>{
 setSsrFrame(120);const th=paper==='cream'?api.CREAM:api.NAVY,html=api.card(paper,true);
 assert.ok(html.includes('fill="'+th.ink+'"'));
 assert.match(html,new RegExp('color:'+th.ground+'[^>]*><bdi dir="auto">A payoff'));
 assert.match(html,new RegExp('color:'+th.ground+'[^>]*><bdi dir="auto">The supplied detail'));
 const detail=html.match(/<div style="([^"]*)"><bdi dir="auto">The supplied detail/)[1];
 assert.ok(Number(detail.match(/font-size:([\d.]+)px/)[1])>=34);
 const [lo,hi]=[luminance(th.ground),luminance(th.ink)].sort((a,b)=>a-b);assert.ok((hi+.05)/(lo+.05)>=4.5);
 for(const frame of [0,59,60]){setSsrFrame(frame);assert.ok(api.card(paper,true).includes('fill="'+th.ink+'" fill-opacity="0"'));}
});
test('compose still refuses a second emphasized card',()=>{
 assert.equal(composeDataSchema.safeParse({arrangement:'grid',parts:['a','b'].map(id=>({id,kind:'card',title:'Example',emphasis:true,at:{frame:0}}))}).success,false);
});
test('inverted card values remain readable, including the ticket stub',()=>{
 const textColor=(html,text)=>{const stack=[];for(const token of html.matchAll(/<[^>]+>|[^<]+/g)){const s=token[0];if(s.startsWith('</'))stack.pop();else if(s.startsWith('<'))stack.push(s.match(/style="([^"]*)"/)?.[1]?.match(/(?:^|;)color:([^;]+)/)?.[1]);else if(s===text)return stack.findLast(c=>c!==undefined);}return undefined;};
 setSsrFrame(120);
 for(const paper of ['cream','navy'])for(const variant of ['plain','ticket','follow']){
  const th=paper==='cream'?api.CREAM:api.NAVY;
  const html=api.card(paper,true,{variant,value:'3',...(variant==='follow'?{pressFrame:150}:{})});
  assert.equal(textColor(html,'3'),th.ground,'value ink follows the inverted card');
 }
});
test('scene-caption safety sees presenter gaps, but does not hide two continuous takeovers',()=>{
 const t=[{kind:'whiteout',atFrame:180,durationInFrames:14}];
 const contiguous=[page('old','takeover',0),page('new','takeover',180)];
 assert.equal(sceneCaptionOpacity(t,contiguous,180),1);
 assert.equal(sceneCaptionOpacity(t,[{...contiguous[0],durationInFrames:176},contiguous[1]],180),0);
});
