import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ramp, useMagazine} from '../base';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;

export const RulePart: React.FC<MagazinePartProps<any>> = ({box, at, th}) => {
  const f = useCurrentFrame();
  const {copy} = useMagazine();
  return <Frame box={box}><div style={{position: 'absolute', top: box.height / 2 - 1, [copy.side]: 0, width: box.width * ramp(f, at, 26), height: 2, background: th.gold}}/></Frame>;
};
