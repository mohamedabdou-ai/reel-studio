import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {FamilyDesignProps} from '../../family-designs';
import {usePreparedPlate} from '../../../screen-recording/ScreenRecordingScene';
import type {ScreenRecordingSceneData} from '../../../screen-recording/schema';
import {SCREEN_VIEWPORT, SCREEN_VIEWPORT_TOP, screenTrackPose, screenRectToFrame} from '../../../screen-recording/pose';
import {calloutState, circleAround, CALLOUT_PAD, CLICK_RIPPLE_SEC} from '../../../motion-library/capture';
import {clamp01, EASE, toFrame} from '../../../core/motion';
import {Footage} from '../../../core/plate';
import {useProbe} from '../../../core/safe';
import {Ground, MagazineScope, NAVY} from '../system/base';
import {Dressing} from './message-board-focus';

export const recordingPose = screenTrackPose;
// Intersect the displayed plate with the unchanged viewport; this is furniture only.
export function visibleCaptureRect(pose: ReturnType<typeof screenTrackPose>) {
  const x = Math.max(0, pose.left), y = Math.max(0, pose.top);
  return {x, y: SCREEN_VIEWPORT_TOP + y, width: Math.max(0, Math.min(SCREEN_VIEWPORT.width, pose.left + pose.width) - x), height: Math.max(0, Math.min(SCREEN_VIEWPORT.height, pose.top + pose.height) - y)};
}

const Recording: React.FC<FamilyDesignProps> = ({scene: input}) => {
  const scene = input as ScreenRecordingSceneData, plate = usePreparedPlate(), frame = useCurrentFrame(), {fps} = useVideoConfig(), probe = useProbe() !== null;
  if (!plate) throw new Error('ScreenRecording requires PreparedPlateProvider.');
  const pose = recordingPose(frame, scene.data.keys, plate), top = SCREEN_VIEWPORT_TOP + pose.top;
  const visible = visibleCaptureRect(pose), ruleHeight = Math.min(2, visible.height);
  const rippleFrames = Math.max(2, toFrame(CLICK_RIPPLE_SEC, fps));
  return <AbsoluteFill>
    <Dressing><Ground th={NAVY}/></Dressing>
    <div data-screen-recording-viewport="" style={{position: 'absolute', left: 0, top: SCREEN_VIEWPORT_TOP, width: SCREEN_VIEWPORT.width, height: SCREEN_VIEWPORT.height, overflow: 'hidden'}}>
      <div data-recording-pose={JSON.stringify(pose)} style={{position: 'absolute', left: pose.left, top: pose.top, width: pose.width, height: pose.height}}>
        {/\.(svg|png|jpe?g|webp)$/i.test(plate.src) ? <Img src={staticFile(plate.src)} style={{width: '100%', height: '100%'}}/> : <Footage src={plate.src} muted startFromSec={scene.fromFrame / fps} style={{width: '100%', height: '100%'}}/>}
      </div>
      <svg width={1080} height={1220} style={{position: 'absolute', inset: 0}}>
        {scene.data.callouts.map((callout, i) => {
          const state = calloutState(callout, frame, fps, probe);
          if (!state) return null;
          const box = screenRectToFrame(callout.rect, pose), circle = circleAround(box);
          const dash = {pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - state.draw};
          return <g key={i} data-recording-callout={callout.kind} opacity={state.opacity} fill="none" stroke={NAVY.gold} strokeWidth={3} strokeLinecap="butt" strokeLinejoin="miter">
            {callout.kind === 'circle' ? <circle cx={circle.left + circle.radius} cy={circle.top + circle.radius - SCREEN_VIEWPORT_TOP} r={circle.radius} {...dash}/>
              : <rect x={box.x - CALLOUT_PAD} y={box.y - SCREEN_VIEWPORT_TOP - CALLOUT_PAD} width={box.width + CALLOUT_PAD * 2} height={box.height + CALLOUT_PAD * 2} {...dash}/>}
          </g>;
        })}
        {!probe ? scene.data.clicks.map((click, i) => {
          const p = clamp01((frame - click.atFrame + 1) / rippleFrames);
          if (frame < click.atFrame || p >= 1) return null;
          const e = EASE.land(p);
          return <circle key={i} data-recording-click="" cx={pose.left + click.x * pose.width} cy={top + click.y * pose.height - SCREEN_VIEWPORT_TOP} r={56 * e} fill="none" stroke={NAVY.gold} strokeWidth={3} opacity={1 - e}/>;
        }) : null}
      </svg>
    </div>
    {visible.width > 0 && visible.height > 0 ? <Dressing>{['top', 'bottom'].map(edge => <div key={edge} data-recording-rule={edge} data-visible-capture={JSON.stringify(visible)} style={{position: 'absolute', left: visible.x, top: edge === 'top' ? visible.y : visible.y + visible.height - ruleHeight, width: visible.width, height: ruleHeight, background: NAVY.gold, pointerEvents: 'none'}}/>)}</Dressing> : null}
  </AbsoluteFill>;
};
export const ScreenRecording: React.FC<FamilyDesignProps> = (props) => <MagazineScope data={{lang: 'ar'}}><Recording {...props}/></MagazineScope>;
export default ScreenRecording;
