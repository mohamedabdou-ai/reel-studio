import './lib/project-tmp.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cliArgs, checkedPath } from './lib/job-paths.mjs';
import { assertProjectOutput } from './lib/project-paths.mjs';
import { writeJson } from './lib/media.mjs';
import { analyzeReframe, renderReframe } from './lib/reframe-pipeline.mjs';
import { installFaceModel } from './lib/reframe-runtime.mjs';

const usage = 'node scripts/reframe.mjs install | analyze --source Raw/my-video.mp4 [--start 0 --duration 3 --out Projects/example/faces.json] | render (--source Raw/my-video.mp4 OR --analysis Projects/example/faces.json) --ratio 9:16 --out Projects/example/vertical.mp4 [--short-edge 1080]';
try {
  const args = cliArgs(process.argv.slice(2), ['source', 'start', 'duration', 'out', 'ratio', 'analysis', 'short-edge', 'sample-fps', 'analysis-edge', 'min-confidence', 'max-speed', 'smoothing', 'force', 'help'], ['force', 'help']);
  const command = args._[0];
  if (args.help || !command) { console.log(usage); process.exitCode = command ? 0 : 1; }
  else {
    if (args._.length !== 1 || !['install', 'analyze', 'render'].includes(command)) throw new Error(usage);
    let result;
    if (command === 'install') {
      if (Object.keys(args).some((name) => !['_', 'help'].includes(name))) throw new Error('install takes no options');
      result = await installFaceModel();
    } else {
      if (command === 'render' && !args.out) throw new Error('render requires an explicit --out path');
      if (command === 'analyze' && args.analysis) throw new Error('--analysis is only valid for render');
      if (args.analysis && (args.source || args.start || args.duration)) throw new Error('An existing --analysis supplies its own source and range; omit --source/--start/--duration');
      if (!args.analysis && !args.source) throw new Error('An explicit --source is required; source media is never auto-discovered');
      let analysis;
      if (args.analysis) analysis = JSON.parse(await fs.readFile(await checkedPath(args.analysis, { mustExist: true }), 'utf8'));
      else analysis = await analyzeReframe({ source: args.source, startSec: Number(args.start ?? 0), durationSec: args.duration === undefined ? undefined : Number(args.duration),
        sampleFps: Number(args['sample-fps'] ?? 5), analysisMaxEdge: Number(args['analysis-edge'] ?? 640), minConfidence: Number(args['min-confidence'] ?? 0.5), force: !!args.force,
        log: (message) => process.stderr.write(`${message}\n`) });
      if (command === 'analyze') {
        if (args.out) {
          const out = assertProjectOutput(await checkedPath(args.out));
          if (path.extname(out) !== '.json') throw new Error('Analysis output must be a separate .json file');
          await writeJson(out, analysis);
        }
        result = analysis;
      } else {
        const settings = {};
        if (args['max-speed'] !== undefined) settings.maxSpeed = Number(args['max-speed']);
        if (args.smoothing !== undefined) settings.smoothingSeconds = Number(args.smoothing);
        result = await renderReframe({ analysis, ratio: args.ratio ?? '9:16', out: args.out, shortEdge: Number(args['short-edge'] ?? 1080), settings, force: !!args.force });
      }
    }
    console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
}
