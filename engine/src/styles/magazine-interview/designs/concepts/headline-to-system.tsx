import React from 'react';
import type {ConceptDesignProps} from './types';
import {formatNumber} from '../../../../core/numbers';
import {CardMorph} from '../../../../core/transitions-dir';
import {CONCEPT_BOX, dirOf, useConceptDigits} from '../../../../motion-concepts/shared';
import {MIN_FRAMES, layoutFor, roundedPath, stateAt} from '../../../../motion-concepts/headline-to-system/math';
import {headlineToSystemSchema, type HeadlineToSystemData} from '../../../../motion-concepts/headline-to-system/schema';
import {Canvas, Frame, NAVY as t, Text, WireDiamond, rectStyle, useConceptFrame} from './own-drawing';

export const headlineParams = (config: HeadlineToSystemData, mode: 'once' | 'loop' = 'once') => ({box: CONCEPT_BOX, mode, rtl: dirOf(config.coreIdea) === 'rtl', pillK: 0, windowRadius: 0});
const Diagram: React.FC<{data: HeadlineToSystemData; duration: number; mode: 'once' | 'loop'}> = ({data, duration, mode}) => {
  const params = headlineParams(data, mode), L = layoutFor(CONCEPT_BOX, params), S = stateAt(useConceptFrame(duration, MIN_FRAMES), duration, params);
  const digits = useConceptDigits(data.coreIdea);
  return <div data-concept="headline-to-system" data-mechanism-rects={JSON.stringify(S.rects)}>
    {S.cardIn > 0 ? <Frame box={S.hub} active fill={t.faint} opacity={S.cardIn}/> : null}
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}} strokeLinecap="butt" strokeLinejoin="miter">
      {S.cards.map((c, i) => {const r = L.cards[i].route; return <g key={i}>
        <path d={roundedPath(r, 0)} fill="none" stroke={t.hair} strokeWidth={2} opacity={c.line}/>
        <path d={roundedPath(r, 0)} fill="none" stroke={t.gold} strokeWidth={2} pathLength={1} strokeDasharray={`${c.line} 2`}/>
        <WireDiamond x={r[0].x} y={r[0].y} opacity={c.portFrom}/><WireDiamond x={r[3].x} y={r[3].y} opacity={c.portTo}/>
      </g>;})}
    </svg>
    {data.assets.map((asset, i) => {const c = S.cards[i], l = L.cards[i]; return c.presence > 0 ? <CardMorph key={i}
      from={{...l.seed, radius: 0}} to={{...l.card, radius: 0}} progress={c.presence} fit="crop" background={t.ground} style={{opacity: c.fade}}>
      <div data-mechanism-box={JSON.stringify(c.rect)} style={{position: 'absolute', inset: 0, boxSizing: 'border-box', border: `2px solid ${t.hair}`, overflow: 'hidden'}}>
        <div style={{opacity: c.content}}>
          <Text box={l.badge} text={formatNumber(i + 1, {digits})} size={40} floor={28} weight={500} mono numeric color={t.gold} align="center" hook={{'data-number-kind': 'badge'}}/>
          <Text box={l.label} text={asset.label} size={34} floor={34} lines={2} weight={600}/>
        </div>
        {[l.barA, {...l.barB, x: params.rtl ? l.barA.x + l.barA.width * .3 : l.barA.x, width: l.barA.width * .7}].map((b, k) => <div key={k} style={{...rectStyle(b), left: params.rtl ? b.x + b.width * (1 - c.bars[k]) : b.x, width: b.width * c.bars[k], height: 2, background: t.gold}}/>)}
      </div>
    </CardMorph> : null;})}
    <div style={{...rectStyle(L.text), transform: `scale(${S.textScale})`, transformOrigin: '50% 50%', overflow: 'hidden'}}>
      <Text box={{x: 0, y: 0, width: L.text.width, height: L.text.height}} text={data.coreIdea} size={52} floor={34} lines={3} weight={800} align="center"/>
    </div>
  </div>;
};
export const HeadlineToSystem: React.FC<ConceptDesignProps<HeadlineToSystemData>> = ({config, durationInFrames, mode = 'once', backdrop, sectionIndex = 0}) => {
  const data = headlineToSystemSchema.parse(config);
  return <Canvas rtl={headlineParams(data, mode).rtl} backdrop={backdrop} sectionIndex={sectionIndex}><Diagram data={data} duration={durationInFrames} mode={mode}/></Canvas>;
};
