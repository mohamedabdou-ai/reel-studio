import {fontsReady,LOADED_FAMILIES} from '../core/fonts';
import {awaitTypeFont} from './font-ready';
import {rasterLine,segmentBlobs,type Blob} from '../arabic/index.ts';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {continueRender,delayRender,cancelRender} from 'remotion';
import {useProbe} from '../core/safe';
import type {ArabicMoveProps,CanvasEnvironment,DrawMove} from './types';
import {designWarning} from '../style-kit/design-safety';

export const fontAt=(family:string,size:number)=>`${/Aref|Amiri/.test(family)?700:900} ${size}px "${family}", "Cairo"`;
export const context=(canvas:HTMLCanvasElement)=>{
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Arabic type needs a Canvas 2D context');return ctx;
};
/** Measurement never happens until the selected face has loaded. No network font URLs are used. */
export function useTypeFonts(font:string,text:string):boolean {
  const [ready,setReady]=useState(false);
  const [handle]=useState(()=>typeof document!=='undefined'&&document.fonts?delayRender('Arabic type font'):null);
  useEffect(()=>{
    if(!document.fonts){setReady(true);return;}
    let active=true,released=false;
    const release=()=>{if(!released&&handle!==null){released=true;continueRender(handle);}};
    const selected=LOADED_FAMILIES.includes(font)?font:'Cairo';
    awaitTypeFont(fontAt(selected,64),text,{studioReady:fontsReady,
      nextFrame:()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())),
      load:(css,value)=>document.fonts.load(css,value),check:(css,value)=>document.fonts.check(css,value),
    }).then(()=>{if(active)setReady(true);release();}).catch(error=>{release();if(active)cancelRender(error);});
    return ()=>{active=false;release();};
  },[font,text,handle]);
  return ready;
}
export function fit(ctx:CanvasRenderingContext2D,text:string,font:string,start=64,max=226,floor=1):number {
  floor=Number.isFinite(floor)?Math.max(1,floor):1;
  let size=Math.max(floor,start);ctx.font=fontAt(font,size);
  while(size>floor&&ctx.measureText(text).width>max){size=Math.max(floor,size-1);ctx.font=fontAt(font,size);}
  if(size===floor&&(start>floor||ctx.measureText(text).width>max))designWarning('arabic-type',{text,font,size,width:max,floor});
  return size;
}
export function text(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,font:string,size:number,color:string,stroke=false):void {
  ctx.font=fontAt(font,size);ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='alphabetic';
  if(stroke){ctx.strokeStyle=color;ctx.lineWidth=.75;ctx.strokeText(value,x,y);}else{ctx.fillStyle=color;ctx.fillText(value,x,y);}
}
export function layout(ctx:CanvasRenderingContext2D,words:string[],cx=135){
  const space=ctx.measureText(' ').width,widths=words.map(w=>ctx.measureText(w).width);
  let x=cx+(widths.reduce((a,b)=>a+b,0)+space*(words.length-1))/2;
  return words.map((word,i)=>{const right=x;x-=widths[i];const box={word,left:x,right,center:(x+right)/2,width:widths[i]};x-=space;return box;});
}
export interface Raster {canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;width:number;height:number;baseline:number;size:number;k:number}
const rasters=new Map<string,Raster>();
export function raster(textValue:string,font:string,size:number,k=4):Raster {
  const key=JSON.stringify([textValue,font,size,k]);const found=rasters.get(key);if(found)return found;
  const scratch=document.createElement('canvas'),measurer=context(scratch);
  const line=rasterLine(measurer,textValue,fontAt(font,size*k),size*k);
  const canvas=line.canvas as HTMLCanvasElement,ctx=context(canvas);
  const result={canvas,ctx,width:line.width,height:line.height,baseline:line.baseline,size,k};
  // Bounded per-browser cache, shared by frames, never keyed by the current frame.
  if(rasters.size>=64)rasters.delete(rasters.keys().next().value!);rasters.set(key,result);return result;
}
const tintCache=new WeakMap<Raster,Map<string,HTMLCanvasElement>>();
export function tint(r:Raster,color:string):HTMLCanvasElement {
  let colors=tintCache.get(r);if(!colors){colors=new Map();tintCache.set(r,colors);}const cached=colors.get(color);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;
  const ctx=context(canvas);ctx.drawImage(r.canvas,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,r.width,r.height);colors.set(color,canvas);return canvas;
}
export const MoveCanvas:React.FC<ArabicMoveProps & {move:string;draw:DrawMove}>=(props)=>{
  const ref=useRef<HTMLCanvasElement>(null),ready=useTypeFonts(props.font,props.text+(props.to??'')),probe=useProbe();
  useLayoutEffect(()=>{
    if(!ready||!ref.current)return;
    const ctx=context(ref.current);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,props.width,props.height);
    ctx.setTransform(props.width/270,0,0,props.height/480,0,0);ctx.save();
    const size=fit(ctx,props.text,props.font,64,226,props.fitFloor);
    const env:CanvasEnvironment={...props,size,ink:props.ink??'#F5F2E8',probe:!!probe};
    // A resting real-text probe includes meaningful ink; decorations are skipped by each draw function.
    if(probe){
      text(ctx,props.text,135,255,props.font,size,env.ink);
      if(props.to)text(ctx,props.to,135,255,props.font,fit(ctx,props.to,props.font,64,226,props.fitFloor),env.ink);
      if(props.stamp)text(ctx,props.stamp,146,325,props.font,fit(ctx,props.stamp,props.font,26,62,props.fitFloor),env.ink);
    }
    else props.draw(ctx,props.frame/props.fps,env);
    ctx.restore();
  },[ready,props,probe]);
  return React.createElement('canvas',{ref,width:props.width,height:props.height,'aria-label':props.text,
    'data-arabic-move':props.move,'data-arabic-font':props.font,style:{position:'absolute',inset:0,width:'100%',height:'100%'}});
};

export interface InkBlob extends Blob {sprite:HTMLCanvasElement;id:number;cx:number;cy:number}
const blobCache=new WeakMap<Raster,Map<string,InkBlob[]>>();
export function blobs(r:Raster,color:string):InkBlob[]{
  let colors=blobCache.get(r);if(!colors){colors=new Map();blobCache.set(r,colors);}const old=colors.get(color);if(old)return old;
  const parts=segmentBlobs(r.ctx.getImageData(0,0,r.width,r.height),r.size*r.k).map((blob,id)=>{
    const sprite=document.createElement('canvas');sprite.width=blob.w;sprite.height=blob.h;const c=context(sprite);
    const pixels=c.createImageData(blob.w,blob.h);pixels.data.set(blob.mask.data);c.putImageData(pixels,0,0);
    c.globalCompositeOperation='source-in';c.fillStyle=color;c.fillRect(0,0,blob.w,blob.h);
    return {...blob,sprite,id,cx:blob.x+blob.w/2,cy:blob.y+blob.h/2};
  });colors.set(color,parts);return parts;
}
export function drawBlob(ctx:CanvasRenderingContext2D,r:Raster,b:InkBlob,x=135,baseline=255,o:{alpha?:number;dx?:number;dy?:number;rotate?:number;sx?:number;sy?:number}={}):void{
  const w=b.w/r.k,h=b.h/r.k;
  ctx.save();ctx.globalAlpha*=o.alpha??1;ctx.translate(x+(b.cx-r.width/2)/r.k+(o.dx??0),baseline+(b.cy-r.baseline)/r.k+(o.dy??0));
  ctx.rotate(o.rotate??0);ctx.scale(o.sx??1,o.sy??1);ctx.drawImage(b.sprite,-w/2,-h/2,w,h);ctx.restore();
}
export function thickest(r:Raster):{x:number;y:number}{
  const w=r.width,h=r.height,pixels=r.ctx.getImageData(0,0,w,h).data,d=new Float32Array(w*h);
  for(let i=0;i<w*h;i++)d[i]=pixels[i*4+3]>127?1e9:0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!d[i])continue;let v=d[i];
    if(x>0)v=Math.min(v,d[i-1]+1);if(y>0){v=Math.min(v,d[i-w]+1);if(x>0)v=Math.min(v,d[i-w-1]+1.414);if(x<w-1)v=Math.min(v,d[i-w+1]+1.414);}d[i]=v;}
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(!d[i])continue;let v=d[i];
    if(x<w-1)v=Math.min(v,d[i+1]+1);if(y<h-1){v=Math.min(v,d[i+w]+1);if(x<w-1)v=Math.min(v,d[i+w+1]+1.414);if(x>0)v=Math.min(v,d[i+w-1]+1.414);}d[i]=v;}
  let at=0,best=-1;for(let i=0;i<d.length;i++)if(d[i]<1e9&&d[i]>best){best=d[i];at=i;}return {x:at%w,y:Math.floor(at/w)};
}
