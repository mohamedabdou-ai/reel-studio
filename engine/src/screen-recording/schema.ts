import { z } from "zod";
import { focusRectSchema } from "../motion-library/schema.ts";
import type { Size } from "../motion-library/geometry.ts";
import { MAX_SCREEN_UPSCALE, activeKeyIndex, insideScreenZone, screenKeyPose, screenKeyScale, screenRectToFrame } from "./pose.ts";

const frame = z.number().int().min(0).max(4320000);
const unit = z.number().min(0).max(1);

export const screenKeySchema = z.object({ atFrame: frame, focus: focusRectSchema, zoom: z.number().min(1).max(4), moveFrames: frame.max(120) }).strict();

export const screenClickSchema = z.object({ atFrame: frame, x: unit, y: unit }).strict();

export const screenCalloutSchema = z.object({ atFrame: frame, untilFrame: frame, kind: z.enum(["rect", "circle"]), rect: focusRectSchema }).strict();

export const screenRecordingVariants = [
  z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), fromFrame: frame, durationInFrames: frame.min(1), motion: z.enum(["land", "stagger", "quiet"]),
    family: z.literal("screen-recording"), layout: z.literal("takeover"),
    data: z.object({
      keys: z.array(screenKeySchema).min(1).max(60),
      clicks: z.array(screenClickSchema).max(60).default([]),
      callouts: z.array(screenCalloutSchema).max(30).default([]),
    }).strict(),
  }),
] as const;
export const screenRecordingSceneSchema = screenRecordingVariants[0];
export type ScreenRecordingSceneData = z.infer<typeof screenRecordingSceneSchema>;


export function screenRecordingIssues(scene: ScreenRecordingSceneData, source: Size): string[] {
  const issues: string[] = [];
  const { keys, clicks, callouts } = scene.data;
  const end = scene.durationInFrames;
  if (keys[0].atFrame !== 0) issues.push(`${scene.id}: the first camera key must start at frame 0.`);
  keys.forEach((key, i) => {
    if (i > 0 && key.atFrame <= keys[i - 1].atFrame) issues.push(`${scene.id}: camera keys must be strictly ordered.`);
    if (key.atFrame + key.moveFrames > end) issues.push(`${scene.id}: camera key ${i} must land inside its scene.`);
    const scale = screenKeyScale(key, source);
    if (scale > MAX_SCREEN_UPSCALE + 1e-9) issues.push(`${scene.id}: camera key ${i} enlarges the recording ${scale.toFixed(2)}x (limit ${MAX_SCREEN_UPSCALE}); lower its zoom or widen its focus.`);
  });
  for (const click of clicks) if (click.atFrame >= end) issues.push(`${scene.id}: click at frame ${click.atFrame} is outside the scene.`);
  for (const callout of callouts) {
    if (!(callout.atFrame < callout.untilFrame && callout.untilFrame <= end)) issues.push(`${scene.id}: callout frames must satisfy atFrame < untilFrame <= scene length.`);
    const box = screenRectToFrame(callout.rect, screenKeyPose(keys[activeKeyIndex(callout.atFrame, keys)], source));
    if (!insideScreenZone(box)) issues.push(`${scene.id}: callout at frame ${callout.atFrame} lands outside the Instagram safe zone; choose a camera key that frames it.`);
  }
  return issues;
}
