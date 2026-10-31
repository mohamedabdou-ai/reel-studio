import React from 'react';
import {Easing, useCurrentFrame} from 'remotion';
import {Diamond, Mask, HEAVY, THIN, clamp01, ramp, useMagazine, useType} from '../base';
import {decimalsOf, useFormat} from '../page-parts';
import {displayWeight} from '../../../../style-kit/design-safety';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const heavyOf = (font: string, w = HEAVY) => displayWeight(font, 'Alexandria', w);
const settle = Easing.bezier(0.2, 0.7, 0.2, 1);

export const BarsPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {wid} = useType();
  const fmt = useFormat();
  const n = part.items.length;
  const max = part.max ?? Math.max(1, ...part.items.map((b: any) => b.value));
  const unitH = part.unit ? 64 : 0;
  const rowH = (box.height - unitH) / n;
  const stacked = n <= 3;
  const L = stacked ? Math.max(48, Math.min(76, Math.floor(rowH * 0.26))) : Math.max(40, Math.min(54, Math.floor(rowH * 0.44)));
  const V = stacked ? Math.max(64, Math.min(170, Math.floor(rowH * 0.5))) : Math.max(46, Math.min(84, Math.floor(rowH * 0.62)));
  const T = stacked ? Math.max(26, Math.min(72, Math.floor(rowH * 0.24))) : Math.max(18, Math.min(28, Math.floor(rowH * 0.22)));
  const Lw = stacked ? 0 : Math.min(box.width * 0.42, Math.max(...part.items.map((b: any) => wid(b.label, L, 800)))) + 30;
  const dec = part.items.map((b: any) => decimalsOf(b.value));
  const valW = Math.max(...part.items.map((b: any, i: number) => wid(fmt(b.value, dec[i]) + '', V, THIN))) + 28;
  const trackW = box.width - Lw - valW;
  return <Frame box={box}>
    {part.unit ? <div style={{position: 'absolute', top: 0, [copy.side]: 0, display: 'flex', alignItems: 'center', gap: 22, direction: copy.dir, ...rise(f, at, 18)}}>
      <Diamond size={13} color={th.gold}/><span style={{fontFamily: font, fontWeight: 500, fontSize: 40, lineHeight: '52px', color: th.dim, whiteSpace: 'nowrap'}}>{part.unit}</span>
    </div> : null}
    {part.items.map((b: any, i: number) => {
      const a = at + (b.offsetFrames ?? i * 9);
      const k = ramp(f, a, 22), grow = ramp(f, a + 8, 40, settle);
      const y = unitH + i * rowH;
      const len = trackW * (b.value / max) * grow;
      const barY = stacked ? y + L * 1.3 + 12 + Math.max(0, (rowH - L * 1.3 - 12 - T) / 2 - 8) : y + (rowH - T) / 2;
      const valueText = fmt(b.value * grow, dec[i]);
      // bars grow from the copy side; the value sits just past the tip
      const tip = Lw + len;
      return <React.Fragment key={i}>
        {i > 0 ? <div style={{position: 'absolute', top: y - 1, [copy.side]: 0, width: box.width * ramp(f, Math.max(at, a - 4), 24), height: 1.5, background: th.gold, opacity: 0.4}}/> : null}
        <div style={{position: 'absolute', top: stacked ? y + 10 : y + (rowH - L * 1.3) / 2, [copy.side]: 0, width: stacked ? box.width : Lw - 30, direction: copy.dir}}>
          <Mask h={Math.round(L * 1.3)} pad={Math.round(L * 0.34)} k={k}>
            <div style={{fontFamily: font, fontWeight: heavyOf(font), fontSize: L, lineHeight: `${Math.round(L * 1.3)}px`, height: Math.round(L * 1.3), color: th.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', textAlign: copy.align}}>{b.label}</div>
          </Mask>
        </div>
        <div style={{position: 'absolute', top: barY, [copy.side]: Lw, width: len, height: T, background: th.gold}}/>
        <div style={{position: 'absolute', top: barY - 8, [copy.side]: tip - 2, width: 3, height: T + 16, background: th.gold, opacity: grow > 0.02 ? 1 : 0}}/>
        <div style={{position: 'absolute', top: barY + T / 2 - V * 0.52, [copy.side]: tip + 22, direction: 'ltr', fontFamily: font, fontWeight: THIN, fontSize: V, lineHeight: `${V}px`, color: th.ink, opacity: clamp01(k * 1.8), whiteSpace: 'nowrap'}}>{valueText}</div>
      </React.Fragment>;
    })}
  </Frame>;
};
