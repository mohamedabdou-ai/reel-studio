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
    'tests/graphics-audio.test.mjs', 'tests/graphics-audio-ffmpeg.test.mjs', 'tests/project-scenes.test.mjs',
    'tests/performance-controls.test.mjs', 'tests/alignment-workflow.test.mjs', 'tests/emphasis-proposals.test.mjs', 'tests/publishing-flexibility.test.mjs', 'tests/bootstrap-profile.test.mjs', 'tests/project-scene-example.test.mjs', 'tests/proxy-cache-hardlinks.test.mjs', 'tests/review-export.test.mjs', 'tests/font-css.test.mjs', 'tests/font-faces.test.mjs', 'tests/grid-glide-assets.test.mjs', 'tests/grid-glide-demo.test.mjs', 'tests/grid-glide-director.test.mjs', 'tests/grid-glide-docs.test.mjs', 'tests/grid-glide-editor.test.mjs', 'tests/grid-glide-ending.test.mjs', 'tests/grid-glide-kit.test.mjs', 'tests/grid-glide-layout.test.mjs', 'tests/grid-glide-math.test.mjs', 'tests/grid-glide-render.test.mjs', 'tests/grid-glide-rtl-lint.test.mjs', 'tests/grid-glide-scene-render.test.mjs', 'tests/grid-glide-scenes.test.mjs', 'tests/grid-glide-sound.test.mjs', 'tests/grid-glide-style.test.mjs', 'tests/grid-glide-text.test.mjs', 'tests/grid-glide-video-predicates.test.mjs', 'tests/grid-sans-font.test.mjs', 'tests/release-notes.test.mjs', 'tests/style-aliases.test.mjs', 'tests/family-designs.test.mjs', 'tests/style-baselines.test.mjs', 'tests/style-completeness.test.mjs', 'tests/style-docs.test.mjs', 'tests/style-registry.test.mjs', 'tests/style-sound-palettes.test.mjs', 'tests/style-themes.test.mjs', 'tests/transcription-setup.test.mjs', 'tests/studio-download.test.mjs', 'tests/one-shot-math.test.mjs', 'tests/one-shot-render.test.mjs', 'tests/one-shot-scene.test.mjs', 'tests/one-shot-sound.test.mjs', 'tests/cartoon-sound.test.mjs', 'tests/cartoon-scene.test.mjs', 'tests/cartoon-math.test.mjs', 'tests/cartoon-render.test.mjs', 'tests/cartoon-assets.test.mjs', 'tests/cartoon-mouth.test.mjs', 'tests/cartoon-lint.test.mjs', 'tests/cartoon-docs.test.mjs', 'tests/editor-scene-templates.test.mjs', 'tests/editor-look.test.mjs', 'tests/editor-keymap.test.mjs', 'tests/review-sfx-preview.test.mjs', 'tests/output-boundary.test.mjs', 'tests/card-labels.test.mjs', 'tests/digits.test.mjs', 'tests/digits-preference.test.mjs', 'tests/digits-render.test.mjs', 'tests/digits-captions.test.mjs', 'tests/settings-arabic.test.mjs', 'tests/transcription-chunks.test.mjs', 'tests/transcription-compare.test.mjs', 'tests/transcription-ab.test.mjs', 'tests/production-manager.test.mjs', 'tests/library-selection.test.mjs', 'tests/arabic-check-gates.test.mjs', 'tests/arabic-check.test.mjs', 'tests/arabic-core.test.mjs', 'tests/arabic-lint.test.mjs', 'tests/arabic-type-canvas.test.mjs', 'tests/arabic-type-fonts.test.mjs', 'tests/arabic-type-registration.test.mjs', 'tests/arabic-type-render.test.mjs', 'tests/arabic-type-schema.test.mjs', 'tests/arabic-type-timing.test.mjs', 'tests/caption-skins.test.mjs', 'tests/cc0-install.test.mjs', 'tests/cc0-sounds.test.mjs', 'tests/chat-thread-scene.test.mjs', 'tests/documentary-map.test.mjs', 'tests/documentary-style.test.mjs', 'tests/effects-looks.test.mjs', 'tests/figures-scene.test.mjs', 'tests/font-coverage.test.mjs', 'tests/kinetic-stretch.test.mjs', 'tests/layered-speaker-math.test.mjs', 'tests/layered-speaker-render.test.mjs', 'tests/layered-speaker-scene.test.mjs', 'tests/looks-captions.test.mjs', 'tests/looks-editor.test.mjs', 'tests/looks-library.test.mjs', 'tests/looks.test.mjs', 'tests/marks.test.mjs', 'tests/matte-runtime.test.mjs', 'tests/proof-screen-integration.test.mjs', 'tests/proof-screen.test.mjs', 'tests/scene-camera.test.mjs', 'tests/scene-stickers.test.mjs', 'tests/stickers.test.mjs', 'tests/transitions-v4.test.mjs', 'tests/v4-fonts.test.mjs',
    'tests/arabic-type-look.test.mjs', 'tests/compose-adapters.test.mjs', 'tests/compose-layout.test.mjs', 'tests/compose-render.test.mjs', 'tests/compose-schema.test.mjs', 'tests/lane-e0-engine-prep.test.mjs', 'tests/magazine-arabic-type-design.test.mjs', 'tests/magazine-concepts-more.test.mjs', 'tests/magazine-concepts-own.test.mjs', 'tests/magazine-concepts-parts.test.mjs', 'tests/magazine-concepts.test.mjs', 'tests/magazine-coverage.test.mjs', 'tests/magazine-creator-cta-design.test.mjs', 'tests/magazine-design-ssr.test.mjs', 'tests/magazine-kinetic-hook-design.test.mjs', 'tests/magazine-kinetic-text-design.test.mjs', 'tests/magazine-message-board-design.test.mjs', 'tests/magazine-numerals.test.mjs', 'tests/magazine-screen-focus-design.test.mjs', 'tests/magazine-screen-recording-design.test.mjs', 'tests/magazine-system-parity.test.mjs', 'tests/magazine-task20-fixes.test.mjs', 'tests/magazine-task21-fixes.test.mjs', 'tests/magazine-task21-fixes2.test.mjs', 'tests/magazine-task21-fixes3.test.mjs', 'tests/magazine-task21-fixes4.test.mjs', 'tests/style-system-rules.test.mjs', 'tests/safe-surfaces.test.mjs']);
  await run('doctor-quick', ['scripts/studio.mjs', 'doctor', '--quick']);
  if (values.doctor) await run('doctor-render', ['scripts/studio.mjs', 'doctor']);
  if (ref && git(root, ['status', '--porcelain', '--untracked-files=no']).trim()) throw new Error('The installation changed tracked release files.');
  const result = {ok: true, root, ref, files: manifest.length, packages: Object.keys(packages.resolved).length, seeded, checks,
    modules: await fs.realpath(path.join(root, 'engine', 'node_modules'))};
  await fs.writeFile(path.join(qa, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
