import React from 'react';
import {MoveCanvas,text,fontAt,fit,layout} from '../canvas';
import {clamp,E,hash,lerp,progress as P} from '../math';
import type {ArabicMoveProps,DrawMove} from '../types';
const draw:DrawMove=(ctx,t,p)=>{
  const words=p.text.trim().split(/\s+/),size=fit(ctx,p.text,p.font,45,220,p.fitFloor);
  ctx.font=fontAt(p.font,size);const boxes=layout(ctx,words),by=240;
  const exit=P(t,p.durationInFrames/p.fps-.3,.3);ctx.globalAlpha=1-exit;
  boxes.forEach((b,i)=>{
    const reveal=.9+.7*i,rv=E.expIO(P(t,reveal,.3));text(ctx,b.word,b.center,by,p.font,size,rv>0?p.accent:p.ink);
    const right=lerp(b.right+3,b.left-3,rv),width=(right-b.left+3)*E.expOut(P(t,.06*i,.3));if(width<.5)return;
    ctx.save();ctx.translate(right,by-size*.42);ctx.rotate((hash(i,9)-.5)*(p.look?.barTilt??2)*Math.PI/180);ctx.fillStyle=p.ink;
    const h=size*.62;ctx.beginPath();ctx.moveTo(0,-h/2);
    for(let k=1;k<=6;k++)ctx.lineTo(-width*k/6,-h/2+(hash(i,k)-.5)*(p.look?.barJag??2));
    for(let k=6;k>=0;k--)ctx.lineTo(-width*k/6,h/2+(hash(k,i)-.5)*(p.look?.barJag??2));ctx.closePath();ctx.fill();ctx.restore();
  });
  const start=.9+.7*(words.length-1)+.3+.4;
  if(p.stamp && t>=start){const f=P(t,start,.25),scale=lerp(1.6,1,E.back(f));
    const shake=1.5*Math.sin(2*Math.PI*14*(t-start-.25))*(1-P(t,start+.25,.2))*(t>start+.25?1:0);
    ctx.save();ctx.globalAlpha=(1-exit)*clamp(f*2);ctx.translate(146+shake,325);ctx.rotate(-8*Math.PI/180);ctx.scale(scale,scale);
    ctx.strokeStyle=p.accent;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-38,-20,76,40,8);ctx.stroke();
    ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-34,-16,68,32,6);ctx.stroke();text(ctx,p.stamp,0,9,p.font,fit(ctx,p.stamp,p.font,26,62,p.fitFloor),p.accent);ctx.restore();}
};
export const RedactedStamp:React.FC<ArabicMoveProps>=props=><MoveCanvas {...props} move="redacted-stamp" draw={draw}/>;
