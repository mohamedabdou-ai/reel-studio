import React from 'react';
import {useCurrentFrame} from 'remotion';
import {fitOnLines} from '../../../../core/type';
import {Dressing, rectStyle, useConceptTimeline} from '../../../../motion-concepts/shared';
import {minFramesAtFps} from '../../../../motion-concepts/timeline';
import type {Rect} from '../../../../motion-concepts/geometry';
import {Diamond, MagazineCaption, MagazineScope, Mask, MONO, NAVY, SERIF, fitWarning, ramp, useMagazine} from '../../system/base';
import {smallNumeralStyle} from '../../system/numerals';
import {PlainPage, balancedLines, useFormat} from '../../system/page-parts';

export {rectStyle, MONO, NAVY};

export function useConceptFrame(duration: number, minimum: number) {
  const clock = useConceptTimeline(minimum);
  if (!Number.isInteger(duration) || duration < minFramesAtFps(minimum, clock.fps)) throw new RangeError(`magazine-interview: duration must satisfy the concept minimum (${minimum} at 30 fps)`);
  return clock.frame;
}

/** Height-aware composition of the exported type fitter and balanced line planner. Overflow retains the floor and all copy. */
export function textPlan(text: string, box: Rect, font: string, size = 34, floor = 34, lines = 1, weight = 600, lh = 1.18) {
  let result: {size: number; box: number; lines: string[]; fits: boolean} | undefined;
  for (let s = size; s >= floor; s--) {
    const r = fitOnLines(text, {fontFamily: font, fontSize: s, fontWeight: weight}, {maxBoxWidth: box.width, maxLines: lines, min: s, max: s, lineHeight: lh});
    const balanced = r.lines.length > 1 ? balancedLines(text, s, weight, box.width, font) : r.lines;
    const lineBox = Math.round(s * lh);
    result = {size: s, box: lineBox, lines: balanced, fits: r.fits && balanced.length <= lines && balanced.length * lineBox <= box.height};
    if (result.fits) return result;
  }
  fitWarning(text, box.width, floor, lines);
  return result!;
}

export const Text: React.FC<{box: Rect; text: string; size?: number; floor?: number; lines?: number; weight?: number; color?: string; mono?: boolean; numeric?: boolean; align?: 'left' | 'right' | 'center'; lh?: number; hook?: Record<string, string | number>}> =
({box, text, size = 34, floor = 34, lines = 1, weight = 600, color = NAVY.ink, mono, numeric, align, lh = 1.18, hook}) => {
  const {font, copy} = useMagazine();
  const numeralFace = mono ? smallNumeralStyle(text, size) : undefined;
  const family = (numeralFace?.fontFamily ?? font) as string, drawnWeight = (numeralFace?.fontWeight ?? weight) as number;
  const p = textPlan(text, box, family, size, floor, lines, drawnWeight, lh);
  return <div {...hook} data-text-box={JSON.stringify(box)} data-font-size={p.size} data-text-floor={floor} data-text-fits={String(p.fits)} data-text-lines={p.lines.length}
    data-numeral-text={mono ? text : undefined} data-text-requested-size={size} data-text-leading={lh}
    data-token-part={hook?.['data-token-part']} data-label-lines={hook?.['data-token-part'] ? p.lines.length : undefined} data-label-font-size={hook?.['data-token-part'] ? p.size : undefined}
    data-copy-lines={hook?.['data-copy-part'] ? p.lines.length : undefined} data-copy-font-size={hook?.['data-copy-part'] ? p.size : undefined}
    style={{...rectStyle(box), overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: family, fontSize: p.size,
      fontWeight: drawnWeight, lineHeight: `${p.box}px`, color, textAlign: align ?? copy.align, direction: numeric ? 'ltr' : copy.dir, unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums'}}>
    {p.lines.map((line, i) => <div key={i} style={{whiteSpace: 'pre'}}><bdi dir={numeric ? 'ltr' : 'auto'} style={numeric ? {direction: 'ltr', unicodeBidi: 'isolate-override', display: 'inline-block'} : undefined}>{line}</bdi></div>)}
  </div>;
};

const Furniture: React.FC<{sectionIndex: number}> = ({sectionIndex}) => {
  const {copy} = useMagazine();
  const fmt = useFormat();
  const f = useCurrentFrame();
  return <Dressing><PlainPage th={NAVY}/>
    <div style={{position: 'absolute', top: 1424, left: 65, width: 788 * ramp(f, 14, 24), height: 1.5, background: NAVY.gold, opacity: .8}}/>
    <div style={{position: 'absolute', top: 1436, [copy.side]: 227, fontFamily: SERIF, fontSize: 34, lineHeight: '34px', color: NAVY.gold, opacity: ramp(f, 8, 18), direction: 'ltr'}}>{fmt(sectionIndex + 1).padStart(2,fmt(0))}</div>
  </Dressing>;
};

export const Canvas: React.FC<{rtl: boolean; backdrop?: 'canvas' | 'none'; caption?: string; sectionIndex?: number; children: React.ReactNode}> = ({rtl, backdrop = 'canvas', caption, sectionIndex = 0, children}) =>
  <MagazineScope data={{lang: rtl ? 'ar' : 'en'}}><div style={{position: 'absolute', inset: 0}}>
    {backdrop === 'canvas' ? <Furniture sectionIndex={sectionIndex}/> : null}{children}
    {caption ? <MagazineCaption y={1310} text={caption} th={NAVY}/> : null}
  </div></MagazineScope>;

export const Frame: React.FC<{box: Rect; active?: boolean; fill?: string; opacity?: number; frameOpacity?: number; children?: React.ReactNode; hook?: Record<string, string | number>}> = ({box, active, fill, opacity, frameOpacity, children, hook}) =>
  <div {...hook} data-mechanism-box={JSON.stringify(box)} style={{...rectStyle(box), background: fill ?? NAVY.ground, opacity, overflow: 'hidden'}}>{children}<div data-frame-opacity={frameOpacity} style={{position: 'absolute', inset: 0, boxSizing: 'border-box', border: `2px solid ${active ? NAVY.gold : NAVY.hair}`, opacity: frameOpacity, pointerEvents: 'none'}}/></div>;

/** SVG diamonds use a bounding box, avoiding any extent outside the mechanism's measured rect. */
export const WireDiamond: React.FC<{x: number; y: number; size?: number; color?: string; opacity?: number}> = ({x, y, size = 11, color = NAVY.gold, opacity = 1}) =>
  <path d={`M${x} ${y - size / 2}L${x + size / 2} ${y}L${x} ${y + size / 2}L${x - size / 2} ${y}Z`} fill={color} opacity={opacity}/>;

export const KickerMark: React.FC<{box: Rect; text: string}> = ({box, text}) => {
  const f = useCurrentFrame(), {copy} = useMagazine();
  return <div style={{...rectStyle(box), overflow: 'hidden'}}><Mask h={box.height} pad={0} k={ramp(f, 0, 14)} rise={30}>
    <Diamond size={10} color={NAVY.gold} style={{position: 'absolute', [copy.side]: 3, top: box.height / 2 - 5}}/>
    <Text box={{x: copy.ar ? 0 : 28, y: 0, width: box.width - 28, height: box.height}} text={text} size={32} floor={32} weight={600} color={NAVY.gold}/>
  </Mask></div>;
};
