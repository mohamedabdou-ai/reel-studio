// Shared drawing helpers for the three magazine-interview family designs: page furniture built only from rules and diamonds,
// number formatting that follows the creator's digit choice, and the settled-state wrapper used by the safe-zone probe.
import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {useProbe} from '../../../core/safe';
import {useDesignText} from '../../../style-kit/digits';
import {displayWeight} from '../../../style-kit/design-safety';
import {Diamond, Ground, Headline, Mask, CW, HEAVY, THIN, W, X0, X1, mix, ramp, railInset, useMagazine, useType, wrapWords, type HPlan, type Theme} from './base';

/** Under the safe-zone probe every animation reads a frame long past its end, so the final settled state is measured. */
export const Settled: React.FC<{children?: React.ReactNode}> = ({children}) =>
  useProbe() === null ? <>{children}</> : <Sequence from={-100000} layout="none">{children}</Sequence>;

/** Where the headline may sit: narrower when a scene sticker occupies the top corner of the page. */
export type HeadBox = {right: number; width: number; sticker: boolean};
export const headBox = (sticker: unknown): HeadBox => sticker ? {right: W - 828, width: 828 - X0, sticker: true} : {right: W - X1, width: CW, sticker: false};

export const decimalsOf = (n: number) => n.toFixed(6).split('.')[1].replace(/0+$/, '').length;

/** Formats a number the way the style prints it (minus sign, thousands commas) and then applies the creator's digit choice. */
export const useFormat = () => {
  const shown = useDesignText();
  return (n: number, decimals = 0, group = true) => {
    const [whole, frac] = Math.abs(n).toFixed(decimals).split('.');
    const body = group && whole.length > 3 ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole;
    return shown((n < 0 ? '−' : '') + body + (frac ? '.' + frac : ''));
  };
};

/** A page of the magazine: grained ground with a double gold rule and a diamond at its head. No folio words, only furniture. */
export const PlainPage: React.FC<{th: Theme; children?: React.ReactNode}> = ({th, children}) => {
  const f = useCurrentFrame();
  const {copy} = useMagazine();
  const a = ramp(f, 0, 28), b = ramp(f, 6, 28);
  return <AbsoluteFill>
    <Ground th={th}/>
    <div style={{position: 'absolute', top: 262, [copy.side]: X0, width: CW * a, height: 2, background: th.gold}}/>
    <div style={{position: 'absolute', top: 271, [copy.side]: X0, width: CW * b, height: 1, background: th.gold, opacity: 0.5}}/>
    <Diamond size={14} color={th.gold} style={{position: 'absolute', top: 256, [copy.side]: X0 - 4, opacity: a}}/>
    {children}
  </AbsoluteFill>;
};

/** A diamond bullet followed by one line of text that rises through a padded mask: the unit line of a figure. */
export const DiamondLine: React.FC<{text: string; top: number; at: number; th: Theme; size?: number; weight?: number; color?: string; right?: number; width?: number}> = ({text, top, at, th, size = 52, weight = 500, color, right = W - X1, width: space = CW}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {fit} = useType();
  const rail = railInset(top, Math.round(size * 1.3), copy.side);
  const width = space - rail - 40;
  const t = fit(text, {width, size, min: 34, lines: 1, weight});
  const k = ramp(f, at, 20);
  return <>
    <Diamond size={13} color={th.gold} style={{position: 'absolute', top: top + t.box / 2 - 6, [copy.side]: right + rail + 3, opacity: ramp(f, at, 12)}}/>
    <div style={{position: 'absolute', top, [copy.side]: right + rail + 40, width, direction: copy.dir}}>
      <Mask h={t.box} pad={Math.round(t.size * 0.34)} k={k}>
        <div style={{fontFamily: font, fontWeight: weight, fontSize: t.size, lineHeight: `${t.box}px`, height: t.box, color: color ?? th.dim, whiteSpace: 'nowrap', textAlign: copy.align}}>{text}</div>
      </Mask>
    </div>
  </>;
};

/** A headline of one row when it fits (thin words, then heavy words); otherwise the kit's stacked two-weight plan. */
export type HeaderPlan = {kind: 'row'; size: number; box: number; thin: string; key: string; height: number} | {kind: 'stack'; plan: HPlan; height: number};

/** `split` fixes which words are thin and which heavy; without it the last one to three words go heavy, as the kit's planner does. */
export const useHeaderPlan = (text: string | undefined, width: number, o: {max?: number; min?: number; lines?: number; maxHeight?: number; split?: {thin: string; key: string}} = {}): HeaderPlan | null => {
  const {font} = useMagazine();
  const {wid, planHeadline} = useType();
  if (!text) return null;
  const {max = 108, min = 84, lines = 2, maxHeight} = o;
  const words = text.trim().split(/\s+/), n = words.length;
  const kc = Math.min(n, n <= 3 ? 1 : n <= 6 ? 2 : 3);
  const thin = o.split ? o.split.thin : words.slice(0, n - kc).join(' '), key = o.split ? o.split.key : words.slice(n - kc).join(' ');
  const heavy = displayWeight(font, 'Alexandria', HEAVY);
  for (let s = max; s >= min; s -= 2) {
    const w = (thin ? wid(thin, s, THIN) + s * 0.3 : 0) + wid(key, s, heavy);
    if (w <= width) { const box = Math.round(s * 1.3); return {kind: 'row', size: s, box, thin, key, height: box}; }
  }
  const plan = planHeadline(text, {max, min, lines, width, maxHeight});
  return {kind: 'stack', plan, height: plan.height};
};

export const Header: React.FC<{plan: HeaderPlan; th: Theme; top: number; at: number; right: number; width: number; rule?: boolean}> = ({plan, th, top, at, right, width, rule = true}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const heavy = displayWeight(font, 'Alexandria', HEAVY);
  return <>
    {plan.kind === 'stack'
      ? <Headline plan={plan.plan} th={th} top={top} at={at} right={right} width={width}/>
      : <div style={{position: 'absolute', top, [copy.side]: right, width, direction: copy.dir}}>
        <Mask h={plan.box} pad={Math.round(plan.size * 0.34)} k={ramp(f, at, 20)}>
          <div style={{display: 'flex', alignItems: 'baseline', gap: plan.size * 0.3, height: plan.box, direction: copy.dir, whiteSpace: 'nowrap', fontFamily: font, fontSize: plan.size, lineHeight: `${plan.box}px`, color: th.ink}}>
            {plan.thin ? <span style={{fontWeight: THIN}}>{plan.thin}</span> : null}
            <span style={{fontWeight: mix(THIN, heavy, ramp(f, at + 14, 14))}}>{plan.key}</span>
          </div>
        </Mask>
      </div>}
    {rule ? <div style={{position: 'absolute', top: top + plan.height + 22, [copy.side]: right, width: width * ramp(f, at + 8, 26), height: 1.5, background: th.gold}}/> : null}
  </>;
};

/** Greedy wrap, then narrowed a little at a time so the last line is never a single orphan word. */
export const balancedLines = (text: string, size: number, weight: number, width: number, font: string): string[] => {
  const words = text.split(/\s+/), wrap = (w: number) => wrapWords(words, size, weight, w, w, font).lines;
  const lines = wrap(width);
  if (lines.length < 2 || lines[lines.length - 1].includes(' ')) return lines;
  for (let w = width - 24; w >= width * 0.6; w -= 24) {
    const t = wrap(w);
    if (t.length > lines.length) break;
    if (t[t.length - 1].includes(' ')) return t;
  }
  return lines;
};
