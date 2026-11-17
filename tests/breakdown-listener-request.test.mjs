import test from 'node:test';
import assert from 'node:assert/strict';
import {loadListenerConfig, LISTENER_SCHEMA, buildListenerPrompt, buildGenerateBody, estimateListenerCost, validateHeard} from '../scripts/lib/breakdown-listener-request.mjs';

const b = {durationSec: 14.6, sound: {sfx: [{id: 'X01', t: 3.25, type: 'pop'}, {id: 'X02', t: 6.75, type: 'impact'}]},
  text: [{id: 'T01', start: 0.5, end: 3, text: 'سر النجاح', kind: 'caption'}, {id: 'T02', start: 1, end: 2, text: 'EXIT', kind: 'scene-text'}]};
const good = () => ({sfx: [{id: 'X01', heard: true, type: 'pop'}, {id: 'X02', heard: false, type: 'none'}], extraSfx: [{t: 9.31, type: 'ding'}],
  text: [{id: 'T01', font: 'kufi', weight: 'bold'}], music: {present: true, character: 'soft piano bed', characterAr: 'بيانو هادي', bpm: 120},
  voice: {present: false, character: 'none', characterAr: 'مفيش'}});

test('config pins a stable Gemini model and the data-use note', () => {
  const c = loadListenerConfig();
  assert.equal(c.provider, 'gemini');
  assert.match(c.model, /^gemini-[0-9.]+-flash$/);
  assert.match(c.dataUse, /free-tier/);
});

test('prompt lists measured candidates and leaves scene text out', () => {
  const p = buildListenerPrompt(b);
  assert.match(p, /"id":"X01","t":3.3/);
  assert.match(p, /سر النجاح/);
  assert.doesNotMatch(p, /EXIT/);
});

test('request body sends the file by uri with fps and the JSON schema', () => {
  const body = buildGenerateBody({fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', mimeType: 'video/mp4', prompt: 'p', config: loadListenerConfig()});
  assert.deepEqual(body.contents[0].parts[0], {fileData: {mimeType: 'video/mp4', fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc'}, videoMetadata: {fps: 2}});
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseJsonSchema, LISTENER_SCHEMA);
  assert.equal(body.generationConfig.temperature, 0);
});

test('cost estimate for 60 s follows the token rates and the price switch date', () => {
  const c = loadListenerConfig();
  const now = estimateListenerCost(60, c, new Date('2026-11-16T00:00:00Z'));
  assert.equal(now.inputTokens, 35380);
  assert.equal(now.usdTypical, 0.0378);
  assert.equal(now.usdMax, 0.0573);
  assert.ok(estimateListenerCost(60, c, new Date('2027-01-02T00:00:00Z')).usdMax > now.usdMax);
});

test('validation keeps known ids, maps not-heard to null type and ignores unknown ids', () => {
  const raw = good();
  raw.sfx.push({id: 'X99', heard: true, type: 'pop'});
  const v = validateHeard(raw, b);
  assert.deepEqual(v.sfx, [{id: 'X01', heard: true, type: 'pop'}, {id: 'X02', heard: false, type: null}]);
  assert.deepEqual(v.extraSfx, [{t: 9.31, type: 'ding'}]);
  assert.deepEqual(v.ignoredIds, ['X99']);
  assert.equal(v.music.bpm, 120);
});

test('validation rejects bad shapes and drops an out-of-range tempo', () => {
  assert.throws(() => validateHeard({...good(), sfx: [{id: 'X01', heard: 'yes', type: 'pop'}]}, b), e => e.code === 'invalid-response');
  assert.throws(() => validateHeard({...good(), text: [{id: 'T01', font: 'comic', weight: 'bold'}]}, b), /text entry/);
  assert.equal(validateHeard({...good(), music: {...good().music, bpm: 900}}, b).music.bpm, null);
});


test('unknown and repeated IDs are tracked; scene text cannot receive font guesses', () => {
  const raw = good(); raw.sfx.push({...raw.sfx[0]}); raw.text.push({id: 'T02', font: 'sans', weight: 'regular'});
  const got = validateHeard(raw, b);
  assert.deepEqual(got.ignoredIds, ['X01', 'T02']);
  assert.equal(got.sfx.length, 2); assert.equal(got.text.length, 1);
});


test('candidate types do not leak into the listener prompt or influence an independent label', () => {
  const other = structuredClone(b);
  for (const x of other.sound.sfx) x.type = 'riser';
  assert.equal(buildListenerPrompt(b), buildListenerPrompt(other));
  assert.doesNotMatch(buildListenerPrompt(b), /measuredType|"type"/u);
});
