import React from 'react';
import {useCurrentFrame} from 'remotion';
import {isArabic} from '../../../core/type';
import {EASE, clamp01} from '../../../core/motion';
import {useProbe} from '../../../core/safe';
import {DesignText, useDesignText} from '../../../style-kit/digits';
import {AR, Mask, NAVY, fit, fitWarning, useMagazine, planHeadline, type HPlan} from '../system/base';
import {balancedLines} from '../system/page-parts';

export const language = (strings: string[]) => ({lang: isArabic(strings.join(' ')) ? 'ar' : 'en'});
export const Dressing: React.FC<{children?: React.ReactNode}> = ({children}) => useProbe() === null ? <>{children}</> : null;

// Fixed boxes clip only after warning at the type floor; they never resize the mechanism.
export function textPlan(text: string, width: number, height: number, size: number, floor: number, weight: number, maxLines = 3, font = AR) {
  const lines = Math.max(1, Math.min(maxLines, Math.floor(height / (floor * 1.2))));
  let result = fit(text, {width, size, min: floor, lines, weight, lh: 1.2}, font);
  for (let s = result.size; s >= floor; s--) {
    const candidate = fit(text, {width, size: s, min: s, lines, weight, lh: 1.2}, font);
    const balanced = candidate.lines.length > 1 ? balancedLines(text, s, weight, width, font) : candidate.lines;
    result = {...candidate, lines: balanced};
    if (candidate.fits && candidate.box * balanced.length <= height) return result;
  }
  fitWarning(text, width, floor, lines);
  return {...result, fits: false};
}

export const TextBox: React.FC<{text: string; width: number; height: number; size: number; floor: number; weight: number; color?: string; lines?: number; align?: 'left' | 'right' | 'center'}> = (p) => {
  const {copy, font} = useMagazine();
  const shown = useDesignText();
  const t = textPlan(shown(p.text), p.width, p.height, p.size, p.floor, p.weight, p.lines, font);
  return <div data-p2-text="" data-size={t.size} data-floor={p.floor} data-fits={t.fits} data-text-height={t.box * t.lines.length}
    style={{width: p.width, height: p.height, overflow: 'hidden', fontFamily: font, fontSize: t.size, fontWeight: p.weight, lineHeight: `${t.box}px`, color: p.color ?? NAVY.ink, direction: copy.dir, textAlign: p.align ?? copy.align}}>
    {t.lines.map((line, i) => <div key={i} style={{whiteSpace: 'nowrap'}}><bdi dir="auto"><DesignText>{line}</DesignText></bdi></div>)}
  </div>;
};

export type TitleBeat = {at: number; text: string};
export const SwapTitle: React.FC<{beats: TitleBeat[]; top: number; height: number; size: number; floor: number}> = ({beats, top, height, size, floor}) => {
  const f = useCurrentFrame(), probe = useProbe() !== null;
  let active = 0;
  beats.forEach((beat, i) => {if (f >= beat.at) active = i;});
  const beat = beats[active], elapsed = f - beat.at;
  const draw = (text: string) => <TextBox text={text} width={950} height={height} size={size} floor={floor} weight={800} lines={1}/>;
  return <div data-p2-header="" style={{position: 'absolute', left: 65, top, width: 950, height, overflow: 'hidden'}}>
    {active > 0 && elapsed < 8 && !probe ? <div style={{position: 'absolute', inset: 0, transform: `translateY(${30 * EASE.land(clamp01(elapsed / 8))}px)`, opacity: 1 - clamp01(elapsed / 8)}}>{draw(beats[active - 1].text)}</div> : null}
    <Mask h={height} pad={16} k={probe ? 1 : EASE.land(clamp01((elapsed - (active ? 4 : 0)) / 14))}>{draw(beat.text)}</Mask>
  </div>;
};

export function focusCardPlan(label: string, detail: string | undefined, width: number, height: number, focus = 1, font = AR) {
  const body = detail ? textPlan(detail, width, Math.max(53, height - 118), 44, 34, 400, 3, font) : null;
  const bodyHeight = body ? body.box * body.lines.length : 0;
  const room = height - 26 - (body ? 24 + bodyHeight : 0), max = Math.max(56, Math.floor(40 + 56 * focus));
  let headline = planHeadline(label, {width, max, min: 56, lines: 4, maxHeight: room}, font);
  const words = label.trim().split(/\s+/);
  // planHeadline joins very short words to its key row. A two-word focused title
  // still needs the explicitly requested contrast (for example "A result").
  if (words.length >= 2 && headline.rows.every(row => row.key)) {
    const size = Math.max(56, Math.min(headline.size, Math.floor(room / 2 / 1.2)));
    const thin = fit(words.slice(0, -1).join(' '), {width, size, min: 56, lines: 2, weight: 200, lh: 1.2}, font);
    const key = fit(words.at(-1)!, {width, size: thin.size, min: 56, lines: 2, weight: 800, lh: 1.2}, font);
    const rows = [...thin.lines.map(text => ({text, key: false})), ...key.lines.map(text => ({text, key: true}))];
    headline = {...headline, size: Math.min(thin.size, key.size), box: Math.round(Math.min(thin.size, key.size) * 1.2), rows};
    headline.height = headline.rows.length * headline.box;
  }
  const ruleY = headline.height + 24, bodyY = ruleY + 2 + 24, blockHeight = body ? bodyY + bodyHeight : ruleY + 2;
  return {headline, body, ruleY, bodyY, blockHeight, top: Math.max(0, (height - blockHeight) / 2)};
}

export const FocusCard: React.FC<{label: string; detail?: string; width: number; height: number; focus: number}> = ({label, detail, width, height, focus}) => {
  const {font, copy} = useMagazine(), shown = useDesignText(), p = focusCardPlan(shown(label), detail ? shown(detail) : undefined, width, height, focus, font);
  return <div data-focus-content="" data-focus-layout={JSON.stringify({top: p.top, height: p.blockHeight, titleHeight: p.headline.height, ruleY: p.ruleY, bodyY: p.bodyY, titleSize: p.headline.size})}
    style={{position: 'absolute', left: 0, top: p.top, width, height: Math.min(height, p.blockHeight), overflow: 'hidden', direction: copy.dir}}>
    <div data-focus-headline="" data-headline-size={p.headline.size} style={{height: p.headline.height, overflow: 'hidden'}}>
      {p.headline.rows.map((row: HPlan['rows'][number], i: number) => <div key={i} data-headline-weight={row.key ? 800 : 200} style={{fontFamily: font, fontSize: p.headline.size, fontWeight: row.key ? 800 : 200, lineHeight: `${p.headline.box}px`, height: p.headline.box, color: NAVY.ink, textAlign: copy.align, whiteSpace: 'nowrap'}}><bdi dir="auto">{row.text}</bdi></div>)}
    </div>
    <div data-focus-rule="" style={{position: 'absolute', top: p.ruleY, width, height: 2, background: NAVY.gold}}/>
    {detail && p.body ? <div style={{position: 'absolute', top: p.bodyY}}><TextBox text={detail} width={width} height={p.body.box * p.body.lines.length} size={44} floor={34} weight={400} color={NAVY.dim}/></div> : null}
  </div>;
};
