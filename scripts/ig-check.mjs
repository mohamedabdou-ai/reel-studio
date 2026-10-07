import { parseArgs, writeJson } from './lib/media.mjs';
import { igCheck } from './lib/ig.mjs';

const args = parseArgs(process.argv.slice(2), { channel: 'organic' });
const file = args._[0];
if (!file || args.json === true) { console.error('Usage: node scripts/ig-check.mjs <file.mp4> [--channel organic|ads|api] [--no-loudness] [--json out.json]'); process.exit(1); }

const report = await igCheck(file, { channel: args.channel, withLoudness: !args['no-loudness'] });
if (args.json) await writeJson(args.json, report);

const pad = (s, n) => String(s).padEnd(n);
for (const c of report.checks) {
  const mark = c.level === 'pass' ? 'PASS' : c.level === 'warn' ? 'WARN' : 'FAIL';
  process.stderr.write(`${mark}  ${pad(c.id, 18)} ${pad(c.actual, 28)} ${c.level === 'pass' ? '' : '→ ' + c.expected}\n`);
}
console.log(JSON.stringify({ ok: report.ok, channel: report.channel, fails: report.fails, warnings: report.warnings, summary: report.summary }, null, 2));
process.exit(report.ok ? 0 : 3);
