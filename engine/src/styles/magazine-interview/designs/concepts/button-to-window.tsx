import type {ConceptDesignProps} from './types';
import React from 'react';
import {CardMorph} from '../../../../core/transitions-dir';
import {formatNumber, ARABIC_PERCENT} from '../../../../core/numbers';
import {CONCEPT_BOX, Dressing, dirOf, tint, useConceptDigits, useConceptTimeline} from '../../../../motion-concepts/shared';
import {seg} from '../../../../motion-concepts/timeline';
import {layoutFor,stateAt,MIN_FRAMES} from '../../../../motion-concepts/button-to-window/math';
import type {ButtonToWindowData} from '../../../../motion-concepts/button-to-window/schema';
import {MarkRing,NAVY} from '../../system/base';
import {Sheet,Text,Icon,Cursor,Rects,css} from './sheet-parts';

export const ButtonToWindow:React.FC<ConceptDesignProps<ButtonToWindowData>> = ({config:data,durationInFrames,mode='once',backdrop,sectionIndex=0}) => {
  const {frame}=useConceptTimeline(MIN_FRAMES),rtl=dirOf(data.ctaLabel)==='rtl';
  const params={mode,box:CONCEPT_BOX,rtl,pillK:0,windowRadius:0};
  const L=layoutFor(CONCEPT_BOX,params),S=stateAt(frame,durationInFrames,params),digits=useConceptDigits(data.ctaLabel);
  const th=NAVY,W=L.window.width,H=L.window.height;
  return <Sheet rtl={rtl} backdrop={backdrop} sectionIndex={sectionIndex}><Rects rects={S.rects} params={params}/>
    <div style={{position:'absolute',inset:0,transform:`scale(${1-.03*S.press*(1-S.p)})`,transformOrigin:`${L.window.x+W/2}px ${L.window.y+H/2}px`}}>
      <CardMorph from={{...L.button,radius:0}} to={{...L.window,radius:0}} progress={S.p} fit="crop" background={tint(th.gold,th.ground,seg(S.p,.1,.6))}>
        {S.label>.001?<Text text={data.ctaLabel} box={L.label} size={50} min={34} lines={1} weight={700} color={th.tagInk} align="center" style={{opacity:S.label}}/>:null}
        <div style={{position:'absolute',inset:0,opacity:S.chrome}}>
          <div style={{position:'absolute',left:0,top:L.bar.height-2,width:W,height:2,background:th.hair}}/>
          <Icon src={data.productIcon} name={data.productName} box={L.icon} size={40}/>
          <Text text={data.productName} box={L.name} size={40} min={34} lines={1} weight={700}/>
          {data.badge?<Text text={data.badge} box={L.badge} size={28} min={28} lines={1} weight={600} color={th.gold}/>:null}
          {data.progressLabel?<Text text={data.progressLabel} box={L.progressLabel} size={34} min={34} lines={1} color={th.dim}/>:null}
          <Text text={formatNumber(S.pct,{digits,suffix:digits==='arabic-indic'?ARABIC_PERCENT:'%'})} box={L.pct} size={40} min={28} lines={1} mono weight={500} color={th.gold} align={rtl?'left':'right'}/>
          <div style={{...css(L.track),height:2,background:th.hair}}><div style={{position:'absolute',top:-1,[rtl?'right':'left']:0,height:4,width:L.track.width*S.fill,background:th.gold}}/></div>
        </div>
        {data.previewLines.map((line,i)=>{const row=S.rows[i],r=L.rows[i];return <div key={i} style={{position:'absolute',inset:0,opacity:row.presence,transform:`translateY(${row.dy}px)`}}>
          <div style={{...css(r.card),borderBottom:`2px solid ${th.hair}`,boxSizing:'border-box'}}/>
          <div style={css(r.icon)}><MarkRing size={r.icon.width} ring={row.check} mark={row.check} kind="check" ringColor={th.gold} markColor={th.gold}/></div>
          <Text text={line} box={r.text} size={40} min={34} lines={2} weight={400}/>
        </div>;})}
      </CardMorph>
      <div data-p5-frame="morph" style={{...css(S.rect),border:`2px solid ${th.gold}`,boxSizing:'border-box',pointerEvents:'none'}}/>
    </div>
    <Dressing><div style={{position:'absolute',left:L.tip.x-56*S.ripple.p,top:L.tip.y-56*S.ripple.p,width:112*S.ripple.p,height:112*S.ripple.p,border:`3px solid ${th.gold}`,borderRadius:'50%',boxSizing:'border-box',opacity:S.ripple.opacity}}/></Dressing>
    <Cursor x={L.tip.x} y={L.tip.y} opacity={S.cursor.opacity} scale={S.cursor.scale}/>
  </Sheet>;
};
