import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFreeSpace, freeSpace, spaceNeeded} from '../scripts/lib/setup-space.mjs';

const disk = (freeBytes, bsize) => ({statfs: async () => ({bavail: Math.floor(freeBytes / bsize), bsize})});

test('the need counts one cluster per file plus a tenth more', () => {
  assert.equal(spaceNeeded({bytes: 900_000_000, files: 28_000}, 4096), Math.ceil((900_000_000 + 28_000 * 4096) * 1.1));
  assert.ok(spaceNeeded({bytes: 900_000_000, files: 28_000}, 1024 * 1024) > 30e9, 'exFAT 1 MB clusters need over 30 GB for the packages');
});

test('enough space passes and a missing need is not checked', async () => {
  await assertFreeSpace('D:/x', {bytes: 1e9, files: 10}, disk(5e9, 4096));
  await assertFreeSpace('D:/x', undefined, {statfs: async () => assert.fail('not called')});
});

test('short space fails before the step with the amount in the line', async () => {
  await assert.rejects(assertFreeSpace('D:/x', {bytes: 1.6e9, files: 30}, disk(0.5e9, 4096)), error => {
    assert.equal(error.reason, 'disk-full');
    assert.equal(error.code, 'ENOSPC');
    assert.equal(error.hint, error.message);
    assert.match(error.message, /^المساحة الفاضية على القرص .+ جيجا، والخطوة دي محتاجة حوالي .+ جيجا\./);
    return true;
  });
});

test('a volume whose free space cannot be read is not blocked', async () => {
  assert.equal(await freeSpace('\\\\server\\share', {statfs: async () => { throw Object.assign(new Error('no'), {code: 'ENOSYS'}); }}), null);
  await assertFreeSpace('\\\\server\\share', {bytes: 1e12, files: 1}, {statfs: async () => { throw new Error('no'); }});
});
