import React from 'react';
import {MoveCanvas,raster,blobs,drawBlob,fontAt,layout,type InkBlob} from '../canvas';
import {rubaaFix} from '../../arabic/index.ts';
import {clamp,E,lerp,progress as P} from '../math';
import type {ArabicMoveProps,DrawMove} from '../types';
export const penText=(value:string,font:string):string=>/Aref Ruqaa/.test(font)?value.split(/\s+/).map(rubaaFix).join(' '):value;
const draw:DrawMove=(ctx,t,p)=>{
  const value=penText(p.text,p.font),r=raster(value,p.font,p.size),all=blobs(r,p.ink),accent=blobs(r,p.accent);
  const bodies=all.filter(b=>b.kind==='body').sort((a,b)=>b.x+b.w-a.x-a.w),marks=all.filter(b=>b.kind==='dot');
  const by=258,k=r.k,TN=Math.tan(20*Math.PI/180),exit=E.cubIn(P(t,p.durationInFrames/p.fps-.8,.45));ctx.globalAlpha=1-exit;ctx.translate(0,-7.5*exit);
  r.ctx.font=fontAt(p.font,p.size*k);const words=layout(r.ctx,value.split(' '),r.width/2),key=words[words.length-1];
  const assigned=new Map<InkBlob,InkBlob[]>();
  marks.forEach(m=>{let best=bodies[0],score=-Infinity;for(const b of bodies){const overlap=Math.min(b.x+b.w,m.x+m.w)-Math.max(b.x,m.x);if(overlap>score){score=overlap;best=b;}}
    if(score<=0)best=bodies.reduce((a,b)=>Math.abs(a.cx-m.cx)<Math.abs(b.cx-m.cx)?a:b,best);
    if(best)assigned.set(best,[...(assigned.get(best)??[]),m]);});
  let at=.25;const schedule=bodies.map(b=>{const duration=.09*Math.max(1,Math.round(b.w/(.4*p.size*k))),start=at;at+=duration+.06;return {b,start,duration,end:start+duration};});
  const geo=(b:InkBlob)=>({x0:135+(b.x-r.width/2)/k,x1:135+(b.x+b.w-r.width/2)/k,y0:by+(b.y-r.baseline)/k,y1:by+(b.y+b.h-r.baseline)/k,my:by+(b.cy-r.baseline)/k,h:b.h/k});
  let pen:{x:number;y:number}|null=null;
  schedule.forEach(({b,start,duration,end},i)=>{
    if(t<start)return;const g=geo(b),q=E.sinIO(P(t,start,duration)),edge=lerp(g.x1+g.h/2*TN,g.x0-g.h/2*TN,q),edgeAt=(y:number)=>edge+(g.my-y)*TN;
    const ac=b.cx>=key.left&&b.cx<=key.right?E.cubOut(P(t,end+.25,.3)):0;
    const clip=(width?:number)=>{ctx.beginPath();ctx.moveTo(edgeAt(g.y0-3),g.y0-3);ctx.lineTo(width===undefined?g.x1+6:edgeAt(g.y0-3)+width,g.y0-3);
      ctx.lineTo(width===undefined?g.x1+6:edgeAt(g.y1+3)+width,g.y1+3);ctx.lineTo(edgeAt(g.y1+3),g.y1+3);ctx.closePath();ctx.clip();};
    ctx.save();clip();drawBlob(ctx,r,b,135,by,{alpha:1-ac});if(ac>0)drawBlob(ctx,r,accent[b.id],135,by,{alpha:ac});ctx.restore();
    const wet=q<1?.6:.6*(1-P(t,end,.35));if(wet>0){ctx.save();clip(Math.max(5,b.w/k*.14));drawBlob(ctx,r,accent[b.id],135,by,{alpha:wet});ctx.restore();}
    if(t>=start&&t<=end)pen={x:edgeAt(g.my),y:g.my};
    const next=schedule[i+1];if(!pen&&next&&t>end&&t<next.start){const ng=geo(next.b),u=(t-end)/.06;pen={x:lerp(edgeAt(g.my),ng.x1+ng.h/2*TN,u),y:lerp(g.my,ng.my,u)-6.5*Math.sin(Math.PI*u)};}
    (assigned.get(b)??[]).sort((a,c)=>c.cx-a.cx).forEach((m,j)=>{const tm=end+.04+.05*j;if(t<tm)return;const f=E.cubOut(P(t,tm,.12)),scale=1.4-.4*f;
      drawBlob(ctx,r,m,135,by,{alpha:clamp(2*f)*(1-ac),sx:scale,sy:scale});if(ac>0)drawBlob(ctx,r,accent[m.id],135,by,{alpha:clamp(2*f)*ac,sx:scale,sy:scale});});
  });
  if(pen&&t<at+.04){const nib=pen as {x:number;y:number};ctx.save();ctx.translate(nib.x,nib.y);if(p.look?.nibShadow!==false)ctx.rotate(20*Math.PI/180);ctx.fillStyle=p.accent;if(p.look?.nibShadow!==false){ctx.shadowColor='#00000040';ctx.shadowBlur=3;}ctx.fillRect(-1.6,-6,3.2,12);ctx.restore();}
};
export const PenWrite:React.FC<ArabicMoveProps>=props=><MoveCanvas {...props} move="pen-write" draw={draw}/>;
