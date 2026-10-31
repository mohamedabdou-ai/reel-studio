import type {ConceptDesignProps} from './types';
import React from 'react';
import {CONCEPT_BOX,dirOf,Dressing} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt} from '../../../../motion-concepts/glass-lens/math';
import type {GlassLensData} from '../../../../motion-concepts/glass-lens/schema';
import {MarkRing,NAVY as th} from '../../system/base';
import {Paper,Text,Geometry,rect,useFrame} from './frozen-parts';
export const paramsFor=(config:GlassLensData,mode:'once'|'loop'='once')=>({mode,box:CONCEPT_BOX,rtl:config.rows.filter(r=>dirOf(r.label)==='rtl').length>=3,keyIndex:config.keyIndex});
export const LOCK_RING=36,LOCK_GAP=16;
export const valueBoxFor=(box:{x:number;y:number;width:number;height:number},rtl:boolean)=>({...box,x:box.x+(rtl?LOCK_RING+LOCK_GAP:0),width:box.width-LOCK_RING-LOCK_GAP});
export const GlassLens:React.FC<ConceptDesignProps<GlassLensData>>=({sectionIndex=0,...p})=><Paper sectionIndex={sectionIndex} rtl={paramsFor(p.config).rtl} {...p}><Drawing {...p}/></Paper>;
const Drawing:React.FC<ConceptDesignProps<GlassLensData>>=({config,durationInFrames,mode='once'})=>{
 const params=paramsFor(config,mode),L=layoutFor(CONCEPT_BOX,params),S=stateAt(useFrame(),durationInFrames,params);
 return <><Geometry rects={S.rects}/><Dressing>{Object.values(L.header).map((r,i)=><div key={i} style={{...rect({...r,height:2}),background:th.hair}}/>)}</Dressing>
 {config.rows.map((r,i)=>{const R=L.rows[i],s=S.rows[i],valueBox=valueBoxFor(R.value,params.rtl);return <div key={i} data-p3-lock-row={JSON.stringify({index:i,valueBox,reserved:LOCK_RING+LOCK_GAP})} style={{...rect(R.rect),opacity:1-.6*s.recede,transform:`scale(${s.scale})`}}>
 <div style={{position:'absolute',left:0,right:0,bottom:0,height:2,background:th.hair}}/>
 <Text text={r.label} box={R.label} size={34} lines={2} weight={600} color={th.dim}/>
 <Text text={r.value} box={valueBox} size={40} min={28} mono weight={500} color={s.key>0?th.gold:th.ink} align={params.rtl?'left':'right'}/>
 </div>;})}
 <div style={{...rect(S.lens.rect),boxSizing:'border-box',border:`${2+S.lock}px solid ${th.gold}`,background:th.faint,opacity:S.lens.opacity,pointerEvents:'none'}}>
 <div data-p3-lock-check="" style={{position:'absolute',[params.rtl?'left':'right']:8,top:(S.lens.rect.height-LOCK_RING)/2,opacity:S.lock}}><MarkRing size={LOCK_RING} ring={S.lock} mark={S.lock} kind="check" ringColor={th.gold} markColor={th.gold}/></div></div>
 </>;
};
