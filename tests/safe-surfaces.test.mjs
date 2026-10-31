import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleEngine,setSsrFrame} from './helpers/engine-bundle.mjs';
import {classifyHeadFrame,probeDiffInRect} from '../scripts/lib/head-envelope.mjs';

const api=await bundleEngine(`
 import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import*as Safe from'./engine/src/core/safe';
 import{PresenterBand}from'./engine/src/styles/magazine-interview/designs/presenter';
 import{MagazineScope,Ground,NAVY,CREAM}from'./engine/src/styles/magazine-interview/system/base';
 const Surface=Safe.DesignSurface??'div';
 export const surface=(contentOnly,probe='#00FF00',image=false)=>renderToStaticMarkup(<Safe.SafeRoot probe={probe} probeSurfaces={!contentOnly}><Surface style={{position:'absolute',left:0,top:900,width:1080,height:180,background:'rgba(8,19,33,0.8)',...(image?{backgroundImage:'url(logo.svg)'}:{}),color:'white',border:'1px solid gold'}}><span style={{position:'absolute',left:30}}>WORD</span><img src="logo.svg"/></Surface></Safe.SafeRoot>);
 export const band=contentOnly=>renderToStaticMarkup(<Safe.SafeRoot probe="#00FF00" probeSurfaces={!contentOnly}><MagazineScope data={{lang:'ar'}}><PresenterBand top={900} bottom={1080} headBox={{x:300,y:300,width:300,height:400}}/></MagazineScope></Safe.SafeRoot>);
 export const ground=(cream,contentOnly)=>renderToStaticMarkup(<Safe.SafeRoot probe="#00FF00" probeSurfaces={!contentOnly}><Ground th={cream?CREAM:NAVY}/></Safe.SafeRoot>);
`,{ssr:true,media:true});
setSsrFrame(120);
test('safe content probe neutralizes a surface fill without hiding its text or border',()=>{
 const html=api.surface(true);
 assert.doesNotMatch(html,/background:rgba\(8,19,33,0.8\)/);
 assert.match(html,/left:30px/);assert.match(html,/>WORD</);assert.match(html,/border:1px solid gold/);
 assert.match(api.surface(false),/background:rgba\(8,19,33,0.8\)/,'default head probe keeps the real fill');
});
test('PresenterBand stays visible to head probes while its fill is ignored by safe content probes',()=>{
 assert.match(api.band(false),/background:linear-gradient/);
 assert.doesNotMatch(api.band(true),/background:linear-gradient/);
});
test('navy and cream page grounds keep the same probe contract',()=>{
 for(const cream of [false,true])assert.equal(api.ground(cream,true),api.ground(cream,false));
});
test('surface opt-in does not change a normal non-probe picture',()=>{
 assert.match(api.surface(true,null),/background:rgba\(8,19,33,0.8\)/);
});
test('media children and URL backgrounds cannot be erased by a surface annotation',()=>{
 const html=api.surface(true,'#00FF00',true);
 assert.match(html,/<img src="logo.svg"/);
 assert.match(html,/background-image:url\(logo.svg\)/);
});

const W=1080,H=1920;
// Deterministic raster fixture: the same opaque bitmap WORD is composited over
// a translucent edge-to-edge band for both probe colours. No images or renders.
function raster(left,fill){
 const probes=[[0,255,0],[255,0,255]];
 const glyphs=['10001/10001/10001/10101/10101/11011/10001','01110/10001/10001/10001/10001/10001/01110','11110/10001/10001/11110/10100/10010/10001','11110/10001/10001/10001/10001/10001/11110'];
 return probes.map(probe=>{
  const b=Buffer.alloc(W*H*3);for(let p=0;p<b.length;p+=3){b[p]=probe[0];b[p+1]=probe[1];b[p+2]=probe[2];}
  if(fill)for(let y=900;y<1080;y++)for(let x=0;x<W;x++)for(let c=0;c<3;c++)b[(y*W+x)*3+c]=Math.round([8,19,33][c]*.8+probe[c]*.2);
  glyphs.forEach((g,i)=>g.split('/').forEach((row,y)=>[...row].forEach((pixel,x)=>{if(pixel==='1')for(let a=0;a<8;a++)for(let d=0;d<8;d++){const p=((950+y*8+a)*W+left+i*48+x*8+d)*3;b[p]=b[p+1]=b[p+2]=255;}})));
  return b;
 });
}
for(const left of [80,30])test(`surface-aware safe analysis ${left===80?'passes inset text':'refuses margin text'} and notes the band`,async()=>{
 const {analyseSafeFrame}=await import('../scripts/lib/safe-probe.mjs');
 const [allA,allB]=raster(left,true),[contentA,contentB]=raster(left,false);
 const r=analyseSafeFrame({allA,allB,contentA,contentB},{width:W,height:H,scale:1,minAlpha:.35,minArea:400});
 assert.equal(r.violations['ig-reels-organic'].length>0,left===30);
 assert.ok(r.surfaces['ig-reels-organic'].some(s=>s.zone==='LEFT'&&s.areaPx2>10000));
 assert.ok(r.surfaces['ig-reels-organic'].some(s=>s.zone==='RIGHT'&&s.areaPx2>10000));
 assert.equal(r.contractFailure,null);
});
test('head analysis still reports a band crossing the head',async()=>{
 const {analyseProbePair}=await import('../scripts/lib/safe-probe.mjs');
 const [a,b]=raster(80,true),r=analyseProbePair(a,b,{width:W,height:H,scale:1,minAlpha:.1});
 assert.ok(r.blobs.some(b=>b.bbox.y<=950&&b.bbox.y+b.bbox.h>=1050));
 const head={x:300,y:950,width:300,height:100},paint=probeDiffInRect(a,b,W,H,head,{scale:1,minAlpha:.1});
 assert.equal(paint.paintedPx2,30000);
 const result=classifyHeadFrame({visible:true,box:head,headRect:head,paintedPx2:paint.paintedPx2,minAreaPx2:16});
 assert.equal(result.status,'FAIL');assert.equal(result.reason,'graphic-in-head');
});
test('unmarked opaque content still fails the probe contract',async()=>{
 const {analyseSafeFrame}=await import('../scripts/lib/safe-probe.mjs');
 const white=new Uint8Array(12*12*3).fill(255);
 const r=analyseSafeFrame({allA:white,allB:white,contentA:white,contentB:white},{width:12,height:12,scale:1});
 assert.match(r.contractFailure,/identical/);
});
