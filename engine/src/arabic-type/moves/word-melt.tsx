import React from 'react';
import {MoveCanvas,text,context,fit,fontAt} from '../canvas';
import {clamp,E,lerp,progress as P} from '../math';
import type {ArabicMoveProps,DrawMove} from '../types';
const rgb=(s:string)=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
const layers=new Map<string,HTMLCanvasElement>();
const draw:DrawMove=(ctx,t,p)=>{
  const to=p.to!,size=Math.min(fit(ctx,p.text,p.font,80,220,p.fitFloor),fit(ctx,to,p.font,80,220,p.fitFloor));
  const end=p.durationInFrames/p.fps,returnAt=Math.max(2.9,end-1.3);
  const k=t<1?0:t<1.8?E.sinIO(P(t,1,.8)):t<returnAt?1:1-E.sinIO(P(t,returnAt,.8));
  if(k===0||k===1){text(ctx,k===0?p.text:to,135,262,p.font,size,k===0?p.ink:p.accent);return;}
  const key=p.text+'|'+to+'|'+p.font;let canvas=layers.get(key);
  if(!canvas){canvas=document.createElement('canvas');canvas.width=1080;canvas.height=800;if(layers.size>=32)layers.clear();layers.set(key,canvas);}
  const c=context(canvas),S=size*4;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,1080,800);
  c.font=fontAt(p.font,S);c.direction='rtl';c.textAlign='center';c.fillStyle='#000000';c.textBaseline='alphabetic';
  c.filter='blur('+(.13*S*k**1.3)+'px)';c.globalAlpha=(1-k)**.4;c.fillText(p.text,540,408);
  c.filter='blur('+(.13*S*(1-k)**1.3)+'px)';c.globalAlpha=k**.4;c.fillText(to,540,408);c.filter='none';c.globalAlpha=1;
  const image=c.getImageData(0,0,1080,800),a=rgb(p.ink),b=rgb(p.accent);
  for(let i=0;i<image.data.length;i+=4){let alpha=clamp((image.data[i+3]/255-.42)/.16);alpha=alpha*alpha*(3-2*alpha);
    for(let j=0;j<3;j++)image.data[i+j]=lerp(a[j],b[j],k);image.data[i+3]=alpha*255;}
  c.putImageData(image,0,0);ctx.drawImage(canvas,0,160,270,200);
};
export const WordMelt:React.FC<ArabicMoveProps>=props=><MoveCanvas {...props} move="word-melt" draw={draw}/>;
