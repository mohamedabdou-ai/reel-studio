import type {ConceptDesignProps} from './types';
import React from 'react';
import {Img,staticFile} from 'remotion';
import {CONCEPT_BOX,dirOf} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt,plateArt} from '../../../../motion-concepts/panel-reveal/math';
import type {PanelRevealData} from '../../../../motion-concepts/panel-reveal/schema';
import {Diamond,NAVY as th,useType,useMagazine} from '../../system/base';
import {Paper,Text,Frame,Geometry,rect,useFrame} from './frozen-parts';
export const paramsFor=(config:PanelRevealData,mode:'once'|'loop'='once')=>({mode,box:CONCEPT_BOX,rtl:dirOf(config.title)==='rtl',pillK:0,seed:config.title});
export const PanelReveal:React.FC<ConceptDesignProps<PanelRevealData>>=({sectionIndex=0,...p})=><Paper sectionIndex={sectionIndex} rtl={paramsFor(p.config).rtl} {...p}><Drawing {...p}/></Paper>;
const Drawing:React.FC<ConceptDesignProps<PanelRevealData>>=({config,durationInFrames,mode='once'})=>{
 const params=paramsFor(config,mode),L=layoutFor(CONCEPT_BOX,params),S=stateAt(useFrame(),durationInFrames,params),{planHeadline,wid}=useType(),{font,copy}=useMagazine();
 const plan=planHeadline(config.title,{max:70,min:56,lines:2,width:L.title.width,maxHeight:L.title.height});
 const art=plateArt(config.title,L.plate.width,L.plate.height),tallest=art.bars.reduce((a,b,i)=>b.height>art.bars[a].height?i:a,0);
 return <><Geometry rects={S.rects}/><div style={{...rect(L.card),overflow:'hidden'}}>
 <div style={{...rect(L.plate),overflow:'hidden'}}><div style={{position:'absolute',inset:0,transform:`scale(${S.zoom})`}}>
 {config.visualSrc?<Img src={staticFile(config.visualSrc)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<svg width={L.plate.width} height={L.plate.height}><circle {...{cx:art.disc.cx,cy:art.disc.cy,r:art.disc.r}} stroke={th.gold} strokeWidth={4} fill="none"/>{art.bars.map((b,i)=><rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} fill={i===tallest?th.gold:'none'} stroke={i===tallest?th.gold:th.hair} strokeWidth={2}/>)}</svg>}
 </div><Frame box={{x:0,y:0,width:L.plate.width,height:L.plate.height}} active/></div>
 <div data-p3-text={JSON.stringify({size:plan.size,min:56,height:plan.height,box:L.title,ok:plan.height<=L.title.height&&plan.rows.every(r=>wid(r.text,plan.size,r.key?800:200)<=L.title.width),weight:800,mono:false})} style={{...rect(L.title),opacity:S.title.presence,transform:`translateY(${S.title.dy}px)`,overflow:'hidden',fontFamily:font,fontSize:plan.size,lineHeight:`${plan.box}px`,textAlign:copy.align,direction:copy.dir,color:th.ink}}>{plan.rows.map((r,i)=><div key={i} style={{fontWeight:r.key?800:200,whiteSpace:'nowrap'}}><bdi dir="auto">{r.text}</bdi></div>)}</div>
 <div style={{position:'absolute',inset:0,opacity:S.cta.presence,transform:`translateY(${S.cta.dy}px)`}}>
 <Frame box={L.cta} active/><Text text={config.cta} box={L.ctaText} size={40} min={34} weight={600} color={th.gold}/>
 <div style={{...rect(L.arrow),transform:`translateX(${S.nudge*L.nudge}px) scaleX(${params.rtl?-1:1})`}}><div style={{position:'absolute',left:0,top:L.arrow.height/2,width:L.arrow.width-10,height:2,background:th.gold}}/><Diamond size={11} color={th.gold} style={{position:'absolute',right:3,top:L.arrow.height/2-4.5}}/></div>
 </div>
 {S.panels.map((s,i)=>s.rect.height>0?<div key={i} style={{...rect(s.rect),background:th.ground}}><div style={{position:'absolute',left:0,top:0,width:s.rect.width,height:Math.min(2,s.rect.height),background:th.gold}}/></div>:null)}
 </div></>;
};
