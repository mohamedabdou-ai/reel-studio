import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {HEAVY, THIN, clamp01, ramp, useMagazine, useType} from '../base';
import {displayWeight} from '../../../../style-kit/design-safety';
import {DesignText} from '../../../../style-kit/digits';
import {sized, stepsMetrics, stepsRowMinimum, SHRINK_FLOOR} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const heavyOf = (font: string, w = HEAVY) => displayWeight(font, 'Alexandria', w);

export const StepsPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {fit, wid} = useType();
  const n = part.items.length;
  // Like a plate, the part reads its shrink from the box allocated by the page.
  const metrics=stepsMetrics(part,box.width,scale);
  const compact=box.height<metrics.natural-1e-7||(metrics.minimumHeight>metrics.natural&&Math.abs(box.height-metrics.minimumHeight)<1e-7);
  const shrink=Math.max(SHRINK_FLOOR.steps,Math.min(1,box.height/metrics.natural));
  const NS = shrink===1?sized('stepNo', scale):Math.round(sized('stepNo', scale)*shrink);
  const numW = wid('04', NS, THIN) + 8;
  const rowH = box.height / n;
  const belowScaleOne=rowH<stepsMetrics(part,box.width,1).natural/n-1e-7;
  const hasImage = part.items.some((it: any) => it.image);
  const thumb = hasImage ? Math.min(180, rowH - 24) : 0;
  return <Frame box={box}>
    {part.items.map((it: any, i: number) => {
      const a = at + it.offsetFrames, y = i * rowH;
      const textW = box.width - numW - 40 - (thumb ? thumb + 30 : 0);
      let titleSize=sized('step',scale),detailSize=sized('detail',scale);
      const lay=()=>({t:fit(it.title,{width:textW,size:titleSize,min:40,lines:1,weight:700,lh:1.3}),d:it.detail?fit(it.detail,{width:textW,size:detailSize,min:34,lines:1,weight:400,lh:1.3}):null});
      let L=lay();
      while(compact&&(stepsRowMinimum(L.t.box,L.d?.box??0)>rowH||belowScaleOne)&&(titleSize>40||detailSize>34)){
        titleSize=Math.max(40,titleSize-4);detailSize=Math.max(34,detailSize-2);L=lay();
      }
      const {t,d}=L;
      const textH = t.box + (d ? d.box : 0);
      return <React.Fragment key={i}>
        <div style={{position: 'absolute', top: y + (rowH - NS) / 2, [copy.side]: 0, width: numW, fontFamily: font, fontWeight: THIN, fontSize: NS, lineHeight: `${NS}px`, color: th.gold, direction: 'ltr', textAlign: copy.align, ...rise(f, a)}}><DesignText>{`0${i + 1}`}</DesignText></div>
        <div style={{position: 'absolute', top: y + (rowH - textH) / 2, [copy.side]: numW + 40, width: textW, direction: copy.dir, whiteSpace: 'nowrap', ...rise(f, a + 4)}}>
          <div style={{fontFamily: font, fontWeight: heavyOf(font, 700), fontSize: t.size, lineHeight: `${t.box}px`, color: th.ink, textAlign: copy.align}}>{it.title}</div>
          {d ? <div style={{fontFamily: font, fontWeight: 400, fontSize: d.size, lineHeight: `${d.box}px`, color: th.dim, textAlign: copy.align}}>{it.detail}</div> : null}
        </div>
        {it.image ? <div style={{position: 'absolute', top: y + (rowH - thumb) / 2, [copy.opposite]: 0, width: thumb, height: thumb, border: `1.5px solid ${th.gold}`, padding: 8, boxSizing: 'border-box', opacity: ramp(f, a + 10, 16)}}>
          <Img src={staticFile(it.image)} style={{width: '100%', height: '100%', objectFit: 'cover'}}/></div> : null}
        {i < n - 1 ? <div style={{position: 'absolute', top: y + rowH - (compact?0:1), [copy.side]: 0, width: box.width * ramp(f, a + 6, 26), height: 1, background: th.hair}}/> : null}
      </React.Fragment>;
    })}
  </Frame>;
};
