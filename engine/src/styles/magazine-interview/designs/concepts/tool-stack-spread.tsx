import type {ConceptDesignProps} from './types';
import React from 'react';
import {Img,staticFile} from 'remotion';
import {EASE} from '../../../../core/motion';
import {formatNumber} from '../../../../core/numbers';
import {useDigits} from '../../../../creative-kit/digits';
import {CONCEPT_BOX,dirOf} from '../../../../motion-concepts/shared';
import {segBeat} from '../../../../motion-concepts/timeline';
import {layoutFor,stateAt,beatsFor,spreadEase,FRONT,PAINT_ORDER} from '../../../../motion-concepts/tool-stack-spread/math';
import type {ToolStackSpreadData} from '../../../../motion-concepts/tool-stack-spread/schema';
import {NAVY as th} from '../../system/base';
import {Paper,Text,Frame,Geometry,rect,useFrame} from './frozen-parts';
export const paramsFor=(config:ToolStackSpreadData,mode:'once'|'loop'='once')=>({mode,box:CONCEPT_BOX,rtl:config.tools.filter(t=>dirOf(t.function)==='rtl').length*2>config.tools.length});
// Invert the exported old ease and sample stateAt; never duplicate pile geometry.
export const stateFor=(frame:number,duration:number,params:ReturnType<typeof paramsFor>)=>{
 const original=stateAt(frame,duration,params),B=beatsFor(params.mode,duration);
 const cards=original.cards.map((c,i)=>{
  const outer=Math.abs(i-FRONT)===2,out=outer?B.out2:B.out1,back=outer?B.back2:B.back1;
  const target=segBeat(frame,out,EASE.land)*(1-(back?segBeat(frame,back,EASE.bezierMorph):0));
  let lo=0,hi=1;for(let n=0;n<32;n++){const mid=(lo+hi)/2;if(spreadEase(mid)<target)lo=mid;else hi=mid;}
  const sampleFrame=target===0?out.from:target===1?out.to:out.from+(out.to-out.from)*(lo+hi)/2;
  const sampled=stateAt(sampleFrame,duration,params).cards[i];
  return {...sampled,glance:c.glance};
 });return {...original,cards};
};
export const ToolStackSpread:React.FC<ConceptDesignProps<ToolStackSpreadData>>=({sectionIndex=0,...p})=><Paper sectionIndex={sectionIndex} rtl={paramsFor(p.config).rtl} {...p}><Drawing {...p}/></Paper>;
const Drawing:React.FC<ConceptDesignProps<ToolStackSpreadData>>=({config,durationInFrames,mode='once'})=>{
 const params=paramsFor(config,mode),f=useFrame(),L=layoutFor(CONCEPT_BOX,params),S=stateFor(f,durationInFrames,params),digits=useDigits()??(params.rtl?'arabic-indic':'latin');
 const max=Math.max(...S.cards.map(c=>c.glance)),active=max>0?S.cards.findIndex(c=>c.glance===max):-1;
 return <><Geometry rects={S.cards.map(c=>c.rect)}/>{PAINT_ORDER.map(i=>{const c=S.cards[i],slot=L.slots[i],tool=config.tools[i];return <div key={i} style={{...rect(slot),background:th.ground,transform:`translateY(${c.dy}px) scale(${c.scale})`}}>
 <Frame box={{x:0,y:0,width:slot.width,height:slot.height}} active={active===i} fill={active===i?th.faint:th.ground}/>
 {tool.icon?<div style={{...rect(L.chip),boxSizing:'border-box',border:`2px solid ${th.hair}`}}><Img src={staticFile(tool.icon)} style={{width:'100%',height:'100%',objectFit:'contain'}}/></div>:<Text text={formatNumber(i+1,{digits})} box={L.chip} size={40} min={28} lh={1} weight={500} mono color={th.gold}/>}
 <Text text={tool.name} box={{...L.name,y:5,height:50}} size={40} weight={700}/>
 <Text text={tool.function} box={{...L.fn,y:55,height:slot.height-60}} size={34} lines={2} color={th.dim} lh={1.12}/>
 </div>;})}</>;
};
