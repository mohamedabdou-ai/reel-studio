import './lib/project-tmp.mjs';
import {parseAlignmentOptions} from './lib/alignment-contract.mjs';
import {inspectAlignmentRuntime, installAlignmentRuntime} from './lib/alignment-install.mjs';
import {runAlignmentWorkflow} from './lib/alignment-pipeline.mjs';

async function main() {
  if(process.argv.slice(2).some(arg=>arg==='--help'||arg==='help')) {
    console.log('Optional local forced alignment (CPU). Consumes reviewed recorded text; outputs draft timing and coverage only.\n'+
      'node scripts/align-captions.mjs inspect [--language ar|en]\n'+
      'node scripts/align-captions.mjs install [--language ar|en] [--python <existing Python 3.10-3.13 executable>]\n'+
      'node scripts/align-captions.mjs run --edit Projects/<slug>/edit.json --out Projects/<slug>/alignment [--language ar|en] [--start-ms <n>] [--duration-ms <n>] [--confidence-threshold <0..1>]\n'+
      'Default language: ar. Install downloads CPU Python packages and the pinned public language model into Tools/alignment. Run uses local files offline.');
    return;
  }
  const options = parseAlignmentOptions(process.argv.slice(2));
  if (options.command === 'inspect') {
    console.log(JSON.stringify(await inspectAlignmentRuntime(options), null, 2));
    return;
  }
  if (options.command === 'install') {
    console.log(JSON.stringify(await installAlignmentRuntime(options), null, 2));
    return;
  }
  const result = await runAlignmentWorkflow(options);
  console.log(JSON.stringify({
    status: 'draft',
    outputDirectory: result.outputDirectory,
    cacheKey: result.cacheKey,
    cacheHit: result.cacheHit,
    coverage: result.outputs.draft.coverage,
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
