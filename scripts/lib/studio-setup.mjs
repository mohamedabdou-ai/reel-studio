import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promises as fs, statSync} from 'node:fs';
import path from 'node:path';
import {resolveNpmCommand} from './npm-command.mjs';
import {downloadVerified, sha256File} from './studio-download.mjs';
import {checkEngineDependencies, dependencyProblem, moduleDirectoryProblem} from './engine-dependencies.mjs';
import {classifySetupError} from './setup-failure.mjs';
import {assertFreeSpace} from './setup-space.mjs';

export const PACKAGES_TIMEOUT_MS = 60 * 60 * 1000;
export const BROWSER_RETRY_DELAYS_MS = Object.freeze([5000, 20000, 60000]);
export const NPM_RETRY_ARGS = Object.freeze(['--fetch-retries=5', '--fetch-retry-mintimeout=10000', '--fetch-retry-maxtimeout=120000']);
const NPM_RERUN_REASONS = Object.freeze(['network', 'file-locked', 'timeout']);
// Step sizes are rounded up, and each file also takes one cluster (see setup-space.mjs).
export const STEP_NEEDS = Object.freeze({
  packages: {bytes: 900_000_000, files: 28_000},
  browser: {bytes: 750_000_000, files: 600},
  ffmpeg: {bytes: 700_000_000, files: 4},
  transcription: {bytes: 1_600_000_000, files: 30},
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const tagged = (message, reason) => Object.assign(new Error(message), {reason});



export const BROWSER_HOMES = Object.freeze({engine: 'engine/node_modules/.remotion', root: '.remotion'});
export const STEP_TIMEOUT_MS = 30 * 60 * 1000;
const FOLDERS = Object.freeze(['Raw', 'Projects', 'Outputs', 'Tools/bin', 'Tools/models', 'state/cache/npm', 'state/tmp', 'state/downloads', 'engine/public/projects']);

const ENSURE_BROWSER = "require('node:module').createRequire(require('node:path').join(process.cwd(), 'package.json'))('@remotion/renderer').ensureBrowser({logLevel: 'warn'}).catch((error) => { console.error(error); process.exit(1); });";
const exists = async (file) => !!(await fs.stat(file).catch(() => null));
const hashOf = (value) => createHash('sha256').update(value).digest('hex');


export function remotionBrowserHome(cwd) {
  const start = path.resolve(cwd);
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (statSync(path.join(dir, 'package.json'), {throwIfNoEntry: false})?.isFile()) return path.join(dir, 'node_modules', '.remotion');
    if (path.dirname(dir) === dir) return path.join(start, '.remotion');
  }
}


export function browserHomeProblem(root) {
  const home = remotionBrowserHome(root);
  if (home.toLowerCase() === path.join(path.resolve(root), BROWSER_HOMES.root).toLowerCase()) return null;
  const owner = path.dirname(path.dirname(home));
  return `فيه package.json في ${owner} فوق فولدر الاستوديو، فالرندر هيدوّر على المتصفح برّه الفولدر. انقل فولدر الاستوديو لمكان مفيهوش package.json فوقه (مثلًا D:\\ReelStudio) وبعدين شغّل setup تاني.`;
}

export function runProcess(command, args, {cwd, timeoutMs = STEP_TIMEOUT_MS, spawnImpl = spawn}) {
  return new Promise((resolve, reject) => {
    const name = path.basename(args[0] === '-e' ? command : args[0] ?? command);
    const child = spawnImpl(command, args, {cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false, env: process.env});
    // Output still reaches the setup log through this process's own streams; the last 4 KB also explain a failure.
    let tail = '';
    const keep = (chunk, stream) => { stream.write(chunk); tail = (tail + chunk.toString('utf8')).slice(-4096); };
    child.stdout.on('data', chunk => keep(chunk, process.stdout));
    child.stderr.on('data', chunk => keep(chunk, process.stderr));
    const fail = error => reject(Object.assign(error, {outputTail: tail}));
    const timer = setTimeout(() => {
      child.kill();
      fail(Object.assign(new Error(`${name} did not finish within ${Math.round(timeoutMs / 1000)} s and was stopped`), {reason: 'timeout'}));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else fail(new Error(`${name} exited with code ${code}`));
    });
  });
}


export async function linkTree(source, target) {
  await fs.mkdir(target, {recursive: true});
  for (const entry of await fs.readdir(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await linkTree(from, to);
    } else if (entry.isFile()) {
      await fs.rm(to, {force: true});
      await fs.link(from, to).catch(() => fs.copyFile(from, to));
    }
  }
}

export function setupSteps(root, lock, {run = runProcess, sleep = wait, statfs, installFfmpeg = async (...args) => (await import('./ffmpeg-install.mjs')).installPinnedFfmpeg(...args)} = {}) {
  const at = (relative) => path.join(root, ...relative.split('/'));
  const space = (id) => assertFreeSpace(root, STEP_NEEDS[id], statfs ? {statfs} : {});
  const engine = at('engine');
  const browserOk = async (home) => (await sha256File(at(`${BROWSER_HOMES[home]}/${lock.browser.exe}`))) === lock.browser.exeSha256;
  const browserDir = (home) => at(`${BROWSER_HOMES[home]}/chrome-headless-shell`);
  const writeOnce = (file, text) => fs.writeFile(file, text, {encoding: 'utf8', flag: 'wx'}).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  const assertPackagesLocal = async () => {
    const problem = await moduleDirectoryProblem(root);
    if (problem) throw tagged(problem.error, 'path');
  };
  return [
    {
      id: 'folders',
      key: async () => 'folders-v1',
      verify: async () => {
        for (const dir of FOLDERS) if (!(await exists(at(dir)))) return false;
        return (await exists(at('engine/plates.json'))) && (await exists(at('engine/proxies.json')));
      },
      run: async () => {
        for (const dir of FOLDERS) await fs.mkdir(at(dir), {recursive: true});
        await writeOnce(at('engine/plates.json'), '{"schema":1,"recordedOn":null,"plates":{}}\n');
        await writeOnce(at('engine/proxies.json'), '{}\n');
      },
    },
    {
      id: 'packages',
      key: async () => { await assertPackagesLocal(); return hashOf(await fs.readFile(at('engine/package-lock.json'))); },
      verify: async () => (await exists(at('engine/node_modules/.package-lock.json'))) && (await checkEngineDependencies(root)).ok,
      run: async (log) => {
        await assertPackagesLocal();
        await space('packages');
        const install = (extra = []) => {
          const npm = resolveNpmCommand(['ci', '--ignore-scripts', '--no-audit', '--no-fund', ...NPM_RETRY_ARGS, ...extra]);
          return run(npm.command, npm.args, {cwd: engine, timeoutMs: PACKAGES_TIMEOUT_MS});
        };
        log('npm ci --ignore-scripts (engine/)');
        try {
          await install();
        } catch (error) {
          if (!NPM_RERUN_REASONS.includes(classifySetupError(error))) throw error;
          log(`npm ci failed (${error.message}); running it once more from the local package cache`);
          await install(['--prefer-offline']);
        }
        const checked = await checkEngineDependencies(root);
        if (!checked.ok) throw new Error(dependencyProblem(checked));
      },
    },
    {
      id: 'browser',
      key: async () => `${lock.browser.version}:${lock.browser.exeSha256}`,
      verify: async () => browserHomeProblem(root) === null && (await browserOk('engine')) && (await browserOk('root')),
      run: async (log) => {
        const problem = browserHomeProblem(root);
        if (problem) throw Object.assign(new Error(problem), {reason: 'path', hint: problem});
        if (!(await browserOk('engine')) && (await browserOk('root'))) {
          log('browser: reusing the verified copy in .remotion/');
          await linkTree(browserDir('root'), browserDir('engine'));
        }
        if (!(await browserOk('engine'))) {
          await space('browser');
          for (let failures = 0; ; failures += 1) {
            log('browser: Remotion ensureBrowser in engine/');
            try {
              await run(process.execPath, ['-e', ENSURE_BROWSER], {cwd: engine});
              break;
            } catch (error) {
              if (failures >= BROWSER_RETRY_DELAYS_MS.length) throw error;
              const delay = BROWSER_RETRY_DELAYS_MS[failures];
              log(`browser: download failed (${error.message}); retry ${failures + 1} of ${BROWSER_RETRY_DELAYS_MS.length} in ${delay / 1000} s`);
              await sleep(delay);
            }
          }
        }
        if (!(await browserOk('engine'))) {
          await fs.rm(browserDir('engine'), {recursive: true, force: true});
          throw tagged(`The render browser does not match its pinned SHA-256 (${lock.browser.version}); it was removed.`, 'hash');
        }
        if (!(await browserOk('root'))) await linkTree(browserDir('engine'), browserDir('root'));
      },
    },
    {
      id: 'ffmpeg',
      key: async () => lock.ffmpeg.sha256,
      verify: async () => {
        const report = await fs.readFile(at('Tools/bin/ffmpeg-install.json'), 'utf8').then(JSON.parse).catch(() => null);
        return report?.ok === true && report.archiveSha256 === lock.ffmpeg.sha256
          && (await exists(at('Tools/bin/ffmpeg.exe'))) && (await exists(at('Tools/bin/ffprobe.exe')));
      },
      run: async (log) => {
        await space('ffmpeg');
        await installFfmpeg(lock.ffmpeg, {root, log});
      },
    },
    {
      id: 'fonts',
      key: async () => hashOf(JSON.stringify(lock.fonts)),
      verify: async () => {
        if (!(await exists(at('engine/public/fonts/manifest.json')))) return false;
        for (const font of lock.fonts) if ((await sha256File(at(`engine/public/fonts/${font.file}`))) !== font.sha256) return false;
        return true;
      },
      run: async (log) => {
        for (const font of lock.fonts) await downloadVerified({url: font.url, sha256: font.sha256, bytes: font.bytes, target: at(`engine/public/fonts/${font.file}`), log});
        const manifest = lock.fonts.map(({url, ...entry}) => ({...entry, sourceUrl: url})).sort((a, b) => a.file.localeCompare(b.file, 'en'));
        await fs.writeFile(at('engine/public/fonts/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        log(`fonts: ${lock.fonts.length} files verified`);
      },
    },
    {
      id: 'models',
      key: async () => hashOf(JSON.stringify(lock.models)),
      verify: async () => {
        for (const model of lock.models) if ((await sha256File(at(model.path))) !== model.sha256) return false;
        return true;
      },
      run: async (log) => {
        for (const model of lock.models) await downloadVerified({url: model.url, sha256: model.sha256, bytes: model.bytes, target: at(model.path), log});
      },
    },
    {
      // Loaded on first use, so status and the settings screen stay light and setup still starts before npm ci.
      id: 'transcription',
      key: async () => hashOf(JSON.stringify(lock.transcription)),
      verify: async () => (await import('./transcription-install.mjs')).verifyPinnedWhisper(lock.transcription, {root}),
      run: async (log) => { await space('transcription'); await (await import('./transcription-install.mjs')).installPinnedWhisper(lock.transcription, {root, log}); },
    },
  ];
}

export async function runSetup({steps, state, save, log = () => {}, requiredIds = steps.map((step) => step.id)}) {
  const now = () => new Date().toISOString();
  state.steps ??= {};
  Object.assign(state, {status: 'running', error: null, reason: null, hint: null});
  await save(state);
  for (const step of steps) {
    state.step = step.id;
    await save(state);
    let key = null;
    try {
      key = await step.key();
      const prior = state.steps[step.id];
      if (prior?.ok && prior.key === key && (await step.verify())) {
        log(`${step.id}: already done`);
        continue;
      }
      log(`${step.id}: start`);
      await step.run(log);
      if (!(await step.verify())) throw new Error(`${step.id} finished but its result could not be verified`);
    } catch (error) {
      const reason = classifySetupError(error);
      const message = String(error?.message ?? error).split(/\r?\n/)[0].slice(0, 300);
      const hint = typeof error?.hint === 'string' && error.hint ? error.hint : null;
      state.steps[step.id] = {ok: false, key, at: now(), error: message, reason};
      Object.assign(state, {status: 'failed', error: message, reason, hint});
      await save(state);
      log(`${step.id}: failed (${reason}): ${error?.message ?? error}`);
      return state;
    }
    state.steps[step.id] = {ok: true, key, at: now()};
    await save(state);
    log(`${step.id}: done`);
  }
  const complete = requiredIds.every((id) => state.steps[id]?.ok === true);
  Object.assign(state, {status: complete ? 'done' : 'incomplete', step: null, finishedAt: now()});
  await save(state);
  return state;
}
