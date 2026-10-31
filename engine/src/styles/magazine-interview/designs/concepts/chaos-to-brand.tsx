import type {ConceptDesignProps} from './types';
import React from 'react';
import {CONCEPT_BOX,dirOf,useConceptTimeline} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt,MIN_FRAMES} from '../../../../motion-concepts/chaos-to-brand/math';
import type {ChaosToBrandData} from '../../../../motion-concepts/chaos-to-brand/schema';
import {buildGeometry} from '../../../../motion-concepts/chaos-to-brand/scene';
import {getSceneTheme} from '../../../../creative-kit/primitives';
import {NAVY,useMagazine} from '../../system/base';
import {Sheet,Text,Rects} from './sheet-parts';

const Drawing:React.FC<ConceptDesignProps<ChaosToBrandData>> = ({config:data,durationInFrames,mode='once'}) => {
  const {frame:f}=useConceptTimeline(MIN_FRAMES),th=NAVY,{font}=useMagazine();
  const geo=React.useMemo(()=>buildGeometry(data.mark,{...getSceneTheme('magazine-interview'),ar:font,display:font,grammar:undefined}),[data.mark,font]);
  const shape=geo.shape;
  const L=layoutFor(CONCEPT_BOX,{aspect:shape.aspect}),S=stateAt(f,durationInFrames,{mode,box:CONCEPT_BOX,shape});
  const sx=geo.kind==='path'?L.mark.width/geo.vb.width:1,sy=geo.kind==='path'?L.mark.height/geo.vb.height:1;
  return <><Rects rects={S.rects} params={{mode,box:CONCEPT_BOX,shape}}/>
    <svg width={1080} height={1920} style={{position:'absolute',inset:0}}>
      {S.solid>.001&&geo.kind==='path'?<g transform={`translate(${L.mark.x} ${L.mark.y}) scale(${sx} ${sy}) translate(${-geo.vb.x} ${-geo.vb.y})`}>
        {geo.filled?<path d={geo.d} fill={th.gold} fillOpacity={S.mark.fill}/>:null}
        {geo.parts.map((part,i)=><path key={i} d={part.d} fill="none" stroke={th.gold} strokeWidth={8/(sx+sy)} strokeLinecap="butt" strokeLinejoin="miter" pathLength={1} strokeDasharray={1} strokeDashoffset={1-S.mark.draw}/>)}
      </g>:null}
      {S.solid>.001&&geo.kind==='text'?<svg data-mark-kind="text" x={S.mark.clip.x} y={S.mark.clip.y} width={S.mark.clip.width} height={S.mark.clip.height} overflow="hidden">
        <g transform={`translate(${-S.mark.clip.x} ${-S.mark.clip.y})`}>
          <text x={L.mark.x+(geo.raster.origin.x-geo.raster.ink.x)*L.mark.width/geo.raster.ink.width}
            y={L.mark.y+(geo.raster.origin.y-geo.raster.ink.y)*L.mark.width/geo.raster.ink.width}
            fontFamily={geo.raster.family} fontWeight={geo.raster.weight}
            // Native rasterize samples at 220 px; this rescales that same glyph ink.
            fontSize={220*L.mark.width/geo.raster.ink.width} fill={th.gold} textAnchor="start" style={{direction:'ltr',whiteSpace:'pre'}}>{geo.text}</text>
        </g>
      </svg>:null}
      {S.particles.map((p,i)=>{const r=Math.max(5,Math.min(7,p.r));return p.opacity<.004?null:<path key={i} d={`M${p.x} ${p.y-r} L${p.x+r} ${p.y} L${p.x} ${p.y+r} L${p.x-r} ${p.y} Z`} fill={th.gold} opacity={p.opacity}/>;})}
    </svg>
    <Text text={data.brandName} box={L.name} size={92} min={44} lines={1} weight={800} align="center" style={{opacity:S.name.presence,transform:`translateY(${S.name.dy}px)`}}/>
    <Text text={data.tagline} box={L.tagline} size={40} min={34} lines={2} weight={400} color={th.dim} align="center" style={{opacity:S.tagline.presence,transform:`translateY(${S.tagline.dy}px)`}}/>
  </>;
};
export const ChaosToBrand:React.FC<ConceptDesignProps<ChaosToBrandData>> = ({sectionIndex=0,...p})=><Sheet rtl={dirOf(p.config.brandName+' '+p.config.tagline)==='rtl'} backdrop={p.backdrop} sectionIndex={sectionIndex}><Drawing {...p}/></Sheet>;
