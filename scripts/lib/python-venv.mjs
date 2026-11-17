// scripts/lib/python-venv.mjs
import './project-tmp.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {assertProjectOutput} from './project-paths.mjs';

export async function runLogged(command, args, {logFile, cwd, env = process.env, label = 'Command', timeout} = {}) {
  const log = assertProjectOutput(path.resolve(logFile));
  await fsp.mkdir(path.dirname(log), {recursive: true});
  // Stream directly to disk so analyser logs do not grow the Node heap.
  const handle = await fsp.open(log, 'w');
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, {cwd, env, windowsHide: true, timeout, stdio: ['ignore', handle.fd, handle.fd]});
      child.once('error', error => reject(new Error(`${label} failed to start: ${error.message}`, {cause: error})));
      child.once('close', (code, signal) => {
        if (code === 0) resolve({code, signal, logFile: log});
        else reject(new Error(`${label} failed with exit code ${code}${signal ? ` (${signal})` : ''}. Diagnostics: ${log}`));
      });
    });
  } finally { await handle.close(); }
}

export function pythonCandidates(python, platform = process.platform) {
  if (python) return [{command: python, args: []}];
  return platform === 'win32' ? [{command: 'python', args: []}, {command: 'py', args: ['-3']}] : [{command: 'python3', args: []}];
}

export async function bootstrapVenv({venv, python, explicitPython, logFile, env, run = runLogged, platform = process.platform}) {
  assertProjectOutput(venv);
  assertProjectOutput(python);
  if (fs.existsSync(python)) return;
  const failures = [];
  for (const candidate of pythonCandidates(explicitPython, platform)) {
    try {
      await run(candidate.command, [...candidate.args, '-m', 'venv', venv], {logFile, env, label: 'Python venv'});
      if (fs.existsSync(python)) return;
    } catch (error) { failures.push(error.message); }
  }
  throw new Error(`Could not create the dedicated Python runtime. ${failures.join(' | ')}`);
}

export async function acquireFileLease(file, {label='Operation'}={}) {
  const target=assertProjectOutput(path.resolve(file));
  await fsp.mkdir(path.dirname(target),{recursive:true});
  let handle;
  try { handle=await fsp.open(target,'wx'); }
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    throw await fileLeaseError(target,label);
  }
  const token=globalThis.crypto.randomUUID();
  try {await handle.writeFile(JSON.stringify({schema:1,pid:process.pid,startedAt:new Date().toISOString(),token})+'\n','utf8');}
  catch(error){await handle.close();await fsp.rm(target,{force:true});throw error;}
  let released=false;
  return async()=>{
    if(released)return;released=true;await handle.close();
    let owner;try{owner=JSON.parse(await fsp.readFile(target,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}
    if(owner.token!==token)throw new Error(`Lock ownership changed; preserving ${target}`);
    await fsp.rm(assertProjectOutput(target));
  };
}

export async function fileLeaseError(file,label='Operation') {
  const target=assertProjectOutput(path.resolve(file));
    let owner;try{owner=JSON.parse(await fsp.readFile(target,'utf8'));}catch{}
    let state='owner cannot be verified';
    if(Number.isSafeInteger(owner?.pid) && owner.pid>0) {
      try{process.kill(owner.pid,0);state='owner is still running';}
      catch(e){state=e.code==='ESRCH'?'owner is not running':'owner status is unknown';}
    }
    return new Error(`${label} is locked: ${target}; pid=${owner?.pid ?? 'unknown'}, started=${owner?.startedAt ?? 'unknown'} (${state}). After confirming that owner has stopped, remove only this lock file and retry. No lock is removed automatically.`);
}
