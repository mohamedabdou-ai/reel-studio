import React from 'react';
import {MoveCanvas,text,fontAt,layout,fit} from '../canvas';
import {E,progress as P} from '../math';
import type {ArabicMoveProps,DrawMove} from '../types';
const draw:DrawMove=(ctx,t,p)=>{
  const words=p.text.trim().split(/\s+/),size=fit(ctx,p.text,p.font,42,180,p.fitFloor);ctx.font=fontAt(p.font,size);const boxes=layout(ctx,words);
  const exit=P(t,p.durationInFrames/p.fps-.4,.4);
  boxes.forEach((b,i)=>{const f=E.cubOut(P(t,.22*i,.75));if(f<=0)return;ctx.save();ctx.globalAlpha=f*(1-exit);
    ctx.filter='blur('+(6.5*(1-f))+'px)';ctx.translate(b.center,255+10*(1-f));const scale=1.25-.25*f;ctx.scale(scale,scale);
    text(ctx,b.word,0,0,p.font,size,i===words.length-1?p.accent:p.ink);ctx.restore();});
};
export const Unblur:React.FC<ArabicMoveProps>=props=><MoveCanvas {...props} move="unblur" draw={draw}/>;
