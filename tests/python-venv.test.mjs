// tests/python-venv.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {runLogged, pythonCandidates, bootstrapVenv, acquireFileLease} from '../scripts/lib/python-venv.mjs';

test('python candidates prefer an explicit executable, then python and py -3 on Windows', () => {
  assert.deepEqual(pythonCandidates('C:/Py/python.exe', 'win32'), [{command: 'C:/Py/python.exe', args: []}]);
  assert.deepEqual(pythonCandidates(undefined, 'win32'), [{command: 'python', args: []}, {command: 'py', args: ['-3']}]);
  assert.deepEqual(pythonCandidates(undefined, 'linux'), [{command: 'python3', args: []}]);
});

test('runLogged writes combined output and names the label on failure', async t => {
  const dir = await fs.mkdtemp(path.join(PROJECT_TMP, 'pyvenv-'));
  t.after(() => fs.rm(dir, {recursive: true, force: true}));
  const ok = await runLogged(process.execPath, ['-e', 'console.log("hello")'], {logFile: path.join(dir, 'ok.log')});
  assert.match(await fs.readFile(ok.logFile, 'utf8'), /hello/u);
  await assert.rejects(
    runLogged(process.execPath, ['-e', 'process.exit(3)'], {logFile: path.join(dir, 'bad.log'), label: 'Breakdown shots'}),
    /Breakdown shots failed with exit code 3/u,
  );
});

test('bootstrapVenv tries candidates in order until the venv python exists', async t => {
  const dir = await fs.mkdtemp(path.join(PROJECT_TMP, 'pyvenv-'));
  t.after(() => fs.rm(dir, {recursive: true, force: true}));
  const pythonPath = path.join(dir, 'venv', 'Scripts', 'python.exe');
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (command === 'py') { await fs.mkdir(path.dirname(pythonPath), {recursive: true}); await fs.writeFile(pythonPath, ''); return; }
    throw new Error(`${command} missing`);
  };
  await bootstrapVenv({venv: path.join(dir, 'venv'), python: pythonPath, logFile: path.join(dir, 'b.log'), env: {}, run, platform: 'win32'});
  assert.deepEqual(calls.map(c => c[0]), ['python', 'py']);
  assert.deepEqual(calls[1].slice(1), ['-3', '-m', 'venv', path.join(dir, 'venv')]);
});

test('file leases record PID/time and give safe recovery instructions for interrupted owners',async t=>{
 const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'lease-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'operation.lock');
 const release=await acquireFileLease(file);const record=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(record.pid,process.pid);assert.ok(Number.isFinite(Date.parse(record.startedAt)));
 await assert.rejects(()=>acquireFileLease(file),/remove only this lock file and retry/);await release();await release();
 await fs.writeFile(file,JSON.stringify({pid:2147483647,startedAt:'2026-01-01T00:00:00Z'}));await assert.rejects(()=>acquireFileLease(file),/pid=2147483647/);assert.ok((await fs.stat(file)).isFile());
});
