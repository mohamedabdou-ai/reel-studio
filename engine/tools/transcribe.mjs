import '../../scripts/lib/project-tmp.mjs';
import { parseArgs } from '../../scripts/lib/media.mjs';
import { transcribeMedia } from '../../scripts/lib/transcription-run.mjs';

const args = parseArgs(process.argv.slice(2));
try {
  if (args.help) console.log(`Usage: node engine/tools/transcribe.mjs --media "Raw/my-video.mp4" [options]
  --lang ar --model medium       Multilingual speech recognition; never translation.
  --start 0 --duration 10        Optional source range in seconds. Timestamps stay source-absolute.
  --chunk-seconds 14             Short chunks reduce long-form timing drift.
  --overlap-seconds 2            Keep overlap context; review every seam.
  --threads 4 --backend cpu      Local CPU backend.
  --timing token|dtw             Token estimates by default; optional DTW can be expensive.
  --vad on|off                   Optional installed Silero VAD; default off.
  --out "Projects/example/transcript"  Project-local output directory.
  --force                       Recompute cached chunks.
Outputs: captions.json (Caption[]), captions.srt, whisper-raw.json (verbatim chunk envelope),
transcript-review.json (uncertainty/timing), transcript-manifest.json (content hashes).
Captions are unverified ASR drafts. Review against recorded words before using in an edit.`);
  else {
    const result = await transcribeMedia(args);
    const { report, ...summary } = result;
    console.log(JSON.stringify({ ...summary, issueCount: report.issues.length, binaryVersion: report.runtime.binaryVersion }));
    if (!result.ok) process.exitCode = 2;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
