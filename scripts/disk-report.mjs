import './lib/project-tmp.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, parseArgs } from './lib/media.mjs';
import { cleanPlan, fmt, freeBytes, renderBudget, scanUsage } from './lib/disk-report.mjs';

const args = parseArgs(process.argv.slice(2), {});
const free = freeBytes(ROOT);
const ram = os.freemem();
const usage = scanUsage({ root: ROOT });
const plan = args.clean ? cleanPlan({ root: ROOT }) : [];
const budget = args.frames ? renderBudget({ frames: Number(args.frames), freeRamBytes: ram, freeDiskBytes: free }) : null;

let removed = [];
if (args.clean && args.apply) {
  for (const item of plan) {
    fs.rmSync(item.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    removed.push(item);
  }
}
const freeAfter = args.clean && args.apply ? freeBytes(ROOT) : free;

if (args.json) {
  console.log(JSON.stringify({ freeDiskBytes: free, freeRamBytes: ram, usage, plan, removed, freeDiskAfterBytes: freeAfter, budget }, null, 2));
} else {
  console.log(`D: free ${fmt(free)}   RAM free ${fmt(ram)}\n`);
  console.log('real = bytes only this folder holds (hard links to engine/public are not counted twice)');
  for (const r of usage.slice(0, 14)) console.log(`${fmt(r.real).padStart(9)} real  ${fmt(r.apparent).padStart(9)} shown by du   ${r.label}${r.note ? '  - ' + r.note : ''}`);
  if (budget) console.log(`\nRender budget: ${budget.message}`);
  if (args.clean) {
    const total = plan.reduce((s, i) => s + i.bytes, 0);
    console.log(`\n${args.apply ? 'Removed' : 'Would remove'} ${plan.length} item(s), ${fmt(total)}:`);
    for (const i of plan) console.log(`  ${fmt(i.bytes).padStart(9)}  ${path.relative(ROOT, i.path)}  (${i.reason})`);
    if (!args.apply && plan.length) console.log('\nRun again with --apply to remove them.');
    if (args.apply) console.log(`D: free now ${fmt(freeAfter)}`);
  }
  console.log(`\nالمساحة الفاضية على D: ${fmt(free)}${args.clean && args.apply ? `، بعد التنضيف ${fmt(freeAfter)}` : ''}.`);
}
