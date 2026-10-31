import type {ConceptDesignProps} from './types';
import React from 'react';
import {formatNumber} from '../../../../core/numbers';
import {CONCEPT_BOX, dirOf, useConceptDigits} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt,unitsShown} from '../../../../motion-concepts/prompt-to-results/math';
import type {PromptToResultsData} from '../../../../motion-concepts/prompt-to-results/schema';
import {revealTotal,splitReveal,caretMark} from '../../../../creative-kit/code-tokens';
import {Diamond, NAVY as th, fitWarning,useMagazine,useType} from '../../system/base';
import {Paper,Text,Frame,Geometry,rect,useFrame} from './frozen-parts';
const SEND_ARROW='M32 45 L32 20 M21 31 L32 20 L43 31';
export const paramsFor=(config:PromptToResultsData,mode:'once'|'loop'='once')=>({mode,box:CONCEPT_BOX,rtl:dirOf(config.prompt)==='rtl',pillK:0,windowRadius:0});
export const PromptToResults:React.FC<ConceptDesignProps<PromptToResultsData>>=({sectionIndex=0,...p})=><Paper sectionIndex={sectionIndex} rtl={paramsFor(p.config).rtl} {...p}><Drawing {...p}/></Paper>;
const Drawing:React.FC<ConceptDesignProps<PromptToResultsData>>=({config,durationInFrames,mode='once'})=>{
  const f=useFrame(),params=paramsFor(config,mode),L=layoutFor(CONCEPT_BOX,params),S=stateAt(f,durationInFrames,params),digits=useConceptDigits(config.prompt);
  const {fit}=useType(),{font,copy}=useMagazine();
  const t=fit(config.prompt,{width:L.input.width,size:44,min:34,lines:3,weight:400,lh:1.15});
  const inputFits=t.fits&&t.lines.length*t.box<=L.input.height;
  if(!inputFits)fitWarning(config.prompt,L.input.width,34,3);
  const typed=splitReveal(t.lines,unitsShown(S.typed,revealTotal(t.lines,'type')),'type');
  const T=L.trunk;
  return <><Geometry rects={S.rects}/><div style={rect(L.window)}>
    <svg width={L.window.width} height={L.window.height} style={{position:'absolute',inset:0}}>
      <path d={`M${T.x} ${T.y0}V${T.y1}`} fill="none" stroke={th.hair} strokeWidth={2}/><path d={`M${T.x} ${T.y0}V${T.y1}`} fill="none" stroke={th.gold} strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1-S.trunk.drawn}/>
      {T.nodes.map((y,i)=><path key={i} d={`M${T.x} ${y}H${T.stubX}`} fill="none" stroke={th.gold} strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1-S.trunk.stubs[i]}/>)}</svg>
    {T.nodes.map((y,i)=><Diamond key={i} size={11} color={th.gold} style={{position:'absolute',left:T.x-5.5,top:y-5.5,opacity:S.trunk.stubs[i]}}/>)}
    <div data-p3-text={JSON.stringify({size:t.size,min:34,height:t.lines.length*t.box,box:L.input,ok:inputFits,weight:400,mono:false})} style={{...rect(L.input),overflow:'hidden',fontFamily:font,fontWeight:400,fontSize:t.size,lineHeight:`${t.box}px`,color:th.ink,direction:copy.dir,textAlign:copy.align}}>
      {typed.map((line,i)=><div key={i} style={{height:t.box,whiteSpace:'pre'}}><bdi dir="auto">{line.shown}</bdi>{line.caret&&S.focus>0?<>{caretMark(line.shown)}<span data-idle="caret" style={{display:'inline-block',width:4,height:t.size,verticalAlign:'middle',background:th.gold,opacity:S.focus*(Math.floor(f/15)%2?.2:1)}}/>{caretMark(line.shown)}</>:null}</div>)}</div>
    <div style={{position:'absolute',left:L.input.x,top:L.input.y+L.input.height,width:L.input.width,height:2,background:th.gold}}/>
    <div style={{...rect(L.send),boxSizing:'border-box',border:`2px solid ${th.gold}`,background:S.armed?th.gold:'transparent',transform:`scale(${1-.03*S.press})`}}><svg width="100%" height="100%" viewBox="0 0 64 64"><path d={SEND_ARROW} fill="none" stroke={th.tagInk} strokeWidth={3}/></svg></div>
    {config.results.map((r,i)=>{const C=L.cards[i],c=S.cards[i];return <div key={i} style={{...rect(C.card),opacity:c.presence,transform:`translateY(${c.dy}px) scale(${c.scale})`}}>
      <Frame box={{x:0,y:0,width:C.card.width,height:C.card.height}} active progress={c.presence}/>
      <div style={{opacity:c.presence,overflow:'hidden'}}><Text text={formatNumber(i+1,{digits})} box={C.chip} size={40} min={28} lh={1} weight={500} mono color={th.gold}/></div>
      <Text text={r.title} box={{...C.title,y:6,height:50}} size={40} weight={700}/>
      <div style={{opacity:c.detail}}><Text text={r.detail} box={{...C.detail,y:56,height:C.card.height-62}} size={34} lines={3} color={th.dim} lh={1.12}/></div>
    </div>;})}
  </div></>;
};
