export const CUE_KINDS = Object.freeze(['transition', 'stamp', 'swap', 'click', 'count', 'reveal', 'type']);

const KIND_ORDER = new Map(CUE_KINDS.map((kind, index) => [kind, index]));

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


export function sceneCues(scene) {
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

  add(0, 'transition');
  switch (scene.family) {
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
    default:
      break;
  }
  return sortCues(cues);
}


export function editCues(manifest) {
  const scenes = list(manifest?.scenes);
  const cues = scenes.flatMap(sceneCues);
  for (const transition of list(manifest?.transitions)) {
    const frame = frameOf(transition?.atFrame);
    if (frame === null || frame < 0) continue;
    const owner = scenes.find((scene) => Number.isInteger(scene?.fromFrame) && Number.isInteger(scene?.durationInFrames)
      && frame >= scene.fromFrame && frame < scene.fromFrame + scene.durationInFrames);
    cues.push({ frame, kind: 'transition', sceneId: typeof owner?.id === 'string' ? owner.id : 'timeline' });
  }
  return sortCues(cues);
}
