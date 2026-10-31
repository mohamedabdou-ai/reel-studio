import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Mask, ramp, useMagazine, useType} from '../base';
import {balancedLines} from '../page-parts';
import {sized} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;

export const BodyPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale, emphasis}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {fit} = useType();
  const size = sized('body', scale);
  const maxLines = Math.max(1, Math.floor(box.height / (size * 1.24) + 0.05));
  const t0 = fit(part.text, {width: box.width, size, min: 44, lines: Math.min(6, maxLines), weight: emphasis ? 600 : 400, lh: 1.24});
  // balanced breaks: no single word left alone on the last line
  const t = t0.lines.length > 1 ? {...t0, lines: balancedLines(part.text, t0.size, emphasis ? 600 : 400, box.width, font)} : t0;
  return <Frame box={box}>
    <div style={{position: 'absolute', top: Math.max(0, (box.height - t.box * t.lines.length) / 2), [copy.side]: 0, width: box.width, direction: copy.dir}}>
      {t.lines.map((l, i) => <Mask key={i} h={t.box} pad={Math.round(t.size * 0.34)} k={ramp(f, at + i * 6, 20)}>
        <div style={{fontFamily: font, fontWeight: emphasis ? 600 : 400, fontSize: t.size, lineHeight: `${t.box}px`, height: t.box, color: emphasis ? th.ink : th.dim, whiteSpace: 'nowrap', textAlign: copy.align}}>{l}</div>
      </Mask>)}
    </div>
  </Frame>;
};
