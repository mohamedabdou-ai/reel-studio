// Frozen magazine drawing. Each concept retains its original engine layout and clock.
import React from 'react';
import {Sequence,useCurrentFrame} from 'remotion';
import {DesignText,useDesignText} from '../../../../style-kit/digits';
import {Dressing} from '../../../../motion-concepts/shared';
import {PlainPage, balancedLines, useFormat} from '../../system/page-parts';
import {MagazineScope, MagazineCaption, NAVY, MONO, THIN, SUF_TOP, fitWarning, useMagazine, useType} from '../../system/base';
import {smallNumeralStyle} from '../../system/numerals';
import type {Rect} from '../../../../motion-concepts/geometry';
export const rect = (r:Rect):React.CSSProperties => ({position:'absolute',left:r.x,top:r.y,width:r.width,height:r.height});
export const Paper:React.FC<{rtl:boolean; backdrop?:'canvas'|'none'; sectionIndex?:number; caption?:string; children:React.ReactNode}> = p => <MagazineScope data={{lang:p.rtl?'ar':'en'}}><PaperInner {...p}/></MagazineScope>;
const PaperInner:React.FC<React.ComponentProps<typeof Paper>> = ({backdrop='canvas',sectionIndex=0,caption,children}) => {
  const fmt=useFormat(); const {copy}=useMagazine();
  const page=fmt(sectionIndex+1).padStart(2,fmt(0)),numeral=smallNumeralStyle(page,30);
  return <div data-p3-page="navy" dir={copy.dir} style={{position:'absolute',inset:0,textAlign:copy.align}}>
    {backdrop==='canvas'?<Dressing><Sequence from={-100000} layout="none"><PlainPage th={NAVY}/></Sequence><div style={{position:'absolute',left:65,top:1424,width:788,height:1.5,background:NAVY.gold}}/><div style={{position:'absolute',top:1436,[copy.side]:227,fontFamily:numeral.fontFamily,fontWeight:numeral.fontWeight,fontVariantNumeric:numeral.fontVariantNumeric,fontSize:30,lineHeight:'36px',color:NAVY.gold}}>{page}</div></Dressing>:null}
    {children}{caption?<MagazineCaption y={1310} text={caption} th={NAVY}/>:null}
  </div>;
};
// A frozen part drawing: only the enclosing mechanism changes pose or presence.
// Uses the same exported fit/balancedLines/wid functions as CardPart and ListPart.
export const Text:React.FC<{text:string; box:Rect; size:number; min?:number; lines?:number; weight?:number; color?:string; mono?:boolean; align?:'left'|'right'|'center'; lh?:number; center?:boolean}> = ({text,box,size,min=size,lines=1,weight=400,color=NAVY.ink,mono=false,align,lh=1.2,center=true}) => {
  const {font,copy}=useMagazine(); const {fit,wid}=useType(); const shown=useDesignText()(text),numericFace=smallNumeralStyle(shown);
  const family=mono?numericFace.fontFamily as string:font;
  if(mono)weight=numericFace.fontWeight as number;
  text=shown;
  // Badge numerals use an explicit one-em line box. The generic text helper's
  // 1.3 fallback leading for non-Alexandria faces must not shrink a 40px digit
  // that fits its 44px badge; width still uses the real exported fitter.
  const layout=(s:number)=>{const plan=fit(text,{width:box.width,size:s,min,lines,weight,lh,family});return mono&&lh===1?{...plan,box:Math.round(plan.size)}:plan;};
  let t=layout(size);
  let rows=t.lines.length>1?balancedLines(text,t.size,weight,box.width,family):t.lines;
  while(rows.length*t.box>box.height && t.size>min){t=layout(Math.max(min,t.size-2));rows=t.lines.length>1?balancedLines(text,t.size,weight,box.width,family):t.lines;}
  const ok=t.fits&&rows.length<=lines&&rows.length*t.box<=box.height&&rows.every(s=>wid(s,t.size,weight,family)<=box.width+0.5);
  if(!ok)fitWarning(text,box.width,min,lines);
  return <div data-p3-text={JSON.stringify({text:shown,size:t.size,requestedSize:size,min,height:rows.length*t.box,box,ok,weight,mono:mono&&family===MONO,numeric:mono,family,lineCount:rows.length,color})} style={{...rect(box),overflow:'hidden',display:'flex',flexDirection:'column',justifyContent:center?'center':'flex-start',fontFamily:family,fontSize:t.size,fontWeight:weight,fontVariantNumeric:mono?'tabular-nums':undefined,color,lineHeight:`${t.box}px`,textAlign:align??copy.align,direction:copy.dir}}>{rows.map((s,i)=><div key={i} style={{whiteSpace:'nowrap',flex:'none'}}><bdi dir="auto"><DesignText>{s}</DesignText></bdi></div>)}</div>;
};
export const Frame:React.FC<{box:Rect; active?:boolean; fill?:string; progress?:number}> = ({box,active=false,fill='none',progress=1}) => <svg style={rect(box)} width={box.width} height={box.height}><rect x={1} y={1} width={Math.max(0,box.width-2)} height={Math.max(0,box.height-2)} fill={fill} stroke={active?NAVY.gold:NAVY.hair} strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1-progress}/></svg>;
export const NumberFace:React.FC<{text:string; suffix?:string; box:Rect; size:number; min?:number; color?:string}> = ({text,suffix='',box,size,min=28,color=NAVY.ink}) => {
  const {font,copy}=useMagazine();const {wid}=useType();const shown=useDesignText();text=shown(text);suffix=shown(suffix);
  const small=smallNumeralStyle(text);
  // NumberPart's suffix ratio is inline, not exported. Use exported THIN and
  // SUF_TOP; magazine-concepts-parts.test.mjs compares a real NumberPart render.
  const suffixRatio=.42;
  let s=size;const width=(n:number)=>wid(text,n,n>=72?THIN:(small.fontWeight as number),n>=72?font:(small.fontFamily as string))+(suffix?wid(suffix,n>=72?n*suffixRatio:n,n>=72?THIN:(small.fontWeight as number),n>=72?font:(small.fontFamily as string))+14:0);
  while(s>min&&(width(s)>box.width||s*1.2>box.height))s=Math.max(min,s-2);
  const big=s>=72,ok=width(s)<=box.width&&s*1.2<=box.height;
  if(!ok)fitWarning(text+suffix,box.width,min,1);
  const family=big?font:(small.fontFamily as string),weight=big?THIN:(small.fontWeight as number),suffixSize=big?s*suffixRatio:s;
  return <div data-p3-text={JSON.stringify({text,size:s,min,height:s*1.2,box,ok,weight,mono:!big&&family===MONO,numeric:!big,family})} style={{...rect(box),overflow:'hidden',display:'flex',alignItems:'center',justifyContent:copy.ar?'flex-end':'flex-start',direction:'ltr',fontFamily:family,fontWeight:weight,fontVariantNumeric:'tabular-nums',color,fontSize:s,lineHeight:`${s*1.2}px`}}><div style={{display:'flex',alignItems:'flex-start'}}><bdi dir="ltr" style={{lineHeight:`${suffix&&big?s:s*1.2}px`,marginTop:suffix&&big?-s*.12:0}}>{text}</bdi>{suffix?<span data-p3-suffix={JSON.stringify({size:suffixSize,weight:big?THIN:(small.fontWeight as number),lineHeight:suffixSize,marginTop:big?SUF_TOP*s:0,marginLeft:14,numberSize:s})} style={{fontSize:suffixSize,fontWeight:big?THIN:(small.fontWeight as number),lineHeight:`${suffixSize}px`,color:NAVY.gold,marginTop:big?SUF_TOP*s:0,marginLeft:14}}><DesignText>{suffix}</DesignText></span>:null}</div></div>;
};
export const Geometry:React.FC<{rects:Rect[]}> = ({rects}) => <span data-p3-rects={JSON.stringify(rects)}/>;
export const useFrame=useCurrentFrame;
