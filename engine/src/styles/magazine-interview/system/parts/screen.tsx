import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {CREAM, NAVY, Diamond, Ground, MarkRing, HEAVY, THIN, MONO, clamp01, ramp, useMagazine, useType} from '../base';
import {decimalsOf, useFormat} from '../page-parts';
import {displayWeight} from '../../../../style-kit/design-safety';
import {screenNatural, SHRINK_FLOOR} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const heavyOf = (font: string, w = HEAVY) => displayWeight(font, 'Alexandria', w);

export const ScreenPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {fit, wid} = useType();
  const fmt = useFormat();
  const heavy = heavyOf(font);
  const sh = th.name === 'navy' ? CREAM : NAVY; // the sheet is the other paper
  const natural = screenNatural(part, box.width);
  const k = Math.max(SHRINK_FLOOR.screen, Math.min(1, box.height / natural));
  const W0 = box.width / k, FI = 18, CP = 52, inner = W0 - CP * 2;
  const frameK = ramp(f, at + 2, 30), tint = ramp(f, at + 26, 24), hl = ramp(f, at + 24, 30);
  // chrome: title (heavy) and address (mono) on one row when both fit, else stacked
  const title = part.title ? fit(part.title, {width: inner, size: 54, min: 40, lines: 2, weight: 800, lh: 1.3}) : null;
  const urlSize = part.url ? ([28, 26, 24, 22].find(s => wid(part.url, s, 400, MONO) <= inner) ?? 22) : 0;
  const oneRow = !!title && !!part.url && title.lines.length === 1 && wid(title.lines[0], title.size, heavy) + wid(part.url, urlSize, 400, MONO) + 60 <= inner;
  const chromeH = (title ? title.box * title.lines.length : 0) + (part.url && !oneRow ? (title ? 8 : 0) + 36 : 0);
  const bodyTop = FI + 24 + chromeH + (chromeH ? 30 : 10);
  let y = 0;
  const items = part.blocks.map((b: any, i: number) => {
    let h = 0, node: React.ReactNode = null;
    if (b.kind === 'heading') { const t = fit(b.text, {width: inner, size: 60, min: 44, lines: 2, weight: 700, lh: 1.2}); h = t.box * t.lines.length;
      node = t.lines.map((l, j) => <div key={j} style={{fontFamily: font, fontWeight: heavyOf(font, 700), fontSize: t.size, lineHeight: `${t.box}px`, color: sh.ink, whiteSpace: 'nowrap', textAlign: copy.align}}>{l}</div>); }
    else if (b.kind === 'text') { const t = fit(b.text, {width: inner, size: 44, min: 42, lines: 3, weight: 400, lh: 1.3}); h = t.box * t.lines.length;
      node = t.lines.map((l, j) => <div key={j} style={{fontFamily: font, fontWeight: 400, fontSize: t.size, lineHeight: `${t.box}px`, color: sh.dim, whiteSpace: 'nowrap', textAlign: copy.align}}>{l}</div>); }
    else if (b.kind === 'row') { h = 76;
      node = <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 76, borderBottom: `1.5px solid ${sh.hair}`, direction: copy.dir}}>
        <span style={{fontFamily: font, fontWeight: 600, fontSize: 44, color: sh.ink, whiteSpace: 'nowrap'}}>{b.text}</span>
        {b.value !== undefined ? <span style={{fontFamily: font, fontWeight: heavy, fontSize: 46, color: sh.ink, direction: 'ltr'}}>{fmt(b.value, decimalsOf(b.value))}</span> : null}</div>; }
    else if (b.kind === 'stat') { h = b.text ? 170 : 124;
      node = <div style={{direction: copy.dir}}><div style={{fontFamily: font, fontWeight: THIN, fontSize: 120, lineHeight: '124px', color: sh.ink, direction: 'ltr', textAlign: copy.align}}>{fmt(b.value, decimalsOf(b.value))}</div>
        {b.text ? <div style={{fontFamily: font, fontWeight: 500, fontSize: 42, lineHeight: '46px', color: sh.dim, whiteSpace: 'nowrap', textAlign: copy.align}}>{b.text}</div> : null}</div>; }
    else if (b.kind === 'button') { h = 96;
      node = <div style={{height: 88, marginTop: 4, background: sh.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font, fontWeight: heavyOf(font, 700), fontSize: 44, color: sh.ground}}>{b.text}</div>; }
    else if (b.kind === 'image') { h = 300;
      node = <div style={{height: 300, border: `1.5px solid ${sh.hair}`, overflow: 'hidden'}}><Img src={staticFile(b.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}}/></div>; }
    const it = {i, y, h, node};
    y += h + 30;
    return it;
  });
  const bodyH = Math.max(0, y - 30);
  const plateH = Math.min(box.height / k, bodyTop + bodyH + FI + 30);
  const focus = part.focus !== undefined ? items[Math.min(part.focus, items.length - 1)] : null;
  const R = 16;
  return <Frame box={box}>
    <div style={{position: 'absolute', top: Math.max(0, (box.height - plateH * k) * 0.42), [copy.side]: 0, width: W0, height: plateH, transform: `scale(${k})`, transformOrigin: copy.ar ? 'top right' : 'top left'}}>
      <div style={{position: 'absolute', inset: 0, background: sh.ground, boxShadow: '0 34px 70px rgba(0,0,0,0.55)', opacity: clamp01(ramp(f, at, 14) * 1.6), overflow: 'hidden'}}><Ground th={sh} height={plateH} surface="object"/></div>
      <svg width={W0} height={plateH} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <rect x={FI} y={FI} width={W0 - 2 * FI} height={plateH - 2 * FI} fill="none" stroke={sh.gold} strokeWidth={1.8} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frameK}/>
        <rect x={FI + 8} y={FI + 8} width={W0 - 2 * FI - 16} height={plateH - 2 * FI - 16} fill="none" stroke={sh.gold} strokeOpacity={0.35} strokeWidth={1} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frameK}/>
      </svg>
      {[[FI, FI], [W0 - FI, FI], [FI, plateH - FI], [W0 - FI, plateH - FI]].map(([x, yy], d) =>
        <Diamond key={d} size={13} color={sh.gold} style={{position: 'absolute', left: x - 6.5, top: yy - 6.5, opacity: frameK}}/>)}
      <div style={{position: 'absolute', top: FI + 24, [copy.side]: CP, width: inner, direction: copy.dir, opacity: ramp(f, at + 4, 16)}}>
        {title && oneRow
          ? <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: title.box}}>
            <span style={{fontFamily: font, fontWeight: heavy, fontSize: title.size, color: sh.ink, whiteSpace: 'nowrap'}}>{title.lines[0]}</span>
            <span style={{fontFamily: MONO, fontSize: urlSize, color: sh.dim, direction: 'ltr', whiteSpace: 'nowrap'}}>{part.url}</span>
          </div>
          : <>
            {title ? title.lines.map((l, j) => <div key={j} style={{fontFamily: font, fontWeight: heavy, fontSize: title.size, lineHeight: `${title.box}px`, color: sh.ink, whiteSpace: 'nowrap', textAlign: copy.align}}>{l}</div>) : null}
            {part.url ? <div style={{marginTop: title ? 8 : 0, height: 36, lineHeight: '36px', fontFamily: MONO, fontSize: urlSize, color: sh.dim, direction: 'ltr', textAlign: copy.ar ? 'right' : 'left', whiteSpace: 'nowrap'}}>{part.url}</div> : null}
          </>}
      </div>
      {chromeH ? <div style={{position: 'absolute', top: bodyTop - 16, [copy.side]: CP, width: inner * ramp(f, at + 8, 26), height: 1.5, background: sh.gold}}/> : null}
      <div style={{position: 'absolute', top: bodyTop, [copy.side]: CP, width: inner}}>
        {focus ? <div style={{position: 'absolute', top: focus.y - R, left: -R, width: inner + 2 * R, height: focus.h + 2 * R, borderRadius: 18, background: sh.gold, opacity: 0.13 * tint}}/> : null}
        {items.map((it: any) => <div key={it.i} style={{position: 'absolute', top: it.y, left: 0, width: inner, direction: copy.dir,
          ...rise(f, at + 10 + it.i * 8, 22)}}>{it.node}</div>)}
        {focus ? <>
          <svg width={inner + 2 * R} height={focus.h + 2 * R} style={{position: 'absolute', top: focus.y - R, left: -R, overflow: 'visible'}}>
            <rect x={0} y={0} width={inner + 2 * R} height={focus.h + 2 * R} rx={18} fill="none" stroke={sh.gold} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - hl}/>
          </svg>
          <div style={{position: 'absolute', top: focus.y - R - 30, [copy.ar ? 'left' : 'right']: -R - 30, width: 60, height: 60, borderRadius: 30, background: sh.ground, border: `1.5px solid ${sh.gold}`, opacity: ramp(f, at + 30, 20)}}>
            <div style={{position: 'absolute', inset: 4}}><MarkRing size={52} ring={ramp(f, at + 30, 20)} mark={ramp(f, at + 36, 16)} kind="check" ringColor={sh.gold} markColor={sh.gold}/></div>
          </div>
        </> : null}
      </div>
    </div>
  </Frame>;
};
