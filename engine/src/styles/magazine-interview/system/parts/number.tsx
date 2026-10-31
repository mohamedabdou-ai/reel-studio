import React from 'react';
import {Easing, useCurrentFrame} from 'remotion';
import {Diamond, Mask, THIN, SUF_TOP, clamp01, ramp, useMagazine, useType} from '../base';
import {decimalsOf, useFormat} from '../page-parts';
import {DesignText} from '../../../../style-kit/digits';
import {sized} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const settle = Easing.bezier(0.2, 0.7, 0.2, 1);

export const NumberPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale, emphasis, cell}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {wid, fit} = useType();
  const fmt = useFormat();
  const dec = decimalsOf(part.value);
  const final = fmt(part.value, dec) + '';
  const lineSize = sized('line', scale), lineBox = Math.round(lineSize * 1.3);
  const tail = (part.label || part.unit ? 36 : 0) + lineBox * ((part.label ? 1 : 0) + (part.unit ? 1 : 0));
  const suffixW = (S: number) => part.suffix ? wid(part.suffix, S * 0.42, THIN) + 14 : 0;
  let S = emphasis ? 520 : sized('number', scale);
  while (S > 120 && wid(final, S, THIN) + suffixW(S) > box.width - 8) S -= 4;
  S = Math.max(120, Math.min(S, Math.floor((box.height - tail) / 0.82)));
  const boxH = Math.round(S * 0.82);
  const y0 = Math.max(0, (box.height - boxH - tail) * 0.42);
  const roll = ramp(f, at + 8, part.rollFrames ?? 58, settle);
  const ruleTop = y0 + boxH + 30;
  const label = part.label ? fit(part.label, {width: box.width - 40, size: lineSize, min: 34, lines: 1, weight: 600}) : null;
  return <Frame box={box}>
    <div style={{position: 'absolute', top: y0, [copy.side]: 0, width: box.width, height: boxH, direction: 'ltr', display: 'flex', justifyContent: cell ? 'center' : copy.ar ? 'flex-end' : 'flex-start', alignItems: 'flex-start', ...rise(f, at, 36)}}>
      <div data-count-progress={roll} style={{fontFamily: font, fontWeight: THIN, fontSize: S, lineHeight: `${S}px`, marginTop: -S * 0.12, color: th.ink, whiteSpace: 'nowrap'}}>{fmt(part.value * roll, dec)}</div>
      {part.suffix ? <div style={{fontFamily: font, fontWeight: THIN, fontSize: S * 0.42, lineHeight: `${S * 0.42}px`, marginTop: SUF_TOP * S, marginLeft: 14, color: th.gold}}><DesignText>{part.suffix}</DesignText></div> : null}
    </div>
    {part.label || part.unit ? <div style={{position: 'absolute', top: ruleTop, [copy.side]: cell ? box.width * 0.2 : 0, width: box.width * (cell ? 0.6 : 1) * ramp(f, at + 46, 28), height: 2, background: th.gold}}/> : null}
    {label ? <div style={{position: 'absolute', top: ruleTop + 24, [copy.side]: 0, width: box.width, direction: copy.dir, display: 'flex', alignItems: 'center', justifyContent: cell ? 'center' : undefined, gap: 26}}>
      <Diamond size={13} color={th.gold} style={{opacity: ramp(f, at + 56, 12)}}/>
      <Mask h={label.box} pad={Math.round(label.size * 0.34)} k={ramp(f, at + 56, 20)}>
        <div style={{fontFamily: font, fontWeight: 600, fontSize: label.size, lineHeight: `${label.box}px`, height: label.box, color: th.ink, whiteSpace: 'nowrap'}}>{part.label}</div>
      </Mask>
    </div> : null}
    {part.unit ? <div style={{position: 'absolute', top: ruleTop + 24 + (label ? lineBox : 0), [copy.side]: 66, width: box.width - 66, direction: copy.dir, fontFamily: font, fontWeight: 400, fontSize: lineSize * 0.86, lineHeight: `${lineBox}px`, color: th.dim, whiteSpace: 'nowrap', textAlign: copy.align, ...rise(f, at + 62, 18)}}>{part.unit}</div> : null}
  </Frame>;
};
