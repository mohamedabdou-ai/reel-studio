import React from 'react';
import type {ConceptDesignProps} from './types';
import {CONCEPT_BOX, Dressing, dirOf} from '../../../../motion-concepts/shared';
import {MIN_FRAMES, layoutFor, stateAt} from '../../../../motion-concepts/data-morph/math';
import {dataMorphSchema, type DataMorphData} from '../../../../motion-concepts/data-morph/schema';
import {SUF_TOP, THIN, useMagazine} from '../../system/base';
import {Canvas, KickerMark, NAVY as t, Text, WireDiamond, rectStyle, textPlan, useConceptFrame} from './own-drawing';

export const morphParams = (config: DataMorphData, mode: 'once' | 'loop' = 'once') => ({box: CONCEPT_BOX, mode, rtl: dirOf(config.metricLabel) === 'rtl', axis: 'ltr' as const, pillK: 0, windowRadius: 0, values: config.values});
const Diagram: React.FC<{data: DataMorphData; duration: number; mode: 'once' | 'loop'}> = ({data, duration, mode}) => {
  const params = morphParams(data, mode), L = layoutFor(CONCEPT_BOX, params), S = stateAt(useConceptFrame(duration, MIN_FRAMES), duration, params);
  const {font} = useMagazine();
  const p = textPlan(data.finalKpi, L.kpi, font, 104, 72, 1, 200);
  const suffix = data.finalKpi.match(/[%٪]$/)?.[0] ?? '', body = suffix ? data.finalKpi.slice(0, -1) : data.finalKpi;
  return <div data-concept="data-morph" data-mechanism-rects={JSON.stringify(S.rects)} style={rectStyle(L.window)}>
    <KickerMark box={L.metric} text={data.metricLabel}/>
    {data.unit ? <Text box={L.chip} text={data.unit} size={28} floor={28} weight={600} color={t.dim}/> : null}
    <div style={{...rectStyle(L.rule), background: t.gold}}/>
    <svg width={L.window.width} height={L.window.height} style={{position: 'absolute', inset: 0}} strokeLinecap="butt" strokeLinejoin="miter">
      {L.grid.map((y, i) => <line key={i} x1={L.plot.x} x2={L.plot.x + L.plot.width} y1={y} y2={y} stroke={t.faint} strokeWidth={1}/>)}
      <line x1={L.plot.x} x2={L.plot.x + L.plot.width} y1={L.baseline} y2={L.baseline} stroke={t.hair} strokeWidth={2}/>
      {L.cx.map((x, i) => <line key={i} x1={x} x2={x} y1={L.baseline} y2={L.baseline + L.tick} stroke={t.hair} strokeWidth={2}/>)}
      {S.links.map((k, i) => k.s > 0 ? <line key={i} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} stroke={t.gold} strokeWidth={4}/> : null)}
      {S.bars.map((b, i) => b.height > 0 ? <g key={i} data-bar={i} data-bar-box={JSON.stringify({x: b.x, y: b.y, width: b.width, height: b.height})}>
        <rect x={b.x + 1} y={b.y + 1} width={Math.max(0, b.width - 2)} height={Math.max(0, b.height - 2)} fill={i === 5 ? t.gold : t.faint} stroke={i === 5 ? t.gold : t.hair} strokeWidth={2} opacity={1 - S.m[i]}/>
        <WireDiamond x={b.cx} y={b.cy} size={i === 5 ? 14 + 8 * S.hi : 14} color={i === 5 && S.hi > 0 ? t.gold : t.ink} opacity={S.m[i]}/>
        {i === 5 && S.hi > 0 ? <circle cx={b.cx} cy={b.cy} r={17} fill="none" stroke={t.gold} strokeWidth={4} opacity={S.hi}/> : null}
      </g> : null)}
      {S.leader.p > 0 ? <line x1={S.leader.x} x2={S.leader.x} y1={S.leader.y1} y2={S.leader.y2} stroke={t.gold} strokeWidth={2}/> : null}
      <Dressing>{S.halo.opacity > 0 ? <circle cx={S.halo.cx} cy={S.halo.cy} r={S.halo.r - 2} stroke={t.gold} strokeWidth={4} fill="none" opacity={S.halo.opacity}/> : null}</Dressing>
    </svg>
    <div data-font-size={p.size} data-text-fits={String(p.fits)} style={{...rectStyle(L.kpi), overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: params.rtl ? 'flex-end' : 'flex-start', opacity: S.kpi, transform: `translateY(${S.kpiDy}px)`, fontFamily: font, fontWeight: 200, fontSize: p.size, lineHeight: `${p.box}px`, color: t.ink}}>
      <bdi dir="ltr" style={{direction: 'ltr', unicodeBidi: 'isolate-override', whiteSpace: 'pre'}}>{body}{suffix ? <span data-kpi-suffix={suffix} data-kpi-size={p.size} style={{display: 'inline-block', fontSize: p.size * .42, fontWeight: THIN, lineHeight: `${p.size * .42}px`, verticalAlign: 'top', marginTop: p.size * (.22 + SUF_TOP), marginLeft: 10, color: t.gold}}>{suffix}</span> : null}</bdi>
    </div>
    <div style={{...rectStyle(L.tag), boxSizing: 'border-box', background: t.ground, opacity: S.tag, transform: `translateY(${S.tagDy}px)`, overflow: 'hidden'}}>
      <Text box={{x: 16, y: 4, width: L.tag.width - 32, height: L.tag.height - 8}} text={data.resultLabel} size={32} floor={32} weight={700} color={t.gold}/>
    </div>
  </div>;
};
export const DataMorph: React.FC<ConceptDesignProps<DataMorphData>> = ({config, durationInFrames, mode = 'once', backdrop, sectionIndex = 0}) => {
  const data = dataMorphSchema.parse(config);
  return <Canvas rtl={morphParams(data, mode).rtl} backdrop={backdrop} sectionIndex={sectionIndex}><Diagram data={data} duration={durationInFrames} mode={mode}/></Canvas>;
};
