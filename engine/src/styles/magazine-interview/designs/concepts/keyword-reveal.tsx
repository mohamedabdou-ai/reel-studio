import type {ConceptDesignProps} from './types';
import React from 'react';
import {CONCEPT_BOX,dirOf,useConceptTimeline} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt,inkGuess,blockHeight,keywordMaxWidth,maxInkHeight,KEYWORD_MAX_SIZE,KEYWORD_MIN_SIZE,MIN_FRAMES,type KeywordMetrics} from '../../../../motion-concepts/keyword-reveal/math';
import type {KeywordRevealData} from '../../../../motion-concepts/keyword-reveal/schema';
import {measureInk} from '../../../../motion-concepts/keyword-reveal/scene';
import {NAVY,useMagazine,useType} from '../../system/base';
import {Sheet,Text,Rects} from './sheet-parts';

const Drawing:React.FC<ConceptDesignProps<KeywordRevealData>> = ({config:data,durationInFrames,mode='once'}) => {
  const {frame:f}=useConceptTimeline(MIN_FRAMES),{font}=useMagazine(),{fit,wid}=useType(),uid=React.useId().replace(/[^a-zA-Z0-9_-]/g,'');
  // Magazine fitting is non-throwing. Geometry and fill-edge motion remain the exported mechanism's.
  let t=fit(data.keyword,{width:keywordMaxWidth(CONCEPT_BOX),size:KEYWORD_MAX_SIZE,min:KEYWORD_MIN_SIZE,lines:2,weight:800,lh:1.24});
  let metrics:KeywordMetrics;
  for(;;){
    const measured=measureInk(t.lines,font,t.size,800);
    const ink=measured&&Number.isFinite(measured.ascent)&&Number.isFinite(measured.descent)&&measured.ascent>0&&measured.descent>=0?measured:inkGuess(data.keyword,t.size);
    metrics={fontSize:t.size,lines:Math.min(2,t.lines.length),width:Math.min(keywordMaxWidth(CONCEPT_BOX),Math.max(1,...t.lines.map(l=>wid(l,t.size,800)))),...ink};
    if(blockHeight(metrics)<=maxInkHeight(CONCEPT_BOX)||t.size<=KEYWORD_MIN_SIZE)break;
    t=fit(data.keyword,{width:keywordMaxWidth(CONCEPT_BOX),size:Math.max(KEYWORD_MIN_SIZE,t.size-2),min:KEYWORD_MIN_SIZE,lines:2,weight:800,lh:1.24});
  }
  const params={mode,box:CONCEPT_BOX,metrics},L=layoutFor(CONCEPT_BOX,metrics),S=stateAt(f,durationInFrames,params),th=NAVY;
  const glyphs=(fill:string,stroke?:string,width?:number)=>t.lines.slice(0,2).map((line,i)=><text key={i} x={L.cx} y={L.baselines[i]} textAnchor="middle" direction={dirOf(line)} fontFamily={font} fontSize={t.size} fontWeight={800} fill={fill} stroke={stroke} strokeWidth={width} strokeLinejoin="miter"><tspan>{line}</tspan></text>);
  return <><Rects rects={S.rects} params={params}/>
    <svg width={1080} height={1920} style={{position:'absolute',inset:0}} data-keyword-size={t.size}>
      <defs><clipPath id={`${uid}-level`}><rect x={L.region.x} y={S.edgeY} width={L.region.width} height={Math.max(0,L.fillBottom-S.edgeY+48)}/></clipPath><clipPath id={`${uid}-glyphs`}>{glyphs(th.gold)}</clipPath></defs>
      {glyphs('none',th.gold,3)}
      {S.level>0?<g clipPath={`url(#${uid}-level)`}>{glyphs(th.gold)}<g clipPath={`url(#${uid}-glyphs)`}><path d={`M${L.region.x} ${S.edgeY} H${L.region.x+L.region.width}`} stroke={th.ink} strokeWidth={2} opacity={S.edge}/></g></g>:null}
    </svg>
    <Text text={data.subheadline} box={{...L.sub,height:Math.max(L.sub.height,156)}} size={40} min={40} lines={3} color={th.dim} align="center" style={{opacity:S.sub.presence,transform:`translateY(${S.sub.dy}px)`}}/>
  </>;
};
export const KeywordReveal:React.FC<ConceptDesignProps<KeywordRevealData>> = ({sectionIndex=0,...p})=><Sheet rtl={dirOf(p.config.keyword)==='rtl'} backdrop={p.backdrop} sectionIndex={sectionIndex}><Drawing {...p}/></Sheet>;
