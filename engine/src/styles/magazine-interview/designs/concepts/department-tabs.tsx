import type {ConceptDesignProps} from './types';
import React from 'react';
import {CONCEPT_BOX,dirOf} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt,beatsFor} from '../../../../motion-concepts/department-tabs/math';
import type {DepartmentTabsData} from '../../../../motion-concepts/department-tabs/schema';
import {Diamond,Mask,ramp,useType,NAVY as th} from '../../system/base';
import {Paper,Text,Geometry,rect,useFrame} from './frozen-parts';
export const paramsFor=(config:DepartmentTabsData,mode:'once'|'loop'='once')=>({mode,box:CONCEPT_BOX,rtl:dirOf(config.tabs.map(t=>[t.label,...t.examples].join(' ')).join(' '))==='rtl',counts:config.tabs.map(t=>t.examples.length)});
export const DepartmentTabs:React.FC<ConceptDesignProps<DepartmentTabsData>>=({sectionIndex=0,...p})=><Paper sectionIndex={sectionIndex} rtl={paramsFor(p.config).rtl} {...p}><Drawing {...p}/></Paper>;
const Drawing:React.FC<ConceptDesignProps<DepartmentTabsData>>=({config,durationInFrames,mode='once'})=>{
 const f=useFrame(),params=paramsFor(config,mode),L=layoutFor(CONCEPT_BOX,{...params,tabCount:config.tabs.length}),S=stateAt(f,durationInFrames,params);
 const B=beatsFor(mode,durationInFrames,config.tabs.length);
 const {wid}=useType();
 let labelSize=32;while(labelSize>28&&config.tabs.some((t,i)=>Math.max(wid(t.label,labelSize,700),wid(t.label,labelSize,600))>L.labels[i].width))labelSize-=2;
 // Read both sides from the mechanism; no copied private tab-selection math.
 const swaps=React.useMemo(()=>Object.entries(beatsFor(mode,durationInFrames,config.tabs.length)).filter(([key])=>key.startsWith('step')||key==='wrap').map(([,b])=>{
  const prev=stateAt(b.from,durationInFrames,params).content.tab,next=stateAt(b.to,durationInFrames,params).content.tab;
  let lo=b.from,hi=b.to;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(stateAt(mid,durationInFrames,params).content.tab===prev)lo=mid+1;else hi=mid;}
  return {at:lo,prev,next};
 }),[mode,durationInFrames,config.tabs.length,params.rtl,params.counts.join(',')]);
 // The existing hold is inviolable: finish a short final mask at that boundary.
 const swap=swaps.find(s=>f>=s.at&&f<Math.min(s.at+18,mode==='once'?B.hold.from:durationInFrames));
 const groups=swap?[
  {tab:swap.prev,k:1-ramp(f,swap.at,8),swap:true},
  {tab:swap.next,k:ramp(f,swap.at+4,14),swap:true},
 ]:[{tab:S.content.tab,k:1,swap:false}];
 return <><Geometry rects={S.rects}/><div style={{...rect(L.window),opacity:S.built,transform:`scale(${S.scale})`}}>
 {[L.strip.y,L.strip.y+L.strip.height].map(y=><div key={y} style={{position:'absolute',left:L.strip.x,top:y,width:L.strip.width,height:2,background:th.hair}}/>)}
 <div style={{...rect(S.pill),top:L.strip.y+L.strip.height-4,height:4,background:th.gold,opacity:S.pillOpacity}}/>
 {config.tabs.map((t,i)=><div key={i} data-p3-tab-label={JSON.stringify({index:i,size:labelSize})} style={{opacity:S.tabs[i].presence,transform:`translateY(${S.tabs[i].dy}px)`}}><Text text={t.label} box={L.labels[i]} size={labelSize} min={labelSize} lines={wid(t.label,labelSize,700)<=L.labels[i].width?1:2} weight={i===S.active?700:600} color={i===S.active?th.ink:th.dim} align="center"/><Diamond color={th.gold} size={11} style={{position:'absolute',left:L.dots[i].x+L.dots[i].width/2-5.5,top:L.dots[i].y,opacity:S.tabs[i].dot}}/></div>)}
 {groups.flatMap((group,g)=>L.rows[params.counts[group.tab]].map((r,j)=>{const row=S.content.rows[j];return <div key={`${g}-${j}`} style={{position:'absolute',inset:0,opacity:group.swap?1:row.presence,transform:`translateY(${group.swap?0:row.dy}px)`}}>
 {r.divider?<div style={{...rect(r.divider),background:th.hair}}/>:null}
 <Diamond color={th.gold} size={13} style={{position:'absolute',left:r.icon.x+(r.icon.width-13)/2,top:r.icon.y+(r.icon.height-13)/2,opacity:group.k}}/>
 <div style={rect(r.text)}><Mask h={r.text.height} pad={14} k={group.swap?group.k:row.presence} rise={30}><Text text={config.tabs[group.tab].examples[j]} box={{x:0,y:0,width:r.text.width,height:r.text.height}} size={40} min={34} lines={2}/></Mask></div>
 </div>;}))}
 </div></>;
};
