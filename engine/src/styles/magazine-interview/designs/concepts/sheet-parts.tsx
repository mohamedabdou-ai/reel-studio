import {smallNumeralStyle} from '../../system/numerals';
import React from 'react';
import {Img, staticFile} from 'remotion';
import {Diamond, MagazineCaption, MagazineScope, NAVY, fitWarning, ramp, useMagazine, useType} from '../../system/base';
import {PlainPage, balancedLines, useFormat} from '../../system/page-parts';
import {useDesignText} from '../../../../style-kit/digits';
import {Dressing, type Rect} from '../../../../motion-concepts/shared';
import {useCurrentFrame} from 'remotion';

export const css = (r:Rect):React.CSSProperties => ({position:'absolute',left:r.x,top:r.y,width:r.width,height:r.height});
const numericCopy=(text:string)=>/[0-9٠-٩۰-۹]/u.test(text)&&/^[\s0-9٠-٩۰-۹%٪.,٫٬/+−→-]+$/u.test(text);

/** Only furniture is dressed; the mechanism stays visible to the safety probe. */
export const Sheet:React.FC<{rtl:boolean; backdrop?:'canvas'|'none'; caption?:string; sectionIndex?:number; children:React.ReactNode}> = ({rtl,backdrop='canvas',caption,sectionIndex=0,children}) =>
  <MagazineScope data={{lang:rtl?'ar':'en'}}><Furniture backdrop={backdrop} sectionIndex={sectionIndex}/>{children}{caption?<MagazineCaption y={1310} text={caption} th={NAVY}/>:null}</MagazineScope>;
const Furniture:React.FC<{backdrop:string;sectionIndex:number}> = ({backdrop,sectionIndex}) => {
  const f=useCurrentFrame(), format=useFormat(), {copy}=useMagazine();
  const page=format(sectionIndex+1,0,false).padStart(2,format(0,0,false)),pageStyle=smallNumeralStyle(page,30);
  if(backdrop!=='canvas')return null;
  return <Dressing><PlainPage th={NAVY}/>
    <div style={{position:'absolute',top:1424,left:65,width:788*ramp(f,14,24),height:1.5,background:NAVY.gold,opacity:.8}}/>
    <div data-p5-folio={page} style={{position:'absolute',top:1436,[copy.side]:227,fontFamily:pageStyle.fontFamily,fontWeight:pageStyle.fontWeight,fontVariantNumeric:pageStyle.fontVariantNumeric,fontSize:30,lineHeight:'34px',color:NAVY.gold,opacity:ramp(f,8,18),direction:'ltr'}}>{page}</div>
  </Dressing>;
};

/** Non-throwing, balanced type that always clips to its own measured box. */
export const Text:React.FC<{text:string; box:Rect; size?:number; min?:number; lines?:number; weight?:number; color?:string; align?:'left'|'right'|'center'; mono?:boolean; style?:React.CSSProperties}> =
({text,box,size=40,min=34,lines=2,weight=400,color=NAVY.ink,align,mono,style}) => {
  const {font,copy}=useMagazine(), {fit,wid}=useType();
  const shown=useDesignText(),numeric=mono||numericCopy(text);
  if(numeric)text=shown(text);
  const numberStyle=numeric?smallNumeralStyle(text,size):null;
  const family=numberStyle?.fontFamily??font;
  if(numeric){weight=numberStyle!.fontWeight as number;if(size<72){size=40;min=28;}}
  const lh=numeric?1.2:1.24;
  const fitted=(ceiling:number)=>{
    const result=fit(text,{width:box.width,size:ceiling,min,lines,weight,lh,family});
    // A numeral gets a 1.2 em line box: 40 px fits the approved 48 px chip.
    // Magazine fit otherwise applies a 1.3 em fallback to every non-Alexandria face.
    return numeric?{...result,box:Math.round(result.size*lh)}:result;
  };
  let t=fitted(size);
  while(t.lines.length*t.box>box.height && t.size>min){
    t=fitted(Math.max(min,t.size-2));
  }
  const balanced=balancedLines(text,t.size,weight,box.width,family);
  const rows=balanced.length<=lines?balanced:t.lines;
  const clipped=rows.length*t.box>box.height || rows.some(l=>wid(l,t.size,weight,family)>box.width+.5);
  if(clipped)fitWarning(text,box.width,min,lines);
  return <div data-p5-text={text} data-size={t.size} data-floor={min} data-lines={rows.length} data-line-height={t.box} data-fit={t.fits&&!clipped?'fit':'clip'} data-box={JSON.stringify(box)} data-numeral-face={numeric?(/[٠-٩۰-۹]/u.test(text)?'arabic-indic':'latin'):null} data-requested-size={numeric?size:null}
    style={{...css(box),overflow:'hidden',display:'flex',flexDirection:'column',justifyContent:'center',fontFamily:family,fontSize:t.size,fontWeight:weight,...(numeric?{fontVariantNumeric:'tabular-nums'}:{}),lineHeight:`${t.box}px`,color,direction:copy.dir,textAlign:align??copy.align,...style}}>
    {rows.map((l,i)=><div key={i} style={{whiteSpace:'nowrap',flexShrink:0}}><bdi dir="auto">{l}</bdi></div>)}
  </div>;
};
export const Icon:React.FC<{src?:string;name:string;box:Rect;opacity?:number;size?:number}> = ({src,name,box,opacity=1,size}) => {
  const shown=useDesignText(),initial=shown(Array.from(name)[0]?.toUpperCase()??''),numeric=numericCopy(initial);
  return <div style={{...css(box),boxSizing:'border-box',border:`2px solid ${NAVY.hair}`,background:NAVY.ground,overflow:'hidden',opacity}}>
    {src?<Img src={staticFile(src)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<Text text={initial} box={{x:0,y:0,width:box.width-4,height:box.height-4}} size={size??(numeric?40:Math.max(34,Math.round(box.width*.48)))} min={28} lines={1} mono={numeric} weight={numeric?500:800} color={NAVY.gold} align="center"/>}
  </div>;
};
export const Cursor:React.FC<{x:number;y:number;opacity:number;scale?:number}> = ({x,y,opacity,scale=1}) => <svg width={52} height={64} viewBox="0 0 52 64" style={{position:'absolute',left:x,top:y,opacity,transform:`scale(${scale})`,transformOrigin:'0 0',overflow:'visible'}}><path d="M0 0 L0 46 L12 35 L21 56 L30 52 L21 32 L38 32 Z" fill={NAVY.ink} stroke={NAVY.ground} strokeWidth={2} strokeLinejoin="miter"/></svg>;
export const Rects:React.FC<{rects:readonly Rect[];params:unknown}> = ({rects,params}) => <div data-mechanism-rects={JSON.stringify(rects)} data-mechanism-params={JSON.stringify(params)} style={{display:'none'}}/>;
export {Diamond};
