import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Headline, QuoteGlyph, clamp01, ramp, useMagazine, useType} from '../base';
import {sized} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});

export const QuotePart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {planHeadline} = useType();
  const indent = 110;
  const max = sized('quote', scale);
  const plan = planHeadline(part.text, {max, min: Math.min(48, max), lines: 7, width: box.width - indent, maxHeight: box.height - 86, thinWeight: 300});
  const top = Math.max(0, (box.height - plan.height - 86) * 0.4);
  const by = top + plan.height + 26;
  return <Frame box={box}>
    <QuoteGlyph open size={190} color={th.gold} p={ramp(f, at, 24)} style={{top: top - 40, [copy.side]: -6}}/>
    <Headline plan={plan} th={th} top={top} at={at + 4} right={indent} width={box.width - indent} stagger={5}/>
    <div style={{position: 'absolute', top: by, [copy.side]: indent, width: 90 * ramp(f, at + 30, 20), height: 2, background: th.gold}}/>
    <div style={{position: 'absolute', top: by + 16, [copy.side]: indent, direction: copy.dir, whiteSpace: 'nowrap', fontFamily: font, fontSize: 36, lineHeight: '48px', ...rise(f, at + 34, 18)}}>
      <span style={{fontWeight: 700, color: th.ink}}>{part.speaker}</span>
      {part.role ? <span style={{fontWeight: 400, color: th.dim}}>{copy.ar ? '، ' : ', '}{part.role}</span> : null}
    </div>
  </Frame>;
};
