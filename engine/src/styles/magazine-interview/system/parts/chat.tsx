import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Diamond, Mask, QuoteGlyph, HEAVY, clamp01, fitWarning, mix, ramp, useMagazine} from '../base';
import {balancedLines} from '../page-parts';
import {displayWeight} from '../../../../style-kit/design-safety';
import {sized} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const heavyOf = (font: string, w = HEAVY) => displayWeight(font, 'Alexandria', w);

export const ChatPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const heavy = heavyOf(font);
  const n = part.messages.length;
  const thread=part.messages.every((m:any)=>m.author);
  const authorGap=thread?12:0;
  const textW = box.width - 84, GAP = 34;
  const layAt = (base: number) => {
    const sizes: number[] = part.messages.map((_: any, i: number) => (!thread&&i === n - 1 ? Math.round(base * 1.3) : base));
    const laid = part.messages.map((m: any, i: number) => ({lines: balancedLines(m.text, sizes[i], m.from === 'them' ? heavy : 400, textW, font), box: Math.round(sizes[i] * (copy.ar ? 1.34 : 1.2))}));
    const authorSize=Math.max(30,Math.round(base*0.62)),authorBox=thread?Math.round(authorSize*1.3):0;
    return {sizes, laid, authorSize,authorBox,total: laid.reduce((h: number, l: any) => h + authorBox+authorGap+l.lines.length * l.box, 0) + GAP * (n - 1)};
  };
  let base = sized('chat', scale), L = layAt(base);
  while (L.total > box.height && base > 46) { base = Math.max(46, base - 2); L = layAt(base); }
  if (L.total > box.height) fitWarning(part.messages.map((m: any) => m.text).join(' / '), textW, 46, 0);
  const {sizes, laid, total,authorSize,authorBox} = L;
  let y = Math.max(0, (box.height - total) * 0.45);
  return <Frame box={box}>
    {part.messages.map((m: any, i: number) => {
      const a = at + m.offsetFrames;
      const them = thread||m.from === 'them';
      const side = them ? copy.side : copy.opposite;
      const l = laid[i], top = y, h = authorBox+authorGap+l.lines.length * l.box;
      y += h + GAP;
      const lk = ramp(f, a, 28);
      const isHero = !thread&&i === n - 1;
      return <React.Fragment key={i}>
        {isHero ? <QuoteGlyph open size={130} color={th.gold} p={ramp(f, a, 22)} style={{top: top - 30, [side]: -2}}/>
          : them ? <>
            <div style={{position: 'absolute', top: top + l.box * 0.12, [side]: 4, width: 2, height: Math.max(0, h - l.box * 0.24) * lk, background: th.gold}}/>
            <Diamond size={14} color={th.gold} style={{position: 'absolute', top: top + authorGap + l.box / 2 - 7, [side]: -3, opacity: clamp01(lk * 3)}}/>
          </> : <div style={{position: 'absolute', top: top + l.box / 2 - 1, [side]: 0, width: 46 * lk, height: 2.5, background: th.gold}}/>}
        <div aria-label={m.text} style={{position: 'absolute', top, [side]: 84, width: textW, direction: copy.dir}}>
          {l.lines.map((line: string, j: number) => <Mask key={j} h={l.box+(j===0?authorBox+authorGap:0)} pad={Math.round(sizes[i] * 0.34)} k={ramp(f, thread&&j===0?a:a + 3 + j * 4, 20)}>
            {thread&&j===0?<div style={{fontFamily:font,fontWeight:600,fontSize:authorSize,lineHeight:`${authorBox}px`,height:authorBox,marginBottom:authorGap,color:th.gold,whiteSpace:'nowrap',textAlign:side}}>{m.author}</div>:null}
            <div style={{fontFamily: font, fontWeight: them ? (isHero ? mix(300, heavy, ramp(f, a + 10, 12)) : heavy) : 400, fontSize: sizes[i], lineHeight: `${l.box}px`, height: l.box, color: th.ink, whiteSpace: 'nowrap', textAlign: side}}>{line}</div>
          </Mask>)}
        </div>
      </React.Fragment>;
    })}
  </Frame>;
};
