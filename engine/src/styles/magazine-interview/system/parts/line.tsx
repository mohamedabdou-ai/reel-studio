import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Diamond, Mask, ramp, useMagazine, useType} from '../base';
import {sized} from '../../../../creative-kit/compose/budget';
import {balancedLines} from '../page-parts';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;

export const LinePart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {fit,wid} = useType();
  const multiline=wid(part.text,34,500)>box.width-40;
  const raw = fit(part.text, {width: box.width - 40, size: sized('line', scale), min: 34, lines: multiline?2:1, weight: 500});
  const t=multiline?{...raw,lines:balancedLines(part.text,raw.size,500,box.width-40,font)}:raw;
  if(multiline)return <Frame box={box}>
    <Diamond size={13} color={th.gold} style={{position:'absolute',top:(box.height-13)/2,[copy.side]:3,opacity:ramp(f,at,12)}}/>
    <div style={{position:'absolute',top:(box.height-t.box*t.lines.length)/2,[copy.side]:40,width:box.width-40,direction:copy.dir}}>
      {t.lines.map((line,i)=><Mask key={i} h={t.box} pad={Math.round(t.size*0.34)} k={ramp(f,at,20)}><div style={{fontFamily:font,fontWeight:500,fontSize:t.size,lineHeight:`${t.box}px`,height:t.box,color:th.dim,whiteSpace:'nowrap',textAlign:copy.align}}>{line}</div></Mask>)}
    </div>
  </Frame>;
  return <Frame box={box}>
    <Diamond size={13} color={th.gold} style={{position: 'absolute', top: (box.height - 13) / 2, [copy.side]: 3, opacity: ramp(f, at, 12)}}/>
    <div style={{position: 'absolute', top: (box.height - t.box) / 2, [copy.side]: 40, width: box.width - 40, direction: copy.dir}}>
      <Mask h={t.box} pad={Math.round(t.size * 0.34)} k={ramp(f, at, 20)}>
        <div style={{fontFamily: font, fontWeight: 500, fontSize: t.size, lineHeight: `${t.box}px`, height: t.box, color: th.dim, whiteSpace: 'nowrap', textAlign: copy.align}}>{part.text}</div>
      </Mask>
    </div>
  </Frame>;
};
