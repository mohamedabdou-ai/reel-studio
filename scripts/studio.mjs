import './lib/project-tmp.mjs';
import {spawn} from 'node:child_process';
import {closeSync, openSync, promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {readProfile} from './lib/branding.mjs';
import {ROOT} from './lib/project-paths.mjs';
import {DOCTOR_DIR, describeFailures, doctorProps, quickChecks, renderDoctor} from './lib/studio-doctor.mjs';
import {checkForUpdate, pullUpdate, resolveGit} from './lib/studio-git.mjs';
import {readLock} from './lib/studio-lock.mjs';
import {runSetup, setupSteps} from './lib/studio-setup.mjs';
import {LOG_FILE, STEP_IDS, describeSetup, readSetupState, workerAlive, writeSetupState} from './lib/studio-state.mjs';

const SELF = fileURLToPath(import.meta.url);
const CHECK_LINES = {
  'no-git': 'مش لاقي git على الجهاز، فمش هقدر أدور على تحديثات.',
  'not-a-clone': 'الفولدر ده مش نسخة git من الاستوديو، فمش هقدر أدور على تحديثات.',
};
const UPDATE_LINES = {
  'no-git': 'مش لاقي git على الجهاز — شوف خطوة Git في AGENTS.md.',
  'local-changes': 'فيه ملفات من الاستوديو نفسه اتعدّلت هنا، فمش هحدّث عشان ما يضيعش حاجة. قولّي وأنا أراجعها معاك.',
  'pull-failed': 'التحديث ما نزلش — غالبًا مشكلة نت. جرّب تاني بعد شوية.',
};
const USAGE = 'Usage: node scripts/studio.mjs setup [--foreground] [--steps folders,packages,browser,ffmpeg,fonts,models] | status | settings [--port <port>] | check | update | doctor [--quick]';

function report(line, json, exitCode = json.ok === false ? 1 : 0) {
  console.log(line);
  console.log(JSON.stringify(json));
  process.exitCode = exitCode;
}

function parseSteps(value) {
  if (value === undefined) return [...STEP_IDS];
  const ids = value.split(',').map((id) => id.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !STEP_IDS.includes(id));
  if (!ids.length || unknown.length) throw new Error(`Unknown setup step "${unknown.join(',')}". Steps: ${STEP_IDS.join(', ')}.`);
  return STEP_IDS.filter((id) => ids.includes(id));
}


async function startSetup(stepIds, next = null) {
  const state = await readSetupState(ROOT);
  if (workerAlive(state)) return describeSetup(state, {alive: true});
  await writeSetupState(ROOT, {...state, status: 'running', pid: null, startedAt: new Date().toISOString(), step: null, error: null, next});
  const log = openSync(path.join(ROOT, ...LOG_FILE.split('/')), 'a');
  try {
    const child = spawn(process.execPath, [SELF, 'setup', '--worker', '--steps', stepIds.join(',')], {cwd: ROOT, detached: true, stdio: ['ignore', log, log], windowsHide: true});
    child.unref();
  } finally {
    closeSync(log);
  }
  return {line: 'بدأت التجهيز في الخلفية — أول مرة بياخد من ١٠ لـ ٢٠ دقيقة حسب النت.', json: {ok: true, status: 'running', steps: stepIds, log: LOG_FILE, next: 'node scripts/studio.mjs status'}};
}

async function runWorker(stepIds, options = {}) {
  const lock = await readLock(ROOT);
  const state = await readSetupState(ROOT);
  const steps = setupSteps(ROOT, lock).filter((step) => stepIds.includes(step.id));
  const log = (message) => console.log(`[setup ${new Date().toISOString()}] ${message}`);
  const final = await runSetup({
    steps,
    state: {...state, ...('next' in options ? {next: options.next} : {}), status: 'running', pid: process.pid, startedAt: state.startedAt ?? new Date().toISOString()},
    save: (value) => writeSetupState(ROOT, value),
    log,
    requiredIds: STEP_IDS,
  });
  return describeSetup(final, {alive: false});
}

const commands = {
  async settings(rest) {
    const {runSettings} = await import('./settings.mjs');
    await runSettings(rest);
  },
  async setup(rest) {
    const {values} = parseArgs({args: rest, options: {worker: {type: 'boolean'}, foreground: {type: 'boolean'}, steps: {type: 'string'}}, strict: true});
    const stepIds = parseSteps(values.steps);
    if (values.worker) {
      const {line, json} = await runWorker(stepIds);
      return report(line, json);
    }
    if (values.foreground) {
      const state = await readSetupState(ROOT);
      if (workerAlive(state)) {
        const {line, json} = describeSetup(state, {alive: true});
        return report(line, json);
      }
      const {line, json} = await runWorker(stepIds, {next: null});
      return report(line, json);
    }
    const {line, json} = await startSetup(stepIds);
    return report(line, json);
  },
  async check() {
    const result = await checkForUpdate(ROOT, {gitExe: resolveGit(ROOT)});
    if (result.channel === 'store') return report(`إنت على نسخة المتجر ${result.current ?? '—'} ✓ — أي نسخة جديدة بتنزل كملف ZIP من حسابك في المتجر.`, result, 0);
    if (!result.ok) return report(CHECK_LINES[result.reason], result, 0);
    if (result.updateAvailable === null) return report('مش قادر أوصل لـ GitHub دلوقتي — هنكمل بالنسخة الحالية.', result, 0);
    if (result.updateAvailable) return report(`فيه نسخة جديدة من الاستوديو (${result.latest}) — قول «حدّث الاستوديو» عشان أنزّلها.`, result, 0);
    return report(`الاستوديو على آخر نسخة (${result.current}) ✓`, result, 0);
  },
  async update() {
    const gitExe = resolveGit(ROOT);
    const result = pullUpdate(ROOT, {gitExe});
    if (result.channel === 'store') return report('التحديث في نسخة المتجر = ملف ZIP جديد: نزّله من صفحة «التنزيلات» في حسابك، وفكّه في فولدر جديد جنب القديم، وافتحه في المساعد وقول «انقل بروفايلي». مشاريعك القديمة بتفضل في فولدرها.', {...result, next: null});
    if (!result.ok) return report(UPDATE_LINES[result.reason] ?? 'التحديث ما نجحش.', result);
    if (!result.updated) return report('انت على آخر نسخة ✓', {...result, next: null});
    if (result.changed.packages || result.changed.tools) {

      const started = await startSetup([...STEP_IDS], 'node scripts/studio.mjs doctor --quick');
      return report('نزّلت التحديث ✓ وبجهّز الأدوات الجديدة في الخلفية. بعد ما يخلص افتح جلسة جديدة عشان التعليمات الجديدة تتقري.', {...result, setup: started.json, next: 'node scripts/studio.mjs status'});
    }
    const quick = await quickChecks(ROOT, {lock: await readLock(ROOT), gitExe, readProfile});
    const summary = {ok: quick.ok, failed: quick.failed, warnings: quick.warnings};
    if (!quick.ok) return report(`نزّلت التحديث ✓ بس الفحص السريع لقى مشكلة في: ${describeFailures(quick)}.`, {...result, quick: summary, next: 'node scripts/studio.mjs setup'});
    return report('نزّلت التحديث ✓ والفحص السريع تمام — افتح جلسة جديدة عشان التعليمات الجديدة تتقري.', {...result, quick: summary, next: null});
  },
  async status() {
    const state = await readSetupState(ROOT);
    const {line, json} = describeSetup(state, {alive: workerAlive(state)});
    return report(line, json);
  },
  async doctor(rest) {
    const {values} = parseArgs({args: rest, options: {quick: {type: 'boolean'}}, strict: true});
    const quick = await quickChecks(ROOT, {lock: await readLock(ROOT), gitExe: resolveGit(ROOT), readProfile});
    const summary = {failed: quick.failed, warnings: quick.warnings, checks: quick.checks};
    const problem = quick.checks.location.ok ? `الفحص لقى مشكلة في: ${describeFailures(quick)}.` : quick.checks.location.error;
    if (!quick.ok) return report(problem, {ok: false, ...summary, next: quick.failed.includes('setup') && quick.checks.location.ok ? 'node scripts/studio.mjs setup' : null}, 2);
    if (values.quick) return report('الفحص السريع تمام ✓', {ok: true, ...summary});
    const profile = await readProfile(ROOT);
    const dir = path.join(ROOT, ...DOCTOR_DIR.split('/'));
    await fs.mkdir(dir, {recursive: true});
    await fs.writeFile(path.join(dir, 'props.json'), `${JSON.stringify(doctorProps(profile), null, 2)}\n`, 'utf8');
    const rendered = await renderDoctor(ROOT);
    await fs.writeFile(path.join(dir, 'render.log'), `${rendered.stderr}\n${rendered.stdout}`, 'utf8');
    const result = rendered.report;
    const passed = rendered.code === 0 && result?.ok === true && result.igCheck?.ok === true && result.safe?.ok === true;
    if (!passed) return report(`فيديو التجربة ما عداش فحوصات التسليم — التفاصيل في ${DOCTOR_DIR}/render.log.`, {ok: false, code: rendered.code, log: `${DOCTOR_DIR}/render.log`, igCheck: result?.igCheck ?? null}, 3);
    return report(`فحص النظام تمام ✓ — افتح ${DOCTOR_DIR}/doctor.mp4 وشوف فيديو التجربة باسمك وألوانك.`, {ok: true, video: `${DOCTOR_DIR}/doctor.mp4`, igCheck: result.igCheck.summary, safe: result.safe, warnings: quick.warnings});
  },
};

try {
  const [command, ...rest] = process.argv.slice(2);
  if (!Object.hasOwn(commands, command ?? '')) throw new Error(USAGE);
  await commands[command](rest);
} catch (error) {
  report(`حصلت مشكلة: ${error.message}`, {ok: false, error: error.message});
}
