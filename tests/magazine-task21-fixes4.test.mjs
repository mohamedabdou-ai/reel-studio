import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {lifecycleBrowser} from './helpers/transition-lifecycle.mjs';

const require=createRequire(new URL('../engine/package.json',import.meta.url));
const {openBrowser}=require('@remotion/renderer');
const {build}=require('esbuild');
const scene=stamp=>({id:'stamp',family:'kinetic-hook',fromFrame:0,durationInFrames:180,layout:'presenter',motion:'land',data:{label:'Claude Code',firstTitle:'بدون 5 Skills',secondTitle:'تستخدم 10% منها',swapFrame:40,stamp,stampFrame:60}});
const render=stamp=>renderFamilyDesign({module:'engine/src/styles/magazine-interview/designs/kinetic-hook.tsx',exportName:'KineticHook',scene:scene(stamp),frame:108,seam:1080,headBox:{x:354,y:262,width:500,height:666}});

for(const compact of [true,false])test(`${compact?'compact':'full'} stamp contains measured Alexandria ink without moving its baseline`,{skip:!existsSync(lifecycleBrowser)?'Optional installed Chrome is unavailable; clean-install keeps the unmarked SSR regression active':false},async t=>{
 const words=['حرفياً','حرفيًا','حرفيا'];
 const root=process.cwd();
 const bundle=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
  import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
  import{KineticHook}from'./engine/src/styles/magazine-interview/designs/kinetic-hook';
  import{designSet}from'./engine/src/style-kit/design-safety';
  const C=designSet({'kinetic-hook':KineticHook},{system:'magazine-interview'})['kinetic-hook'];
  const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:1080px;height:1920px';document.body.appendChild(host);const root=createRoot(host);
  window.drawStamp=scene=>flushSync(()=>root.render(<C scene={scene} style="magazine-interview" seam={1080} headBox={${JSON.stringify(compact?{x:354,y:262,width:500,height:666}:{x:340,y:640,width:400,height:400})}} geometry={{windowTop:0,windowHeight:1920,videoWidth:1080,videoLeft:0,videoTop:0}} aspect={1920/1080}/>));
 `},nodePaths:[path.join(root,'engine/node_modules')],bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',plugins:[{name:'stamp-clock',setup(b){
  b.onResolve({filter:/^remotion$/},()=>({path:'clock',namespace:'stamp-test'}));
  b.onLoad({filter:/.*/,namespace:'stamp-test'},()=>({loader:'js',resolveDir:root,contents:`export * from ${JSON.stringify(path.join(root,'engine/node_modules/remotion/dist/esm/index.mjs').replaceAll('\\','/'))};export const useCurrentFrame=()=>108;export const useVideoConfig=()=>({width:1080,height:1920,fps:30,durationInFrames:180});`}));
  b.onLoad({filter:/core[\\/]fonts\.ts$/},({path:file})=>({loader:'ts',resolveDir:path.dirname(file),contents:readFileSync(file,'utf8').replace(/if \(typeof document !== "undefined"\) \{/,'if (false) {')}));
 }}]});
 const browser=await openBrowser('chrome',{browserExecutable:lifecycleBrowser,logLevel:'error'});
 try{
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
  const fonts=['arabic','latin'].map(subset=>({bytes:readFileSync(`engine/public/fonts/Alexandria-${subset}-var.woff2`).toString('base64'),range:subset==='arabic'?'U+0600-06FF':'U+0000-00FF'}));
  await page.evaluate(async fonts=>{for(const font of fonts){const face=new FontFace('Alexandria','url(data:font/woff2;base64,'+font.bytes+')',{weight:'100 900',unicodeRange:font.range});await face.load();document.fonts.add(face);}await document.fonts.ready;},fonts);
  await page.evaluate(script=>new Function(script)(),bundle.outputFiles[0].text);
  const rows=await page.evaluate(({words,scenes,compact})=>{
   const rows=[];
   for(let i=0;i<words.length;i++){
    window.drawStamp(scenes[i]);const stamp=document.querySelector('[data-p1-stamp]'),css=getComputedStyle(stamp);
    const baseline=document.createElement('span');baseline.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';stamp.appendChild(baseline);
    const visualBaseline={x:baseline.getBoundingClientRect().left,y:baseline.getBoundingClientRect().top};
    // Measure containment in the frame's own coordinate system, before its approved tilt.
    const savedTransform=stamp.style.transform;
    if(!compact)stamp.style.transform='none';
    const box=stamp.getBoundingClientRect(),y=baseline.getBoundingClientRect().top;
    const ctx=document.createElement('canvas').getContext('2d');ctx.font=css.fontWeight+' '+css.fontSize+' '+css.fontFamily;ctx.textAlign='right';ctx.direction='rtl';
    const m=ctx.measureText(words[i]),anchor=box.right-parseFloat(css.borderRightWidth)-parseFloat(css.paddingRight);
    rows.push({text:words[i],frame:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height},inner:{left:box.left+parseFloat(css.borderLeftWidth),right:box.right-parseFloat(css.borderRightWidth),top:box.top+parseFloat(css.borderTopWidth),bottom:box.bottom-parseFloat(css.borderBottomWidth)},ink:{left:anchor-m.actualBoundingBoxLeft,right:anchor+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent},baseline:y,visualBaseline,fontSize:parseFloat(css.fontSize)});
    stamp.style.transform=savedTransform;
   }
   return rows;
  },{words,scenes:words.map(scene),compact});
  t.diagnostic(JSON.stringify({stampInk:rows}));
  const plain=rows[2];
  if(compact){assert.equal(plain.frame.top,936);assert.equal(plain.frame.height,44);assert.equal(plain.frame.left,65);assert.equal(plain.fontSize,32);}
  else assert.equal(plain.fontSize,44);
  for(const row of rows.slice(0,2)){
   assert.ok(row.ink.top>=row.inner.top,`${row.text}: ink top ${row.ink.top} above inner frame ${row.inner.top}`);
   assert.ok(row.ink.bottom<=row.inner.bottom,`${row.text}: ink bottom ${row.ink.bottom} below inner frame ${row.inner.bottom}`);
   assert.ok(row.ink.left>=row.inner.left&&row.ink.right<=row.inner.right,'horizontal ink stays inside frame');
   assert.equal(row.baseline,plain.baseline,'word baseline is fixed');
   assert.ok(Math.abs(row.visualBaseline.x-plain.visualBaseline.x)<0.02&&Math.abs(row.visualBaseline.y-plain.visualBaseline.y)<0.02,'baseline stays fixed through the approved transform');
   assert.equal(row.frame.left,plain.frame.left,'anchor edge is fixed');
   assert.equal(row.fontSize,plain.fontSize);
   assert.ok(row.frame.top<=plain.frame.top,'frame can only grow upward');
  }
  if(compact){assert.equal(rows[0].frame.top,plain.frame.top-11);assert.equal(rows[1].frame.height,44,'a mark already inside the letters ascent needs no extra space');}
 }finally{await browser.close({silent:true});}
});
test('an unmarked stamp keeps its pre-round4 markup exactly',async()=>{
 assert.equal(createHash('sha256').update(await render('حرفيا')).digest('hex'),'c146acb4f83a316369525cd38f9b3a252b63b94980624e184c4adc8101193a42');
});
