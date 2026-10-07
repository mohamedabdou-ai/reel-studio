import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promises as fs, statSync} from 'node:fs';
import path from 'node:path';
import {resolveNpmCommand} from './npm-command.mjs';
import {downloadVerified, sha256File} from './studio-download.mjs';



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

export function runProcess(command, args, {cwd, timeoutMs = STEP_TIMEOUT_MS}) {
  return new Promise((resolve, reject) => {
    const name = path.basename(args[0] === '-e' ? command : args[0] ?? command);
    const child = spawn(command, args, {cwd, stdio: 'inherit', windowsHide: true, shell: false, env: process.env});
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${name} did not finish within ${Math.round(timeoutMs / 1000)} s and was stopped`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with code ${code}`));
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

export function setupSteps(root, lock) {
  const at = (relative) => path.join(root, ...relative.split('/'));
  const ffmpegArchive = at(`state/cache/downloads/ffmpeg-${lock.ffmpeg.version}-full_build.7z`);
  const engine = at('engine');
  const browserOk = async (home) => (await sha256File(at(`${BROWSER_HOMES[home]}/${lock.browser.exe}`))) === lock.browser.exeSha256;
  const browserDir = (home) => at(`${BROWSER_HOMES[home]}/chrome-headless-shell`);
  const writeOnce = (file, text) => fs.writeFile(file, text, {encoding: 'utf8', flag: 'wx'}).catch((error) => { if (error.code !== 'EEXIST') throw error; });
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
      key: async () => hashOf(await fs.readFile(at('engine/package-lock.json'))),
      verify: async () => (await exists(at('engine/node_modules/remotion/package.json'))) && (await exists(at('engine/node_modules/.package-lock.json'))),
      run: async (log) => {
        const npm = resolveNpmCommand(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
        log('npm ci --ignore-scripts (engine/)');
        await runProcess(npm.command, npm.args, {cwd: engine});
      },
    },
    {
      id: 'browser',
      key: async () => `${lock.browser.version}:${lock.browser.exeSha256}`,
      verify: async () => browserHomeProblem(root) === null && (await browserOk('engine')) && (await browserOk('root')),
      run: async (log) => {
        const problem = browserHomeProblem(root);
        if (problem) throw new Error(problem);
        if (!(await browserOk('engine')) && (await browserOk('root'))) {
          log('browser: reusing the verified copy in .remotion/');
          await linkTree(browserDir('root'), browserDir('engine'));
        }
        if (!(await browserOk('engine'))) {
          log('browser: Remotion ensureBrowser in engine/');
          await runProcess(process.execPath, ['-e', ENSURE_BROWSER], {cwd: engine});
        }
        if (!(await browserOk('engine'))) {
          await fs.rm(browserDir('engine'), {recursive: true, force: true});
          throw new Error(`The render browser does not match its pinned SHA-256 (${lock.browser.version}); it was removed.`);
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


        await downloadVerified({url: lock.ffmpeg.url, sha256: lock.ffmpeg.sha256, bytes: lock.ffmpeg.bytes, target: ffmpegArchive});
        log('ffmpeg: archive verified, extracting');
        await runProcess(process.execPath, [at('scripts/install-ffmpeg.mjs')], {cwd: root});
        await fs.rm(ffmpegArchive, {force: true});
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
        for (const font of lock.fonts) await downloadVerified({url: font.url, sha256: font.sha256, bytes: font.bytes, target: at(`engine/public/fonts/${font.file}`)});
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
      run: async () => {
        for (const model of lock.models) await downloadVerified({url: model.url, sha256: model.sha256, bytes: model.bytes, target: at(model.path)});
      },
    },
  ];
}

export async function runSetup({steps, state, save, log = () => {}, requiredIds = steps.map((step) => step.id)}) {
  const now = () => new Date().toISOString();
  state.steps ??= {};
  Object.assign(state, {status: 'running', error: null});
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
      state.steps[step.id] = {ok: false, key, at: now(), error: error.message};
      Object.assign(state, {status: 'failed', error: error.message});
      await save(state);
      log(`${step.id}: failed: ${error.message}`);
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
