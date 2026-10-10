import './lib/project-tmp.mjs';
import {cliArgs} from './lib/job-paths.mjs';
import {proposePodcastBatch, selectPodcastBatch, preparePodcastBatch, renderPodcastBatch, podcastBatchStatus} from './lib/podcast-batch.mjs';

const usage = 'Usage: podcast.mjs propose --source <local-video> --transcript <reviewed-words.json> --id <batch> --reviewed-by <name> [--min-sec 15 --max-sec 90] | select <batch.json> --selections <approved-selections.json> | prepare <batch.json> [--profile PROFILE.json] [--no-proxy] [--clip id] | render <batch.json> [--review | --deliver --approved-by name] [--options clip-render-options.json] [--clip id] | status <batch.json>';
try {
  const [action, ...tokens] = process.argv.slice(2);
  const allowed = {propose: ['source', 'transcript', 'id', 'reviewed-by', 'min-sec', 'max-sec'], select: ['selections'], prepare: ['profile', 'no-proxy', 'clip'], render: ['review', 'deliver', 'approved-by', 'options', 'clip'], status: []};
  if (!Object.hasOwn(allowed, action)) throw new Error(usage);
  const args = cliArgs(tokens, allowed[action], ['no-proxy', 'review', 'deliver']);
  if (args._.length !== (action === 'propose' ? 0 : 1)) throw new Error(usage);
  const onProgress = message => process.stderr.write(`[podcast] ${message}\n`);
  let result;
  if (action === 'propose') result = await proposePodcastBatch({source: args.source, transcript: args.transcript, id: args.id, reviewedBy: args['reviewed-by'],
    ...(args['min-sec'] === undefined ? {} : {minSec: Number(args['min-sec'])}), ...(args['max-sec'] === undefined ? {} : {maxSec: Number(args['max-sec'])})});
  else if (action === 'select') result = await selectPodcastBatch(args._[0], args.selections);
  else if (action === 'prepare') result = await preparePodcastBatch(args._[0], {profile: args.profile, noProxy: !!args['no-proxy'], clip: args.clip, onProgress});
  else if (action === 'render') result = await renderPodcastBatch(args._[0], {delivery: !!args.deliver, review: !!args.review, approvedBy: args['approved-by'], optionsFile: args.options, clip: args.clip, onProgress});
  else result = await podcastBatchStatus(args._[0]);
  const lines = {propose: () => `جهّزت ${result.candidates.length} اقتراح للمراجعة؛ اختار المقاطع قبل التحضير.`, select: () => `حفظت اختيار ${result.clips.length} مقطع بالموافقة المسجّلة.`,
    prepare: () => `جهّزت ${result.clips.length} مقطع؛ افتح المحرر وراجع الصورة والكلام قبل التصدير.`, render: () => `تصدير ${result.clips.length} مقطع خلص؛ راجع الفيديوهات والصوت قبل التسليم.`, status: () => `حالة المقاطع: ${result.status}.`};
  console.log(lines[action]());
  console.log(JSON.stringify(result));
} catch (error) {
  console.log('المقاطع محتاجة مراجعة الخطوة الموضّحة قبل ما نكمّل.');
  console.log(JSON.stringify({ok: false, error: error.message}));
  process.exitCode = 1;
}
