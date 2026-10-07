import {promises as fs} from 'node:fs';
import path from 'node:path';

export const STEP_LABELS = Object.freeze({
  folders: 'بجهّز فولدرات الشغل',
  packages: 'بنزّل مكتبات المونتاج (دي أطول خطوة)',
  browser: 'بنزّل متصفح الرندر',
  ffmpeg: 'بنزّل FFmpeg',
  fonts: 'بنزّل الخطوط',
  models: 'بنزّل موديلات كشف الوش',
});
export const STEP_IDS = Object.freeze(Object.keys(STEP_LABELS));
export const STATE_FILE = 'state/setup.json';
export const LOG_FILE = 'state/setup.log';
export const STARTING_GRACE_MS = 60_000;
export const DOCTOR_NEXT = 'node scripts/studio.mjs doctor';

const stateFile = (root) => path.join(root, ...STATE_FILE.split('/'));

export async function readSetupState(root) {
  const raw = await fs.readFile(stateFile(root), 'utf8').catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)));
  if (raw === null) return {schema: 1, status: 'new', steps: {}};
  return {schema: 1, steps: {}, ...JSON.parse(raw)};
}

export async function writeSetupState(root, state) {
  const file = stateFile(root);
  await fs.mkdir(path.dirname(file), {recursive: true});
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify({...state, updatedAt: new Date().toISOString()}, null, 2)}\n`, 'utf8');
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(temporary, file);
      return;
    } catch (error) {
      if (attempt >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export function workerAlive(state, now = Date.now()) {
  if (state.status !== 'running') return false;
  if (state.pid) return isAlive(state.pid);
  return now - Date.parse(state.startedAt ?? 0) < STARTING_GRACE_MS;
}

export function describeSetup(state, {alive}) {
  const total = STEP_IDS.length;
  const index = state.step ? STEP_IDS.indexOf(state.step) + 1 : 0;
  const label = state.step ? STEP_LABELS[state.step] ?? state.step : 'البداية';
  const done = Object.fromEntries(STEP_IDS.map((id) => [id, state.steps?.[id]?.ok === true]));
  const json = {ok: true, status: state.status, step: state.step ?? null, index, total, done, error: state.error ?? null, log: LOG_FILE, next: null};
  if (state.status === 'done') {

    const next = state.next ?? DOCTOR_NEXT;
    const line = next.endsWith('--quick') ? 'التجهيز خلص ✓ — الخطوة الجاية: الفحص السريع (doctor --quick).' : 'التجهيز خلص ✓ — الخطوة الجاية: فيديو التجربة (doctor).';
    return {line, json: {...json, next}};
  }
  if (state.status === 'failed') return {line: `التجهيز وقف عند «${label}»: ${state.error}. شغّل setup تاني وهيكمّل من مكانه.`, json: {...json, ok: false, next: 'node scripts/studio.mjs setup'}};
  if (state.status === 'incomplete') return {line: 'خلصت الخطوات اللي اتطلبت، بس لسه فيه خطوات ناقصة — شغّل setup من غير --steps.', json: {...json, next: 'node scripts/studio.mjs setup'}};
  if (state.status === 'running' && alive) {
    const line = index ? `جاري التجهيز (${index} من ${total}): ${label}…` : 'بدأت التجهيز في الخلفية…';
    return {line, json: {...json, next: 'node scripts/studio.mjs status'}};
  }
  if (state.status === 'running') return {line: 'التجهيز وقف فجأة من غير ما يخلص. شغّل setup تاني وهيكمّل من مكانه.', json: {...json, ok: false, status: 'stalled', next: 'node scripts/studio.mjs setup'}};
  return {line: 'لسه ما بدأناش التجهيز — شغّل node scripts/studio.mjs setup', json: {...json, next: 'node scripts/studio.mjs setup'}};
}
