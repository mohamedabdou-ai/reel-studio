import test from 'node:test';
import assert from 'node:assert/strict';
import {runSetup} from '../scripts/lib/studio-setup.mjs';
import {describeSetup} from '../scripts/lib/studio-state.mjs';
import {REASON_HINTS} from '../scripts/lib/setup-failure.mjs';

const step = (id, run) => ({id, key: async () => `${id}-v1`, verify: async () => false, run});
const runOnce = async steps => runSetup({steps, state: {steps: {}}, save: async () => {}, requiredIds: steps.map(item => item.id)});

test('a failed step stores its reason, a short error and any ready hint', async () => {
  const long = `${'x'.repeat(400)}\nsecond line`;
  const state = await runOnce([step('ffmpeg', async () => { throw Object.assign(new Error(long), {reason: 'extract'}); })]);
  assert.deepEqual([state.status, state.reason, state.hint, state.error.length], ['failed', 'extract', null, 300]);
  assert.equal(state.steps.ffmpeg.reason, 'extract');
  const full = await runOnce([step('transcription', async () => { throw Object.assign(new Error('short'), {reason: 'disk-full', hint: 'سطر المساحة'}); })]);
  assert.equal(full.hint, 'سطر المساحة');
});

test('a new run clears the previous reason', async () => {
  const state = {steps: {}, status: 'failed', reason: 'network', hint: 'old', error: 'old'};
  const done = await runSetup({steps: [{id: 'folders', key: async () => 'k', verify: async () => true, run: async () => {}}], state, save: async () => {}, requiredIds: ['folders']});
  assert.deepEqual([done.status, done.reason, done.hint, done.error], ['done', null, null, null]);
});

test('the status line names the step and gives the hint for the reason', () => {
  const failed = {status: 'failed', step: 'packages', steps: {}, error: 'npm-cli.js exited with code 1', reason: 'file-locked', hint: null};
  const {line, json} = describeSetup(failed, {alive: false});
  assert.equal(line, `التجهيز وقف عند «بنزّل مكتبات المونتاج (دي أطول خطوة)»: ${REASON_HINTS['file-locked']}`);
  assert.deepEqual([json.ok, json.reason, json.error, json.next], [false, 'file-locked', 'npm-cli.js exited with code 1', 'node scripts/studio.mjs setup']);
});

test('a failure saved by an older studio keeps its old line', () => {
  const {line, json} = describeSetup({status: 'failed', step: 'ffmpeg', steps: {}, error: 'install-ffmpeg.mjs exited with code 1'}, {alive: false});
  assert.equal(line, 'التجهيز وقف عند «بنزّل FFmpeg»: install-ffmpeg.mjs exited with code 1. شغّل setup تاني وهيكمّل من مكانه.');
  assert.equal(json.reason, null);
});
