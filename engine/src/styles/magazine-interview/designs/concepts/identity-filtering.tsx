import React from 'react';
import type {ConceptDesignProps} from './types';
import {formatNumber} from '../../../../core/numbers';
import {CONCEPT_BOX, Dressing, dirOf, useConceptDigits} from '../../../../motion-concepts/shared';
import {MIN_FRAMES, layoutFor, stateAt} from '../../../../motion-concepts/identity-filtering/math';
import {identityFilteringSchema, type FilteringCriterion, type IdentityFilteringData} from '../../../../motion-concepts/identity-filtering/schema';
import {MarkRing} from '../../system/base';
import {Canvas, Frame, NAVY as t, Text, WireDiamond, rectStyle, useConceptFrame} from './own-drawing';

export const typedValue = (value: number | boolean, number: (n: number) => string): string => typeof value === 'boolean' ? (value ? '✓' : '×') : number(value);
export const predicate = (c: FilteringCriterion, number: (n: number) => string) => `${c.op === 'gte' ? '≥' : c.op === 'lte' ? '≤' : '='} ${typedValue(c.value, number)}`;
export const identityParams = (config: IdentityFilteringData, mode: 'once' | 'loop' = 'once') => ({data: config, box: CONCEPT_BOX, mode, rtl: dirOf(`${config.title} ${config.cards.map(c => c.label).join(' ')}`) === 'rtl'});

const Diagram: React.FC<{data: IdentityFilteringData; duration: number; mode: 'once' | 'loop'}> = ({data, duration, mode}) => {
  const f = useConceptFrame(duration, MIN_FRAMES), params = identityParams(data, mode), rtl = params.rtl;
  const L = layoutFor(CONCEPT_BOX, data.cards.length, data.criteria.length, rtl), S = stateAt(f, duration, params);
  const digits = useConceptDigits(data.title);
  const number = (v: number) => formatNumber(v, {digits, decimals: String(v).split('.')[1]?.length ?? 0, grouping: false});
  return <div data-concept="identity-filtering" data-mechanism-rects={JSON.stringify(S.rects)} style={{position: 'absolute', inset: 0, opacity: S.presence}}>
    <Text box={L.title} text={data.title} size={56} floor={34} weight={800}/>
    {data.criteria.map((c, i) => {
      const box = L.criteria[i], s = S.criteria[i], w = box.width;
      const metaW = (w - 48) / 2;
      return <Frame key={c.id} box={box} active={s.active || s.completed} fill={s.active ? t.faint : t.ground} hook={{'data-criterion-id': c.id}}>
        <Text box={{x: 5, y: 4, width: 28, height: 32}} text={number(i + 1)} size={40} floor={28} mono numeric weight={500} color={t.gold} align="center" lh={1.1} hook={{'data-number-kind': 'step'}}/>
        <Text box={{x: 37, y: 4, width: metaW, height: 32}} text={predicate(c, number)} size={28} floor={28} mono numeric weight={500} color={t.gold} align="left" lh={1.1}/>
        <Text box={{x: 39 + metaW, y: 4, width: metaW, height: 32}} text={s.completed ? `${number(s.inputCount)} → ${number(s.retainedCount)}` : `${number(i + 1)} / ${number(data.criteria.length)}`} size={28} floor={28} mono numeric weight={500} color={t.gold} align="right" lh={1.1}/>
        <Text box={{x: 8, y: 42, width: w - 16, height: 80}} text={c.label} size={34} floor={34} lines={2} weight={600}/>
        <div style={{position: 'absolute', bottom: 0, [rtl ? 'right' : 'left']: 0, width: w * s.progress, height: 3, background: t.gold}}/>
      </Frame>;
    })}
    <Text box={L.laneLabels[0]} text={S.resolved > 0 ? data.retainedLabel : data.sourceLabel} size={28} floor={28} weight={600}/>
    <Text box={L.laneLabels[1]} text={data.rejectedLabel} size={28} floor={28} weight={600} color={t.dim}/>
    <Dressing><svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
      {L.rows.map((row, i) => <g key={i}>
        <path d={`M${L.region.x + 10} ${row.y + 36}H${L.region.x + L.region.width - 10}`} fill="none" stroke={t.hair} strokeWidth={2}/>
        <WireDiamond x={S.cards[i].rect.x + S.cards[i].rect.width / 2} y={row.y + 36} size={11} color={S.cards[i].status === 'rejected' ? t.dim : t.gold}/>
      </g>)}
    </svg></Dressing>
    {S.cards.map((s, i) => {
      const c = data.cards[i], w = s.rect.width, rejected = s.status === 'rejected', retained = s.status === 'retained';
      const marker = rejected ? `× ${number(s.rejectedAt + 1)}` : retained ? `✓ ${number(s.criterionIndex + 1)}` : number(s.criterionIndex + 1);
      return <Frame key={c.id} box={s.rect} active={retained} opacity={rejected ? .55 : 1} fill={retained ? t.faint : t.ground}
        hook={{'data-card-id': c.id, 'data-status': s.status, 'data-rejected-at': s.rejectedAt}}>
        <Text box={{x: rtl ? 46 : 10, y: 2, width: w - 56, height: 37}} text={c.label} size={34} floor={34} weight={600} color={rejected ? t.dim : t.ink} lh={1.1}/>
        <div style={{position: 'absolute', left: rtl ? 10 : w - 38, top: 6}}>{rejected || retained
          ? <MarkRing size={28} ring={1} mark={1} kind={rejected ? 'cross' : 'check'} ringColor={rejected ? t.dim : t.gold} markColor={rejected ? t.ink : t.gold}/>
          : <svg width={28} height={28}><WireDiamond x={14} y={14} size={11} color={t.dim}/></svg>}</div>
        <Text box={{x: 10, y: 39, width: 116, height: 32}} text={c.id} size={28} floor={28} mono weight={500} color={t.gold} align="left" lh={1.14}/>
        <Text box={{x: 136, y: 39, width: w - 214, height: 32}} text={typedValue(s.value, number)} size={28} floor={28} mono numeric weight={500} color={t.gold} align="right" lh={1.14}/>
        <Text box={{x: w - 68, y: 39, width: 58, height: 32}} text={marker} size={40} floor={28} mono numeric weight={500} color={rejected ? t.dim : t.gold} align="right" lh={1.14} hook={{'data-number-kind': 'step'}}/>
      </Frame>;
    })}
    <div style={{...rectStyle(L.footer), borderTop: `2px solid ${t.hair}`, boxSizing: 'border-box', overflow: 'hidden'}}>
      <Text box={{x: rtl ? 180 : 0, y: 6, width: L.footer.width - 180, height: 44}} text={S.resolved > 0 ? data.retainedLabel : data.sourceLabel} size={34} floor={34} weight={600}/>
      <Text box={{x: rtl ? 0 : L.footer.width - 170, y: 6, width: 170, height: 44}} text={`${number(S.remainingCount)} / ${number(data.cards.length)}`} size={32} floor={28} mono numeric weight={500} color={t.gold} align={rtl ? 'left' : 'right'}/>
    </div>
  </div>;
};

export const IdentityFiltering: React.FC<ConceptDesignProps<IdentityFilteringData>> = ({config, durationInFrames, mode = 'once', backdrop, sectionIndex = 0}) => {
  const data = identityFilteringSchema.parse(config), params = identityParams(data, mode);
  return <Canvas rtl={params.rtl} backdrop={backdrop} sectionIndex={sectionIndex}><Diagram data={data} duration={durationInFrames} mode={mode}/></Canvas>;
};
