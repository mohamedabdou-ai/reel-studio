import React from 'react';
import type {ConceptDesignProps} from './types';
import type {DigitSet} from '../../../../core/numbers';
import {toArabicIndic} from '../../../../core/digits';
import {CONCEPT_BOX, dirOf, useConceptDigits} from '../../../../motion-concepts/shared';
import {centerRect, roundRect} from '../../../../motion-concepts/geometry';
import {MIN_FRAMES, layoutFor, stateAt} from '../../../../motion-concepts/conditional-branching/math';
import {conditionalBranchingSchema, type ConditionalBranchingData} from '../../../../motion-concepts/conditional-branching/schema';
import {MarkRing} from '../../system/base';
import {Canvas, Frame, NAVY as t, Text, WireDiamond, useConceptFrame} from './own-drawing';
import {branchingCopy} from './copy-own';
import {DockedToken, outcomeSections, routeAtCard} from './branching-landing';

export const branchingParams = (config: ConditionalBranchingData, mode: 'once' | 'loop' = 'once') => ({box: CONCEPT_BOX, mode, data: config,
  rtl: dirOf([config.input.label, config.condition.label, config.branches.whenTrue, config.branches.whenFalse].join(' ')) === 'rtl'});

/** No rounding: even a decisive seventh decimal remains visible. */
export const valueText = (value: number | boolean, rtl: boolean, digits: DigitSet) => {
  const c = branchingCopy(rtl);
  if (typeof value === 'boolean') return value ? c.true : c.false;
  return digits === 'latin' ? String(value) : toArabicIndic(String(value));
};

const Diagram: React.FC<{data: ConditionalBranchingData; duration: number; mode: 'once' | 'loop'}> = ({data, duration, mode}) => {
  const params = branchingParams(data, mode), rtl = params.rtl, L = layoutFor(CONCEPT_BOX, rtl), S = stateAt(useConceptFrame(duration, MIN_FRAMES), duration, params);
  const digits = useConceptDigits([data.input.label, data.condition.label, data.branches.whenTrue, data.branches.whenFalse].join(' '));
  const c = branchingCopy(rtl), expression = `${data.condition.kind === 'boolean-equals' ? '=' : '≥'} ${valueText(data.condition.kind === 'boolean-equals' ? data.condition.equals : data.condition.threshold, rtl, digits)}`;
  const result = S.condition.result === null ? c.evaluating : S.condition.result ? c.matched : c.unmatched;
  const token = roundRect(centerRect(S.token.x, S.token.y, S.token.width, S.token.height));
  const landed = S.branches.some(b => b.progress >= 1);
  const wire = (d: string, progress: number, dim = false) => <>
    <path d={d} fill="none" stroke={t.hair} strokeWidth={2} opacity={dim ? .5 : 1}/>
    {progress > 0 ? <path d={d} fill="none" stroke={t.gold} strokeWidth={3} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress}/> : null}
  </>;
  return <div data-conditional-branching="graphic" data-selected-route={S.selected ?? 'pending'} data-mechanism-rects={JSON.stringify(S.rects)} style={{position: 'absolute', inset: 0, opacity: S.presence}}>
    <Text box={L.title} text={c.title} size={48} floor={34} weight={800}/>
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}} strokeLinecap="butt" strokeLinejoin="miter">
      {wire(L.approach.d, S.approach)}{wire(L.trunk.d, S.trunk)}
      <path d={`M${L.condition.x + (rtl ? 0 : L.condition.width)} ${L.gate.y}H${L.gate.x}`} fill="none" stroke={S.condition.result === null ? t.hair : t.gold} strokeWidth={2}/>
      {L.branches.map((b, i) => <g key={b.key} data-route={b.key} data-active={String(S.branches[i].active)}>
        {wire(landed ? routeAtCard(b.path.d, b.rect) : b.path.d, S.branches[i].progress, !!S.selected && !S.branches[i].active)}
        <WireDiamond x={b.arrow.x} y={b.arrow.y} color={S.branches[i].active ? t.gold : t.hair}/>
      </g>)}
      <WireDiamond x={L.fork.x} y={L.fork.y} color={S.selected ? t.gold : t.hair}/>
    </svg>
    <Frame box={L.condition} active={S.condition.evaluation > 0}>
      <Text box={{x: 16, y: 8, width: L.condition.width - 32, height: 44}} text={data.condition.label} size={36} floor={34} weight={600}/>
      <Text box={{x: 16, y: 62, width: L.condition.width - 32, height: 50}} text={expression} size={40} floor={28} mono numeric weight={500} color={t.gold}/>
      <div style={{position: 'absolute', left: 16, top: 122, width: L.condition.width - 32, height: 2, background: t.hair}}><div style={{position: 'absolute', [rtl ? 'right' : 'left']: 0, width: `${100 * S.condition.evaluation}%`, height: 3, background: t.gold}}/></div>
      <Text box={{x: 16, y: 138, width: L.condition.width - 32, height: 45}} text={result} size={34} floor={34} weight={400} color={t.dim}/>
    </Frame>
    {L.branches.map((b, i) => {
      const s = S.branches[i], w = b.rect.width, markSize = 28;
      // MarkRing's 48%-radius circle and 2.2px stroke extend .54px beyond a 28px SVG.
      // Measure the requested 12px corner gap to its painted outer stroke.
      const bleed = markSize * .48 + 1.1 - markSize / 2;
      const markBox = {x: rtl ? w - 12 - markSize - bleed : 12 + bleed, y: 12 + bleed, width: markSize, height: markSize};
      const sections = outcomeSections(b.rect);
      return <Frame key={b.key} box={b.rect} active={s.active}
      fill={s.active ? t.faint : t.ground} opacity={S.selected && !s.active ? .55 : 1} hook={{'data-outcome': b.key, 'data-active': String(s.active),
        'data-label-row-rect': JSON.stringify(sections.labelRow), 'data-body-rect': JSON.stringify(sections.body), 'data-outcome-name-rect': JSON.stringify(sections.outcome)}}>
      <div data-outcome-mark={b.key} data-mark-box={JSON.stringify(markBox)} style={{position: 'absolute', left: markBox.x, top: markBox.y, width: markSize, height: markSize, display: 'flex'}}><MarkRing size={markSize} ring={1} mark={1} kind={b.key === 'whenTrue' ? 'check' : 'cross'} ringColor={b.key === 'whenTrue' ? t.gold : t.dim} markColor={b.key === 'whenTrue' ? t.gold : t.ink}/></div>
      <Text box={{x: rtl ? w - 122 : 46, y: 4, width: 72, height: 40}} text={b.key === 'whenTrue' ? c.yes : c.no} size={34} floor={34} weight={600} hook={{'data-branch-label': b.key}}/>
      <Text box={{x: 16, y: 149, width: w - 32, height: b.rect.height - 151}} text={data.branches[b.key]} size={34} floor={34} lines={2} weight={600} lh={1}
        hook={{'data-copy-part': 'outcome-label'}}/>
      {s.active ? <DockedToken name={S.token.label} score={valueText(S.token.value, rtl, digits)} id={S.token.id}
        body={{...sections.body, x: sections.body.x - Math.round(b.rect.x), y: sections.body.y - Math.round(b.rect.y)}} opacity={S.resolved}/> : null}
      {s.active ? <div style={{position: 'absolute', top: 2, left: 2, right: 2, height: 3, background: t.gold, opacity: S.resolved}}/> : null}
    </Frame>;})}
    <div data-token-drawing="true" data-token-scale={1}
      style={{position: 'absolute', left: token.x, top: token.y, width: token.width, height: token.height}}>
    <Frame box={{x: 0, y: 0, width: token.width, height: token.height}} active fill="transparent" frameOpacity={1 - S.resolved} hook={{'data-token-id': S.token.id}}>
      <div data-token-fill-opacity={1 - S.resolved} style={{position: 'absolute', inset: 0, background: t.ground, opacity: 1 - S.resolved, pointerEvents: 'none'}}/>
      <div data-travelling-copy-opacity={1 - S.resolved} style={{position: 'absolute', inset: 0, opacity: 1 - S.resolved}}>
      <Text box={{x: 12, y: 2, width: token.width - 24, height: 74}} text={S.token.label} size={34} floor={34} lines={2} weight={700} lh={1.08} hook={{'data-token-part': 'label'}}/>
      <Text box={{x: 12, y: 76, width: token.width - 24, height: 29}} text={valueText(S.token.value, rtl, digits)} size={28} floor={28} mono numeric weight={500} color={t.gold} align={rtl ? 'right' : 'left'} lh={1}/>
      <Text box={{x: 12, y: 105, width: token.width - 24, height: 29}} text={S.token.id} size={28} floor={28} mono weight={500} color={t.gold} lh={1}/>
      </div>
    </Frame>
    </div>
  </div>;
};

export const ConditionalBranching: React.FC<ConceptDesignProps<ConditionalBranchingData>> = ({config, durationInFrames, mode = 'once', backdrop, sectionIndex = 0}) => {
  const data = conditionalBranchingSchema.parse(config);
  return <Canvas rtl={branchingParams(data, mode).rtl} backdrop={backdrop} sectionIndex={sectionIndex}><Diagram data={data} duration={durationInFrames} mode={mode}/></Canvas>;
};
