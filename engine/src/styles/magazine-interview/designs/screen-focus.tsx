import React from 'react';
import type {FamilyDesignProps} from '../../family-designs';
import type {ScreenFocusScene, ImageScreenStep, VideoScreenStep} from '../../../motion-library/schema';
import type {CaptureCallout} from '../../../motion-library/schema';
import {AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {focusGeometry, FOCUS_VIEWPORT} from '../../../motion-library/geometry';
import {capturePose, cursorAt, arrowPath, calloutState, captureRectToViewport, chipPlacement, circleAround, markBounds, CALLOUT_PAD, type CapturePose} from '../../../motion-library/capture';
import {EASE, clamp01} from '../../../core/motion';
import {Footage} from '../../../core/plate';
import {useDesignData} from '../../../style-kit/digits';
import {Diamond, Furniture, Ground, Kicker, MagazineScope, NAVY, useMagazine} from '../system/base';
import {DiamondLine} from '../system/page-parts';
import {Dressing, language, SwapTitle, TextBox} from './message-board-focus';
import {SCREENS_COPY} from './copy-screens';
import {SmallNumeral} from '../system/numerals';
import {useProbe} from '../../../core/safe';

export const SCREEN_STACK = {kicker: 350, heading: 410, headingHeight: 62, plate: 488, plateWidth: 872, plateHeight: 592, scale: 0.95, label: 1066.4, progress: 1134.4, bottom: 1148.4};
export const imagePose = (step: ImageScreenStep, frame: number) => focusGeometry({width: step.sourceWidth, height: step.sourceHeight}, step.focus, FOCUS_VIEWPORT, step.zoom, EASE.land(clamp01((frame - step.focusFrame) / step.settleFrames)));
const ImageCapture: React.FC<{step: ImageScreenStep; frame: number}> = ({step, frame}) => {
  const g = imagePose(step, frame), reveal = clamp01((frame - step.focusFrame) / 9);
  return <>
    <Img src={staticFile(step.src)} style={{position: 'absolute', ...g.image, maxWidth: 'none'}}/>
    <div data-focus-box={JSON.stringify(g.box)} style={{position: 'absolute', left: g.box.x, top: g.box.y, width: g.box.width, height: g.box.height, border: `3px solid ${NAVY.gold}`, boxSizing: 'border-box', opacity: reveal}}/>
    {reveal > 0 ? <Cursor x={g.cursor.x * 840} y={g.cursor.y * 560} click={clamp01((frame - step.focusFrame - step.settleFrames) / 18)} opacity={reveal} plateScale={SCREEN_STACK.scale}/> : null}
  </>;
};
const VideoCapture: React.FC<{step: VideoScreenStep; frame: number}> = ({step, frame}) => {
  const {fps} = useVideoConfig(), pose = capturePose(step, frame), cursor = cursorAt(step.cursor, frame, fps);
  return <>
    <div data-capture-pose={JSON.stringify(pose)} style={{position: 'absolute', ...pose}}><Sequence from={step.atFrame} layout="none"><Footage src={step.src} muted startFromSec={step.trimBeforeFrame / fps} style={{width: '100%', height: '100%'}}/></Sequence></div>
    {step.callouts.map((callout, i) => <CaptureMark key={i} callout={callout} pose={pose} frame={frame} fps={fps}/>)}
    {cursor ? <Cursor x={pose.left + cursor.x * pose.width} y={pose.top + cursor.y * pose.height} click={cursor.click} opacity={cursor.appear} plateScale={SCREEN_STACK.scale}/> : null}
  </>;
};
const Focus: React.FC<FamilyDesignProps> = ({scene, sectionIndex = 0}) => {
  const data = useDesignData((scene as ScreenFocusScene).data), frame = useCurrentFrame(), {copy} = useMagazine();
  let phase = 0;
  data.steps.forEach((step, i) => {if (frame >= step.atFrame) phase = i;});
  const step = data.steps[phase], focusFrame = step.kind === 'video' ? step.keys[0].atFrame : step.focusFrame;
  const s = SCREEN_STACK;
  return <AbsoluteFill data-screen-focus-phase={phase}>
    <Dressing><Ground th={NAVY}/><Furniture th={NAVY} section="" page={String(sectionIndex + 1).padStart(2, '0')}/></Dressing>
    <div style={{position: 'absolute', [copy.side]: 65, top: s.kicker, width: 800, height: 44, overflow: 'hidden'}}><Kicker th={NAVY} text={data.kicker} top={0} right={0} at={0}/></div>
    <div style={{position: 'absolute', top: s.kicker, [copy.opposite]: 65}}><SmallNumeral text={SCREENS_COPY.screensStepSeparator[copy.ar ? 'ar' : 'en'] + String(phase + 1).padStart(2, '0')}/></div>
    <SwapTitle beats={data.steps.map(step => ({at: step.atFrame, text: step.title}))} top={s.heading} height={s.headingHeight} size={48} floor={48}/>
    <div data-screen-plate="" data-plate-scale={s.scale} style={{position: 'absolute', left: (1080 - s.plateWidth * s.scale) / 2, top: s.plate, width: s.plateWidth, height: s.plateHeight, transform: `scale(${s.scale})`, transformOrigin: 'top left'}}>
      <Dressing><svg data-screen-plate-frame="" width={s.plateWidth} height={s.plateHeight} style={{position: 'absolute', inset: 0}} fill="none">
        <rect x={0.75} y={0.75} width={s.plateWidth - 1.5} height={s.plateHeight - 1.5} stroke={NAVY.gold} strokeWidth={1.5}/><rect x={7} y={7} width={s.plateWidth - 14} height={s.plateHeight - 14} stroke={NAVY.hair} strokeWidth={1}/>
      </svg></Dressing>
      <div data-focus-viewport="840x560" style={{position: 'absolute', left: 16, top: 16, width: 840, height: 560, overflow: 'hidden'}}>
        <Dressing><div style={{position: 'absolute', inset: 0, background: NAVY.ground}}/></Dressing>
        {step.kind === 'video' ? <VideoCapture key={phase} step={step} frame={frame}/> : <ImageCapture step={step} frame={frame}/>}
      </div>
    </div>
    <div style={{position: 'absolute', left: 65, top: s.label, width: 950, height: 52, overflow: 'hidden'}}><DiamondLine th={NAVY} text={step.label} top={0} right={0} width={950} size={40} weight={600} color={NAVY.ink} at={focusFrame}/></div>
    {data.steps.length >= 2 ? <div data-p2-progress="" style={{position: 'absolute', top: s.progress, [copy.side]: 65, height: 14, display: 'flex', alignItems: 'center', gap: 18, direction: copy.dir}}>{data.steps.map((_, i) => <Diamond key={i} size={10} color={i <= phase ? NAVY.gold : NAVY.hair}/>)}</div> : null}
  </AbsoluteFill>;
};
export const ScreenFocus: React.FC<FamilyDesignProps> = (props) => {
  const data = (props.scene as ScreenFocusScene).data;
  return <MagazineScope data={language([data.kicker, ...data.steps.flatMap(step => [step.title, step.label, ...(step.kind === 'video' ? step.callouts.map(c => c.text ?? '') : [])])])}><Focus {...props}/></MagazineScope>;
};
export default ScreenFocus;

// Drawing only. Positions, draw times and chip placement come from the mechanism.
export const CaptureMark: React.FC<{callout: CaptureCallout; pose: CapturePose; frame: number; fps: number}> = ({callout, pose, frame, fps}) => {
  const probe = useProbe() !== null, state = calloutState(callout, frame, fps, probe);
  if (!state) return null;
  const box = captureRectToViewport(callout.rect, pose), circle = circleAround(box);
  const path = arrowPath(box).split(' L ').slice(0, 2).join(' L ');
  const target = path.match(/L ([\d.-]+) ([\d.-]+)$/);
  const tag = chipPlacement(markBounds(callout.kind, box));
  const dash = {pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - state.draw};
  return <div data-capture-mark={callout.kind} style={{position: 'absolute', inset: 0, opacity: state.opacity}}>
    <svg width={840} height={560} style={{position: 'absolute', inset: 0, overflow: 'hidden'}} fill="none" stroke={NAVY.gold} strokeWidth={callout.kind === 'rect' ? 3 : 2} strokeLinecap="butt" strokeLinejoin="miter">
      {callout.kind === 'rect' ? <rect x={box.x - CALLOUT_PAD} y={box.y - CALLOUT_PAD} width={box.width + CALLOUT_PAD * 2} height={box.height + CALLOUT_PAD * 2} {...dash}/>
        : callout.kind === 'circle' ? <circle cx={circle.left + circle.radius} cy={circle.top + circle.radius} r={circle.radius} {...dash}/>
        : callout.kind === 'arrow' ? <path d={path} {...dash}/> : null}
      {callout.text !== undefined ? <path d={`M ${box.x + box.width / 2} ${box.y + box.height / 2} L ${tag.left + 160} ${tag.bodyTop + 30}`} {...dash}/> : null}
    </svg>
    {callout.kind === 'arrow' && target ? <Diamond size={11} color={NAVY.gold} style={{position: 'absolute', left: Number(target[1]) - 5.5, top: Number(target[2]) - 5.5, opacity: state.draw}}/> : null}
    {callout.text !== undefined ? <>
      <Diamond size={11} color={NAVY.gold} style={{position: 'absolute', left: box.x + box.width / 2 - 5.5, top: box.y + box.height / 2 - 5.5, opacity: state.draw}}/>
      <div style={{position: 'absolute', left: tag.left, top: tag.bodyTop, width: 320, height: 60, boxSizing: 'border-box', padding: '4px 16px', background: NAVY.ground, opacity: clamp01(state.draw * 1.5), overflow: 'hidden'}}>
        <TextBox text={callout.text} width={288} height={52} size={32} floor={28} weight={700} color={NAVY.gold} lines={1}/>
      </div>
    </> : null}
  </div>;
};

export const CURSOR_HEIGHT = 44;
export const Cursor: React.FC<{x: number; y: number; click?: number; opacity?: number; plateScale?: number}> = ({x, y, click = 0, opacity = 1, plateScale = .95}) => useProbe() !== null ? null : <>
  {click > 0 && click < 1 ? <svg width={840} height={560} style={{position: 'absolute', inset: 0, opacity: 1 - EASE.land(click)}}><circle cx={x} cy={y} r={56 * EASE.land(click)} fill="none" stroke={NAVY.gold} strokeWidth={3}/></svg> : null}
  <svg data-p2-cursor="" data-cursor-height={CURSOR_HEIGHT} width={CURSOR_HEIGHT / plateScale} height={CURSOR_HEIGHT / plateScale} viewBox="4 2 16 19" style={{position: 'absolute', left: x, top: y, opacity, overflow: 'visible'}}>
    <path d="M5 3L19 12L12 13L9 20L5 3Z" fill={NAVY.ink} stroke={NAVY.ground} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="miter"/>
  </svg>
</>;
