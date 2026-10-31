import React from 'react';
import {Easing, Img, staticFile, useCurrentFrame, Sequence} from 'remotion';
import {Diamond, clamp01, ramp, useMagazine} from '../base';
import {SceneClip} from '../../../../core/clip';
import {Footage} from '../../../../core/plate';
import {mediaAspect} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const settle = Easing.bezier(0.2, 0.7, 0.2, 1);

/** The existing image plate's exact double frame and rise, reused only by adapter sources. */
const AdapterPlate:React.FC<{x:number;top:number;width:number;height:number;f:number;at:number;th:MagazinePartProps<any>['th'];index:number|string;children?:React.ReactNode}>=({x,top,width:w,height:h,f,at,th,index,children})=>{
  const frameP=ramp(f,at,30);
  return <div data-adapter-plate={index} style={{position:'absolute',left:x,top,width:w,height:h,...rise(f,at,24)}}>
    <div style={{position:'absolute',inset:14,overflow:'hidden'}}>{children}</div>
    <svg width={w} height={h} style={{position:'absolute',inset:0,overflow:'visible'}}>
      <rect x={0.75} y={0.75} width={w-1.5} height={h-1.5} fill="none" stroke={th.gold} strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1-frameP}/>
      <rect x={7} y={7} width={w-14} height={h-14} fill="none" stroke={th.hair} strokeWidth={1} opacity={frameP}/>
    </svg>
  </div>;
};

const AdapterCaption:React.FC<{part:any;box:Box;x:number;width:number;top:number;at:number;th:MagazinePartProps<any>['th']}>=({part,box,x,width,top,at,th})=>{
  const f=useCurrentFrame(),{copy,font}=useMagazine();
  return part.caption?<div style={{position:'absolute',top,[copy.side]:copy.ar?box.width-x-width:x,width,display:'flex',alignItems:'center',gap:22,direction:copy.dir,...rise(f,at+18,16)}}>
    <Diamond size={12} color={th.gold}/><span style={{fontFamily:font,fontWeight:500,fontSize:38,lineHeight:'48px',color:th.dim,whiteSpace:'nowrap'}}>{part.caption}</span>
  </div>:null;
};

const PairMedia:React.FC<MagazinePartProps<any>>=({part,box,at,th,mediaCenterY})=>{
  const f=useCurrentFrame(),{copy,font}=useMagazine(),ratio=mediaAspect(part);
  const available=Math.max(0,box.height-(part.caption?64:0)-24);
  const w=Math.min(Math.max(0,(box.width-28)/2),available/ratio),h=w*ratio,rowWidth=w*2+28;
  const rowX=ratio>1?(box.width-rowWidth)/2:copy.ar?box.width-rowWidth:0;
  const top=mediaCenterY===undefined?0:mediaCenterY-(h+(part.caption?88:0))/2;
  return <Frame box={box}>
    {part.source.images.map((image:any,i:number)=>{
      const x=rowX+(copy.ar?1-i:i)*(w+28);
      return <AdapterPlate key={i} index={i} x={x} top={top} width={w} height={h} f={f} at={at+i*8} th={th}>
        <Img src={staticFile(image.src)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
        <div style={{position:'absolute',top:18,[i===0?copy.opposite:copy.side]:18,padding:'4px 16px',background:th.ground,color:th.gold,fontFamily:font,fontWeight:700,fontSize:32,direction:copy.dir,opacity:i===0?0.4:1}}>{image.label}</div>
      </AdapterPlate>;
    })}
    <AdapterCaption part={part} box={box} x={rowX} width={rowWidth} top={top+h+24} at={at} th={th}/>
  </Frame>;
};

const SequenceMedia:React.FC<MagazinePartProps<any>>=({part,box,at,th,fps,mediaCenterY})=>{
  const f=useCurrentFrame(),{copy,font}=useMagazine(),steps=part.source.steps;
  const plateFor=(step:any)=>{
    const ratio=mediaAspect(part,step?.clip),gap=step?.clip&&!part.caption?0:24;
    const available=Math.max(0,box.height-(part.caption?64:0)-gap);
    const w=Math.min(box.width,available/ratio),h=w*ratio,x=ratio>1?(box.width-w)/2:copy.ar?box.width-w:0;
    const top=mediaCenterY===undefined?0:mediaCenterY-(h+(part.caption?88:0))/2;
    return {w,h,x,top};
  };
  const active=steps.filter((step:any)=>f>=at+step.offsetFrames).at(-1)??steps[0];
  const current=plateFor(active);
  return <Frame box={box}>
    {steps.map((step:any,i:number)=>{
      const next=steps[i+1]?.offsetFrames,label=step.label??step.title;
      const {w,h,x,top}=plateFor(step);
      return <Sequence key={i} from={at+step.offsetFrames} durationInFrames={next===undefined?undefined:next-step.offsetFrames} layout="none">
        <AdapterPlate index="sequence" x={x} top={top} width={w} height={h} f={f} at={at} th={th}>
          {step.clip?<SceneClip clip={{...step.clip,trimBeforeFrame:step.clip.trimBeforeFrame??0,fit:step.clip.fit??'cover'}} width={w-28} height={h-28}/>
            :step.video?<Footage src={step.video.src} muted startFromSec={(step.video.trimBeforeFrame??0)/fps} objectFit={step.video.fit??'contain'} style={{width:'100%',height:'100%'}}/>
            :step.still?<Img src={staticFile(step.still)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:null}
          {label?<div style={{position:'absolute',top:18,[copy.side]:18,padding:'4px 16px',background:th.ground,color:th.gold,fontFamily:font,fontWeight:700,fontSize:32,direction:copy.dir}}>{label}</div>:null}
        </AdapterPlate>
      </Sequence>;
    })}
    <AdapterCaption part={part} box={box} x={current.x} width={current.w} top={current.top+current.h+24} at={at} th={th}/>
  </Frame>;
};

export const MediaPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, fps,mediaCenterY}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const s = part.source;
  if(s.kind==='pair')return <PairMedia part={part} box={box} at={at} th={th} emphasis={false} dir={copy.dir} fps={fps} scale={1} mediaCenterY={mediaCenterY}/>;
  if(s.kind==='sequence')return <SequenceMedia part={part} box={box} at={at} th={th} emphasis={false} dir={copy.dir} fps={fps} scale={1} mediaCenterY={mediaCenterY}/>;
  const capH = part.caption ? 64 : 0;
  const ratio = s.kind === 'image' ? s.height / s.width : s.kind === 'compare' ? s.before.height / s.before.width : 9 / 16;
  const h0 = box.height - capH - 24;
  const w = Math.min(box.width, h0 / ratio), h = w * ratio;
  const x = ratio > 1 ? (box.width - w) / 2 : copy.ar ? box.width - w : 0; // portrait plates sit on the centre line
  const top=mediaCenterY===undefined?0:mediaCenterY-(h+(part.caption?88:0))/2;
  const frameP = ramp(f, at, 30);
  const reveal = s.kind === 'compare' ? ramp(f, at + 12, s.revealFrames, settle) : 1;
  return <Frame box={box}>
    <div style={{position: 'absolute', left: x, top, width: w, height: h, ...rise(f, at, 24)}}>
      <div style={{position: 'absolute', inset: 14, overflow: 'hidden'}}>
        {s.kind === 'image' ? <Img src={staticFile(s.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}}/> : null}
        {s.kind === 'compare' ? <>
          <Img src={staticFile(s.before.src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}}/>
          <div style={{position: 'absolute', inset: 0, clipPath: copy.ar ? `inset(0 0 0 ${(1 - reveal) * 100}%)` : `inset(0 ${(1 - reveal) * 100}% 0 0)`}}>
            <Img src={staticFile(s.after.src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}}/></div>
          <div style={{position: 'absolute', top: 0, bottom: 0, width: 3, background: th.gold, [copy.ar ? 'right' : 'left']: `calc(${reveal * 100}% - 1.5px)`, opacity: reveal > 0.02 && reveal < 0.98 ? 1 : 0}}/>
          {[s.before, s.after].map((side: any, i: number) => <div key={i} style={{position: 'absolute', top: 18, [i === 0 ? copy.opposite : copy.side]: 18, padding: '4px 16px', background: th.ground, color: th.gold, fontFamily: font, fontWeight: 700, fontSize: 32, direction: copy.dir,
            opacity: i === 0 ? 1 - reveal * 0.6 : reveal}}>{side.label}</div>)}
        </> : null}
        {s.kind === 'clip' ? <Sequence from={at} layout="none"><SceneClip clip={{...s.clip, trimBeforeFrame: s.clip.trimBeforeFrame ?? 0, fit: s.clip.fit ?? 'cover'}} width={w - 28} height={h - 28}/></Sequence> : null}
      </div>
      <svg width={w} height={h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} fill="none" stroke={th.gold} strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frameP}/>
        <rect x={7} y={7} width={w - 14} height={h - 14} fill="none" stroke={th.hair} strokeWidth={1} opacity={frameP}/>
      </svg>
    </div>
    {part.caption ? <div style={{position: 'absolute', top: top+h + 24, [copy.side]: copy.ar ? box.width - x - w : x, width: w, display: 'flex', alignItems: 'center', gap: 22, direction: copy.dir, ...rise(f, at + 18, 16)}}>
      <Diamond size={12} color={th.gold}/><span style={{fontFamily: font, fontWeight: 500, fontSize: 38, lineHeight: '48px', color: th.dim, whiteSpace: 'nowrap'}}>{part.caption}</span>
    </div> : null}
  </Frame>;
};
