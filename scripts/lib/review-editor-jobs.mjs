import './project-tmp.mjs';
import path from 'node:path';
import os from 'node:os';
import { promises as fs, constants as fsc, existsSync, lstatSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawn, execFile, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { ROOT, checkedPath, ensureOutput, readJson, slug } from './job-paths.mjs';
import { renderBudget, freeBytes as diskFree } from './disk-report.mjs';
import { ffprobeJson, summarizeProbe } from './media.mjs';
import { editManifestSchema } from '../../engine/src/prepared-edit/schema.ts';
import { validateManifest } from '../../engine/src/review-editor/validate.ts';
import { tryCompile } from '../../engine/src/review-editor/time.ts';
import { EDIT_HISTORY_KEEP } from '../../engine/src/review-editor/types.ts';
import { manifestRevision } from './review-editor-revision.mjs';

const GB = 1024 ** 3;

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}



export const DELIVERY_CRF = 10;
const MIN_PREPARE_BYTES = 2 * GB;
const PROJECT_DIR = (id) => `Projects/${id}`;

const exists = (abs) => fs.stat(abs).then(() => true, () => false);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gb = (n) => (n / GB).toFixed(1);






// eslint-disable-next-line no-control-regex
const HISTORY_NAME = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:~([^\\/:*?"<>|\x00-\x1f]{1,60}))?\.json$/;
const stampOf = (date) => date.toISOString().replace(/[:.]/g, '-');
const savedAtOf = (m) => `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;

const cleanLabel = (label) => (typeof label !== 'string' ? '' : Array.from(
  label.normalize('NFC').replace(/[^\p{L}\p{N}\p{M} _.-]+/gu, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, ''),
).slice(0, 40).join('').trim());


export function historyDir(manifestRel) {
  const dir = path.posix.dirname(manifestRel);
  const base = path.posix.basename(manifestRel, path.posix.extname(manifestRel));
  return base === 'edit' ? `${dir}/edit-history` : `${dir}/edit-history/${base}`;
}

function projectOf(manifestRel) {
  const folder = manifestRel.split('/')[1];
  try { return slug(folder, 'project'); } catch {
    throw new HttpError(400, `اسم فولدر المشروع (${folder}) لازم يكون slug: حروف صغيرة وأرقام و - بس. الـ pipeline نفسه بيرفض غيره.`);
  }
}



function alignKeys(next, prev) {
  if (Array.isArray(next)) {
    const before = Array.isArray(prev) ? prev : [];
    const byId = new Map(before.filter((p) => p && typeof p === 'object' && typeof p.id === 'string').map((p) => [p.id, p]));
    return next.map((v, i) => alignKeys(v, v && typeof v === 'object' && typeof v.id === 'string' && byId.has(v.id) ? byId.get(v.id) : before[i]));
  }
  if (next && typeof next === 'object') {
    const before = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
    const out = {};
    const put = (key, value) => { if (key !== '__proto__') out[key] = value; };
    for (const key of Object.keys(before)) if (Object.hasOwn(next, key)) put(key, alignKeys(next[key], before[key]));
    for (const key of Object.keys(next)) if (!Object.hasOwn(out, key)) put(key, alignKeys(next[key], undefined));
    return out;
  }
  return next;
}



async function renameRetry(from, to, beforeAttempt = async () => {}) {
  for (let attempt = 0; ; attempt++) {
    try { await beforeAttempt(); return await fs.rename(from, to); } catch (error) {
      if (attempt >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      await sleep(40 * (attempt + 1));
    }
  }
}


async function writeAtomic(rel, text, project, beforeReplace = async () => {}) {
  const abs = await ensureOutput(rel, { project });
  const tmpAbs = await checkedPath(`${rel}.${randomUUID()}.tmp`, { write: true, project });
  const handle = await fs.open(tmpAbs, 'wx');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await renameRetry(tmpAbs, abs, beforeReplace); } catch (error) {
    await fs.unlink(tmpAbs).catch(() => {});
    throw error;
  }
}

const listHistoryNames = async (rel) => (await fs.readdir(path.join(ROOT, ...rel.split('/')), { withFileTypes: true }).catch(() => []))
  .filter((e) => e.isFile() && HISTORY_NAME.test(e.name)).map((e) => e.name).sort().reverse();





export function createManifestStore({ manifestPath, isBusy = () => false, now = () => new Date() }) {
  let chain = Promise.resolve();
  const serialised = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };
  const dirRel = historyDir(manifestPath);

  async function save(body) {
    const input = body?.manifest;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'مفيش manifest في الطلب.');
    if (Object.hasOwn(body, 'baseRevision') && !/^[a-f0-9]{64}$/.test(body.baseRevision ?? '')) {
      throw new HttpError(400, 'بيانات الحفظ ناقصة. افتح المحرر من جديد قبل الحفظ.');
    }
    const check = validateManifest(input);
    if (!check.ok) throw new HttpError(422, 'الـ manifest فيه أخطاء فمش هيتحفظ. صلّحها الأول.', { issues: check.issues });
    const project = projectOf(manifestPath);
    return serialised(async () => {
      if (isBusy()) throw new HttpError(409, 'فيه تصدير شغّال دلوقتي، والملف لازم يفضل زي ما هو لحد ما يخلص. التعديلات لسه عندك في الصفحة؛ احفظ بعد ما يخلص أو ألغيه.');
      const abs = await checkedPath(manifestPath, { mustExist: true }).catch(() => {
        throw new HttpError(409, `الملف ${manifestPath} اتمسح أو اتنقل من على الديسك. مش هحفظ مكانه من غير ما تعرف.`);
      });
      const prevText = await fs.readFile(abs, 'utf8');
      const stale = () => new HttpError(409, 'المساعد أو صفحة تانية غيّروا المونتاج. تعديلاتك لسه عندك؛ راجع التحديث الجديد قبل الحفظ.', {code: 'PROJECT_CHANGED'});
      if (body.baseRevision !== undefined && body.baseRevision !== manifestRevision(prevText)) throw stale();
      let prev = null;
      try { prev = JSON.parse(prevText); } catch {                                                               }
      if (typeof prev?.id === 'string' && prev.id !== input.id) {
        throw new HttpError(409, `الـ id مايتغيرش من هنا (على الديسك "${prev.id}"): المخرجات والـ prepared مربوطين بيه.`);
      }
      const eol = prevText.includes('\r\n') ? '\r\n' : '\n';
      const text = JSON.stringify(alignKeys(input, prev), null, 2).replace(/\n/g, eol) + eol;
      const savedAt = now();
      if (text === prevText) return { ok: true, path: manifestPath, backup: null, savedAt: savedAt.toISOString(), manifestRevision: manifestRevision(text) };


      const label = cleanLabel(body.label);
      let backupRel = null;
      for (let bump = 0; bump < 50 && !backupRel; bump++) {
        const name = `${stampOf(new Date(savedAt.getTime() + bump))}${label ? `~${label}` : ''}.json`;
        const candidate = `${dirRel}/${name}`;
        const target = await ensureOutput(candidate, { project });
        try { await fs.copyFile(abs, target, fsc.COPYFILE_EXCL); backupRel = candidate; } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
      if (!backupRel) throw new HttpError(500, 'مقدرتش أعمل نسخة احتياطية قبل الحفظ، فماحفظتش حاجة.');

      try { await writeAtomic(manifestPath, text, project, async () => {
        if (await fs.readFile(abs, 'utf8') !== prevText) throw stale();
      }); } catch (error) {
        await fs.unlink(path.join(ROOT, ...backupRel.split('/'))).catch(() => {});
        throw error;
      }
      const back = await fs.readFile(abs, 'utf8');
      if (back !== text || !editManifestSchema.safeParse(JSON.parse(back)).success) throw new HttpError(500, 'الملف اتكتب بس القراءة الراجعة مش مطابقة. راجع الملف قبل ما تكمل.');

      for (const stale of (await listHistoryNames(dirRel)).slice(EDIT_HISTORY_KEEP)) await fs.unlink(path.join(ROOT, ...dirRel.split('/'), stale)).catch(() => {});
      return { ok: true, path: manifestPath, backup: backupRel, savedAt: savedAt.toISOString(), manifestRevision: manifestRevision(text) };
    });
  }

  async function history() {
    return (await listHistoryNames(dirRel)).slice(0, EDIT_HISTORY_KEEP).map((file) => {
      const m = HISTORY_NAME.exec(file);
      return { file, savedAt: savedAtOf(m), ...(m[6] ? { label: m[6] } : {}) };
    });
  }


  async function restore(body) {
    const file = body?.file;
    if (typeof file !== 'string' || !HISTORY_NAME.test(file)) throw new HttpError(400, 'اسم النسخة مش صحيح.');
    const rel = `${dirRel}/${file}`;
    const abs = await checkedPath(rel, { mustExist: true }).catch((error) => {
      throw new HttpError(/missing/i.test(error.message) ? 404 : 400, /missing/i.test(error.message) ? 'النسخة دي مش موجودة (اتمسحت من القايمة؟).' : error.message);
    });
    let manifest;
    try { manifest = JSON.parse(await fs.readFile(abs, 'utf8')); } catch { throw new HttpError(422, 'النسخة دي مش JSON سليم.'); }
    const check = validateManifest(manifest);
    if (!check.ok) throw new HttpError(422, 'النسخة دي مش متوافقة مع شكل الـ manifest الحالي، فمينفعش تتفتح.', { issues: check.issues });
    return { manifest };
  }

  return { save, history, restore };
}




export const JOB_STAGES = Object.freeze({
  starting: 'بيبدأ',
  plate: 'بجهّز الفوتيج (plate)',
  proxy: 'بجهّز نسخة المعاينة (proxy)',
  bundle: 'بحضّر الـ composition',
  checks: 'فحص الـ safe zone وموضع الراس',
  render: 'بيرندر',
  finalize: 'بيجمّع الملف ويفحص الـ encode',
  done: 'خلص',
});



const STAGE_RULES = [
  [/Preparing a continuous footage plate/i, 'plate'],
  [/Preparing and verifying the preview proxy/i, 'proxy'],
  [/\[render [\d.]+s\]\s*(?:bundle|serv)/i, 'bundle'],
  [/\bcomposition \S+: \d+x\d+/i, 'bundle'],
  [/\bbudget:/i, 'checks'],
  [/\bhead gate:/i, 'checks'],
  [/\bmode (?:preview|review|deliver):/i, 'render'],
];
const RENDER_PCT = /(?:^|\s)(\d{1,3})%\s+rendered\b/;

const STAGE_PCT = { starting: 1, plate: 5, proxy: 12, bundle: 15, checks: 20, render: 22, finalize: 95, done: 100 };
const PREPARE_PCT = { starting: 2, plate: 15, proxy: 60, bundle: 60, checks: 60, render: 60, finalize: 90, done: 100 };


export function createProgressTracker(kind) {
  const table = kind === 'prepare' ? PREPARE_PCT : STAGE_PCT;
  let stage = 'starting';
  let pct = 0;
  const move = (nextStage, nextPct) => {
    const changed = nextStage !== stage || nextPct > pct;
    stage = nextStage;
    pct = Math.max(pct, nextPct);
    return changed ? { type: 'progress', pct: Math.round(pct), stage: JOB_STAGES[stage], at: Date.now() } : null;
  };
  return {
    initial: () => ({ type: 'progress', pct: 0, stage: JOB_STAGES.starting, at: Date.now() }),
    feed(line) {
      const hit = RENDER_PCT.exec(line);
      if (hit && kind !== 'prepare') {
        const renderPct = Math.min(100, Number(hit[1]));
        return renderPct >= 100 ? move('finalize', STAGE_PCT.finalize) : move('render', 22 + 0.7 * renderPct);
      }
      for (const [rx, next] of STAGE_RULES) if (rx.test(line)) return move(next, table[next]);
      return null;
    },
  };
}


const NOISE = /MODULE_TYPELESS_PACKAGE_JSON|Reparsing as ES module|--trace-warnings|To eliminate this warning/;



function killTree(pid) {
  return new Promise((resolve) => {
    if (!Number.isInteger(pid)) return resolve();
    if (process.platform === 'win32') {

      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
    } else {
      try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {                    } }
      resolve();
    }
  });
}

const SWEEP_SLACK_MS = 2000;
const isStagingDir = (name) => /^\..+-pending-[A-Za-z0-9]+$/.test(name);
const isProxyTemp = (name) => /\.json\.\d+\.tmp$/.test(name);
const madeSince = (abs, since) => { try { return statSync(abs).mtimeMs >= since - SWEEP_SLACK_MS; } catch { return false; } };
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const removeTree = (abs) => { try { rmSync(abs, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); return true; } catch { return false; } };
















function sweepAfterKill(job) {
  const removed = [];
  const stuck = [];
  const drop = (abs, label) => (removeTree(abs) ? removed : stuck).push(label);

  const lockAbs = path.join(ROOT, ...PROJECT_DIR(job.project).split('/'), 'prepare.lock');
  let owner = null;
  try { owner = JSON.parse(readFileSync(lockAbs, 'utf8')); } catch {                                                         }
  if (owner?.pid === job.pid && Date.parse(owner.createdAt) >= job.startedAt - SWEEP_SLACK_MS) {
    const plates = path.join(ROOT, 'engine', 'public', '_prepared', job.project);
    let entries = [];
    try { if (lstatSync(plates).isDirectory()) entries = readdirSync(plates, { withFileTypes: true }); } catch {                           }
    for (const entry of entries) {
      const abs = path.join(plates, entry.name);
      const ours = (entry.isFile() && (entry.name.endsWith('.render.lock') || isProxyTemp(entry.name))) || (entry.isDirectory() && isStagingDir(entry.name));
      if (ours && madeSince(abs, job.startedAt)) drop(abs, `_prepared/${entry.name}`);
    }
    drop(lockAbs, 'prepare.lock');
  }

  if (job.output) {
    const outAbs = path.join(ROOT, ...job.output.split('/'));
    const outLock = `${outAbs}.render.lock`;
    if (existsSync(outLock)) {
      const parsed = path.parse(outAbs);
      let siblings = [];
      try { siblings = readdirSync(parsed.dir, { withFileTypes: true }); } catch {                        }
      for (const entry of siblings) if (entry.isDirectory() && entry.name.startsWith(`.${parsed.name}-pending-`)) drop(path.join(parsed.dir, entry.name), entry.name);
      drop(outLock, `${parsed.base}.render.lock`);
    }
  }
  return { removed, stuck };
}


const sweepOnce = (job) => (job.swept ??= sweepAfterKill(job));
const childGone = (job) => !job.child || job.child.exitCode !== null || job.child.signalCode !== null;
const processAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const sweepNote = ({ removed, stuck }) => [
  removed.length ? `اتمسح: ${removed.join(', ')}.` : '',
  stuck.length ? `ماقدرتش أمسح: ${stuck.join(', ')} (لسه مفتوحة في process تاني؟). لو الـ Prepare أو الـ Export الجاي وقف على lock، امسح الملف ده بإيدك.` : '',
].filter(Boolean).join(' ');


function parseFinalJson(stdout) {
  const text = stdout.trim();
  try { return JSON.parse(text); } catch {                    }
  const starts = [...text.matchAll(/^\{/gm)].map((m) => m.index);
  for (const start of starts) { try { return JSON.parse(text.slice(start)); } catch {                        } }
  return null;
}


function failureMessage(stderrLines, code) {
  for (const line of [...stderrLines].reverse()) {
    if (!line.startsWith('{"ok":false')) continue;
    try { const parsed = JSON.parse(line); if (typeof parsed.error === 'string' && parsed.error) return parsed.error; } catch {                    }
  }
  const tail = stderrLines.filter((l) => !NOISE.test(l)).slice(-25).join('\n');
  return tail || `الـ pipeline وقف بكود ${code} من غير رسالة.`;
}
const capMessage = (text, max = 8000) => (text.length > max ? `…${text.slice(-max)}` : text);

const localStamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

async function defaultProbeDuration(file) {
  try { return summarizeProbe(file, await ffprobeJson(file)).durationSec ?? null; } catch { return null; }
}








export function createJobManager({
  manifestPath, pipelineScript = path.join(ROOT, 'scripts', 'editor.mjs'), freeBytes = diskFree, freeMem = os.freemem,
  probeDuration = defaultProbeDuration, now = () => new Date(), log = () => {}, kill = killTree, cancelGraceMs = 10000,
}) {
  const jobs = new Map();
  const dir = path.posix.dirname(manifestPath);
  let active = null;
  let starting = false;
  let disposed = false;
  let heartbeat = null;
  const FINISHED_KEPT = 10;

  const busy = () => starting || active !== null;




  async function readDiskManifest() {
    let raw;
    try { raw = await readJson(manifestPath); } catch (error) { throw new HttpError(422, `مش قادر أقرأ ${manifestPath}: ${error.message}`); }
    const check = validateManifest(raw);
    if (!check.ok) throw new HttpError(422, 'الملف اللي على الديسك فيه أخطاء. احفظ نسخة سليمة الأول.', { issues: check.issues });
    return { manifest: editManifestSchema.parse(raw), check };
  }

  function budgetFor(mode, manifest) {
    const compiled = manifest ? tryCompile(manifest) : null;
    const frames = compiled?.ok ? compiled.compiled.durationInFrames : 3600;
    const freeDisk = freeBytes(ROOT);
    const freeRam = freeMem();
    if (mode === 'prepare') {
      const ok = freeDisk >= MIN_PREPARE_BYTES;
      return { freeDisk, freeRam, needed: MIN_PREPARE_BYTES, ok, message: ok
        ? `المساحة كفاية: فاضل ${gb(freeDisk)} GB على D:.`
        : `المساحة قليلة: فاضل ${gb(freeDisk)} GB على D: والتجهيز محتاج ${gb(MIN_PREPARE_BYTES)} GB على الأقل. نضّف المساحة (node scripts/disk-report.mjs --clean).` };
    }
    const deliver = mode === 'deliver';
    const b = renderBudget({ frames, freeRamBytes: freeRam, freeDiskBytes: freeDisk, png: deliver });
    const message = b.ok
      ? (b.spills
        ? `الرام الفاضي (${gb(freeRam)} GB) أقل من ${gb(b.needRamBytes)} GB، فالفريمات هتتكتب على القرص الأول (~${gb(b.spillBytes)} GB). فاضل ${gb(freeDisk)} GB على D: وده كفاية.`
        : `المساحة كفاية: فاضل ${gb(freeDisk)} GB على D:، والرام (${gb(freeRam)} GB) كفاية فالفريمات هتعدّي على طول للـ encoder.`)
      : `المساحة مش كفاية للتصدير: محتاج ~${gb(b.needDiskBytes)} GB على D: وفاضل ${gb(freeDisk)} GB${b.spills ? ` (الرام الفاضي ${gb(freeRam)} GB بس، فالفريمات هتتكتب على القرص الأول)` : ''}. نضّف المساحة (node scripts/disk-report.mjs --clean) أو اقفل أي render تاني وجرّب تاني.`;
    return { freeDisk, freeRam, needed: b.needDiskBytes, ok: b.ok, message, detail: b.message };
  }

  async function disk(modeArg) {
    const mode = ['deliver', 'preview', 'prepare'].includes(modeArg) ? modeArg : 'deliver';
    let manifest = null;
    try { manifest = editManifestSchema.parse(await readJson(manifestPath)); } catch {                                                     }
    const b = budgetFor(mode, manifest);
    return { freeDiskBytes: b.freeDisk, freeRamBytes: b.freeRam, neededDiskBytes: b.needed, ok: b.ok, message: b.message };
  }




  async function plan(kind, mode) {
    const { manifest, check } = await readDiskManifest();
    const project = PROJECT_DIR(manifest.id);
    if (!manifestPath.startsWith(`${project}/`)) {
      throw new HttpError(422, `الـ id (${manifest.id}) مش بيطابق فولدر المشروع. الـ pipeline بيرفضه: الـ manifest لازم يكون جوّه ${project}/.`);
    }
    if (kind === 'export' && mode === 'deliver' && !check.deliveryReady) {
      const delivery = check.issues.filter((i) => i.stage === 'delivery');
      throw new HttpError(422, `مش جاهز للتصدير النهائي (${delivery.length} حاجة ناقصة): ${delivery[0]?.message ?? ''}`, { issues: delivery });
    }
    const motionPlan = `${dir}/motion-plan.json`;
    if (kind === 'export' && mode === 'deliver' && !(await exists(path.join(ROOT, ...motionPlan.split('/'))))) {
      throw new HttpError(422, `التصدير النهائي محتاج ${motionPlan} جنب الـ manifest (قياس حركة الـ presenter). مش موجود.`);
    }
    const budget = budgetFor(kind === 'prepare' ? 'prepare' : mode, manifest);
    if (!budget.ok) {
      const report = { freeDiskBytes: budget.freeDisk, freeRamBytes: budget.freeRam, neededDiskBytes: budget.needed, ok: false, message: budget.message };
      throw new HttpError(507, budget.message, { disk: report, ...(budget.detail ? { detail: budget.detail } : {}) });
    }
    if (kind === 'prepare') return { kind: 'prepare', project: manifest.id, args: ['prepare', manifestPath] };

    const stamp = localStamp(now());
    const outputFor = (suffix) => `${project}/renders/${manifest.id}-${mode}-${stamp}${suffix}.mp4`;
    let output = outputFor('');
    for (let n = 2; await exists(path.join(ROOT, ...output.split('/'))); n++) output = outputFor(`-${n}`);
    await ensureOutput(output, { project: manifest.id });
    const deliver = mode === 'deliver' ? ['--deliver', '--motion-plan', motionPlan, '--png', '--crf', String(DELIVERY_CRF)] : [];
    return { kind: mode, project: manifest.id, output, args: ['render', manifestPath, '--out', output, ...deliver] };
  }



  const writeEvent = (res, seq, event) => { if (!res.writableEnded && !res.destroyed) res.write(`id: ${seq}\ndata: ${JSON.stringify(event)}\n\n`); };

  function emit(job, event) {
    const seq = ++job.seq;
    job.events.push({ seq, event });
    if (job.events.length > 2000) job.events.splice(0, job.events.length - 2000);
    for (const res of job.subs) writeEvent(res, seq, event);
  }

  function ensureHeartbeat() {
    if (heartbeat) return;
    heartbeat = setInterval(() => {
      for (const job of jobs.values()) for (const res of job.subs) if (!res.writableEnded) res.write(': ping\n\n');
    }, 15000);
    heartbeat.unref();
  }

  function finish(job, event) {
    if (job.terminal) return;
    job.terminal = true;
    job.state = event.type === 'result' ? 'done' : event.type === 'error' ? 'error' : 'cancelled';
    emit(job, event);
    for (const res of job.subs) res.end();
    job.subs.clear();
    if (active === job) active = null;
    for (const [id] of [...jobs].filter(([, j]) => j.terminal).slice(0, -FINISHED_KEPT)) jobs.delete(id);
    job.resolveClosed();
  }



  async function buildResult(job, parsed) {
    const seconds = +((Date.now() - job.startedAt) / 1000).toFixed(1);
    if (!parsed || parsed.ok !== true) throw new Error('الـ pipeline خلّص من غير نتيجة مفهومة (stdout مش JSON فيه ok:true).');
    if (job.kind === 'prepare') {
      return {
        ok: true, kind: 'prepare', seconds,
        ...(typeof parsed.plate === 'string' ? { plate: parsed.plate.replace(/^engine\/public\//, '') } : {}),
        ...(typeof parsed.plateCached === 'boolean' ? { plateCached: parsed.plateCached } : {}),
        warnings: (Array.isArray(parsed.captionIssues) ? parsed.captionIssues : []).map((i) => String(i?.message ?? i)),
      };
    }
    if (parsed.output !== job.output) throw new Error(`الـ pipeline كتب ملف غير المطلوب (${parsed.output} بدل ${job.output}).`);
    const outAbs = path.join(ROOT, ...job.output.split('/'));
    const stat = await fs.stat(outAbs).catch(() => null);
    if (!stat?.isFile() || !stat.size) throw new Error(`الـ pipeline قال خلص بس الملف مش موجود أو فاضي: ${job.output}`);
    const qcRel = `${job.output}.qc.json`;
    const warnings = [];
    let qc = null;
    try { qc = JSON.parse(await fs.readFile(path.join(ROOT, ...qcRel.split('/')), 'utf8')); } catch (error) { warnings.push(`ملف الـ QC (${qcRel}) ماتقراش: ${error.message}`); }
    const head = qc?.head ? { status: qc.head.status, ran: qc.head.ran, reason: qc.head.reason ?? null, counts: qc.head.counts ?? null } : null;
    const plates = qc?.plates ? { level: qc.plates.level, action: qc.plates.action, messages: Array.isArray(qc.plates.messages) ? qc.plates.messages : [] } : null;
    warnings.push(...(Array.isArray(qc?.warnings) ? qc.warnings.map(String) : []));
    for (const w of Array.isArray(qc?.igCheck?.warnings) ? qc.igCheck.warnings : []) warnings.push(`encode: ${typeof w === 'string' ? w : JSON.stringify(w)}`);
    return {
      ok: true, kind: job.kind, output: job.output, qc: qcRel, safeReport: parsed.safeReport ?? null,
      gates: { encode: qc?.igCheck?.ok ?? null, safe: qc?.safe?.ok ?? null, motion: qc?.motion ?? null, head, plates },
      seconds, sizeBytes: stat.size, durationSec: await probeDuration(outAbs), warnings,
      needsReview: head?.status === 'NEEDS-REVIEW',
    };
  }




  function finishCancelled(job, swept) {
    const line = swept
      ? `اتلغى. ${sweepNote(swept) || 'مفيش locks.'} ملفات مؤقتة ممكن تفضل في state/tmp (node scripts/clean-temp.mjs بينضّفها لما مفيش render شغال).`
      : `اتلغى، بس الـ process (pid ${job.pid}) لسه شغال بعد ${Math.round(cancelGraceMs / 1000)} ثواني. مسحتش الـ locks بتاعته عشان لسه بيستخدمها؛ هتتمسح لوحدها أول ما يقف.`;
    emit(job, { type: 'log', line, at: Date.now() });
    finish(job, { type: 'cancelled', at: Date.now() });
  }



  function launch(p) {
    const job = {
      id: randomBytes(6).toString('hex'), kind: p.kind, project: p.project, output: p.output ?? null, state: 'running', terminal: false,
      startedAt: Date.now(), seq: 0, events: [], subs: new Set(), child: null, pid: null, cancelRequested: false, swept: null,
      stdout: '', stderrLines: [], resolveClosed: () => {},
    };
    job.closed = new Promise((resolve) => { job.resolveClosed = resolve; });
    jobs.set(job.id, job);
    active = job;
    const tracker = createProgressTracker(p.kind === 'prepare' ? 'prepare' : 'export');
    emit(job, tracker.initial());
    emit(job, { type: 'log', line: `> node ${path.relative(ROOT, pipelineScript).replace(/\\/g, '/')} ${p.args.join(' ')}`, at: Date.now() });

    let child;
    try {
      child = spawn(process.execPath, [pipelineScript, ...p.args], {
        cwd: ROOT, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
      });
    } catch (error) {
      finish(job, { type: 'error', message: `مقدرتش أشغّل الـ pipeline: ${error.message}`, at: Date.now() });
      return job;
    }
    job.child = child;
    job.pid = child.pid ?? null;

    let pending = '';
    const line = (text) => {
      const clean = text.replace(/\r$/, '');
      if (!clean.trim() || NOISE.test(clean)) return;
      job.stderrLines.push(clean);
      if (job.stderrLines.length > 400) job.stderrLines.shift();
      emit(job, { type: 'log', line: clean, at: Date.now() });
      const moved = tracker.feed(clean);
      if (moved) emit(job, moved);
    };
    child.stdout.on('data', (chunk) => { if (job.stdout.length < 32 * 1024 * 1024) job.stdout += chunk; });
    child.stderr.on('data', (chunk) => {
      pending += chunk;
      for (let i = pending.indexOf('\n'); i >= 0; i = pending.indexOf('\n')) { line(pending.slice(0, i)); pending = pending.slice(i + 1); }
    });
    child.on('error', (error) => finish(job, { type: 'error', message: `الـ pipeline ماشتغلش: ${error.message}`, at: Date.now() }));




    child.on('exit', (code) => {
      if (code === 0) return;
      try { sweepOnce(job); } catch (error) { log(`job ${job.id} clean-up failed: ${error?.stack ?? error}`); }
    });
    child.on('close', async (code) => {
      if (job.terminal) return;
      try {
        if (pending.trim()) line(pending);
        pending = '';
        if (code === 0) {
          try {
            const result = await buildResult(job, parseFinalJson(job.stdout));
            emit(job, { type: 'progress', pct: 100, stage: JOB_STAGES.done, at: Date.now() });
            finish(job, { type: 'result', result, at: Date.now() });
          } catch (error) {
            finish(job, { type: 'error', message: capMessage(error.message), at: Date.now() });
          }
        } else if (job.cancelRequested) {
          finishCancelled(job, sweepOnce(job));
        } else {
          const note = sweepNote(sweepOnce(job));
          if (note) emit(job, { type: 'log', line: `الـ pipeline وقف فجأة قبل ما يقفل شغله (كراش أو الرام خلصت أو Ctrl-C). ${note}`, at: Date.now() });
          finish(job, { type: 'error', message: capMessage(failureMessage(job.stderrLines, code)), at: Date.now() });
        }
      } catch (error) {
        log(`job ${job.id} close handler failed: ${error?.stack ?? error}`);
        finish(job, { type: 'error', message: `خطأ داخلي وأنا بقفل الـ job: ${error?.message ?? error}`, at: Date.now() });
      }
    });
    return job;
  }




  async function start(kind, mode) {
    if (kind === 'export' && !['preview', 'deliver'].includes(mode)) throw new HttpError(400, 'mode لازم يكون preview أو deliver.');
    if (disposed) throw new HttpError(503, 'الـ editor بيقفل.');
    if (busy()) throw new HttpError(409, 'فيه job شغّال دلوقتي (تصدير أو تجهيز). استنى يخلص أو ألغيه الأول.', { activeJobId: active?.id ?? null });
    starting = true;
    try {
      const planned = await plan(kind, mode);
      if (disposed) throw new HttpError(503, 'الـ editor بيقفل.');
      return { jobId: launch(planned).id };
    } finally {
      starting = false;
    }
  }

  function stream(id, req, res) {
    const job = jobs.get(id);
    if (!job) throw new HttpError(404, 'مفيش job بالاسم ده.');
    const lastEventId = Number(req.headers['last-event-id']);
    const from = Number.isInteger(lastEventId) && lastEventId > 0 ? lastEventId : 0;
    const headers = { 'cache-control': 'no-store, no-transform', 'x-content-type-options': 'nosniff' };
    if (job.terminal && from >= job.seq) { res.writeHead(204, headers); res.end(); return; }
    res.writeHead(200, { ...headers, 'content-type': 'text/event-stream; charset=utf-8', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    for (const item of job.events) if (item.seq > from) writeEvent(res, item.seq, item.event);
    if (job.terminal) { res.end(); return; }
    job.subs.add(res);
    ensureHeartbeat();
    res.on('close', () => job.subs.delete(res));
  }

  async function cancel(id) {
    const job = jobs.get(id);
    if (!job) throw new HttpError(404, 'مفيش job بالاسم ده.');
    if (job.terminal || job.cancelRequested) return { ok: true };
    job.cancelRequested = true;
    emit(job, { type: 'log', line: 'بيتلغى...', at: Date.now() });
    if (!childGone(job)) await kill(job.pid);



    setTimeout(() => { if (!job.terminal) finishCancelled(job, childGone(job) ? sweepOnce(job) : null); }, cancelGraceMs).unref();
    return { ok: true };
  }


  async function dispose() {
    disposed = true;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    const job = active;
    if (!job || job.terminal) return;
    job.cancelRequested = true;
    if (!childGone(job)) await kill(job.pid);
    await Promise.race([job.closed, sleep(5000)]);
  }


  function killActiveSync() {
    const job = active;
    const pid = job?.pid;
    if (!Number.isInteger(pid) || childGone(job)) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    else { try { process.kill(-pid, 'SIGKILL'); } catch {            } }


    for (let waited = 0; waited < 1500 && processAlive(pid); waited += 50) sleepSync(50);
    if (!processAlive(pid)) try { sweepOnce(job); } catch {                                        }
  }

  return { start, stream, cancel, disk, dispose, busy, killActiveSync, activeJobId: () => active?.id ?? null };
}
