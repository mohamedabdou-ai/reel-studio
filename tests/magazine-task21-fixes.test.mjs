import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleEngine,setSsrFrame} from './helpers/engine-bundle.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
import {createHash} from 'node:crypto';
import {sceneCues,editCues} from '../scripts/lib/scene-cues.mjs';
import {loadStylePalette,planSfxEvents} from '../scripts/lib/sfx-events.mjs';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';

const api=await bundleEngine(`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import {SafeRoot} from './engine/src/core/safe';
 import {MAGAZINE_INTERVIEW_DESIGNS} from './engine/src/styles/magazine-interview/designs';
 import {MagazineScope,MagazineCaption,Ground,NAVY,CREAM,wid} from './engine/src/styles/magazine-interview/system/base';
 import {MAGAZINE_PARTS} from './engine/src/styles/magazine-interview/system/parts';
 export const render=(scene,probe)=>{const C=MAGAZINE_INTERVIEW_DESIGNS[scene.family];return renderToStaticMarkup(<SafeRoot probe={probe}><C scene={scene} seam={1080} words={[]} sectionIndex={2}/></SafeRoot>);};
 export const ground=(cream,probe,surface)=>renderToStaticMarkup(<SafeRoot probe={probe}><Ground th={cream?CREAM:NAVY} surface={surface}/></SafeRoot>);
 export const caption=text=>renderToStaticMarkup(<MagazineScope data={{text}}><MagazineCaption y={1310} text={text}/></MagazineScope>);
 export const width=(text,size)=>wid(text,size,700);
 export const part=(part,frame)=>{globalThis.__SSR_FRAME__=frame;const C=MAGAZINE_PARTS[part.kind];return renderToStaticMarkup(<MagazineScope data={part}><C part={part} at={60} box={{x:65,y:350,width:788,height:600}} scale={1} emphasis={!!part.emphasis} th={CREAM} fps={30} dir="rtl"/></MagazineScope>);};
`,{ssr:true,media:true,plateStub:true});
setSsrFrame(120);
const compose=paper=>({id:'probe',family:'compose',fromFrame:0,durationInFrames:240,layout:'takeover',motion:'land',data:{paper,arrangement:'stack',parts:[{id:'h',kind:'headline',text:'A clear idea',at:{frame:0}}]}});
for(const paper of ['cream','navy'])test(`compose ${paper} page honours the probe without erasing drawn copy`,()=>{
 const html=api.render(compose(paper),'#00ff00');
 assert.match(html,/width:1080px;height:1920px;overflow:hidden;background:#00ff00/);
 assert.doesNotMatch(html,/radial-gradient|linear-gradient|feTurbulence/);
 assert.match(html.replace(/<[^>]*>/g,''),/A clearidea/);
});
test('an English product label cannot flip Arabic hook titles',()=>{
 const scene={...ARABIC_SCENES.find(s=>s.family==='kinetic-hook'),data:{label:'Claude Code',firstTitle:'بدون 5 Skills',secondTitle:'تستخدم 10% منها',swapFrame:118,stamp:'حرفياً',stampFrame:74}};
 const html=api.render(scene);
 assert.match(html,/data-direction="rtl"/);
 assert.match(html,/top:326px;right:65px/);
 assert.match(html,/data-p1-swap="old"[^>]*text-align:right/);
 const english=api.render({...scene,data:{...scene.data,firstTitle:'Without five skills',secondTitle:'Use ten percent',stamp:'Literally'}});
 assert.match(english,/data-direction="ltr"/);
});
test('classic takeover and the shared page ground honour the probe',()=>{
 const scene={...ARABIC_SCENES.find(s=>s.family==='intro'),layout:'takeover'};
 const html=api.render(scene,'#00ff00');
 assert.match(html,/width:1080px;height:1920px;overflow:hidden;background:#00ff00/);
 assert.doesNotMatch(html,/feTurbulence/);
 assert.match(api.ground(true),/feTurbulence/);
 assert.match(api.ground(true,'#00ff00','object'),/width:1080px;height:1920px;overflow:hidden;background:#F5F0E4/);
 assert.match(api.ground(true,'#00ff00','object'),/feTurbulence/);
});
test('an emphasized card fill is absent before at and present when settled',()=>{
 const card={id:'c4',kind:'card',title:'Errors',body:'A real user',emphasis:true,at:{frame:60}};
 for(const frame of [0,59,60])assert.match(api.part(card,frame),/fill="#0B1A2C" fill-opacity="0"/);
 assert.match(api.part(card,120),/fill="#0B1A2C" stroke=/);
});
test('zero-offset bars cannot draw their separator before the part entrance',()=>{
 const html=api.part({kind:'bars',at:{frame:60},items:[{label:'One',value:20,offsetFrames:0},{label:'Two',value:40,offsetFrames:0}]},59);
 const separators=[...html.matchAll(/<div style="[^"]*height:1.5px;background:#B8862E;opacity:0.4[^"]*"/g)];
 assert.ok(separators.length);for(const match of separators)assert.match(match[0],/width:0(?:px)?;/);
});
test('an early scene-frame stamp press cannot paint before the card entrance',()=>{
 const html=api.part({kind:'card',variant:'stamp',title:'Example',at:{frame:60},pressFrame:10},59);
 assert.match(html,/visibility:hidden/);
});
const captions=[
 'إذا استخدمت "Claude Code" بدون خمسة "Skills" فإنك حرفياً',
 'بعضك ستغير تماماً الأول هو "MCP Builder" حرفياً أنت',
 'تقدمه "API Documentation" ديكومنتيشن وكلود بيعمل لك mcp سيرفر',
 'لك الاخطاء أكنه مستخدم حقيقي بالضبط الثالثة front-end design',
];
for(const text of captions)test(`caption stays in its column: ${text}`,()=>{
 const html=api.caption(text),size=Number(html.match(/font-size:([\d.]+)px/)[1]);
 const lines=[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1].replaceAll('&quot;','"').replaceAll('&#x27;',"'"));
 assert.ok(size>=34);assert.ok(lines.length<=2);
 assert.equal(lines.join(' '),text);
 for(const line of lines)assert.ok(api.width(line,size)<=768+0.5,`${line} overflows at ${size}`);
 assert.match(html,/left:65px;width:788px/);
 const ruleWidth=Number(html.match(/width:([\d.]+)px;height:1.5px/)[1]);
 assert.equal(ruleWidth,Math.min(788,Math.max(...lines.map(line=>api.width(line,size)))+80));
});
test('a short caption retains its original markup',()=>{
 assert.equal(createHash('sha256').update(api.caption('Short copy')).digest('hex'),'d7f2df7e41b1939f178fc74bddb038cf6bf37031773e20f98f45d1daf4970495');
});
const cueScene={id:'cues',family:'compose',fromFrame:100,durationInFrames:300,layout:'split',motion:'land',data:{arrangement:'stack',parts:[
 {id:'k',kind:'kicker',text:'Start',at:{frame:0}},
 {id:'h',kind:'headline',text:'Three steps',at:{word:4,dt:0.1}},
 {id:'s',kind:'steps',at:{word:5},items:[{title:'One',offsetFrames:0},{title:'Two',offsetFrames:30},{title:'Three',offsetFrames:60}]},
]}};
test('compose cues resolve words and row offsets and do not double the opening',()=>{
 const words=[{sourceIndex:4,fromFrame:130,toFrame:140},{sourceIndex:5,fromFrame:160,toFrame:170}];
 assert.deepEqual(sceneCues(cueScene,30,{words}).map(c=>[c.frame,c.kind]),[[100,'transition'],[133,'reveal'],[160,'reveal'],[190,'reveal'],[220,'reveal']]);
 const list={...cueScene,data:{parts:[{kind:'list',at:{frame:20},staggerFrames:15,items:[{text:'One'},{text:'Two'},{text:'Three'}]}]}};
 assert.deepEqual(sceneCues(list).filter(c=>c.kind==='reveal').map(c=>c.frame),[120,135,150]);
});
test('a null reveal recipe stays silent and the magazine palette chooses soft-transition',async()=>{
 const palette=await loadStylePalette('magazine-interview');
 const cues=sceneCues({...cueScene,data:{parts:[{kind:'card',at:{frame:30}},{kind:'card',at:{frame:60}}]}});
 assert.equal(palette.entries.reveal.recipe.id,'soft-transition');
 const muted={...palette,entries:{...palette.entries,reveal:{...palette.entries.reveal,recipe:null}}};
 const result=planSfxEvents(cues,muted,{fps:30,durationInFrames:600});
 assert.deepEqual(result.events.map(e=>e.atFrame),[100]);
 assert.equal(result.decisions.filter(d=>d.kind==='reveal'&&d.reason==='no-sound-for-kind').length,2);
});

// Run the real CLI with its project I/O rooted in an isolated state/tmp mirror.
// Only source inspection is stubbed in this unit fixture; the real recording is
// separately reproduced with ffprobe, without that stub.
for(const kind of ['graphics','layout'])test(`planner retains ${kind} transition at a word-anchored compose start`,async()=>{
 await mkdir(path.resolve('state/tmp'),{recursive:true});
 const root=await mkdtemp(path.resolve('state/tmp/task21-unit-'));
 const project='Projects/task21-plan';await mkdir(path.join(root,project),{recursive:true});
 await writeFile(path.join(root,project,'source.mp4'),'synthetic source identity');
 await writeFile(path.join(root,project,'words.json'),JSON.stringify([{text:'Start',startMs:0,endMs:400},{text:'Result',startMs:5000,endMs:5500}]));
 const transition=kind==='graphics'?{transitions:[{atFrame:90,durationInFrames:14,kind:'magazine-flip'}]}:{layoutTransitions:[{atFrame:90,durationInFrames:18,kind:'curtain',from:'presenter',to:'split'}]};
 const brief={version:1,id:'task21-plan',source:project+'/source.mp4',transcript:project+'/words.json',style:'magazine-interview',purpose:'explainer',tone:'editorial',sound:'none',creator:{displayName:'Example',handle:'@example',ending:{cta:null,followCard:false,signOff:null}},beats:[
  kind==='graphics'?{id:'hook',fromSec:0,toSec:3,intent:'intro',layout:'split',data:ARABIC_SCENES.find(s=>s.family==='intro').data}:{id:'hook',fromSec:0,toSec:3,intent:'kinetic-hook',layout:'presenter',data:{label:'Example',firstTitle:'First',secondTitle:'Second',swapFrame:30,stamp:'Example',stampFrame:50}},
  {id:'page',fromSec:3,toSec:10,intent:'compose',layout:'split',data:{arrangement:'stack',parts:[{id:'h',kind:'headline',text:'A clear example',at:{word:1}}]}},
 ],...transition};
 await writeFile(path.join(root,project,'brief.json'),JSON.stringify(brief));
 const hook=path.join(root,'sandbox.mjs');
 await writeFile(hook,`import{registerHooks}from'node:module';import{readFileSync}from'node:fs';registerHooks({load(url,ctx,next){
 if(url.endsWith('/scripts/lib/job-paths.mjs'))return{format:'module',shortCircuit:true,source:readFileSync(new URL(url),'utf8').replace("import { ROOT } from './media.mjs';",'const ROOT = '+JSON.stringify(process.env.TASK21_TEST_ROOT)+';')};
 if(url.endsWith('/scripts/lib/edit-project.mjs')){let s=readFileSync(new URL(url),'utf8');const a=s.indexOf('export async function inspectEditSource('),b=s.indexOf('export async function initEditProject(',a);if(a<0||b<a)throw Error('inspection seam moved');s=s.slice(0,a)+"export async function inspectEditSource(source){const identity=await fileSnapshot(source);return {source:{path:source,sha256:identity.sha256,fps:30,width:1080,height:1920,totalFrames:300}};}\\n"+s.slice(b);return{format:'module',shortCircuit:true,source:s};}return next(url,ctx);}});`);
 let stdout;try{({stdout}=await promisify(execFile)(process.execPath,['--import',pathToFileURL(hook).href,'scripts/editor.mjs','plan',project+'/brief.json'],{cwd:process.cwd(),env:{...process.env,TASK21_TEST_ROOT:root},windowsHide:true,maxBuffer:4*1024*1024}));}catch(error){assert.fail(error.stderr||error.message);}
 assert.equal(JSON.parse(stdout).ok,true);
 const result=JSON.parse(await readFile(path.join(root,project,'edit.json'),'utf8'));
 for(const key of Object.keys(transition))assert.deepEqual(result[key],transition[key]);
 assert.equal(result.scenes[1].data.parts[0].at.word,1);
 assert.equal(result.captions.words.length,2);
});
