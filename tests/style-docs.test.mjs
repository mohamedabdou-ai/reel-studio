import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STYLE_METAS} from '../engine/src/styles/registry.ts';
import {GUIDE_HEADINGS, RECIPE_BULLETS, TABLE_START, TABLE_END, assertGuideHeadings, renderStyleTable, syncStyleDocs} from '../scripts/style-docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

function markdownFiles(dir) {
  const base = path.join(ROOT, dir);
  if (!existsSync(base)) return [];
  return readdirSync(base).flatMap(name => {
    const relative = `${dir}/${name}`;
    if (statSync(path.join(ROOT, relative)).isDirectory()) return markdownFiles(relative);
    return relative.endsWith('.md') ? [relative] : [];
  });
}
const instructionFiles = () => markdownFiles('instructions');
const docFiles = () => [...instructionFiles(), ...markdownFiles('.agents'), ...markdownFiles('.claude'),
  ...['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CLAUDE.md', 'docs/media/README.md'].filter(file => existsSync(path.join(ROOT, file)))];

/** Level-2 sections of a guide: [{title, body}]. */
function sectionsOf(text) {
  const parts = [];
  for (const line of text.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) parts.push({title: heading[1].trim(), lines: []});
    else if (parts.length) parts[parts.length - 1].lines.push(line);
  }
  return parts.map(part => ({title: part.title, body: part.lines.join('\n').trim()}));
}
const slug = heading => heading.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
const anchorsOf = text => new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map(m => slug(m[1])).concat([...text.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])));

async function sandbox(t) {
  const base = path.join(ROOT, 'state', 'tmp', 'style-docs');
  await fs.mkdir(base, {recursive: true});
  const dir = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(async () => {
    const relative = path.relative(base, dir);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.rm(dir, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(dir, 'instructions'), {recursive: true});
  return dir;
}

test('the guide template matches the approved section list', () => {
  assert.deepEqual(GUIDE_HEADINGS, ['Look', 'Best for', 'Layouts and footage', 'Palette and brand', 'Recipe', 'Design system', 'Style-owned scenes', 'Avoid']);
  assert.deepEqual(RECIPE_BULLETS, ['Decision', 'Composition/material', 'Timing/action', 'Transition/sound', 'Application/review']);
});

test('system styles require Design system immediately after Recipe', () => {
  assert.doesNotThrow(() => assertGuideHeadings('magazine-interview', GUIDE_HEADINGS));
  assert.throws(() => assertGuideHeadings('magazine-interview', GUIDE_HEADINGS.filter(title => title !== 'Design system')), /Design system/);
  for (let index = 0; index < GUIDE_HEADINGS.length; index++) {
    if (index === GUIDE_HEADINGS.indexOf('Design system')) continue;
    const misplaced = GUIDE_HEADINGS.filter(title => title !== 'Design system');
    misplaced.splice(index, 0, 'Design system');
    assert.throws(() => assertGuideHeadings('magazine-interview', misplaced), /sections, in order/);
  }
  assert.throws(() => assertGuideHeadings('magazine-interview', [...GUIDE_HEADINGS, 'Design system']), /sections, in order/);
});

test('styles without a design system must omit Design system', () => {
  assert.doesNotThrow(() => assertGuideHeadings('section-deck', GUIDE_HEADINGS.filter(title => title !== 'Design system')));
  assert.throws(() => assertGuideHeadings('section-deck', GUIDE_HEADINGS), /sections, in order/);
});

test('the generated style table is current and lists every registered style in registry order', async () => {
  const result = await syncStyleDocs(ROOT, {check: true});
  assert.equal(result.ok, true, 'Run node scripts/style-docs.mjs to regenerate the style table.');
  const hub = read('instructions/STYLES.md');
  const block = hub.slice(hub.indexOf(TABLE_START) + TABLE_START.length, hub.indexOf(TABLE_END));
  const ids = [...block.matchAll(/^\| <a id="([a-z0-9-]+)"><\/a>\[`\1`\]\(styles\/\1\.md\)/gm)].map(match => match[1]);
  assert.deepEqual(ids, STYLE_METAS.map(meta => meta.id));
  assert.equal(block.trim(), renderStyleTable(STYLE_METAS));
});

test('the table generator rewrites only the marked block, keeps line endings and reports drift', async t => {
  const dir = await sandbox(t);
  const metas = [{id: 'demo-one', label: {en: 'Demo one', ar: 'تجربة'}, useCases: ['explainer', 'story'], brand: true, ownScenes: []},
    {id: 'demo-two', label: {en: 'Demo | two', ar: 'تجربة ٢'}, useCases: ['tutorial'], brand: false, ownScenes: ['demo-scene', 'demo-card']}];
  const before = `# Styles\r\n\r\nIntro stays.\r\n\r\n${TABLE_START}\r\nstale\r\n${TABLE_END}\r\n\r\nOutro stays.\r\n`;
  const hub = path.join(dir, 'instructions', 'STYLES.md');
  await fs.writeFile(hub, before);
  assert.equal((await syncStyleDocs(dir, {check: true, metas})).ok, false);
  assert.equal(await fs.readFile(hub, 'utf8'), before, 'A check must not change the file.');
  const written = await syncStyleDocs(dir, {metas});
  assert.deepEqual([written.ok, written.changed], [true, true]);
  const after = await fs.readFile(hub, 'utf8');
  assert.ok(after.startsWith('# Styles\r\n\r\nIntro stays.\r\n') && after.endsWith('Outro stays.\r\n'));
  assert.ok(!/[^\r]\n/.test(after), 'Every line ending stays CRLF.');
  assert.match(after, /\| <a id="demo-two"><\/a>\[`demo-two`\]\(styles\/demo-two\.md\) \| Demo \\\| two · تجربة ٢ \| tutorial \| own palette \| `demo-scene`, `demo-card` \|/);
  assert.match(after, /\| <a id="demo-one"><\/a>\[`demo-one`\]\(styles\/demo-one\.md\) \| Demo one · تجربة \| explainer, story \| profile colours \| none \|/);
  assert.equal((await syncStyleDocs(dir, {check: true, metas})).ok, true);
  assert.equal((await syncStyleDocs(dir, {metas})).changed, false, 'A second run changes nothing.');
});

test('the generator refuses a hub without exactly one pair of markers', async t => {
  const dir = await sandbox(t);
  const hub = path.join(dir, 'instructions', 'STYLES.md');
  await fs.writeFile(hub, '# Styles\n\nNo markers here.\n');
  await assert.rejects(syncStyleDocs(dir, {metas: []}), /markers|once/);
  await fs.writeFile(hub, `${TABLE_END}\n${TABLE_START}\n`);
  await assert.rejects(syncStyleDocs(dir, {metas: []}), /markers|once/);
  await fs.writeFile(hub, `${TABLE_START}\n${TABLE_START}\n${TABLE_END}\n`);
  await assert.rejects(syncStyleDocs(dir, {metas: []}), /markers|once/);
});

test('every registered style has a guide with the complete template', () => {
  for (const meta of STYLE_METAS) {
    const file = `instructions/styles/${meta.id}.md`;
    assert.ok(existsSync(path.join(ROOT, file)), `${file} is missing; copy the template in instructions/STYLE-AUTHORING.md.`);
    const text = read(file);
    assert.ok(text.startsWith(`# ${meta.id}\n`), `${file} must start with "# ${meta.id}".`);
    const sections = sectionsOf(text);
    assertGuideHeadings(meta.id, sections.map(section => section.title));
    for (const section of sections) assert.ok(section.body.length > 0, `${file}: the "${section.title}" section is empty.`);
    const recipe = sections.find(section => section.title === 'Recipe').body;
    assert.deepEqual([...recipe.matchAll(/^- \*\*([^:]+):\*\*/gm)].map(match => match[1]), RECIPE_BULLETS, `${file}: the Recipe needs the five decision bullets, in order.`);
    assert.doesNotMatch(text, /\b(?:TBD|TODO|FIXME)\b/, `${file} still has a placeholder.`);
  }
});

test('each guide documents the scene families its registry entry names', () => {
  for (const meta of STYLE_METAS) {
    const scenes = sectionsOf(read(`instructions/styles/${meta.id}.md`)).find(section => section.title === 'Style-owned scenes').body;
    for (const family of new Set([...meta.ownScenes, ...meta.fit.semanticBeats])) {
      assert.ok(scenes.includes(`\`${family}\``), `${meta.id}: "Style-owned scenes" must mention \`${family}\`.`);
    }
  }
});

test('the guide folder holds one guide per registered style and nothing else', () => {
  const found = readdirSync(path.join(ROOT, 'instructions', 'styles')).sort();
  assert.deepEqual(found, STYLE_METAS.map(meta => `${meta.id}.md`).sort());
});

test('the retired recipes file is gone and nothing links to it', () => {
  assert.equal(existsSync(path.join(ROOT, 'instructions', 'STYLE-RECIPES.md')), false);
  for (const file of docFiles()) assert.doesNotMatch(read(file), /STYLE-RECIPES/, `${file} still refers to the retired recipes file.`);
});

test('relative links in the guides, skills and README resolve, including style anchors', () => {
  const styleDocs = new Set(['instructions/STYLES.md', ...STYLE_METAS.map(meta => `instructions/styles/${meta.id}.md`)]);
  for (const file of docFiles()) {
    for (const match of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
      const [target, fragment] = match[1].split('#');
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      const resolved = path.resolve(path.dirname(path.join(ROOT, file)), decodeURIComponent(target));
      assert.ok(existsSync(resolved), `${file} links to ${match[1]}, which does not exist.`);
      const relative = path.relative(ROOT, resolved).split(path.sep).join('/');
      if (fragment && styleDocs.has(relative)) assert.ok(anchorsOf(read(relative)).has(fragment), `${file} links to ${match[1]}, but that anchor does not exist.`);
    }
  }
});

test('instruction prose does not hard-code how many styles exist', () => {
  for (const file of instructionFiles()) {
    const text = read(file).replace(/<!-- styles:table:start -->[\s\S]*?<!-- styles:table:end -->/, '');
    assert.doesNotMatch(text, /\b(?:eleven|twelve|thirteen)\b/i, `${file} names a style count; use count-free wording.`);
    assert.doesNotMatch(text, /\bother (?:nine|ten|eleven)\b|\b(?:nine|ten) others?\b/i, `${file} counts the other styles; use count-free wording.`);
  }
});

test('the hub keeps the anchors that the audio mix sources point to', () => {
  const hub = read('instructions/STYLES.md');
  for (const meta of STYLE_METAS) {
    assert.ok(hub.includes(`<a id="${meta.id}"></a>`), `The hub table needs an anchor for ${meta.id}.`);
    if (!meta.mix) continue;
    const [file, fragment] = meta.mix.source.split('#');
    assert.ok(existsSync(path.join(ROOT, file)), `${meta.id}: mix source ${file} does not exist.`);
    if (fragment) assert.ok(anchorsOf(read(file)).has(fragment), `${meta.id}: mix source ${meta.mix.source} has no such anchor.`);
  }
});

const AUTHORING = 'instructions/STYLE-AUTHORING.md';

test('the authoring checklist names every file a style touches, and those files exist', () => {
  const text = read(AUTHORING);
  const example = STYLE_METAS[0].id;
  for (const entry of [
    'engine/src/styles/<id>/meta.ts', 'engine/src/styles/registry.ts', 'engine/src/styles/types.ts', 'engine/src/styles/<id>/theme.ts',
    'engine/src/styles/themes.ts', 'engine/src/styles/<id>/sound.json', 'engine/src/core/fonts.ts', 'engine/public/fonts/manifest.template.json',
    'scripts/fetch-fonts.mjs', 'scripts/lib/settings-server.mjs', 'versions.lock.json', 'NOTICE.md', 'scripts/sfx.mjs', 'Sound-Kits/catalog.json',
    'Sound-Kits/README.md', 'scripts/settings-ui/app.css', 'scripts/lib/scene-cues.mjs', 'scripts/lib/editor-director.mjs',
    'engine/src/review-editor/ops/scenes.ts', 'engine/src/review-editor/ops/demo.ts', 'instructions/styles/<id>.md', 'scripts/style-docs.mjs',
    'scripts/sync-assistant-guides.mjs', 'scripts/publication-check.mjs', 'scripts/verify-clean-install.mjs', 'scripts/concept-stills.mjs',
  ]) {
    assert.ok(text.includes(entry), `${AUTHORING} must mention ${entry}.`);
    const concrete = entry.replace('<id>', example);
    assert.ok(existsSync(path.join(ROOT, concrete)), `${AUTHORING} names ${entry}, but ${concrete} does not exist.`);
  }
});

test('the authoring checklist states the rules that keep a style safe to ship', () => {
  const text = read(AUTHORING).toLowerCase();
  for (const phrase of ['.illustration.<id>', 'node-safe', 'sha256', 'flat file name', 'deterministic code', 'never ship wav or mp3', 'arabic and in latin text',
    'publication-check.mjs --history', 'verify-clean-install.mjs --ref head --cache-from . --doctor', 'handles', 'avatars', 'logos', 'private paths',
    'cloned-voice', 'dated approval notes', 'never by character', 'only through `versions.lock.json`']) {
    assert.ok(text.includes(phrase), `${AUTHORING} must state: ${phrase}`);
  }
});

test('the commands in the authoring checklist run real scripts with the arguments they need', () => {
  const text = read(AUTHORING);
  const scripts = [...text.matchAll(/node scripts\/([A-Za-z0-9_.\/-]+\.mjs)/g)].map(match => match[1]);
  assert.ok(scripts.length > 0, `${AUTHORING} must show the node scripts it asks the author to run.`);
  for (const script of scripts) {
    assert.ok(existsSync(path.join(ROOT, 'scripts', script)), `${AUTHORING} runs node scripts/${script}, but that script does not exist.`);
  }
  const stills = text.split('\n').filter(line => line.includes('node scripts/concept-stills.mjs'));
  assert.ok(stills.length > 0, `${AUTHORING} must show the concept-stills command.`);
  for (const line of stills) {
    assert.match(line, /node scripts\/concept-stills\.mjs\b[^`]*--concept\s+\S+/, 'concept-stills exits with its usage text unless --concept is given.');
  }
});

test('the template inside the checklist lists the same sections as the guide template', () => {
  const template = read(AUTHORING).split('```markdown\n')[1]?.split('```')[0] ?? '';
  assert.ok(template.startsWith('# <id>\n'));
  assert.deepEqual(sectionsOf(template).map(section => section.title), GUIDE_HEADINGS);
  assert.deepEqual([...template.matchAll(/^- \*\*([^:]+):\*\*/gm)].map(match => match[1]).filter(label => RECIPE_BULLETS.includes(label)), RECIPE_BULLETS);
});

test('the hub, the canonical skill, the README and the contributor guide point to the checklist', () => {
  assert.match(read('instructions/STYLES.md'), /\]\(STYLE-AUTHORING\.md\)/);
  assert.match(read('.agents/skills/reel-studio/SKILL.md'), /\]\(\.\.\/\.\.\/\.\.\/instructions\/STYLE-AUTHORING\.md\)/);
  assert.match(read('README.md'), /\]\(instructions\/STYLE-AUTHORING\.md\)/);
  assert.match(read('CONTRIBUTING.md'), /\]\(instructions\/STYLE-AUTHORING\.md\)/);
});

test('style documents carry no outside links and no account handles', () => {
  for (const file of ['instructions/STYLES.md', AUTHORING, ...STYLE_METAS.map(meta => `instructions/styles/${meta.id}.md`)]) {
    const text = read(file).replaceAll('https://fonts.gstatic.com/', '');
    assert.doesNotMatch(text, /https?:\/\//, `${file} must not link outside the studio.`);
    // The one neutral placeholder handle of the public examples is allowed; any other handle names an account.
    assert.doesNotMatch(text, /(?<![\w`])@(?!example\.creator(?![A-Za-z0-9_.]))[A-Za-z0-9_.]{3,}/, `${file} must not name an account handle.`);
  }
});
