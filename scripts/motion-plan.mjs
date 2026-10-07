import './lib/project-tmp.mjs';
import {atomicJson, cliArgs, relativePath} from './lib/job-paths.mjs';
import {loadEditProject} from './lib/edit-project.mjs';
import {splitCanvasHeightFor} from './lib/head-guide.mjs';
import {presenterMotionPlan} from './lib/presenter-motion-plan.mjs';

const USAGE = 'Usage: node scripts/motion-plan.mjs <Projects/<slug>/edit.json> [--crop w:h:x:y]';
try {
  const args = cliArgs(process.argv.slice(2), ['crop']);
  if (args._.length !== 1) throw new Error(USAGE);
  const {manifest, compiled} = await loadEditProject(relativePath(args._[0].replaceAll('\\', '/')));
  if (manifest.presenter === false) throw new Error('A screen-only source has no presenter to measure; deliver it without a motion plan.');
  const top = manifest.footage?.split.windowTop ?? splitCanvasHeightFor(manifest.style);
  const crop = args.crop ?? `1080:${1920 - top}:0:${top}`;
  if (!/^\d+:\d+:\d+:\d+$/.test(crop)) throw new Error('--crop must be w:h:x:y.');
  const plan = presenterMotionPlan(manifest, {crop, frames: compiled.durationInFrames});
  const file = `Projects/${manifest.id}/motion-plan.json`;
  await atomicJson(file, plan, {project: manifest.id});
  console.log(JSON.stringify({ok: true, file, crop, segments: plan.segments.length,
    graphics: plan.segments.filter((segment) => segment.kind === 'graphics').map(({from, to, reason}) => ({from, to, reason}))}, null, 2));
} catch (error) {
  console.error(JSON.stringify({ok: false, error: error.message}));
  process.exitCode = 1;
}
