import React from 'react';
import {Headline, useType} from '../base';
import {sized} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;

export const HeadlinePart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, emphasis, scale}) => {
  const {planHeadline} = useType();
  const max = sized('headline', scale);
  const plan = planHeadline(part.text, {max, min: Math.min(56, max), lines: 4, width: box.width, maxHeight: box.height});
  const top = Math.max(0, (box.height - plan.height) / 2);
  return <Frame box={box}><Headline plan={plan} th={th} top={top} at={at} right={0} width={box.width} marker={emphasis} markerAt={at + 34}/></Frame>;
};
