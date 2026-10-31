// tests/compose-schema.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {composeSceneSchema, composeAssets} from '../engine/src/creative-kit/compose/schema.ts';
import * as composeModule from '../engine/src/creative-kit/compose/schema.ts';
import {validateComposeTiming, resolveComposeAt} from '../engine/src/creative-kit/compose/timing.ts';
import {validateComposeBudget} from '../engine/src/creative-kit/compose/budget.ts';
import {composeClipValues} from '../engine/src/creative-kit/compose/media.ts';
import {editManifestSchema} from '../engine/src/prepared-edit/schema.ts';
import {sceneClipClaims, sceneMovingSources} from '../engine/src/core/scene-media.ts';
import {STYLE_IDS, familySupported} from '../engine/src/styles/registry.ts';
import {BEAT_FAMILIES, validateEditorBrief} from '../scripts/lib/editor-director.mjs';
import {verifyKineticAssets} from '../scripts/lib/prepared-props.mjs';
import {familyDataSchema, fieldsForFamily, fieldLabel} from '../engine/src/review-editor/panels/form-schema.ts';

const page = (parts, extra = {}) => ({id: 'p1', family: 'compose', fromFrame: 300, durationInFrames: 150, layout: 'takeover', motion: 'land',
  data: {arrangement: 'stack', parts, ...extra}});
const words = [{sourceIndex: 10, fromFrame: 310, toFrame: 320}, {sourceIndex: 11, fromFrame: 330, toFrame: 345}, {sourceIndex: 40, fromFrame: 900, toFrame: 910}];

test('a valid hero page parses', () => {
  const scene = page([
    {id: 'k', kind: 'kicker', at: {frame: 0}, text: 'بالأرقام'},
    {id: 'n', kind: 'number', at: {word: 11, dt: 0.1}, value: 40000, label: 'في ٣ شهور', emphasis: true},
  ], {arrangement: 'hero'});
  assert.equal(composeSceneSchema.safeParse(scene).success, true);
});

test('hero needs exactly one emphasised part; two are refused anywhere', () => {
  assert.equal(composeSceneSchema.safeParse(page([{id: 'a', kind: 'headline', at: {frame: 0}, text: 'عنوان'}], {arrangement: 'hero'})).success, false);
  const two = page([{id: 'a', kind: 'headline', at: {frame: 0}, text: 'أ', emphasis: true}, {id: 'b', kind: 'body', at: {frame: 5}, text: 'ب', emphasis: true}]);
  assert.equal(composeSceneSchema.safeParse(two).success, false);
});

test('part ids are unique and at most six parts', () => {
  const dup = page([{id: 'a', kind: 'headline', at: {frame: 0}, text: 'أ'}, {id: 'a', kind: 'body', at: {frame: 5}, text: 'ب'}]);
  assert.equal(composeSceneSchema.safeParse(dup).success, false);
  const seven = page(Array.from({length: 7}, (_, i) => ({id: `p${i}`, kind: 'line', at: {frame: i}, text: 'سطر'})));
  assert.equal(composeSceneSchema.safeParse(seven).success, false);
});

test('two-column needs 2 or 4 body parts; grid holds only cards, numbers, rings or marks', () => {
  const head = [{id: 'h', kind: 'headline', at: {frame: 0}, text: 'قبل وبعد'}];
  const cols = page([...head, {id: 'a', kind: 'card', at: {frame: 10}, title: 'قبل'}, {id: 'b', kind: 'card', at: {frame: 20}, title: 'بعد'}], {arrangement: 'two-column'});
  assert.equal(composeSceneSchema.safeParse(cols).success, true);
  const grid = page([...head, {id: 'a', kind: 'card', at: {frame: 10}, title: 'أ'}, {id: 'b', kind: 'body', at: {frame: 20}, text: 'ب'}], {arrangement: 'grid'});
  assert.equal(composeSceneSchema.safeParse(grid).success, false);
});

test('word anchors resolve inside the scene and are checked once words exist', () => {
  const scene = composeSceneSchema.parse(page([
    {id: 'a', kind: 'headline', at: {word: 10}, text: 'أ'},
    {id: 'b', kind: 'body', at: {word: 40}, text: 'ب'},
  ]));
  assert.equal(resolveComposeAt({word: 10}, scene, words, 30), 10);
  assert.equal(resolveComposeAt({word: 10, dt: 0.5}, scene, words, 30), 25);
  assert.equal(resolveComposeAt({word: 40}, scene, words, 30), null);
  assert.deepEqual(validateComposeTiming(scene, 30, null), []);
  assert.match(validateComposeTiming(scene, 30, words).join('\n'), /word 40, which is not inside this scene/);
});

test('parts must be in time order and leave a one-second hold', () => {
  const order = composeSceneSchema.parse(page([{id: 'a', kind: 'headline', at: {frame: 40}, text: 'أ'}, {id: 'b', kind: 'body', at: {frame: 10}, text: 'ب'}]));
  assert.match(validateComposeTiming(order, 30, []).join('\n'), /appears before the part above it/);
  const late = composeSceneSchema.parse(page([{id: 'a', kind: 'headline', at: {frame: 130}, text: 'أ'}]));
  assert.match(validateComposeTiming(late, 30, []).join('\n'), /must finish 30 frames before the scene ends/);
});

test('the budget refuses a page that cannot fit and names the part to drop', () => {
  const long = 'كلام طويل جدا '.repeat(11).trim();
  const scene = composeSceneSchema.parse({...page([
    {id: 'h', kind: 'headline', at: {frame: 0}, text: long.slice(0, 100)},
    {id: 'b1', kind: 'body', at: {frame: 5}, text: long.slice(0, 160)},
    {id: 'b2', kind: 'body', at: {frame: 10}, text: long.slice(0, 160)},
    {id: 'q', kind: 'quote', at: {frame: 15}, text: long.slice(0, 180), speaker: 'ضيف'},
  ]), layout: 'split'});
  const issues = validateComposeBudget(scene, 'magazine-interview');
  assert.equal(issues.length, 1);
  assert.match(issues[0], /drop or shorten part (q|b1|b2|h)/);
  assert.deepEqual(validateComposeBudget(scene, 'section-deck'), ['p1: style section-deck has no design system for composed pages']);
});

test('clip values are found for the plate list and the clip claims', () => {
  const clip = {src: 'projects/demo/clip.mp4', sha256: 'a'.repeat(64), width: 1920, height: 1080, trimBeforeFrame: 0, fit: 'cover'};
  assert.deepEqual(composeClipValues({data: {parts: [{kind: 'media', source: {kind: 'clip', clip}}]}}), [clip]);
});

test('the pilot compare page fits split at the plate shrink floor', () => {
  const scene = composeSceneSchema.parse({...page([
    {id: 'k', kind: 'kicker', at: {frame: 0}, text: 'قبل وبعد'},
    {id: 'h', kind: 'headline', at: {frame: 4}, text: 'نفس الشاشة بعد الترتيب'},
    {id: 'm', kind: 'media', at: {frame: 16}, source: {kind: 'compare', revealFrames: 50,
      before: {src: 'projects/pilot/before.png', width: 960, height: 540, label: 'قبل'},
      after: {src: 'projects/pilot/after.png', width: 960, height: 540, label: 'بعد'}}, caption: 'صور توضيحية للمعاينة'},
  ], {section: 'قبل وبعد'}), layout: 'split'});
  assert.deepEqual(validateComposeBudget(scene, 'magazine-interview'), []);
});

test('the pilot four-cell grid refuses split and names a part', () => {
  const scene = composeSceneSchema.parse({...page([
    {id: 'h', kind: 'headline', at: {frame: 0}, text: 'الأداة دي تستاهل؟'},
    {id: 'n', kind: 'number', at: {frame: 12}, value: 9, suffix: '/10', label: 'السهولة'},
    {id: 'r', kind: 'ring', at: {frame: 20}, value: 72, max: 100, label: 'نسبة الإكمال'},
    {id: 'm', kind: 'marks', at: {frame: 30}, mark: 'check', label: 'تنفع للمبتدئين'},
    {id: 's', kind: 'card', at: {frame: 40}, variant: 'stamp', title: 'تستاهل', pressFrame: 52},
  ], {section: 'الحكم', arrangement: 'grid'}), layout: 'split'});
  const issues = validateComposeBudget(scene, 'magazine-interview');
  assert.equal(issues.length, 1);
  assert.match(issues[0], /drop or shorten part (h|n|r|m|s)\b/);
});

const manifest = scene => ({version: 1, id: 'compose-integration', purpose: 'test', style: 'magazine-interview',
  source: {path: 'Projects/compose-integration/source.mp4', sha256: 'a'.repeat(64), fps: 30, width: 1080, height: 1920, totalFrames: 600},
  segments: [{fromFrame: 0, toFrame: 600}], captions: {status: 'draft', words: [{text: 'عنوان', startMs: 10333, endMs: 10667, confidence: 1}]},
  scenes: [scene], sounds: [], camera: []});

test('compose manifests resolve imported words and reject missing anchors and late motion', () => {
  const scene = page([{id: 'h', kind: 'headline', at: {word: 0}, text: 'عنوان'}]);
  const valid = editManifestSchema.safeParse(manifest(scene));
  assert.equal(valid.success, true, valid.error?.message);
  const missing = editManifestSchema.safeParse(manifest(page([{id: 'h', kind: 'headline', at: {word: 9}, text: 'عنوان'}])));
  assert.equal(missing.success, false);
  assert.match(missing.error.message, /word 9, which is not inside this scene/);
  const late = editManifestSchema.safeParse(manifest(page([{id: 'h', kind: 'headline', at: {frame: 130}, text: 'عنوان'}])));
  assert.equal(late.success, false);
  assert.match(late.error.message, /must finish 30 frames before the scene ends/);
});

test('only magazine-interview accepts compose in the registry and manifest', () => {
  const scene = page([{id: 'h', kind: 'headline', at: {frame: 0}, text: 'عنوان'}]);
  for (const style of STYLE_IDS) {
    assert.equal(familySupported(style, 'compose'), style === 'magazine-interview', style);
    assert.equal(editManifestSchema.safeParse({...manifest(scene), style}).success, style === 'magazine-interview', style);
  }
});

test('compose clip sources and claims include the parsed clip defaults', () => {
  const clip = {src: 'projects/demo/clip.mp4', sha256: 'a'.repeat(64), width: 1920, height: 1080};
  const scene = composeSceneSchema.parse(page([{id: 'm', kind: 'media', at: {frame: 12}, source: {kind: 'clip', clip}}]));
  assert.deepEqual(sceneMovingSources(scene), {foreground: [], captures: [clip.src]});
  assert.deepEqual(sceneClipClaims(scene), [{sceneId: 'p1', ...clip, trimBeforeFrame: 0, frames: 150}]);
});

test('the brief accepts compose intent with its authored part data', () => {
  assert.equal(BEAT_FAMILIES.compose, 'compose');
  const brief = validateEditorBrief({version: 1, id: 'compose-brief', style: 'magazine-interview',
    source: 'Projects/compose-brief/source.mp4', transcript: 'Projects/compose-brief/words.json',
    creator: {displayName: 'Test', handle: null, ending: {cta: null, followCard: false, signOff: null}}, purpose: 'explainer', tone: 'calm',
    beats: [{id: 'page', fromSec: 0, toSec: 5, intent: 'compose', data: {arrangement: 'stack', parts: [{id: 'h', kind: 'headline', at: {frame: 0}, text: 'عنوان'}]}}]});
  assert.equal(brief.beats[0].intent, 'compose');
});

test('compose screen image blocks must be verified during preparation', async () => {
  const scene = composeSceneSchema.parse(page([{id: 's', kind: 'screen', at: {frame: 0}, page: 'web', blocks: [
    {kind: 'image', src: 'projects/compose-missing-screen-block/no-such-image.png'},
  ]}]));
  await assert.rejects(() => verifyKineticAssets(manifest(scene)), /Required input is missing: .*compose-missing-screen-block/);
});

test('compose forms expose every part with Arabic labels', () => {
  assert.ok(familyDataSchema('compose'));
  const walk = fields => fields.flatMap(field => [field.key, ...walk(field.fields ?? []), ...walk(field.item ? [field.item] : []), ...(field.variants ?? []).flatMap(value => walk(value.field ? [value.field] : [value]))]);
  const fields = fieldsForFamily('compose');
  assert.ok(fields.length > 0);
  const keys = new Set(walk(fields).filter(Boolean));
  assert.ok(keys.has('revealFrames') && keys.has('offsetFrames') && keys.has('sha256'));
  for (const key of [...keys].filter(key => !['x', 'y'].includes(key))) assert.notEqual(fieldLabel(key), key, `compose.${key} needs an Arabic label`);
});

test('the comment author field has its approved Arabic label',()=>{
  assert.equal(fieldLabel('author'),'اسم صاحب الرسالة');
});

test('a number label at frame 60 cannot consume the final reading hold', () => {
  const scene = composeSceneSchema.parse(page([{id: 'n', kind: 'number', at: {frame: 60}, value: 40, label: 'نتيجة'}]));
  assert.match(validateComposeTiming(scene, 30, []).join('\n'), /part n must finish 30 frames before the scene ends/);
});

test('card pressFrame is absolute, including a resolved word anchor', () => {
  const card = {id: 'c', kind: 'card', variant: 'follow', title: '@sample', pressFrame: 110};
  const valid = composeSceneSchema.parse(page([{...card, at: {frame: 80}, pressFrame: 100}]));
  assert.deepEqual(validateComposeTiming(valid, 30, []), []);
  const late = composeSceneSchema.parse(page([{...card, at: {word: 10}}]));
  assert.match(validateComposeTiming(late, 30, words).join('\n'), /part c must finish 30 frames before the scene ends/);
});

test('an input card accepts the explicitly allowed idle caret during the reading hold', () => {
  const scene = composeSceneSchema.parse(page([{id: 'c', kind: 'card', variant: 'input', at: {frame: 0}, title: 'Input'}]));
  assert.deepEqual(validateComposeTiming(scene, 30, []), []);
});

test('composeAssets owns nested screen images as well as media and step images', () => {
  const scene = composeSceneSchema.parse(page([{id: 's', kind: 'screen', at: {frame: 0}, page: 'web', blocks: [
    {kind: 'image', src: 'projects/demo/screen.png'}, {kind: 'text', text: 'Text'},
  ]}]));
  assert.deepEqual(composeAssets(scene), ['projects/demo/screen.png']);
});

test('composePaper makes only explicitly authored cream pages cream', () => {
  const data = {arrangement: 'stack', parts: [{id: 'h', kind: 'headline', at: {frame: 0}, text: 'Headline'}]};
  assert.equal(composeModule.composePaper(data), 'navy');
  for (const paper of ['auto', 'navy', 'cream']) assert.equal(composeModule.composePaper({...data, paper}), paper === 'cream' ? 'cream' : 'navy');
});

test('ticket values settle independently of their unused pressFrame', () => {
  const scene = composeSceneSchema.parse(page([{id: 't', kind: 'card', variant: 'ticket', title: 'Ticket', value: '42', at: {frame: 80}, pressFrame: 140}]));
  assert.deepEqual(validateComposeTiming(scene, 30, []), []);
});

test('a short takeover must leave the furniture its own settling time', () => {
  const scene = composeSceneSchema.parse({...page([{id: 'r', kind: 'rule', at: {frame: 0}}]), durationInFrames: 60});
  assert.match(validateComposeTiming(scene, 30, []).join('\n'), /page furniture must finish 30 frames before the scene ends/);
  assert.deepEqual(validateComposeTiming({...scene, layout: 'split'}, 30, []), []);
});
test('chat accepts a bounded optional author', () => {
  const data={arrangement:'stack',parts:[{id:'c',kind:'chat',at:{frame:0},messages:[{from:'them',author:'Guest',text:'Comment',offsetFrames:0}]}]};
  assert.equal(composeSceneSchema.safeParse({id:'s',family:'compose',fromFrame:0,durationInFrames:180,layout:'split',motion:'land',data}).success,true);
  data.parts[0].messages[0].author='x'.repeat(29);
  assert.equal(composeSceneSchema.safeParse({id:'s',family:'compose',fromFrame:0,durationInFrames:180,layout:'split',motion:'land',data}).success,false);
});
