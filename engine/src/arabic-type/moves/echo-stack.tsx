import React from 'react';
import {MoveCanvas,text,fit,fontAt,context} from '../canvas';
import {E,lerp,progress as P} from '../math';
import type {ArabicMoveProps,CanvasEnvironment,DrawMove} from '../types';

const rowOrder=[-3,3,-2,2,-1,1,0] as const;
const layers=new WeakMap<CanvasRenderingContext2D,{canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D}>();
const layerFor=(main:CanvasRenderingContext2D)=>{
  let layer=layers.get(main);
  if(!layer){
    const canvas=document.createElement('canvas');
    layer={canvas,ctx:context(canvas)};layers.set(main,layer);
  }
  if(layer.canvas.width!==main.canvas.width)layer.canvas.width=main.canvas.width;
  if(layer.canvas.height!==main.canvas.height)layer.canvas.height=main.canvas.height;
  return layer;
};
const filledRows=(main:CanvasRenderingContext2D,t:number,p:CanvasEnvironment,size:number,gap:number,yc:number,fold:number,drift:number)=>{
  const {canvas,ctx}=layerFor(main),transform=main.getTransform();
  ctx.font=fontAt(p.font,size);ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='alphabetic';
  const metrics=ctx.measureText(p.text),ascent=Math.max(0,metrics.actualBoundingBoxAscent),descent=Math.max(0,metrics.actualBoundingBoxDescent);
  for(const row of rowOrder){
    const d=Math.abs(row),f=E.expOut(P(t,.05*d,.45));
    const base=lerp(yc+row*gap,yc,fold)+drift*(1-fold);
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.setTransform(transform);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.beginPath();ctx.rect(0,base-ascent-1,270,ascent+descent+2);ctx.clip();
    text(ctx,p.text,135,base+1.2*size*(1-f),p.font,size,row===0?p.accent:p.ink);ctx.restore();
    // The scratch is a full-size pixel layer; composite at identity to avoid
    // applying the logical-canvas transform twice. Restore the caller's state.
    main.save();main.setTransform(1,0,0,1,0,0);
    main.globalCompositeOperation='destination-out';main.globalAlpha=1;main.drawImage(canvas,0,0);
    main.globalCompositeOperation='source-over';
    main.globalAlpha=((1-fold)*(row===0?1:Math.max(0,1-.13*d*1.6))+(row===0?fold:0))*(row===0?1:.3);
    main.drawImage(canvas,0,0);main.restore();
  }
};
const draw:DrawMove=(ctx,t,p)=>{
  const size=fit(ctx,p.text,p.font,Math.min(p.size,42),148,p.fitFloor),gap=.82*size,yc=245-.3*size;
  const fold=E.expIn(P(t,p.durationInFrames/p.fps-.7,.4));
  const drift=-Math.min(18,10*Math.max(0,t-.5));
  if(p.look?.echoFill===true){filledRows(ctx,t,p,size,gap,yc,fold,drift);return;}
  for(let row=-3;row<=3;row++){
    const d=Math.abs(row),f=E.expOut(P(t,.05*d,.45));
    const base=lerp(yc+row*gap,yc,fold)+drift*(1-fold);
    ctx.save();ctx.beginPath();ctx.rect(0,base-1.15*size,270,1.5*size);ctx.clip();
    ctx.globalAlpha=(1-fold)*(row===0?1:Math.max(0,1-.13*d*1.6))+(row===0?fold:0);
    text(ctx,p.text,135,base+1.2*size*(1-f),p.font,size,row===0?p.accent:p.ink,row!==0);ctx.restore();
  }
};
export const EchoStack:React.FC<ArabicMoveProps>=props=><MoveCanvas {...props} move="echo-stack" draw={draw}/>;
