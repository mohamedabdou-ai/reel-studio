// engine/src/styles/magazine-interview/system/scope.tsx
import React from 'react';
import {DesignScope} from '../../../style-kit/design-safety';
import {MagazineScope} from './base';

/** Everything a magazine part needs: digits, fit, bounds, timing, copy direction and the creator's font. Project scenes wrap their content in it. */
export const SystemScope:React.FC<{data:unknown;layout:'split'|'takeover';seam:number;durationInFrames:number;children?:React.ReactNode}>=({data,layout,seam,durationInFrames,children})=>
  <DesignScope data={data} layout={layout} seam={seam} durationInFrames={durationInFrames} style="magazine-interview"><MagazineScope data={data}>{children}</MagazineScope></DesignScope>;
