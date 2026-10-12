import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, rm, mkdtemp} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeProfile} from '../scripts/lib/branding.mjs';
import {validatePublishCopy, renderPublishPack} from '../scripts/lib/publish-pack.mjs';
import {checkCaptionCopy, publishComparison} from '../scripts/lib/caption-check.mjs';
import {createSettingsServer} from '../scripts/lib/settings-server.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const profile = JSON.parse(await readFile(new URL('../PROFILE.example.json', import.meta.url), 'utf8'));
const copy = {
  title: 'A clearer process', notes: [], credits: ['Illustration supplied by @illustrator'],
  instagram: {caption: 'Process design: where could your next decision become easier?', hashtags: ['#ProcessDesign'], altText: 'Three notes gather into a board and one result moves forward.', pinnedComment: 'Which input needs attention first?'},
  tiktok: {caption: 'Process design can change how a busy team chooses its next move.', hashtags: ['#TeamWorkflow'], pinnedComment: 'Screenshot supplied with permission.'},
  youtube: {title: 'Process design for scattered ideas', description: 'Process design starts with a useful question. Watch for the moment the clutter changes.', hashtags: ['#Workflow']},
};

test('selected Shorts extends old profiles and packs retain actual copy, alt text and supplied attribution', () => {
  const selected = normalizeProfile({...profile, platforms: ['youtube', 'instagram', 'tiktok']});
  assert.deepEqual(selected.platforms, ['youtube', 'instagram', 'tiktok']);
  const validated = validatePublishCopy(copy, {profile: selected, cta: null, writingStyle: 'short'});
  assert.deepEqual(validated, copy);
  const pack = renderPublishPack({profile: selected, copy: validated, cta: null, video: {path: 'Outputs/example.mp4', sha256: 'a'.repeat(64)}});
  for (const text of [copy.youtube.title, copy.youtube.description, copy.instagram.caption, copy.tiktok.caption, copy.instagram.altText, copy.instagram.pinnedComment, copy.tiktok.pinnedComment, copy.credits[0]]) assert.ok(pack.includes(text), text);
  assert.match(pack, /YouTube Shorts/);
  assert.equal(normalizeProfile(profile).platforms.includes('youtube'), false, 'existing platform selections stay unchanged');
});

test('Shorts has a separate 100-character title and description validation', () => {
  const selected = {...profile, platforms: ['youtube']};
  const value = {title: copy.title, youtube: {...copy.youtube, title: '😀'.repeat(100)}};
  assert.equal(validatePublishCopy(value, {profile: selected, cta: null}).youtube.title, value.youtube.title);
  assert.throws(() => validatePublishCopy({...value, youtube: {...value.youtube, title: 'x'.repeat(101)}}, {profile: selected, cta: null}), /youtube.title.*100/);
  assert.throws(() => validatePublishCopy({...value, youtube: {...value.youtube, description: ''}}, {profile: selected, cta: null}), /youtube.description/);
  assert.throws(() => validatePublishCopy({...value, youtube: {...value.youtube, description: 'x'.repeat(5001)}}, {profile: selected, cta: null}), /5000/);
  assert.throws(() => validatePublishCopy({...value, instagram: copy.instagram}, {profile: selected, cta: null}), /Unknown publish copy field: instagram/);
});

test('Shorts search checks the title and description, filler tags and cross-platform repetition', () => {
  const selected = ['youtube', 'instagram'];
  const result = checkCaptionCopy({copy, platforms: selected, spokenText: '', keyword: 'Process design'});
  assert.equal(result.ok, true, result.failures.join('\n'));
  const bad = checkCaptionCopy({copy: {...copy, youtube: {...copy.youtube, title: 'A new idea', description: copy.instagram.caption, hashtags: ['#viral']}}, platforms: selected, spokenText: '', keyword: 'Process design'});
  assert.ok(bad.failures.some(line => /YouTube Shorts.*title.*search phrase/.test(line)), bad.failures.join('\n'));
  assert.ok(bad.failures.some(line => /filler hashtag/.test(line)));
  assert.ok(bad.failures.some(line => /share 100 %/.test(line)), bad.failures.join('\n'));
});

test('an original Shorts title cannot dilute a copied description or join into a fabricated copied run', () => {
  const spoken = 'an input can move through a process to a chosen result';
  const entry = {title: 'Process design opens clearer options for teams with busy review cycles', description: 'input can move through', hashtags: ['#Workflow']};
  const copied = checkCaptionCopy({copy: {youtube: entry}, platforms: ['youtube'], spokenText: spoken});
  assert.ok(copied.failures.some(line => /100 % of its 3-word phrases/.test(line)), copied.failures.join('\n'));
  const separate = checkCaptionCopy({copy: {youtube: {...entry, title: 'an input can', description: 'move through a process'}}, platforms: ['youtube'], spokenText: spoken});
  assert.equal(separate.platforms.youtube.longestSourceRun, 4, 'title and description are separate text fields');
});

test('long declared visual copy remains a comparison baseline within the scene contract bounds', () => {
  const sentence = 'the visible authored result moves into focus';
  const comparison = publishComparison({contentMode: 'graphics', projectScenes: {scenes: [{id: 'explain', fields: [{key: 'headline', type: 'string', max: 10000}]}]}, scenes: [{family: 'project-scene', data: {component: 'explain', values: {headline: `${'context '.repeat(400)}${sentence}`}}}]});
  assert.equal(comparison.source, 'authored');
  const result = checkCaptionCopy({copy: {instagram: {caption: sentence, hashtags: ['#VisualDesign']}}, platforms: ['instagram'], comparisonText: comparison.text, comparisonKind: comparison.source});
  assert.ok(result.failures.some(line => /7 authored words in a row/.test(line)), result.failures.join('\n'));
});

test('settings saves only the selected platforms and offers Shorts in the screen', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'reel-shorts-settings-'));
  const app = await createSettingsServer({root: temporary});
  t.after(async () => {await app.close(); await rm(temporary, {recursive: true, force: true});});
  const response = await fetch(`${app.origin}/api/profile`, {method: 'PUT', headers: {'x-reel-studio-token': app.token, 'content-type': 'application/json'}, body: JSON.stringify({etag: null, profile: {...profile, platforms: ['youtube']}})});
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual((await response.json()).profile.platforms, ['youtube']);
  assert.deepEqual(JSON.parse(await readFile(path.join(temporary, 'PROFILE.json'), 'utf8')).platforms, ['youtube']);
  const script = await (await fetch(`${app.origin}/app.js?token=${app.token}`)).text();
  assert.match(script, /\['youtube', 'YouTube Shorts'\]/);
});

async function graphicsProject(t, suffix, manifest = {}) {
  const id = `publish-flex-${suffix}-${Date.now()}`;
  const directory = path.join(root, 'Projects', id);
  await mkdir(directory, {recursive: true});
  t.after(() => rm(directory, {recursive: true, force: true}));
  await writeFile(path.join(directory, 'edit.json'), JSON.stringify({contentMode: 'graphics', captions: {status: 'reviewed', words: []}, creator: {ending: {cta: null}}, ...manifest}));
  await writeFile(path.join(directory, 'clip.mp4'), 'identity-only fixture; no render is claimed');
  const run = command => exec(process.execPath, [`scripts/${command}.mjs`, '--project', id, '--profile', 'PROFILE.example.json', '--keyword', 'Process design', ...(command === 'publish-pack' ? ['--video', `Projects/${id}/clip.mp4`] : [])], {cwd: root, windowsHide: true});
  const writeCopy = value => writeFile(path.join(directory, 'publish-copy.json'), JSON.stringify(value));
  return {directory, run, writeCopy};
}
const silentCopy = {title: copy.title, instagram: copy.instagram, tiktok: copy.tiktok};

test('silent graphics receives every non-plagiarism check and writes real selected caption copy', async t => {
  const {directory, run, writeCopy} = await graphicsProject(t, 'silent');
  await writeCopy(silentCopy);
  const checked = JSON.parse((await run('caption-check')).stdout);
  assert.equal(checked.ok, true);
  assert.equal(checked.comparison.source, 'none');
  const packed = JSON.parse((await run('publish-pack')).stdout);
  assert.equal(packed.teaserCheck, 'passed');
  assert.equal(packed.comparison.source, 'none');
  assert.ok((await readFile(path.join(directory, 'PUBLISH_PACK.md'), 'utf8')).includes(copy.instagram.caption));
  for (const invalid of [
    {...silentCopy, tiktok: {...copy.tiktok, hashtags: ['#fyp']}},
    {...silentCopy, tiktok: copy.instagram},
    {...silentCopy, instagram: {...copy.instagram, caption: 'A vague invitation to watch.'}},
  ]) {
    await rm(path.join(directory, 'PUBLISH_PACK.md'), {force: true});
    await writeCopy(invalid);
    const error = await run('publish-pack').then(() => null, error => error);
    assert.equal(error?.code, 1);
    assert.match(JSON.parse(error.stderr).error, /Rewrite the post description/);
    await assert.rejects(readFile(path.join(directory, 'PUBLISH_PACK.md')), {code: 'ENOENT'});
  }
});

test('graphics compares against authored scene copy without treating paths and IDs as speech', async t => {
  const authored = 'Process design collects scattered inputs into a process then moves one useful result forward';
  const {run, writeCopy} = await graphicsProject(t, 'authored', {scenes: [{id: 'graphic', family: 'intro', data: {title: authored, asset: {path: 'Projects/example/process-design.mp4'}}}]});
  await writeCopy({...silentCopy, instagram: {...copy.instagram, caption: `${authored}. See the change.`}});
  const error = await run('caption-check').then(() => null, error => error);
  assert.equal(error?.code, 1);
  const rejected = JSON.parse(error.stdout || error.stderr);
  assert.equal(rejected.comparison?.source, 'authored');
  assert.ok(rejected.failures.some(line => /authored words in a row/.test(line)), rejected.failures.join('\n'));
});

test('project scenes compare declared nested authored strings while excluding technical fields', async t => {
  const sentence = 'Process design makes the selected result visible after the inputs become one board';
  const manifest = {
    projectScenes: {scenes: [{id: 'process', fields: [{key: 'headline', type: 'string'}, {key: 'items', type: 'array', items: {type: 'object', fields: [{key: 'label', type: 'string'}, {key: 'asset', type: 'asset'}]}}, {key: 'path', type: 'string'}, {key: 'tint', type: 'color'}]}]},
    scenes: [{family: 'project-scene', data: {component: 'process', values: {headline: 'Process design', items: [{label: sentence, asset: 'Projects/fixture/asset.png'}], path: 'This technical path should never count as authored spoken text', tint: '#000000'}}}],
  };
  const {run, writeCopy} = await graphicsProject(t, 'project', manifest);
  await writeCopy({...silentCopy, instagram: {...copy.instagram, caption: `${sentence}. Take a look.`}});
  const error = await run('caption-check').then(() => null, error => error);
  assert.equal(error?.code, 1);
  const rejected = JSON.parse(error.stdout || error.stderr);
  assert.equal(rejected.comparison?.source, 'authored');
  assert.ok(rejected.failures.some(line => /authored words in a row/.test(line)), rejected.failures.join('\n'));
  assert.equal(rejected.comparison.words, 15);
});

test('writing command reports selected platforms and the authored copy source without inventing speech', async t => {
  const {directory} = await graphicsProject(t, 'writing', {scenes: [{family: 'intro', data: {title: 'Process design'}}]});
  const id = path.basename(directory);
  const profileFile = path.join(directory, 'profile.json');
  await writeFile(profileFile, JSON.stringify({...profile, platforms: ['youtube']}));
  const result = JSON.parse((await exec(process.execPath, ['scripts/profile.mjs', 'writing', '--project', id, '--profile', profileFile], {cwd: root, windowsHide: true})).stdout);
  assert.deepEqual(result.platforms, ['youtube']);
  assert.deepEqual(result.comparison, {source: 'authored', words: 2});
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'edit.json'), 'utf8')).captions.words, []);
});

const defaultCopy = {
  headline: 'Process design turns scattered inputs into a visible result',
  detail: 'A clear review question makes the next decision easier',
  item: 'The selected note moves into focus after the board gathers',
};
const defaultContract = {id: 'default-process', label: 'Default process', entry: 'scenes/DefaultProcess.tsx', fields: [
  {key: 'headline', type: 'string', default: defaultCopy.headline},
  {key: 'group', type: 'object', default: {}, fields: [{key: 'detail', type: 'string', default: defaultCopy.detail}]},
  {key: 'items', type: 'array', default: [{}], items: {key: 'item', type: 'object', fields: [
    {key: 'label', type: 'string', default: defaultCopy.item},
    {key: 'asset', type: 'asset', default: 'fixture/illustration.png'},
    {key: 'tint', type: 'color', default: '#000000'},
  ]}},
]};
const defaultManifest = {contentMode: 'graphics', projectScenes: {scenes: [defaultContract]}, scenes: [{family: 'project-scene', data: {component: defaultContract.id, values: {}}}]};

test('publish comparison includes rendered headline, nested object and array item defaults without changing authored values', () => {
  const manifest = structuredClone(defaultManifest);
  const comparison = publishComparison(manifest);
  assert.equal(comparison.source, 'authored');
  for (const sentence of Object.values(defaultCopy)) {
    assert.ok(comparison.text.includes(sentence), sentence);
    const rejected = checkCaptionCopy({copy: {instagram: {caption: sentence, hashtags: ['#Workflow']}}, platforms: ['instagram'], comparisonText: comparison.text, comparisonKind: comparison.source});
    assert.equal(rejected.ok, false, `${sentence} must be rejected as copied rendered text`);
    assert.ok(rejected.failures.some(line => /authored words in a row/.test(line)), rejected.failures.join('\n'));
  }
  assert.doesNotMatch(comparison.text, /illustration\.png|#000000/);
  assert.deepEqual(manifest, defaultManifest, 'comparison must not materialize defaults in the saved manifest');
  manifest.scenes[0].data.values.headline = 'An explicitly supplied alternative headline';
  const overridden = publishComparison(manifest);
  assert.ok(overridden.text.includes('An explicitly supplied alternative headline'));
  assert.ok(!overridden.text.includes(defaultCopy.headline), 'explicit values override default copy');
});

test('both publishing commands reject copy from omitted rendered defaults and leave no pack', async t => {
  const {directory, run, writeCopy} = await graphicsProject(t, 'defaults', defaultManifest);
  await writeCopy({...silentCopy, instagram: {...copy.instagram, caption: `${defaultCopy.headline}. Watch the change.`}});
  const checked = await run('caption-check').then(() => null, error => error);
  assert.equal(checked?.code, 1, 'default text must be compared by caption-check');
  assert.equal(JSON.parse(checked.stdout || checked.stderr).comparison?.source, 'authored');
  const packed = await run('publish-pack').then(() => null, error => error);
  assert.equal(packed?.code, 1, 'default text must prevent a publish pack');
  assert.match(JSON.parse(packed.stderr).error, /authored words in a row/);
  await assert.rejects(readFile(path.join(directory, 'PUBLISH_PACK.md')), {code: 'ENOENT'});
});
