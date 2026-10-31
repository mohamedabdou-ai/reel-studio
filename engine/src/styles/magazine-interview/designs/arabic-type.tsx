import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {FamilyDesignProps} from '../../family-designs';
import {arabicTypeSceneSchema} from '../../../arabic-type/schema';
import {ARABIC_MOVE_COMPONENTS} from '../../../arabic-type/moves';
import {decryptState} from '../../../arabic-type/moves/decrypt';
import {arabicTypeCues} from '../../../arabic-type/timing';
import {LOADED_FAMILIES} from '../../../core/fonts';
import {resolveArabicFont} from '../../../arabic-type/font-ready';
import {displayDigits} from '../../../core/digits';
import {useStatDigits} from '../../../creative-kit/digits';
import {StickerView} from '../../../creative-kit/sticker-view';
import {isLightInk} from '../../../creative-kit/stickers';
import {clamp01, EASE} from '../../../core/motion';
import {AR, Furniture, Ground, MagazineScope, Mask, NAVY, useMagazine} from '../system/base';
import {smallNumeralStyle} from '../system/numerals';
import {Dressing, language, TextBox} from './message-board-focus';
import {SCREENS_COPY} from './copy-screens';

export const typeFont = (move: string) => move === 'kufi-tiles' ? 'Noto Kufi Arabic' : move === 'pen-write' ? 'Noto Naskh Arabic' : AR;
export const MAGAZINE_TYPE_LOOK = {pulse: 0, nibShadow: false, barTilt: 0, barJag: 0, echoFill: true, videoFocusY: 0.33} as const;
// The 270-unit canvas maps 4px per unit. One floor covers all native text.
export const STAMP_BOX = {x: 432, y: 990, width: 304, height: 148};
const ECHO_ZONE_MASK = 'linear-gradient(to bottom, transparent 350px, #000 430px, #000 1070px, transparent 1150px)';
const Type: React.FC<FamilyDesignProps> = ({scene: input, sectionIndex = 0}) => {
  const scene = arabicTypeSceneSchema.parse(input), data = scene.data, frame = useCurrentFrame(), {fps, width, height} = useVideoConfig(), digits = useStatDigits(), {font: magazineFont, copy} = useMagazine();
  const font = resolveArabicFont(undefined, data.move === 'pen-write' || data.move === 'kufi-tiles' ? typeFont(data.move) : magazineFont, data.move, LOADED_FAMILIES);
  const text = displayDigits(data.text, digits), to = data.to ? displayDigits(data.to, digits) : undefined, stamp = data.stamp ? displayDigits(data.stamp, digits) : undefined;
  const Component = ARABIC_MOVE_COMPONENTS[data.move];
  const t = frame / fps, exit = 1 - clamp01((t - scene.durationInFrames / fps + (data.move === 'decrypt' ? .4 : .3)) / .3);
  const decrypt = data.move === 'decrypt' ? decryptState(text, t) : null;
  const percent = decrypt ? displayDigits(Math.round(decrypt.ratio * 100) + SCREENS_COPY.arabicTypePercent[copy.ar ? 'ar' : 'en'], digits) : '';
  const stampAt = arabicTypeCues({...data, text}, fps).find(cue => cue.kind === 'stamp')?.frame;
  const stampProgress = stampAt === undefined ? 0 : EASE.land(clamp01((frame - stampAt) / (fps * .25)));
  return <AbsoluteFill>
    <Dressing><Ground th={NAVY}/><Furniture th={NAVY} section="" page={String(sectionIndex + 1).padStart(2, '0')}/></Dressing>
    <div data-type-zone="" style={{position: 'absolute', inset: 0, clipPath: `inset(350px 65px ${height - (decrypt ? 1080 : 1150)}px 65px)`,
      ...(data.move === 'echo-stack' ? {maskImage: ECHO_ZONE_MASK, WebkitMaskImage: ECHO_ZONE_MASK, maskSize: '100% 100%', WebkitMaskSize: '100% 100%'} : {})}}>
      <Component key={scene.id + '|' + font + '|' + text} text={text} to={to} look={MAGAZINE_TYPE_LOOK} fitFloor={34/4} stamp={undefined} media={data.media} font={font} accent={NAVY.gold} ink={NAVY.ink} digits={digits} frame={frame} fps={fps} width={width} height={height} durationInFrames={scene.durationInFrames}/>
    </div>
    {decrypt ? <Dressing><div data-decrypt-progress={decrypt.ratio} style={{position: 'absolute', left: 240, top: 1100, width: 600, height: 48, opacity: exit}}>
      <div style={{textAlign: 'center', ...smallNumeralStyle(percent, 28), lineHeight: '34px', color: NAVY.dim, direction: 'ltr'}}>{percent}</div>
      <div style={{position: 'absolute', top: 45, width: 600, height: 2, background: NAVY.hair}}/><div style={{position: 'absolute', top: 45, right: 0, width: 600 * decrypt.ratio, height: 2, background: NAVY.gold}}/>
    </div></Dressing> : null}
    {data.move === 'redacted-stamp' && stamp && stampAt !== undefined && frame >= stampAt ? <div data-magazine-stamp="" data-stamp-frame={stampAt} style={{position: 'absolute', left: STAMP_BOX.x, top: STAMP_BOX.y, width: STAMP_BOX.width, height: STAMP_BOX.height, transform: `rotate(-2.5deg) scale(${1.04 - .04 * stampProgress})`, transformOrigin: 'center', opacity: exit, overflow: 'hidden'}}>
      <Mask h={STAMP_BOX.height} pad={0} k={stampProgress}>
        <div style={{position: 'absolute', inset: 0, border: `2px solid ${NAVY.gold}`, boxSizing: 'border-box'}}/><div style={{position: 'absolute', inset: 6, border: `1px solid ${NAVY.gold}`, opacity: .5}}/>
        <div style={{position: 'absolute', left: 20, top: 35}}><TextBox text={stamp} width={264} height={78} size={56} floor={34} weight={700} color={NAVY.gold} lines={1} align="center"/></div>
      </Mask>
    </div> : null}
    {data.sticker ? <div data-scene-sticker="arabic-type" style={{position: 'absolute', left: 460, top: 350, width: 160, height: 160}}><StickerView sticker={data.sticker} startFrame={data.sticker.at ?? 0} size={160} decoration={false} onDark={isLightInk(NAVY.ink)}/></div> : null}
  </AbsoluteFill>;
};
export const ArabicType: React.FC<FamilyDesignProps> = (props) => <MagazineScope data={language([(props.scene.data as {text: string}).text])}><Type {...props}/></MagazineScope>;
export default ArabicType;
