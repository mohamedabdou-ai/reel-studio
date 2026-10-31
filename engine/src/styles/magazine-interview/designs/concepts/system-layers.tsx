import React from 'react';
import type {ConceptDesignProps} from './types';
import {formatNumber} from '../../../../core/numbers';
import {useDigits} from '../../../../creative-kit/digits';
import {CONCEPT_BOX, Dressing, dirOf, tint} from '../../../../motion-concepts/shared';
import {MIN_FRAMES, layoutFor, roundedPath, stateAt} from '../../../../motion-concepts/system-layers/math';
import {systemLayersSchema, type SystemLayersData} from '../../../../motion-concepts/system-layers/schema';
import {Mask} from '../../system/base';
import {Canvas, NAVY as t, Text, rectStyle, useConceptFrame} from './own-drawing';

export const layersParams = (config: SystemLayersData, mode: 'once' | 'loop' = 'once') => ({box: CONCEPT_BOX, mode, rtl: config.layers.filter(l => dirOf(l.label) === 'rtl').length * 2 > config.layers.length});

const Diagram: React.FC<{data: SystemLayersData; duration: number; mode: 'once' | 'loop'}> = ({data, duration, mode}) => {
  const params = layersParams(data, mode), f = useConceptFrame(duration, MIN_FRAMES), L = layoutFor(CONCEPT_BOX, params), S = stateAt(f, duration, params);
  const digits = useDigits() ?? (params.rtl ? 'arabic-indic' : 'latin');
  return <div data-concept="system-layers" data-mechanism-rects={JSON.stringify(S.rects)}>
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}} strokeLinejoin="miter">
      <Dressing><g stroke={t.hair} strokeWidth={2}>{S.rails.map((r, i) => <line key={i} x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y}/>)}</g></Dressing>
      {[4, 3, 2, 1, 0].map(i => <g key={i} data-layer={i} stroke={tint(t.hair, t.gold, S.layers[i].active)} strokeOpacity={1 - i * .125} strokeWidth={2} fill={t.ground}>
        <path d={roundedPath(S.layers[i].front, 0)}/><path d={roundedPath(S.layers[i].top, 0)}/>
      </g>)}
    </svg>
    {data.layers.map((item, i) => {
      const l = L.layers[i], s = S.layers[i], title = item.detail ? l.title : l.titleSolo;
      return <div key={i} style={{...rectStyle(l.block), overflow: 'hidden'}}>
        <Mask h={l.block.height} pad={0} k={s.label} rise={10}>
          <div style={{position: 'absolute', left: -l.block.x, top: -l.block.y}}>
            <Text box={l.chip} text={formatNumber(i + 1, {digits})} size={40} floor={28} mono numeric weight={500} color={t.gold} align="center" hook={{'data-number-kind': 'chip'}}/>
            <Text box={title} text={item.label} size={40} floor={40} weight={700}/>
            {item.detail ? <Text box={{...l.detail, y: l.detail.y - 4, height: l.detail.height + 4}} text={item.detail} size={34} floor={34} weight={400} color={t.dim} lh={1.1}/> : null}
          </div>
        </Mask>
      </div>;
    })}
  </div>;
};

export const SystemLayers: React.FC<ConceptDesignProps<SystemLayersData>> = ({config, durationInFrames, mode = 'once', backdrop, sectionIndex = 0}) => {
  const data = systemLayersSchema.parse(config);
  return <Canvas rtl={layersParams(data, mode).rtl} backdrop={backdrop} sectionIndex={sectionIndex}><Diagram data={data} duration={durationInFrames} mode={mode}/></Canvas>;
};
