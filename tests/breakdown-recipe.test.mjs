import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {meta, listReel} from './fixtures/breakdown-list-reel.mjs';
import {loadRecipeCatalog, loadSoundBands, validateRecipeCatalog, recipeFeatures, scoreStyles, matchFamilies, captionLook, soundRecipe, buildRecipe, renderRecipeMarkdown} from '../scripts/lib/breakdown-recipe.mjs';

test('the shipped catalogue is valid and names only real scene families', async () => {
  const catalog = loadRecipeCatalog();
  validateRecipeCatalog(catalog);
  const guides = (await Promise.all(['instructions/MOTION-CHOICES.md', 'instructions/STYLES.md'].map(f => fsp.readFile(path.join(ROOT, f), 'utf8')))).join('\n');
  for (const rule of catalog.families) for (const family of rule.families) assert.ok(guides.includes(`\`${family.id}\``), family.id);
  for (const style of catalog.styles) assert.ok(guides.includes(`\`${style.id}\``), style.id);
  assert.throws(() => validateRecipeCatalog({...catalog, styles: [{...catalog.styles[0], prefers: {ground: ['purple']}}]}), /ground/);
});

test('features describe a faceless list reel with a framed panel', () => {
  const f = recipeFeatures(listReel());
  assert.equal(f.presenter, 'none');
  assert.equal(f.ground, 'light');
  assert.equal(f.framed, 'yes');
  assert.equal(f.list, 'yes');
  assert.equal(f.pace, 'fast');
  assert.equal(f.text, 'high');
  assert.equal(f.ending, 'yes');
  assert.equal(f.beatSync, 'no');
  assert.equal(f.measures.regionChanges, 10);
  assert.equal(f.measures.highlightSteps, 9);
  const unknown = recipeFeatures({...listReel(), presenter: null, look: null});
  assert.equal(unknown.presenter, 'unknown');
  assert.equal(unknown.ground, 'unknown');
});

test('the list reel is nearest to grid-glide and a talking head to layered-speaker', () => {
  const catalog = loadRecipeCatalog();
  const ranked = scoreStyles(recipeFeatures(listReel()), catalog.styles);
  assert.equal(ranked[0].id, 'grid-glide');
  assert.ok(ranked[0].matched.includes('framed'));
  assert.ok(ranked[0].missed.includes('pace'));
  const head = {presenter: 'most', ground: 'unknown', pace: 'slow', text: 'low', captions: 'yes', framed: 'no', list: 'no', look: 'natural', ending: 'no', punches: 'no', beatSync: 'unknown'};
  assert.equal(scoreStyles(head, catalog.styles)[0].id, 'layered-speaker');
});

test('families follow the measured structure', () => {
  const ids = matchFamilies(recipeFeatures(listReel()), loadRecipeCatalog().families).map(r => r.id);
  assert.deepEqual(ids, ['framed-capture', 'countable-list', 'headline-moments', 'comment-ending']);
});

test('caption look maps backing, outline, highlight and grouping to studio settings', () => {
  const cap = (id, style, text = 'one two three') => ({id, text, start: 0, end: 1, zone: 'bottom', sizePct: 0.04, kind: 'caption', style, ...meta});
  assert.deepEqual(captionLook(listReel()), {present: false, status: 'confirmed', evidence: []});
  const karaoke = captionLook({text: [cap('T01', {fill: '#fff', box: '#000000', highlight: '#ff0'}), cap('T02', {fill: '#fff', box: '#000000', highlight: '#ff0'})]});
  assert.equal(karaoke.presentation, 'pill');
  assert.equal(karaoke.skin, 'karaoke');
  assert.equal(karaoke.grouping, 'compact');
  assert.equal(captionLook({text: [cap('T01', {fill: '#fff', stroke: '#000'}, 'one')]}).skin, 'bold-outline');
  assert.equal(captionLook({text: [cap('T01', {fill: '#fff', stroke: '#000'}, 'one')]}).grouping, 'single');
  assert.equal(captionLook({text: [cap('T01', {fill: '#000', box: '#f4efe4'}, 'a b c d e f g')]}).skin, 'paper-tag');
  const plain = captionLook({text: [cap('T01', {fill: '#ffffff'}, 'a b c d e f g')]});
  assert.equal(plain.presentation, 'minimal');
  assert.equal(plain.skin, 'soft-shadow');
  assert.equal(plain.grouping, 'clauses');
});

test('sound picks a band, an --under start and counts sweeps', () => {
  const bands = loadSoundBands(), styleIds = new Set(loadRecipeCatalog().styles.map(s => s.id));
  const b = listReel();
  const glide = soundRecipe(b, bands, 'grid-glide', styleIds);
  assert.deepEqual(glide.band, {keys: ['grid-glide'], range: [13, 22], inside: false});
  const tone = soundRecipe({...b, sound: {...b.sound, hitsPerMinute: 40}}, bands, 'section-deck', styleIds);
  assert.deepEqual(tone.band.keys, ['calm', 'editorial']);
  assert.equal(tone.under.value, 9);
  const sparse = soundRecipe({...b, sound: {...b.sound, hitsPerMinute: 40, bed: {present: false, ...meta}}}, bands, 'section-deck', styleIds);
  assert.equal(sparse.under.value, 7);
  const dense = soundRecipe({...b, sound: {...b.sound, hitsPerMinute: 62, bed: {present: false, ...meta}, sfx: [{id: 'X01', t: 1, type: 'whoosh', ...meta}]}}, bands, 'section-deck', styleIds);
  assert.deepEqual(dense.band.keys, ['energetic']);
  assert.equal(dense.under.value, 9);
  assert.equal(dense.sweeps, 1);
  assert.deepEqual(soundRecipe({...b, sound: {hasAudio: false}}, bands, 'grid-glide', styleIds), {measured: false, reason: 'no-audio'});
});

test('buildRecipe and its layer are suggestions with a fixed shape', () => {
  const recipe = buildRecipe(listReel());
  assert.equal(recipe.schema, 1);
  assert.equal(recipe.basis, 'inferred');
  assert.equal(recipe.style.nearest.id, 'grid-glide');
  assert.equal(recipe.style.alternatives.length, 2);
  assert.equal(recipe.presenter.share, 0);
  const md = renderRecipeMarkdown(recipe);
  assert.match(md, /^# Studio recipe/m);
  assert.match(md, /never decisions/);
  assert.match(md, /`grid-glide`/);
  assert.match(md, /--under` 9/);
  assert.doesNotMatch(md, /Header line|Comment for the prompts/);
});
