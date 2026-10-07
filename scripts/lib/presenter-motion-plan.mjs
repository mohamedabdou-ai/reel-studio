import {validateMotionPlan} from './motion-plan.mjs';

export const MIN_PRESENTER_FRAMES = 10;


export function presenterMotionPlan(manifest, {crop, frames}) {
  const kinds = Array.from({length: frames}, () => ({kind: 'presenter'}));
  for (const scene of manifest.scenes) {
    if (scene.layout !== 'takeover') continue;
    for (let f = scene.fromFrame; f < Math.min(frames, scene.fromFrame + scene.durationInFrames); f++) kinds[f] = {kind: 'graphics', reason: `takeover scene ${scene.id} covers the presenter`};
  }
  const runs = [];
  for (let f = 0; f < frames; f++) {
    const last = runs.at(-1);
    if (last && last.kind === kinds[f].kind && last.reason === kinds[f].reason) last.to = f + 1;
    else runs.push({from: f, to: f + 1, ...kinds[f]});
  }
  for (const run of runs) {
    if (run.kind === 'presenter' && run.to - run.from < MIN_PRESENTER_FRAMES && runs.length > 1) Object.assign(run, {kind: 'graphics', reason: `presenter visible for under ${MIN_PRESENTER_FRAMES} frames between takeover scenes`});
  }
  const segments = runs.map(({from, to, kind, reason}) => (kind === 'presenter' ? {from, to, kind, crop} : {from, to, kind, reason}));
  return validateMotionPlan({version: 1, segments}, {width: 1080, height: 1920, frames, fps: manifest.source.fps});
}
