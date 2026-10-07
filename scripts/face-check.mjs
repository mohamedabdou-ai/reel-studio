import './lib/project-tmp.mjs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT} from './lib/media.mjs';
import {atomicJson, cliArgs, readJson, relativePath} from './lib/job-paths.mjs';
import {loadEditProject} from './lib/edit-project.mjs';
import {editManifestSchema} from '../engine/src/prepared-edit/schema.ts';
import {footageGeometryFor} from '../engine/src/prepared-edit/footage.ts';
import {installHeadEnvelope} from './lib/delivery-gates.mjs';
import * as HEAD from './lib/head-envelope.mjs';
import {splitCanvasHeightFor} from './lib/head-guide.mjs';
import {repositionFootage} from './lib/face-fix.mjs';

const USAGE = 'Usage: node scripts/face-check.mjs <Projects/<slug>/edit.json> [--fix] [--max-fixes 2] [--envelope <head-envelope.json>]';
const node = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, {cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit']});
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.once('error', reject);
  child.once('close', (code) => resolve({code, stdout}));
});
const print = (value) => console.log(JSON.stringify(value, null, 2));

try {
  const args = cliArgs(process.argv.slice(2), ['fix', 'max-fixes', 'envelope'], ['fix']);
  if (args._.length !== 1) throw new Error(USAGE);
  const file = relativePath(args._[0].replaceAll('\\', '/'));
  const maxFixes = args['max-fixes'] === undefined ? 2 : Number(args['max-fixes']);
  if (!Number.isInteger(maxFixes) || maxFixes < 0 || maxFixes > 5) throw new Error('--max-fixes must be an integer from 0 to 5.');
  let {manifest} = await loadEditProject(file);
  const id = manifest.id;
  if (manifest.presenter === false) {
    print({ok: true, status: 'EXEMPT', reason: 'screen-only source (presenter: false): there is no face to protect', fixes: []});
  } else {
    if (args.envelope !== undefined) await installHeadEnvelope(path.join(ROOT, ...relativePath(args.envelope.replaceAll('\\', '/')).split('/')), HEAD);
    const outDir = `Projects/${id}/qa/face-check`;
    const props = `Projects/${id}/prepared/props.json`;
    const fixes = [];
    for (let attempt = 0; ; attempt++) {
      const prepared = await node([path.join(ROOT, 'scripts', 'editor.mjs'), 'prepare', file, '--no-proxy']);
      if (prepared.code !== 0) throw new Error(`editor prepare failed with exit ${prepared.code}.`);
      const checked = await node([path.join(ROOT, 'scripts', 'head-check.mjs'), '--comp', 'PreparedEdit', '--props-file', props, '--manifest-geometry', '--out', outDir]);
      const report = await readJson(`${outDir}/report.json`, {optional: true});
      const status = report?.status ?? 'ERROR';
      const evidence = {report: `${outDir}/report.json`, sheet: report?.sheet?.file ?? null};
      if (status === 'PASS') { print({ok: true, status, ...evidence, fixes}); break; }
      if (status === 'NEEDS-REVIEW') {
        const rows = report.frames.filter((row) => row.status === 'NEEDS-REVIEW');
        const count = Math.min(6, rows.length);
        const times = [...new Set(Array.from({length: count}, (_, i) => rows[count === 1 ? 0 : Math.round((i * (rows.length - 1)) / (count - 1))].t))];
        let stills = [];
        if (times.length) {
          const rendered = await node([path.join(ROOT, 'scripts', 'stills.mjs'), '--comps', 'PreparedEdit', '--props-file', props, '--at', times.join(','), '--out', `${outDir}/stills`]);
          if (rendered.code !== 0) throw new Error('Could not render the face-check review stills.');
          stills = JSON.parse(rendered.stdout.slice(rendered.stdout.indexOf('{'))).written.map((w) => path.relative(ROOT, w.output).split(path.sep).join('/'));
        }
        print({ok: false, status, reason: 'No face was found in some presenter frames. Show these stills to the follower; deliver with --face-reviewed-by <name> only after they confirm the face is clear.',
          stills, envelopeErrors: report.envelope?.errors ?? [], ...evidence, fixes});
        process.exitCode = HEAD.HEAD_EXIT['NEEDS-REVIEW'];
        break;
      }
      if (status !== 'FAIL') throw new Error(`head-check ended with ${status} (exit ${checked.code}); see ${outDir}/report.json`);
      const failing = report.frames.filter((row) => row.status === 'FAIL');
      if (!args.fix || attempt >= maxFixes) {
        print({ok: false, status, failures: failing.slice(0, 20).map(({frame, t, sceneId, reason}) => ({frame, t, sceneId, reason})), ...evidence, fixes,
          next: args.fix ? 'Moving the video did not clear the face; change that scene layout or its text.' : 'Run again with --fix to move the video automatically.'});
        process.exitCode = HEAD.HEAD_EXIT.FAIL;
        break;
      }
      const aspect = report.aspect.value;
      const splitCanvasHeight = manifest.footage ? null : splitCanvasHeightFor(manifest.style);
      const still = {scale: 1, focusX: 0.5, focusY: 0.4};
      const base = manifest.footage ?? {defaultLayout: 'split',
        full: footageGeometryFor(manifest, 'presenter', still, {aspect, canvasHeight: splitCanvasHeight}),
        split: footageGeometryFor(manifest, 'split', still, {aspect, canvasHeight: splitCanvasHeight})};
      const failures = failing.map((row) => {
        const state = HEAD.manifestFrameState(manifest, row.frame, {aspect, splitCanvasHeight});
        return {row, layout: state.layout, geo: state.geo};
      });
      const remedy = repositionFootage({footage: base, failures, aspect});
      if (!remedy.footage) { print({ok: false, status, notes: remedy.notes, ...evidence, fixes}); process.exitCode = HEAD.HEAD_EXIT.FAIL; break; }
      const backup = `Projects/${id}/edit.before-face-fix-${attempt + 1}.json`;
      await atomicJson(backup, manifest, {project: id});
      manifest = editManifestSchema.parse({...manifest, footage: remedy.footage});
      await atomicJson(file, manifest, {project: id});
      fixes.push({attempt: attempt + 1, backup, notes: remedy.notes});
    }
  }
} catch (error) {
  console.error(JSON.stringify({ok: false, error: error.message}));
  process.exitCode = 1;
}
