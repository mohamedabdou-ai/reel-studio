import React from 'react';
import {Img} from 'remotion';
import {imageFocusGeometry} from './image-focus';

type Props={
  src?:string;
  sourceWidth:number;
  sourceHeight:number;
  viewportWidth:number;
  viewportHeight:number;
  focusX?:number;
  focusY?:number;
  startScale?:number;
  endScale?:number;
  progress:number;
  fit?:'contain'|'cover';
  children?:React.ReactNode;
};

export const ImageScaleFocus:React.FC<Props>=({src,sourceWidth,sourceHeight,viewportWidth,viewportHeight,focusX=.5,focusY=.5,startScale=1,endScale=1,progress,fit='cover',children})=>{
  const geometry=imageFocusGeometry({source:{width:sourceWidth,height:sourceHeight},viewport:{width:viewportWidth,height:viewportHeight},focus:{x:focusX,y:focusY},startScale,endScale,progress,fit});
  const style:React.CSSProperties={position:'absolute',left:geometry.image.left,top:geometry.image.top,width:geometry.image.width,height:geometry.image.height,maxWidth:'none'};
  return <div style={{position:'relative',width:viewportWidth,height:viewportHeight,overflow:'hidden'}}>{src?<Img src={src} style={style}/>:<div style={style}>{children}</div>}</div>;
};
