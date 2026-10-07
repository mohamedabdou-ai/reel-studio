import './lib/project-tmp.mjs';
import { parseArgs } from './lib/media.mjs';
import { mixDelivery } from './lib/mix-run.mjs';
import { STYLE_IDS } from '../engine/src/creative-kit/styles.ts';

const args = parseArgs(process.argv.slice(2));
try {
  if (args.help) console.log(`Usage: node scripts/mix.mjs --video in.mp4 [--sfx effects.wav] --out final.mp4 [options]
  --style <id>                     Accept a registered visual style; mastering targets stay unchanged.
    ${STYLE_IDS.join('|')}
    Legacy section-deck/split-canvas full DNA slugs also remain accepted.
    Only those two measured audio profiles have an LRA reference upper bound.
  --under 5 --lufs -14 --tp -1      Measured SFX placement and unchanged delivery targets.
  --ceilPad 0.8                    Sample-peak headroom below the true-peak target.
  --tighten 1                      Existing optional gentle glue compressor; default off.
  --voice off|clean|denoise        Dialogue cleanup before ducking; default off (unchanged graph).
                                   clean: highpass 75 Hz, gentle de-ess, -1.5 dB @300 Hz, +1.5 dB @3 kHz, light 2:1 compressor.
                                   denoise: clean + afftdn at the measured room floor, only above -55 dBFS (else skipped, reported).
  --report Projects/example/mix.json  Optional structured report file.
Loudness/peak and missing/nonfinite measurements are hard failures (exit 2).
LRA is advisory and explicitly unstable on samples shorter than 60 seconds.
Absent or digitally silent SFX are bypassed. Primary audio is required.
Successful mixing with advisories exits 0; all generated files remain project-local.`);
  else {
    const report = await mixDelivery(args);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 2;
  }
} catch (error) {
  console.log(JSON.stringify({ schema: 1, ok: false, status: 'failed', published: false, errors: [{ code: 'mix_configuration_failed', message: error.message }], warnings: [] }, null, 2));
  process.exitCode = 1;
}
