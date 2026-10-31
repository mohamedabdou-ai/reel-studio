import type {ConceptDesignProps} from './types';
import React from 'react';
import {CONCEPT_BOX,dirOf,useConceptTimeline} from '../../../../motion-concepts/shared';
import {layoutFor,stateAt,LABEL_MAX_W,LABEL_MIN_W,LABEL_PAD_X,MIN_FRAMES} from '../../../../motion-concepts/magnetic-dock/math';
import type {MagneticDockData} from '../../../../motion-concepts/magnetic-dock/schema';
import {NAVY,useType} from '../../system/base';
import {Sheet,Text,Icon,Cursor,Diamond,Rects,css} from './sheet-parts';

const Drawing:React.FC<ConceptDesignProps<MagneticDockData>> = ({config:data,durationInFrames,mode='once'}) => {
  const {frame:f}=useConceptTimeline(MIN_FRAMES),{wid}=useType(),rtl=data.tools.some(t=>dirOf(t.name)==='rtl');
  const labelWidths=data.tools.map(t=>Math.min(LABEL_MAX_W,Math.max(LABEL_MIN_W,wid(t.name,44,700)+2*LABEL_PAD_X)));
  const params={mode,box:CONCEPT_BOX,rtl,labelWidths},L=layoutFor(CONCEPT_BOX),S=stateAt(f,durationInFrames,params),th=NAVY;
  const active=S.icons.reduce((best,icon,i)=>icon.label.presence>S.icons[best].label.presence?i:best,0);
  return <><Rects rects={S.rects} params={params}/>
    <div style={{...css(S.panel),borderTop:`2px solid ${th.hair}`,borderBottom:`2px solid ${th.hair}`,boxSizing:'border-box'}}/>
    {S.icons.map((icon,i)=><React.Fragment key={i}>
      <Icon src={data.tools[i].icon} name={data.tools[i].name} box={icon.rect} opacity={icon.opacity}/>
      <Diamond size={L.dotSize} color={icon.dot>0?th.gold:th.hair} style={{position:'absolute',left:icon.rect.x+icon.rect.width/2-L.dotSize/2,top:L.dotY-L.dotSize/2,opacity:.4+.6*icon.dot}}/>
      {icon.label.presence>.001?<>
        <div data-p5-tag={i===active?'solid':'outline'} style={{...css(icon.label.rect),background:i===active?th.gold:th.ground,outline:i===active?undefined:`2px solid ${th.hair}`,outlineOffset:-2,opacity:icon.label.presence}}>
          <Text text={data.tools[i].name} box={{x:LABEL_PAD_X,y:0,width:icon.label.rect.width-2*LABEL_PAD_X,height:icon.label.rect.height}} size={44} min={28} lines={1} weight={700} color={i===active?th.tagInk:th.gold} align={rtl?'right':'left'}/>
        </div>
        <svg width={1080} height={1920} style={{position:'absolute',inset:0,opacity:icon.label.presence,pointerEvents:'none'}}><path d={`M${icon.label.tipX} ${icon.label.rect.y+icon.label.rect.height} L${icon.rect.x+icon.rect.width/2} ${icon.rect.y}`} fill="none" stroke={th.gold} strokeWidth={2} strokeLinecap="butt"/></svg>
      </>:null}
    </React.Fragment>)}
    <Cursor {...S.cursor}/>
  </>;
};
export const MagneticDock:React.FC<ConceptDesignProps<MagneticDockData>> = ({sectionIndex=0,...p})=><Sheet rtl={p.config.tools.some(t=>dirOf(t.name)==='rtl')} backdrop={p.backdrop} sectionIndex={sectionIndex}><Drawing {...p}/></Sheet>;
