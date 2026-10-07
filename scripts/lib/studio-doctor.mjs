import {spawn, spawnSync} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {isStoreEdition} from './studio-git.mjs';
import {browserHomeProblem} from './studio-setup.mjs';
import {readSetupState} from './studio-state.mjs';

export const CHECK_LABELS = Object.freeze({
  platform: 'نوع الجهاز (لازم ويندوز 64-bit)',
  node: 'Node',
  location: 'مكان فولدر الاستوديو (فيه package.json في فولدر فوقه)',
  setup: 'التجهيز',
  packages: 'مكتبات المونتاج',
  browser: 'متصفح الرندر',
  ffmpeg: 'FFmpeg',
  fonts: 'الخطوط',
  models: 'موديلات كشف الوش',
  profile: 'البروفايل (PROFILE.json)',
});
export const DOCTOR_DIR = 'Projects/_doctor';
const exists = async (file) => !!(await fs.stat(file).catch(() => null));
const toolRuns = (exe) => spawnSync(exe, ['-version'], {stdio: 'ignore', windowsHide: true}).status === 0;

export function doctorProps(profile) {
  return {
    name: profile.name,
    handle: profile.handle ?? null,
    followCard: profile.ending.followCard === true && !!profile.handle,
    cta: profile.ending.ctaDefault ?? null,
    signOff: profile.ending.signOff ?? null,
    brand: {primary: profile.brand.primary, accent: profile.brand.accent, background: profile.brand.background ?? null, text: profile.brand.text ?? null},
  };
}

export async function quickChecks(root, {lock, gitExe, readProfile, runsTool = toolRuns, locationProblem = browserHomeProblem}) {
  const at = (relative) => path.join(root, ...relative.split('/'));
  const [major, minor] = process.versions.node.split('.').map(Number);
  const state = await readSetupState(root);
  const misplaced = locationProblem(root);
  const store = isStoreEdition(root);
  const checks = {
    platform: {ok: process.platform === 'win32' && process.arch === 'x64', actual: `${process.platform} ${process.arch}`},
    node: {ok: major > 22 || (major === 22 && minor >= 20), actual: process.versions.node},
    location: {ok: misplaced === null, error: misplaced},
    setup: {ok: state.status === 'done', actual: state.status},
    packages: {ok: await exists(at('engine/node_modules/remotion/package.json'))},
    browser: {ok: (await exists(at(`engine/node_modules/.remotion/${lock.browser.exe}`))) && (await exists(at(`.remotion/${lock.browser.exe}`)))},
    ffmpeg: {ok: runsTool(at('Tools/bin/ffmpeg.exe')) && runsTool(at('Tools/bin/ffprobe.exe'))},
    fonts: {ok: false, missing: []},
    models: {ok: false, missing: []},
    profile: {ok: false, error: null},
    git: {ok: store || !!gitExe, warnOnly: true},
    clean: {ok: true, warnOnly: true, dirty: []},
  };
  for (const font of lock.fonts) if (!(await exists(at(`engine/public/fonts/${font.file}`)))) checks.fonts.missing.push(font.file);
  checks.fonts.ok = checks.fonts.missing.length === 0 && (await exists(at('engine/public/fonts/manifest.json')));
  for (const model of lock.models) if (!(await exists(at(model.path)))) checks.models.missing.push(model.path);
  checks.models.ok = checks.models.missing.length === 0;
  try {
    await readProfile(root);
    checks.profile.ok = true;
  } catch (error) {
    checks.profile.error = error.message;
  }
  if (gitExe && !store) {
    const status = spawnSync(gitExe, ['-C', root, 'status', '--porcelain', '--untracked-files=no'], {encoding: 'utf8', windowsHide: true});
    checks.clean.dirty = (status.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    checks.clean.ok = status.status === 0 && checks.clean.dirty.length === 0;
  }
  const failed = Object.entries(checks).filter(([, check]) => !check.ok && !check.warnOnly).map(([id]) => id);
  const warnings = Object.entries(checks).filter(([, check]) => !check.ok && check.warnOnly).map(([id]) => id);
  return {ok: failed.length === 0, failed, warnings, checks};
}

export const describeFailures = (quick) => quick.failed.map((id) => CHECK_LABELS[id] ?? id).join('، ');


export function parseRenderReport(stdout) {
  const text = String(stdout).replace(/\r\n/g, '\n').trim();
  const start = text.startsWith('{') ? 0 : text.lastIndexOf('\n{') + 1;
  if (start === 0 && !text.startsWith('{')) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

export function renderDoctor(root) {
  const args = [path.join(root, 'scripts', 'render.mjs'), 'Doctor', '--deliver', '--motion-exempt', 'static-graphics',
    '--props-file', `${DOCTOR_DIR}/props.json`, '--out', `${DOCTOR_DIR}/doctor.mp4`];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: root, windowsHide: true, env: process.env});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({code, stdout, stderr, report: parseRenderReport(stdout)}));
  });
}
