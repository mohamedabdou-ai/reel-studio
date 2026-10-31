import type {ConceptDesignProps} from './types';
import React from 'react';
import {CardMorph} from '../../../../core/transitions-dir';
import {formatNumber} from '../../../../core/numbers';
import {CONCEPT_BOX,dirOf,useConceptDigits,useConceptTimeline} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt,panelZ,MIN_FRAMES} from '../../../../motion-concepts/brief-to-workspace/math';
import type {BriefToWorkspaceData} from '../../../../motion-concepts/brief-to-workspace/schema';
import {NAVY} from '../../system/base';
import {Sheet,Text,Rects,css} from './sheet-parts';

export const BriefToWorkspace:React.FC<ConceptDesignProps<BriefToWorkspaceData>> = ({config:data,durationInFrames,mode='once',backdrop,sectionIndex=0}) => {
  const {frame:f}=useConceptTimeline(MIN_FRAMES),rtl=dirOf(data.briefTitle)==='rtl',digits=useConceptDigits(data.briefTitle);
  const params={mode,box:CONCEPT_BOX,rtl,pillK:0,windowRadius:0},L=layoutFor(CONCEPT_BOX,params),S=stateAt(f,durationInFrames,params),th=NAVY;
  return <Sheet rtl={rtl} backdrop={backdrop} sectionIndex={sectionIndex}><Rects rects={S.rects} params={params}/>
    <div style={{position:'absolute',inset:0,transform:`scale(${S.scale})`,transformOrigin:`${L.window.x+L.window.width/2}px ${L.window.y+L.window.height/2}px`}}>
      <CardMorph from={{...L.brief,radius:0}} to={{...L.window,radius:0}} progress={S.p} fit="crop" background={th.ground}>
        {L.bars.map((r,i)=><div key={i} style={{...css(r),height:2,background:th.hair,opacity:S.bars}}/>)}
        <div style={{...css(L.rule),background:th.hair,opacity:S.rule}}/>
        {L.segments.map((r,i)=><div key={i} style={{...css(r),height:4,background:th.hair,opacity:S.chrome}}><div style={{position:'absolute',top:0,[rtl?'right':'left']:0,width:r.width*S.segments[i],height:4,background:th.gold}}/></div>)}
        <Text text={data.briefTitle} box={S.title} size={44} min={34} lines={2} weight={700}/>
        {data.panels.map((panel,i)=>{const st=S.panels[i],pl=L.panels[i];return <div key={i} style={{...css(st.rect),overflow:'hidden',background:th.ground,opacity:st.fade,zIndex:panelZ(i)}}>
          <div style={{position:'absolute',inset:0,border:`2px solid ${th.hair}`,boxSizing:'border-box'}}/>
          <div style={{position:'absolute',left:0,top:0,width:pl.slot.width,height:pl.slot.height,transform:`scale(${st.zoom})`,transformOrigin:'0 0',opacity:st.content}}>
            <Text text={formatNumber(i+1,{digits})} box={{...pl.chip,y:pl.chip.y-2,height:48}} size={40} min={28} lines={1} weight={500} mono color={th.gold} align="center"/>
            <Text text={panel.label} box={pl.label} size={34} min={34} lines={1} weight={600}/>
            <Text text={panel.detail} box={pl.detail} size={34} min={34} lines={2} weight={400} color={th.dim}/>
          </div>
        </div>;})}
      </CardMorph>
      <div data-p5-frame="morph" style={{...css(S.rect),border:`2px solid ${th.gold}`,boxSizing:'border-box',pointerEvents:'none'}}/>
    </div>
  </Sheet>;
};
