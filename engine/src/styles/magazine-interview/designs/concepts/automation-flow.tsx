import type {ConceptDesignProps} from './types';
import React from 'react';
import {formatNumber} from '../../../../core/numbers';
import {CONCEPT_BOX,dirOf,useConceptDigits} from '../../../../motion-concepts/shared';
import {seg} from '../../../../motion-concepts/timeline';
import {layoutFor,stateAt} from '../../../../motion-concepts/automation-flow/math';
import type {AutomationFlowData} from '../../../../motion-concepts/automation-flow/schema';
import {Diamond,NAVY as th} from '../../system/base';
import {Paper,Text,Frame,Geometry,rect,useFrame} from './frozen-parts';
export const paramsFor=(config:AutomationFlowData,mode:'once'|'loop'='once')=>({mode,box:CONCEPT_BOX,rtl:dirOf([config.input,...config.steps,config.output].join(' '))==='rtl',pillK:0,windowRadius:0});
export const AutomationFlow:React.FC<ConceptDesignProps<AutomationFlowData>>=({sectionIndex=0,...p})=><Paper sectionIndex={sectionIndex} rtl={paramsFor(p.config).rtl} {...p}><Drawing {...p}/></Paper>;
const Drawing:React.FC<ConceptDesignProps<AutomationFlowData>>=({config,durationInFrames,mode='once'})=>{
 const labels=[config.input,...config.steps,config.output],params=paramsFor(config,mode),L=layoutFor(CONCEPT_BOX,params),S=stateAt(useFrame(),durationInFrames,params),digits=useConceptDigits(labels.join(' '));
 return <><Geometry rects={S.rects}/>{L.nodes.map((n,i)=>{
 const s=S.nodes[i],output=n.kind==='output',solid=output&&s.lit>=.5,grow=seg(s.lit,.25,1),b=s.bump;
 return <div key={i} style={{...rect(n.rect),opacity:s.presence,transform:`scale(${s.scale})`}}>
 <Frame box={{x:-b,y:-b,width:n.rect.width+2*b,height:n.rect.height+2*b}} active={s.lit>0||s.react>0} fill={solid?th.gold:th.ground}/>
 {n.kind==='step'?<Text text={formatNumber(i,{digits})} box={n.badge} size={40} min={28} lh={1} weight={500} mono color={th.gold}/>:n.kind==='input'?<Diamond size={16} color={th.gold} style={{position:'absolute',left:n.badge.x+(n.badge.width-16)/2,top:n.badge.y+(n.badge.height-16)/2}}/>:<svg style={rect(n.badge)} viewBox="0 0 64 64">{[18,32,46].map((x,k)=><path key={x} d={`M${x} 50V${50-(k+1)*11*grow}`} stroke={solid?th.tagInk:th.gold} strokeWidth={4}/>)}</svg>}
 <Text text={labels[i]} box={n.text} size={n.kind==='step'?34:40} min={34} lines={n.kind==='step'?2:1} weight={n.kind==='step'?600:700} color={solid?th.tagInk:th.ink}/>
 </div>;})}
 <svg width={1080} height={1920} style={{position:'absolute',inset:0,pointerEvents:'none'}}>{L.conns.map((c,i)=>{
 const s=S.conns[i],point=(t:number)=>({x:c.a.x+(c.b.x-c.a.x)*t,y:c.a.y+(c.b.y-c.a.y)*t});
 const line=(a:number,b:number,color:string,width:number,opacity=1)=>{const A=point(a),B=point(b);return <path d={`M${A.x} ${A.y}L${B.x} ${B.y}`} fill="none" stroke={color} strokeWidth={width} opacity={opacity}/>;};const head=point(s.cometTo);
 return <g key={i}>{line(0,s.draw,th.hair,2)}{line(s.trailFrom,s.trailTo,th.gold,3,.7)}{s.power>0?<>{line(s.cometFrom,s.cometTo,th.gold,4)}<rect x={head.x-8} y={head.y-8} width={16} height={16} fill={th.gold} transform={`rotate(45 ${head.x} ${head.y})`} opacity={s.power}/></>:null}<rect x={c.b.x-5.5} y={c.b.y-5.5} width={11} height={11} fill={th.gold} transform={`rotate(45 ${c.b.x} ${c.b.y})`} opacity={seg(s.draw,.85,1)}/></g>;
 })}</svg></>;
};
