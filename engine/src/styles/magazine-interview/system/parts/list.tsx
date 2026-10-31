import React from 'react';
import {useCurrentFrame} from 'remotion';
import {MarkRing, HEAVY, MONO, clamp01, ramp, useMagazine, useType} from '../base';
import {displayWeight} from '../../../../style-kit/design-safety';
import {DesignText} from '../../../../style-kit/digits';
import {sized} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const heavyOf = (font: string, w = HEAVY) => displayWeight(font, 'Alexandria', w);

export const ListPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {fit} = useType();
  const n = part.items.length;
  const size = sized('list', scale), dsize = sized('detail', scale);
  const R = Math.round(size * 1.45);
  const rowH = box.height / n;
  const stagger = part.staggerFrames ?? 10;
  return <Frame box={box}>
    {part.items.map((it: any, i: number) => {
      const a = at + i * stagger, y = i * rowH;
      const textW = box.width - R - 40;
      const t = fit(it.text, {width: textW, size, min: 40, lines: 1, weight: 700, lh: 1.34});
      const d = it.detail ? fit(it.detail, {width: textW, size: dsize, min: 34, lines: 1, weight: 400, lh: 1.3}) : null;
      const textH = t.box + (d ? d.box : 0);
      const mark = it.mark ?? 'check';
      return <React.Fragment key={i}>
        <div style={{position: 'absolute', top: y + (rowH - R) / 2, [copy.side]: 0}}>
          {mark === 'none'
            ? <div style={{width: R, height: R, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: Math.round(R * 0.38), color: th.gold, direction: 'ltr', opacity: ramp(f, a, 14)}}><DesignText>{`0${i + 1}`}</DesignText></div>
            : <MarkRing size={R} ring={ramp(f, a + 2, 14)} mark={ramp(f, a + 12, 14)} kind={mark} ringColor={mark === 'cross' ? th.dim : th.gold} markColor={mark === 'cross' ? th.ink : th.gold} fillColor={th.gold} fill={ramp(f, a + 24, 12)}/>}
        </div>
        <div style={{position: 'absolute', top: y + (rowH - textH) / 2, [copy.side]: R + 34, width: textW, direction: copy.dir, whiteSpace: 'nowrap', ...rise(f, a)}}>
          <div style={{fontFamily: font, fontWeight: heavyOf(font, 700), fontSize: t.size, lineHeight: `${t.box}px`, color: th.ink, textAlign: copy.align}}>{it.text}</div>
          {d ? <div style={{fontFamily: font, fontWeight: 400, fontSize: d.size, lineHeight: `${d.box}px`, color: th.dim, textAlign: copy.align}}>{it.detail}</div> : null}
        </div>
        {i < n - 1 ? <div style={{position: 'absolute', top: y + rowH - 1, [copy.side]: 0, width: box.width * ramp(f, a + 8, 26), height: 1.5, background: th.hair}}/> : null}
      </React.Fragment>;
    })}
  </Frame>;
};
