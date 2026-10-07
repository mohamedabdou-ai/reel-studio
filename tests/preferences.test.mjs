import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeProfile, profileToBrief} from '../scripts/lib/branding.mjs';
import {defaultPreferences} from '../engine/src/core/preference-options.ts';
import {buildEditorPlan, recommendEditorStyle} from '../scripts/lib/editor-director.mjs';
import {compileEdit} from '../engine/src/prepared-edit/timeline.ts';

const fixture = JSON.parse(await readFile(new URL('../PROFILE.example.json', import.meta.url), 'utf8'));
const legacy = () => {const value = structuredClone(fixture); value.schemaVersion = 2; delete value.preferences; return value;};
const profile = () => ({...legacy(), schemaVersion: 3, preferences: defaultPreferences()});
const words = Array.from({length: 8}, (_, i) => ({text: 'كلمة', startMs: i * 400, endMs: i * 400 + 350, confidence: 1}));
const source = {path: 'Raw/example.mp4', sha256: 'a'.repeat(64), fps: 30, width: 1080, height: 1920, totalFrames: 120};
function brief(p, extra = {}) {
  return {version: 1, id: 'settings-test', source: source.path, transcript: 'Projects/settings-test/words.json',
    ...profileToBrief(p), purpose: 'tutorial', tone: 'calm',
    beats: [{id: 'hook', fromSec: 0, toSec: 3, intent: 'intro', data: {kicker: 'تجربة', title: 'اختياراتك', subtitle: 'شرح بسيط', caption: 'شرح'}}], ...extra};
}

test('schema 2 keeps identity, ending and colours and gains safe defaults', () => {
  const old = legacy(); old.name = 'أحمد'; old.handle = '@ahmed'; old.ending.followCard = true;
  const copy = structuredClone(old);
  const normalized = normalizeProfile(old);
  assert.equal(normalized.schemaVersion, 3);
  for (const key of ['name', 'handle', 'ending', 'brand', 'platforms']) assert.deepEqual(normalized[key], old[key]);
  assert.deepEqual(normalized.preferences.palette, {mode: 'fixed', value: 'brand'});
  assert.deepEqual(old, copy, 'reading must not mutate the original');
});

test('fixed and automatic choices are independent and invalid values are rejected', () => {
  const p = profile();
  p.preferences.style = {mode: 'fixed', value: 'paper-collage'};
  p.preferences.font = {mode: 'fixed', value: 'Tajawal'};
  assert.deepEqual(normalizeProfile(p).preferences, p.preferences);
  for (const invalid of [{mode: 'fixed', value: null}, {mode: 'auto', value: 'Tajawal'}, {mode: 'fixed', value: 'Comic Sans'}, {mode: 'sometimes', value: null}]) {
    const bad = structuredClone(p); bad.preferences.font = invalid;
    assert.throws(() => normalizeProfile(bad));
  }
  assert.throws(() => normalizeProfile({...p, preferences: {...p.preferences, hidden: {mode: 'auto', value: null}}}));
});

test('fixed defaults reach the actual manifest and a one-video override wins', () => {
  const p = profile();
  p.preferences.style = {mode: 'fixed', value: 'paper-collage'};
  p.preferences.font = {mode: 'fixed', value: 'Tajawal'};
  p.preferences.captionsGrouping = {mode: 'fixed', value: 'single'};
  p.preferences.captionsPresentation = {mode: 'fixed', value: 'minimal'};
  p.preferences.writingStyle = {mode: 'fixed', value: 'short'};
  const plan = buildEditorPlan(brief(p), source, words);
  assert.equal(plan.manifest.style, 'paper-collage');
  assert.equal(plan.manifest.fontFamily, 'Tajawal');
  assert.equal(plan.manifest.captions.presentation, 'minimal');
  assert.equal(plan.manifest.writingStyle, 'short');
  assert.equal(compileEdit(plan.manifest).captionGroups.length, 8);
  const override = buildEditorPlan(brief(p, {style: 'split-canvas', fontFamily: 'Cairo', captionsGrouping: 'compact', writingStyle: 'educational'}), source, words);
  assert.equal(override.manifest.style, 'split-canvas');
  assert.equal(override.manifest.fontFamily, 'Cairo');
  assert.equal(override.manifest.writingStyle, 'educational');
  assert.equal(compileEdit(override.manifest).captionGroups.length, 2);
  assert.equal(p.preferences.style.value, 'paper-collage');
});

test('automatic decisions follow video content and remain in the proven automatic style pool', () => {
  const p = profile();
  const tutorial = buildEditorPlan(brief(p), source, words).manifest;
  const comparison = buildEditorPlan(brief(p, {purpose: 'comparison', tone: 'energetic'}), source, words).manifest;
  assert.equal(tutorial.style, 'section-deck');
  assert.equal(tutorial.captions.grouping, 'clauses');
  assert.equal(tutorial.writingStyle, 'educational');
  assert.equal(comparison.style, 'split-canvas');
  assert.equal(comparison.captions.grouping, 'compact');
  assert.equal(comparison.writingStyle, 'short');
  assert.equal(recommendEditorStyle(brief(p)).explicit, false);
  assert.equal(profileToBrief(p).brand, undefined, 'automatic colours use each style palette');
});

test('old briefs and manifests retain previous defaults', () => {
  const b = brief(normalizeProfile(legacy())); delete b.preferences;
  const old = buildEditorPlan(b, source, words).manifest;
  assert.equal(old.fontFamily, undefined);
  assert.equal(old.captions.grouping, undefined);
  assert.equal(old.captions.presentation, undefined);
  assert.equal(old.writingStyle, undefined);
  assert.equal(compileEdit(old).captionGroups.length, 1);
});
