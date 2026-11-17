// scripts/breakdown-eval.mjs
import './lib/project-tmp.mjs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {parseArgs} from './lib/media.mjs';
import {scoreBreakdown} from './lib/breakdown-score.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.breakdown || !args.truth) {
  console.error('Usage: node scripts/breakdown-eval.mjs --breakdown <breakdown.json> --truth <truth.json> [--strict]');
  process.exit(1);
}
const read = file => fsp.readFile(path.resolve(file), 'utf8').then(JSON.parse);
const result = scoreBreakdown(await read(args.breakdown), await read(args.truth));
console.log(JSON.stringify(result, null, 2));
if (args.strict && result.rows.some(r => r.pass === false)) process.exit(1);
