import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PARITY_FILE, captureMagazineParity} from './helpers/magazine-parity.mjs';

test('the 14 approved magazine designs keep their markup in their approved layouts', async () => {
  const recorded = JSON.parse(await readFile(PARITY_FILE, 'utf8'));
  const current = await captureMagazineParity();
  assert.deepEqual(Object.keys(current).sort(), Object.keys(recorded.hashes).sort());
  for (const [key, hash] of Object.entries(recorded.hashes)) assert.equal(current[key], hash, `markup changed: ${key}`);
});
