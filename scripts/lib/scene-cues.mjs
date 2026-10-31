import {resolveComposeAt} from '../../engine/src/creative-kit/compose/timing.ts';
import {arabicTypeCues} from '../../engine/src/arabic-type/timing.ts';
import {chatMessageFrames,chatTypingFrames} from '../../engine/src/creative-kit/chat-thread/timing.ts';
import { oneShotCues } from '../../engine/src/styles/one-shot/scenes/math.ts';
import { CARTOON_FAMILIES, cartoonCues } from '../../engine/src/styles/cartoon/scenes/math.ts';
import { layeredCues } from '../../engine/src/styles/layered-speaker/scenes/math.ts';
import { compileEdit } from '../../engine/src/prepared-edit/timeline.ts';
import { isBrollScene } from '../../engine/src/prepared-edit/broll.ts';

export const CUE_KINDS = Object.freeze(['transition', 'stamp', 'swap', 'click', 'count', 'reveal', 'type']);

const KIND_ORDER = new Map(CUE_KINDS.map((kind, index) => [kind, index]));

// Grid Glide scene families (tests/grid-glide-director.test.mjs keeps this list equal to GRID_GLIDE_FAMILIES).
export const GLIDE_CUE_FAMILIES = Object.freeze(['glide-chapter', 'glide-card', 'glide-lines', 'glide-comment', 'glide-follow']);
// A chapter pill (and the follow pill of glide-follow) starts 14.75 frames (at 30 fps) after its hero word unless the scene sets pillAt, and its click lands 5 frames
// (at 30 fps) after that. Both defaults are fixed in time, so they scale with the edit's frame rate: 14.75 * fps / 30 and
// 5 * fps / 30 frames. An explicit pillAt is already written in the edit's frames and is never scaled.
const GLIDE_PILL_AFTER_HERO = 14.75;
const GLIDE_CLICK_AFTER_PILL = 5;
const glideFrames = (frames30, fps) => (frames30 * (typeof fps === 'number' && Number.isFinite(fps) && fps > 0 ? fps : 30)) / 30;

const frameOf = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null);
const list = (value) => (Array.isArray(value) ? value : []);

const compareCues = (a, b) => a.frame - b.frame
  || KIND_ORDER.get(a.kind) - KIND_ORDER.get(b.kind)
  || (a.sceneId < b.sceneId ? -1 : a.sceneId > b.sceneId ? 1 : 0);


export function sortCues(cues) {
  const seen = new Set(), out = [];
  for (const cue of [...cues].sort(compareCues)) {
    const key = `${cue.frame}:${cue.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ frame: cue.frame, kind: cue.kind, sceneId: cue.sceneId });
  }
  return out;
}


/** `words` are the compiled edit words; cartoon and compose scenes read them (their times are word anchors). */
export function sceneCues(scene, fps = 30, { words = [] } = {}) {
  const from = frameOf(scene?.fromFrame);
  if (from === null || from < 0) return [];
  const length = Number.isInteger(scene.durationInFrames) && scene.durationInFrames > 0 ? scene.durationInFrames : Infinity;
  const sceneId = typeof scene.id === 'string' ? scene.id : '';
  const data = scene.data && typeof scene.data === 'object' ? scene.data : {};
  const cues = [];
  const add = (local, kind) => {
    const frame = frameOf(local);
    if (frame === null || frame < 0 || frame >= length) return;
    cues.push({ frame: from + frame, kind, sceneId });
  };

  // An entrance that is a dip has its climax on the boundary: it gets the stamp, not the cut sound.
  const dipEntrance = GLIDE_CUE_FAMILIES.includes(scene.family) && data.enter?.kind === 'dip';
  // A one-shot take starts silent on its home page and a cartoon body opens on its first act: their own cues carry every sound.
  // The cartoon ending's first frame is its flip, so it keeps the scene-start transition.
  // B-roll plays silently under the voice: it gets no cue, neither at its start nor at a clip change.
  if (!isBrollScene(scene) && scene.family !== 'one-shot' && scene.family !== CARTOON_FAMILIES[0]) add(0, dipEntrance ? 'stamp' : 'transition');
  switch (scene.family) {
    case 'compose':
      for (const part of list(data.parts)) {
        if (!part?.at) continue;
        const at = resolveComposeAt(part.at, scene, words, fps);
        if (at === null) continue; // Cut-away/out-of-window anchors never make a cue.
        const offsets = part.kind === 'steps' ? list(part.items).map(row => row.offsetFrames)
          : part.kind === 'list' ? list(part.items).map((_, i) => i * (part.staggerFrames ?? 10)) : [0];
        for (const offset of offsets) if (at + offset !== 0) add(at + offset, 'reveal');
      }
      break;
    case 'figures':
      if(data.variant==='bars')list(data.bars).forEach((_,i)=>add(Math.round(i*.12*fps),'count'));
      else add(0,'count');
      break;
    case 'chat-thread':
      chatMessageFrames({...data,messages:list(data.messages)},fps).forEach(at=>{if(data.variant==='typing')add(at-chatTypingFrames(fps),'type');add(at,'reveal');});
      break;
    case 'proof-screen':add(Math.ceil(fps),'reveal');break;
    case 'verdict': for(const row of list(data.rows))add(row?.atFrame,'count'); add(data.verdictFrame,'stamp'); break;
    case 'claim-proof': add(data.receiptFrame,'reveal');add(data.totalFrame,'count');add(data.totalFrame+36,'stamp');break;
    case 'map-route':
    case 'map-focus':
      break; // Geographic movement and city labels stay silent.
    case 'cutout-card':
      add(data.at ?? 10, 'reveal');
      break;
    case CARTOON_FAMILIES[0]:
    case CARTOON_FAMILIES[1]:
      if (words.length && Number.isInteger(fps) && fps > 0) for (const cue of cartoonCues(scene, words, fps)) add(cue.frame, cue.kind);
      break;
    case 'one-shot':
      for (const cue of oneShotCues(data, fps)) add(cue.frame, cue.kind);
      break;
    case 'arabic-type':
      for(const cue of arabicTypeCues(data,fps))add(cue.frame,cue.kind);break;
    case 'layered-speaker': // The big word landing and a hand-drawn mark touching down; the speaker is already on screen at the scene start.
      for (const cue of layeredCues(data, fps)) add(cue.frame, cue.kind);
      break;
    case 'message-board':
      add(data.gatherFrame,'reveal');add(data.focusFrame,'swap');if(data.closingFrame!==undefined)add(data.closingFrame,'reveal');break;
    case 'kinetic-text':add(0,'type');break;
    case 'evidence-wipe':add(data.revealFrame,'swap');break;
    case 'token-lens':
      for(const group of list(data.groups))add(group?.atFrame,'reveal');
      add(data.lens?.atFrame,'swap');
      break;
    case 'meter-receipt':
      for(const row of list(data.rows))add(row?.atFrame,'count');
      break;
    case 'ticket-offer':add(data.ticket?.atFrame,'stamp');break;
    case 'comment-stack':
      for(const comment of list(data.comments))add(comment?.atFrame,'reveal');
      break;
    case 'chapter-quote':add(data.quoteFrame,'reveal');break;
    case 'route-stops':
      for(const stop of list(data.stops))add(stop?.atFrame,'reveal');
      break;
    case 'kinetic-hook':
      add(data.swapFrame, 'swap');
      add(data.stampFrame, 'stamp');
      break;
    case 'checklist':
      for (const item of list(data.items)) add(item?.atFrame, 'reveal');
      break;
    case 'count':
      add(data.rollFrame, 'count');
      add(data.unitFrame, 'reveal');

      if (typeof data.badge === 'string') add(data.badgeFrame ?? data.unitFrame, 'stamp');
      break;
    case 'creator-cta':
      add(data.followFrame, 'reveal');
      add(data.clickedFrame, 'click');
      break;
    case 'screen-recording':
      for (const click of list(data.clicks)) add(click?.atFrame, 'click');
      for (const callout of list(data.callouts)) add(callout?.atFrame, 'reveal');
      break;
    case 'data-story':
      for (const item of list(data.items)) add(item?.atFrame, 'count');
      break;
    case 'screens':
    case 'screen-focus':
      if (isBrollScene(scene)) break;
      list(data.steps).forEach((step, index) => {
        if (!step || typeof step !== 'object') return;
        if (index > 0) add(step.atFrame, 'swap');
        if (scene.family === 'screen-focus') {
          add(step.focusFrame, 'reveal');


          if (!Array.isArray(step.cursor)) {
            const focus = frameOf(step.focusFrame), settle = frameOf(step.settleFrames);
            if (focus !== null && settle !== null) add(focus + settle, 'click');
          }
        }

        for (const point of list(step.cursor)) if (point?.click === true) add(point.atFrame, 'click');
        for (const callout of list(step.callouts)) {
          if (!callout || typeof callout !== 'object') continue;
          const typed = callout.kind === 'label' && typeof callout.text === 'string' && callout.text.trim() !== '';
          add(callout.atFrame, typed ? 'type' : 'reveal');
        }
      });
      break;
    case 'glide-chapter':
    case 'glide-follow': // the FOLLOW pill clicks exactly like a tool pill
      if (data.pill && typeof data.pill === 'object') {
        const heroAt = typeof data.heroAt === 'number' ? data.heroAt : 0;
        const pillAt = typeof data.pillAt === 'number' ? data.pillAt : heroAt + glideFrames(GLIDE_PILL_AFTER_HERO, fps);
        add(pillAt + glideFrames(GLIDE_CLICK_AFTER_PILL, fps), 'click');
      }
      break;
    case 'glide-card':
    case 'glide-lines':
    case 'glide-comment':
      break; // Words, boxes, bullets and media changes are silent in this style.
    default:
      break;
  }
  return sortCues(cues);
}


export function editCues(manifest) {
  const scenes = list(manifest?.scenes);
  // Not flatMap(sceneCues): flatMap would hand the array index to sceneCues as its fps.
  const fps = manifest?.source?.fps;
  // Cartoon and compose scenes cue on the recorded words: compile once for the whole edit.
  let words = [];
  if (scenes.some((scene) => CARTOON_FAMILIES.includes(scene?.family) || (scene?.family === 'compose' && list(scene.data?.parts).some(part => part.at && 'word' in part.at)))) { try { words = compileEdit(manifest).words; } catch { words = []; } }
  const cues = scenes.flatMap((scene) => sceneCues(scene, fps, { words }));
  for (const transition of list(manifest?.transitions)) {
    const frame = frameOf(transition?.atFrame);
    if (frame === null || frame < 0) continue;
    const owner = scenes.find((scene) => Number.isInteger(scene?.fromFrame) && Number.isInteger(scene?.durationInFrames)
      && frame >= scene.fromFrame && frame < scene.fromFrame + scene.durationInFrames);
    cues.push({ frame, kind: 'transition', sceneId: typeof owner?.id === 'string' ? owner.id : 'timeline' });
  }
  return sortCues(cues);
}
