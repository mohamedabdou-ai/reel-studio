import { keyPose, captureRectToViewport, type Box, type CapturePose, type PoseStep } from "../motion-library/capture.ts";
import type { FocusRect } from "../motion-library/schema.ts";
import type { Size } from "../motion-library/geometry.ts";
import { EASE, mix, px } from "../core/motion.ts";



export const SCREEN_VIEWPORT: Size = { width: 1080, height: 1220 };
export const SCREEN_VIEWPORT_TOP = 250;

export const SCREEN_ZONE = { top: 250, bottom: 1470, left: 65, right: 1015, rail: { x: 853, y: 1150 } } as const;


export const MAX_SCREEN_UPSCALE = 1.25;

export type ScreenKey = { atFrame: number; focus: FocusRect; zoom: number; moveFrames: number };

export function screenKeyPose(key: ScreenKey, source: Size): CapturePose {
  const step: PoseStep = { sourceWidth: source.width, sourceHeight: source.height, keys: [{ atFrame: 0, focus: key.focus, zoom: key.zoom }], moveFrames: 1 };
  return keyPose(step, 0, SCREEN_VIEWPORT);
}


export const screenKeyScale = (key: ScreenKey, source: Size): number => screenKeyPose(key, source).width / source.width;


export function activeKeyIndex(frame: number, keys: readonly ScreenKey[]): number {
  let index = 0;
  for (let i = 0; i < keys.length; i++) if (frame >= keys[i].atFrame) index = i;
  return index;
}


export function screenTrackPose(frame: number, keys: readonly ScreenKey[], source: Size): CapturePose {
  if (!keys.length) throw new Error("screen-recording: a scene needs at least one camera key");
  const index = activeKeyIndex(frame, keys);
  const key = keys[index];
  const to = screenKeyPose(key, source);
  const moving = index > 0 && key.moveFrames > 0 && frame < key.atFrame + key.moveFrames;
  if (!moving) return { left: px(to.left), top: px(to.top), width: px(to.width), height: px(to.height) };
  const from = screenKeyPose(keys[index - 1], source);
  const p = EASE.inOut((frame - key.atFrame) / key.moveFrames);
  return { left: px(mix(from.left, to.left, p)), top: px(mix(from.top, to.top, p)), width: px(mix(from.width, to.width, p)), height: px(mix(from.height, to.height, p)) };
}


export function screenRectToFrame(rect: FocusRect, pose: CapturePose): Box {
  const box = captureRectToViewport(rect, pose);
  return { x: box.x, y: box.y + SCREEN_VIEWPORT_TOP, width: box.width, height: box.height };
}


export function insideScreenZone(box: Box): boolean {
  const x1 = box.x + box.width, y1 = box.y + box.height, z = SCREEN_ZONE;
  return box.x >= z.left && x1 <= z.right && box.y >= z.top && y1 <= z.bottom && !(x1 > z.rail.x && y1 > z.rail.y);
}
