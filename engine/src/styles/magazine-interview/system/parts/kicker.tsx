import React from 'react';
import {Kicker} from '../base';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;

export const KickerPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th}) =>
  <Frame box={box}><Kicker th={th} text={part.text} top={0} at={at} right={0}/></Frame>;
