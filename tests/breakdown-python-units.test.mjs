// tests/breakdown-python-units.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {breakdownPaths, breakdownEnvironment, inspectBreakdownRuntime, runtimeTestSkip} from '../scripts/lib/breakdown-runtime.mjs';

const exec = promisify(execFile);
const readiness = await inspectBreakdownRuntime();
const skip = runtimeTestSkip(readiness);

test('breakdown Python unit tests pass', {skip, timeout: 600000}, async () => {
  const {python, packageRoot} = breakdownPaths();
  const {stderr} = await exec(python, ['-m', 'unittest', 'discover', '-s', path.join(packageRoot, 'breakdown', 'tests'), '-t', packageRoot],
    {cwd: ROOT, env: breakdownEnvironment(), windowsHide: true, maxBuffer: 16 * 1024 * 1024});
  assert.match(stderr, /OK/u);
});
