import type {ConceptDesignProps} from './types';
import React from 'react';
import {formatNumber} from '../../../../core/numbers';
import {CONCEPT_BOX,dirOf,useConceptDigits} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt,valueFormat,changeText,changeDirection} from '../../../../motion-concepts/kpi-zoom/math';
import type {KpiZoomData} from '../../../../motion-concepts/kpi-zoom/schema';
import {NAVY as th} from '../../system/base';
import {Paper,Text,NumberFace,Frame,Geometry,rect,useFrame} from './frozen-parts';
export const paramsFor=(config:KpiZoomData,mode:'once'|'loop'='once')=>({mode,box:CONCEPT_BOX,rtl:dirOf(config.tiles.map(t=>t.name).join(' '))==='rtl',focusIndex:config.focusIndex,values:config.tiles.map(t=>t.value),changes:config.tiles.map(t=>t.change),windowRadius:0});
export const KpiZoom:React.FC<ConceptDesignProps<KpiZoomData>>=({sectionIndex=0,...p})=><Paper sectionIndex={sectionIndex} rtl={paramsFor(p.config).rtl} {...p}><Drawing {...p}/></Paper>;
const Drawing:React.FC<ConceptDesignProps<KpiZoomData>>=({config,durationInFrames,mode='once'})=>{
 const params=paramsFor(config,mode),L=layoutFor(CONCEPT_BOX,params),S=stateAt(useFrame(),durationInFrames,params),digits=useConceptDigits(config.tiles.map(t=>t.name).join(' '));
 const order=config.tiles.map((_,i)=>i).filter(i=>i!==config.focusIndex).concat(config.focusIndex);
 return <><Geometry rects={S.rects}/>{order.map(i=>{
 const T=S.tiles[i],tile=config.tiles[i];const slot=(part:'name'|'number'|'chip')=>({x:T.parts[part].x,y:T.parts[part].y,width:L.slots[part].w*T.parts[part].scale,height:L.slots[part].h*T.parts[part].scale});
 const fmt=valueFormat(tile.value,i===config.focusIndex?config.unit:undefined,digits),suffix=fmt.suffix??'';
 return <div key={i} style={{...rect(T.rect),opacity:T.opacity,transform:`translate(${T.shift.x}px,${T.shift.y}px) scale(${T.scale})`,overflow:'hidden',background:th.ground}}>
 <Frame box={{x:0,y:0,width:T.rect.width,height:T.rect.height}} active={T.u>0} fill={T.u>0?th.faint:th.ground}/>
 <Text text={tile.name} box={slot('name')} size={32+8*T.u} min={28} weight={600} color={T.u>0?th.ink:th.dim}/>
 <div style={{opacity:1-T.dim}}><NumberFace text={formatNumber(T.value,{...fmt,suffix:''})} suffix={suffix} box={slot('number')} size={180*T.parts.number.scale} min={28}/></div>
 <Text text={changeText(tile.change,T.change,digits)} box={slot('chip')} size={40} min={28} lh={1} weight={600} color={changeDirection(tile.change)==='up'?th.gold:th.dim}/>
 </div>;})}</>;
};
