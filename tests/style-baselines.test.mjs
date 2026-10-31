import test from 'node:test';
import {v4Baseline} from './helpers/v4-baseline.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BASELINE_FILE, BASELINE_SECTIONS, captureStyleBaselines} from '../scripts/capture-style-baselines.mjs';

// The fixture was captured from the hand-written style lists before they moved into
// engine/src/styles/. Everything below recomputes it from the code as it is now.
// One deliberate exception (2026-10-18): the palettes, resolvedPalettes and soundPlans sections were
// re-recorded when the sound policy replaced the sweep recipes with soft landings (instructions/SOUND.md).
// A second one (2026-10-28): kinetic:outcome and kinetic:checklist markup was re-recorded
// for Arabic row order and isolated text directions. See tests/outcome-direction.test.mjs
// and tests/checklist-direction.test.mjs.
// 2026-10-28: section-deck theme, takeover geometry and affected markup keys were re-recorded
// for the fixed chapter-deck designs, including gallery dispatch (2026-10-28).
// Other styles retain their historical captures.
// V4 gate: re-record only rebuilt styles and existing markup keys; all other sections stay intact.
// See state/v4-gate-baseline-changes.json for each old/new hash.
// 2026-10-28: section-deck kinetic:checklist/count/statement markup was re-recorded
// for English labels, direction and display type; Arabic pilot markup stays identical.
// 2026-10-28: five approved V4 style ports re-record only their existing keys; see state/v4-five-styles-baseline-changes.json.
// 2026-10-31: magazine-interview migrations: state/magazine-system-baseline-changes.json, state/magazine-system-baseline-changes-task12.json, state/magazine-system-baseline-changes-d2.json, state/magazine-system-baseline-changes-d3.json, state/magazine-system-baseline-changes-d4.json, state/magazine-system-baseline-changes-task16.json, state/magazine-system-baseline-changes-task20.json, state/magazine-system-baseline-changes-task21.json.
const fixture = v4Baseline(JSON.parse(await readFile(BASELINE_FILE, 'utf8')));
// The recorded example files are passed back, so an example added to instructions/examples later changes nothing.
const recordedExamples = Object.keys(fixture.parses).filter((key) => key.startsWith('example:')).map((key) => key.slice('example:'.length));
const actual = historicalSnapshot(await captureStyleBaselines({styles: fixture.styles, examples: recordedExamples}), fixture);

// This is a migration record of its original cases. Later concepts have their own integration
// tests; adding one must not expand the frozen historical snapshot. Keep whole recorded values
// and every recorded key so changed or missing originals still fail the comparison below.
function historicalSnapshot(snapshot, recorded) {
  const recordedEntries = (values, entries) => Object.fromEntries(Object.keys(entries).map(key => [key, values?.[key]]));
  return {...snapshot,
    markup: Object.fromEntries(Object.entries(recorded.markup).map(([style, entries]) => [style, recordedEntries(snapshot.markup?.[style], entries)])),
    parses: recordedEntries(snapshot.parses, recorded.parses),
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Lists the paths whose values differ, so a failure names the style and the scene instead of printing a wall of JSON.
function differences(now, then, at = '') {
  if (now !== null && then !== null && typeof now === 'object' && typeof then === 'object' && Array.isArray(now) === Array.isArray(then)) {
    const keys = [...new Set([...Object.keys(now), ...Object.keys(then)])];
    return keys.flatMap((key) => differences(now[key], then[key], `${at}/${key}`));
  }
  return same(now, then) ? [] : [at || '/'];
}

test('historical comparison allows added concept cases without rewriting the recorded snapshot', () => {
  const recorded = {markup: {original: {'concept:existing': 'original-hash'}}, parses: {'scene:concept:existing': {ok: true, sha256: 'original-parse'}}};
  const expanded = {markup: {original: {...recorded.markup.original, 'concept:added': 'new-hash'}}, parses: {...recorded.parses, 'scene:concept:added': {ok: true, sha256: 'new-parse'}}};
  assert.deepEqual(historicalSnapshot(expanded, recorded), recorded);
  assert.ok(Object.hasOwn(expanded.markup.original, 'concept:added'), 'Projection must leave the current capture intact');
});

test('historical comparison still detects changed or missing original markup and parses', () => {
  const recorded = {markup: {original: {'concept:existing': 'original-hash'}}, parses: {'scene:concept:existing': {ok: true, sha256: 'original-parse'}}};
  for (const changed of [
    {...recorded, markup: {original: {'concept:existing': 'changed-hash'}}},
    {...recorded, markup: {original: {}}},
    {...recorded, parses: {'scene:concept:existing': {ok: false, sha256: 'changed-parse'}}},
    {...recorded, parses: {}},
  ]) assert.ok(differences(historicalSnapshot(changed, recorded), recorded).length > 0);
});

test('the fixture records the six surviving historical styles and every section', () => {
  assert.equal(fixture.version, 1);
  assert.equal(fixture.styles.length, 6);
  assert.deepEqual(Object.keys(fixture).sort(), ['styles', 'version', ...BASELINE_SECTIONS].sort());
  assert.deepEqual(Object.keys(fixture.markup), fixture.styles);
  for (const style of fixture.styles) assert.ok(Object.keys(fixture.markup[style]).length >= 50, `${style} must cover every scene family and concept`);
  const sceneParses = Object.entries(fixture.parses).filter(([key]) => key.startsWith('scene:'));
  assert.ok(sceneParses.length >= 40, 'the parse record must cover every template and demo scene');
  assert.deepEqual(sceneParses.filter(([, parse]) => !parse.ok).map(([key]) => key), [], 'every template and demo scene must parse when it is recorded');
  assert.ok(recordedExamples.length >= 2, 'the parse record must cover every shipped example');
});

for (const section of BASELINE_SECTIONS) {
  test(`${section} is identical to the pre-migration record`, () => {
    assert.deepEqual(differences(actual[section], fixture[section]).slice(0, 25), [],
      `${section} changed. A migration step must not change a style's behaviour.`);
    assert.deepEqual(actual[section], fixture[section]);
  });
}
