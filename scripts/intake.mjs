import './lib/project-tmp.mjs';
import path from 'node:path';
import {ROOT, ffprobeJson, run} from './lib/media.mjs';
import {atomicJson, cliArgs, ensureOutput, fileSnapshot, readJson, relativePath, slug} from './lib/job-paths.mjs';
import {describeSource, intakePlan, measureKeptTimes, transcodeArgs} from './lib/intake.mjs';

const USAGE = 'Usage: node scripts/intake.mjs --source <file> --id <project-slug>';
try {
  const args = cliArgs(process.argv.slice(2), ['source', 'id']);
  if (typeof args.source !== 'string' || typeof args.id !== 'string' || args._.length) throw new Error(USAGE);
  const id = args.id;
  slug(id, 'project id');
  const source = relativePath(args.source.replaceAll('\\', '/'));
  const original = await fileSnapshot(source);
  const recordPath = `Projects/${id}/source/intake.json`;
  const previous = await readJson(recordPath, {optional: true});
  const reusable = previous?.version === 1 && previous.source === source && previous.sourceSha256 === original.sha256
    && (!previous.transcoded || (await fileSnapshot(previous.edit).catch(() => null))?.sha256 === previous.editSha256);
  if (reusable) console.log(JSON.stringify({...previous, cached: true}, null, 2));
  else {
    const absolute = path.join(ROOT, ...source.split('/'));
    const facts = describeSource(await ffprobeJson(absolute));
    const keptTimes = await measureKeptTimes(absolute);
    const plan = intakePlan(facts, keptTimes);
    let edit = source, editSha256 = original.sha256;
    if (plan.transcode) {
      edit = `Projects/${id}/source/${path.basename(source, path.extname(source))}-${plan.deliveryFps}fps.mp4`;
      await run('ffmpeg', transcodeArgs({input: absolute, output: await ensureOutput(edit, {project: id}), plan, hasAudio: facts.hasAudio}));
      editSha256 = (await fileSnapshot(edit)).sha256;
    }
    const record = {version: 1, id, source, sourceSha256: original.sha256, edit, editSha256, transcoded: plan.transcode, reasons: plan.reasons,
      hdr: plan.hdr, vfr: plan.vfr, taggedFps: facts.taggedFps, keptFrames: keptTimes.length, realFps: plan.realFps, plateFps: plan.plateFps,
      deliveryFps: plan.deliveryFps, repeat: plan.repeat, filter: plan.transcode ? plan.filter : null};
    await atomicJson(recordPath, record, {project: id});
    console.log(JSON.stringify({...record, cached: false}, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ok: false, error: error.message}));
  process.exitCode = 1;
}
