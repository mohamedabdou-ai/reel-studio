import {composeClipValues} from '../creative-kit/compose/media.ts';
import {styleSceneVideoSources} from '../styles/media.ts';
import {projectSceneClipValues} from '../project-scenes/schema.ts';

type SceneLike = {family: string; data?: unknown};
/** Scene families whose data may carry a `foreground` alpha video of the speaker, drawn above the scene's own layer. */
export const FOREGROUND_FAMILIES: readonly string[] = ['kinetic-hook', 'layered-speaker'];
/** The `foreground` of a scene that takes one, or null. */
export function sceneForeground(scene: SceneLike): {src: string} | null {
  const foreground = (scene.data as {foreground?: {src?: unknown}} | null | undefined)?.foreground;
  return FOREGROUND_FAMILIES.includes(scene.family) && typeof foreground?.src === 'string' ? (foreground as {src: string}) : null;
}
type StepLike = {kind?: unknown; src?: unknown};
/** The `projectScenes` contracts an edit carries; project scenes need them to say which of their fields are clips. */
export type ProjectScenes = Parameters<typeof projectSceneClipValues>[0]['projectScenes'];

/**
 * The moving files of one scene, split the way the plate list orders them: presenter mattes first, then captures.
 * `captures` may repeat a file (one entry per step that plays it, so two B-roll steps with the same clip list it twice), while the style providers
 * (styles/media.ts) already de-duplicate theirs. Use `sceneVideoSources` when each file is wanted once.
 */
export type MovingSources = {foreground: string[]; captures: string[]};

/**
 * Every moving file a scene mounts. The plate list, the delivery footage gate, the transition rules and the asset verifier all read this one
 * function, so a family that adds moving footage adds it here. Node-safe duck typing: no React.
 */
export function sceneMovingSources(scene: SceneLike, projectScenes?: ProjectScenes): MovingSources {
  const data = scene.data as {foreground?: {src?: unknown}; steps?: unknown; look?: unknown; move?: unknown; media?: unknown} | null | undefined;
  const foreground: string[] = [];
  const captures: string[] = [];
  const matte = sceneForeground(scene);
  if (matte !== null) foreground.push(matte.src);
  if (scene.family === 'screens' || scene.family === 'screen-focus') {
    const steps = Array.isArray(data?.steps) ? (data?.steps as StepLike[]) : [];
    // In the broll look every step is a clip; in the window look only the steps declared as video are.
    const everyStep = scene.family === 'screens' && data?.look === 'broll';
    for (const step of steps) if ((everyStep || step?.kind === 'video') && typeof step?.src === 'string') captures.push(step.src);
  }
  if(scene.family==='arabic-type'&&data?.move==='video-in-letters'&&typeof data.media==='string')captures.push(data.media);
  if (scene.family === 'compose') for (const clip of composeClipValues({data: scene.data})) captures.push(clip.src);
  captures.push(...styleSceneVideoSources(scene));
  if (scene.family === 'project-scene' && projectScenes !== undefined) {
    for (const use of projectSceneClipValues({projectScenes, scenes: [scene as {family: string; data: unknown}]})) captures.push(use.clip.src);
  }
  return {foreground, captures};
}

/** Each moving file of a scene once, in mount order. */
export function sceneVideoSources(scene: SceneLike, projectScenes?: ProjectScenes): string[] {
  const {foreground, captures} = sceneMovingSources(scene, projectScenes);
  return [...new Set([...foreground, ...captures])];
}

/** What an edit claims about one clip a scene plays: the file's bytes and size, and how many frames of it the scene needs after `trimBeforeFrame`. */
export type ClipClaim = {sceneId: string; src: string; sha256: string; width: number; height: number; trimBeforeFrame: number; frames: number};

type BrollStepLike = {atFrame?: number; src?: string; sha256?: string; width?: number; height?: number; trimBeforeFrame?: number};

/** Every clip a scene plays with its claims, for the prepare-time check. */
export function sceneClipClaims(scene: SceneLike & {id?: string; durationInFrames?: number}, projectScenes?: ProjectScenes): ClipClaim[] {
  const claims: ClipClaim[] = [];
  const data = scene.data as {look?: unknown; steps?: unknown} | null | undefined;
  if (scene.family === 'screens' && data?.look === 'broll' && Array.isArray(data.steps) && typeof scene.durationInFrames === 'number') {
    const steps = data.steps as BrollStepLike[];
    steps.forEach((step, index) => {
      const next = steps[index + 1]?.atFrame;
      const end = typeof next === 'number' ? next : (scene.durationInFrames as number);
      claims.push({sceneId: scene.id ?? '', src: step.src as string, sha256: step.sha256 as string, width: step.width as number, height: step.height as number,
        trimBeforeFrame: step.trimBeforeFrame ?? 0, frames: Math.max(1, end - (step.atFrame ?? 0))});
    });
  }
  if (scene.family === 'compose' && typeof scene.durationInFrames === 'number') {
    for (const clip of composeClipValues({data: scene.data})) claims.push({sceneId: scene.id ?? '', src: clip.src, sha256: clip.sha256, width: clip.width, height: clip.height,
      trimBeforeFrame: clip.trimBeforeFrame ?? 0, frames: scene.durationInFrames});
  }
  if (scene.family === 'project-scene' && projectScenes !== undefined && typeof scene.durationInFrames === 'number') {
    for (const use of projectSceneClipValues({projectScenes, scenes: [scene as {id?: string; family: string; data: unknown}]})) {
      claims.push({sceneId: use.sceneId, src: use.clip.src, sha256: use.clip.sha256, width: use.clip.width, height: use.clip.height,
        trimBeforeFrame: use.clip.trimBeforeFrame, frames: scene.durationInFrames});
    }
  }
  return claims;
}
