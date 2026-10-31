import React from 'react';
import {useCurrentFrame} from 'remotion';
import {MarkRing, HEAVY, clamp01, ramp, useMagazine} from '../base';
import {displayWeight} from '../../../../style-kit/design-safety';
import {sized} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const heavyOf = (font: string, w = HEAVY) => displayWeight(font, 'Alexandria', w);

export const MarksPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const R = Math.min(sized('mark', scale), box.height - (part.label ? 76 : 0), box.width);
  return <Frame box={box}>
    <div style={{position: 'absolute', left: (box.width - R) / 2, top: Math.max(0, (box.height - R - (part.label ? 76 : 0)) / 2)}}>
      <MarkRing size={R} ring={ramp(f, at, 16)} mark={ramp(f, at + 12, 16)} kind={part.mark} ringColor={th.gold} markColor={part.mark === 'cross' ? th.ink : th.gold} fillColor={th.gold} fill={ramp(f, at + 26, 12)}/>
    </div>
    {part.label ? <div style={{position: 'absolute', left: 0, width: box.width, top: Math.max(0, (box.height - R - 76) / 2) + R + 18, textAlign: 'center', direction: copy.dir, fontFamily: font, fontWeight: heavyOf(font, 700), fontSize: 44, lineHeight: '58px', color: th.ink, whiteSpace: 'nowrap', ...rise(f, at + 20, 16)}}>{part.label}</div> : null}
  </Frame>;
};
