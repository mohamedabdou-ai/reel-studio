import './lib/project-tmp.mjs';
import {spawnSync} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {ROOT, assertProjectOutput} from './lib/project-paths.mjs';
import {assertFreshTarget, snapshotWorktree, verifySnapshot, assertNoLinks, seedPinnedArtifacts, installEnvironment} from './lib/clean-install.mjs';
import {checkEngineDependencies, dependencyProblem} from './lib/engine-dependencies.mjs';

const git = (root, args) => {
  const result = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], {encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
};
const files = () => [...new Set(git(ROOT, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].sort();

async function main() {
  const {values} = parseArgs({options: {out: {type: 'string'}, ref: {type: 'string'}, 'cache-from': {type: 'string'}, doctor: {type: 'boolean'}}, strict: true});
  const root = assertProjectOutput(path.resolve(values.out ?? path.join(ROOT, 'state', 'tmp', `clean-install-${randomUUID()}`)));
  await assertFreshTarget(root);
  let manifest, ref = null;
  if (values.ref) {
    ref = git(ROOT, ['rev-parse', `${values.ref}^{commit}`]).trim();
    await fs.mkdir(path.dirname(root), {recursive: true});
    const cloned = spawnSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, 'clone', '--no-local', '--no-hardlinks', ROOT, root], {encoding: 'utf8', windowsHide: true});
    if (cloned.status !== 0) throw new Error(`Clean clone failed: ${cloned.stderr}`);
    git(root, ['checkout', '--detach', ref]);
    manifest = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  } else {
    const selected = files();
    manifest = await snapshotWorktree(ROOT, root, selected);
    await verifySnapshot(ROOT, root, manifest);
    if (JSON.stringify(selected) !== JSON.stringify(files())) throw new Error('Candidate files changed while copying the snapshot.');
  }
  const qa = path.join(root, 'state', 'qa');
  await fs.mkdir(qa, {recursive: true});
  await fs.mkdir(path.join(root, 'state', 'tmp'), {recursive: true});
  await fs.writeFile(path.join(qa, 'source-manifest.json'), JSON.stringify({ref, files: manifest}, null, 2) + '\n');
  const lock = JSON.parse(await fs.readFile(path.join(root, 'versions.lock.json'), 'utf8'));
  const seeded = values['cache-from'] ? await seedPinnedArtifacts(path.resolve(values['cache-from']), root, lock) : [];
  const env = installEnvironment(root), checks = [];
  const run = async (label, args, cwd = root) => {
    process.stderr.write(`[clean-install] ${label}\n`);
    const result = spawnSync(process.execPath, args, {cwd, env, encoding: 'utf8', windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 32 * 1024 * 1024});
    await fs.writeFile(path.join(qa, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    if (result.status !== 0) throw new Error(`${label} failed; see ${path.join(qa, `${label}.log`)}`);
    checks.push(label);
  };
  const profile = JSON.parse(await fs.readFile(path.join(root, 'PROFILE.example.json'), 'utf8'));
  profile.name = 'Example Studio'; profile.handle = '@example.creator';
  await fs.writeFile(path.join(root, 'PROFILE.json'), JSON.stringify(profile, null, 2) + '\n');
  await run('profile', ['scripts/profile.mjs', 'check']);
  await run('setup', ['scripts/studio.mjs', 'setup', '--foreground']);
  await assertNoLinks(path.join(root, 'engine', 'node_modules'));
  const packages = await checkEngineDependencies(root);
  if (!packages.ok) throw new Error(dependencyProblem(packages));
  await run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit'], path.join(root, 'engine'));
  await run('editor-tests', ['--test', '--test-concurrency=1', 'tests/engine-dependencies.test.mjs', 'tests/clean-install.test.mjs',
    'tests/review-live-api.test.mjs', 'tests/review-live-follow.test.mjs', 'tests/review-live-save.test.mjs',
    'tests/graphics-audio.test.mjs', 'tests/graphics-audio-ffmpeg.test.mjs']);
  await run('doctor-quick', ['scripts/studio.mjs', 'doctor', '--quick']);
  if (values.doctor) await run('doctor-render', ['scripts/studio.mjs', 'doctor']);
  if (ref && git(root, ['status', '--porcelain', '--untracked-files=no']).trim()) throw new Error('The installation changed tracked release files.');
  const result = {ok: true, root, ref, files: manifest.length, packages: Object.keys(packages.resolved).length, seeded, checks,
    modules: await fs.realpath(path.join(root, 'engine', 'node_modules'))};
  await fs.writeFile(path.join(qa, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
