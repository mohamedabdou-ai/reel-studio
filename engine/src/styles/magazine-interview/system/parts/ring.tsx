import React from 'react';
import {Easing, useCurrentFrame} from 'remotion';
import {Diamond, THIN, SUF_TOP, clamp01, ramp, useMagazine, useType} from '../base';
import {decimalsOf, useFormat} from '../page-parts';
import {DesignText} from '../../../../style-kit/digits';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const settle = Easing.bezier(0.2, 0.7, 0.2, 1);

export const RingPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {wid, fit} = useType();
  const fmt = useFormat();
  const labelH = part.label ? 70 : 0;
  const D = Math.min(box.width, box.height - labelH), R = D / 2, track = D - 56, r = track / 2;
  const cx = box.width / 2, cy = R;
  const frac = part.max > 0 ? Math.min(1, part.value / part.max) : 0;
  const draw = ramp(f, at + 12, 62, settle), outer = ramp(f, at, 30);
  const dec = decimalsOf(part.value);
  const finalText = fmt(part.value, dec) + '';
  const sfx = part.max === 100 ? '%' : '/' + fmt(part.max, 0);
  let S = 300;
  while (S > 90 && wid(finalText, S, THIN) + wid(sfx, S * 0.3, THIN) + 14 > track * 0.74) S -= 4;
  const circ = 2 * Math.PI * r, headAngle = -Math.PI / 2 + 2 * Math.PI * frac * draw;
  const label = part.label ? fit(part.label, {width: box.width, size: 44, min: 34, lines: 1, weight: 500}) : null;
  return <Frame box={box}>
    <svg width={box.width} height={D} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <circle cx={cx} cy={cy} r={R - 4} fill="none" stroke={th.gold} strokeOpacity={0.4} strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - outer} transform={`rotate(-90 ${cx} ${cy})`}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={th.ink} strokeOpacity={0.28} strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - outer} transform={`rotate(-90 ${cx} ${cy})`}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={th.gold} strokeWidth={12} pathLength={circ} strokeDasharray={`${circ * frac * draw} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`}/>
    </svg>
    <Diamond size={24} color={th.gold} style={{position: 'absolute', left: cx + Math.cos(headAngle) * r - 12, top: cy + Math.sin(headAngle) * r - 12, opacity: ramp(f, at + 12, 8)}}/>
    <div style={{position: 'absolute', left: 0, width: box.width, top: cy - S * 0.42, height: S, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', direction: 'ltr', ...rise(f, at + 8, 30)}}>
      <div style={{fontFamily: font, fontWeight: THIN, fontSize: S, lineHeight: `${S}px`, marginTop: -S * 0.12, color: th.ink, whiteSpace: 'nowrap'}}>{fmt(part.value * draw, dec)}</div>
      <div style={{fontFamily: font, fontWeight: THIN, fontSize: S * 0.3, lineHeight: `${S * 0.3}px`, marginTop: SUF_TOP * S, marginLeft: 14, color: th.gold}}><DesignText>{sfx}</DesignText></div>
    </div>
    {label ? <div style={{position: 'absolute', top: D + 18, left: 0, width: box.width, textAlign: 'center', direction: copy.dir, fontFamily: font, fontWeight: 500, fontSize: label.size, lineHeight: `${label.box}px`, color: th.ink, ...rise(f, at + 56, 18)}}>{part.label}</div> : null}
  </Frame>;
};
