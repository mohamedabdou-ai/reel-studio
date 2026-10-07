import '../../scripts/lib/project-tmp.mjs';
import { parseArgs } from '../../scripts/lib/media.mjs';
import { installWhisper } from '../../scripts/lib/transcription-install.mjs';

const args = parseArgs(process.argv.slice(2));
const allowed = new Set(['_', 'release', 'model', 'with-vad', 'help']);
try {
  for (const key of Object.keys(args)) if (!allowed.has(key)) throw new Error(`Unknown option --${key}.`);
  if (args.help) console.log('Usage: node engine/tools/install-whisper.mjs [--release b4938] [--model medium] [--with-vad]\nPinned official CPU release; everything stays inside this project. Legacy models are reused.');
  else {
    const result = await installWhisper({ releaseTag: args.release, model: args.model, withVad: args['with-vad'] === true });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
