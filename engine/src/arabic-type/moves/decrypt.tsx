import {displayDigits} from '../../core/digits.ts';
import React from 'react';
import {MoveCanvas,text,fit} from '../canvas';
import {clamp,hash,progress as P} from '../math';
import type {ArabicMoveProps,DrawMove} from '../types';
export const decryptState=(value:string,t:number)=>{
  const pool='ابتثجحخدذرزسشصضطظعغفقكلمنهوي',a=Array.from(value),tick=Math.floor(t*18);let settled=0;
  const output=a.map((ch,i)=>{
    if(/\s/.test(ch))return ch;
    if(t<.03*i)return '';
    if(t>=.35+.16*i){settled++;return ch;}
    return pool[Math.floor(hash(i,tick)*pool.length)];
  }).join('');
  return {output,ratio:settled/Math.max(1,a.filter(ch=>!/\s/.test(ch)).length),last:.35+.16*(a.length-1)};
};
export const decryptLayout=(ctx:CanvasRenderingContext2D,value:string,font:string,start:number,t:number,floor=1)=>{
  const state=decryptState(value,t);return {...state,size:fit(ctx,state.output,font,start,226,floor)};
};
const draw:DrawMove=(ctx,t,p)=>{
  const state=decryptLayout(ctx,p.text,p.font,p.size,t,p.fitFloor),end=p.durationInFrames/p.fps,exit=P(t,end-.4,.3);
  ctx.globalAlpha=1-exit;ctx.save();ctx.translate(135,250);
  const pulse=p.look?.pulse??.04;if(pulse!==0)ctx.scale(1+pulse*Math.sin(Math.PI*P(t,state.last,.3)),1);
  text(ctx,state.output,0,0,p.font,state.size,t>=state.last?p.accent:p.ink);ctx.restore();
  ctx.fillStyle=p.ink;ctx.globalAlpha=(1-exit)*.25;ctx.fillRect(60,285,150,1.5);ctx.globalAlpha=1-exit;
  ctx.fillStyle=p.accent;ctx.fillRect(210-150*state.ratio,285,150*state.ratio,1.5);
  text(ctx,displayDigits(Math.round(clamp(state.ratio)*100)+'%',p.digits),135,315,p.font,11,p.ink);
};
export const Decrypt:React.FC<ArabicMoveProps>=props=><MoveCanvas {...props} move="decrypt" draw={draw}/>;
