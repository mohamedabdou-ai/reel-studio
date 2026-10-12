import './project-tmp.mjs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {assertProjectOutput} from './project-paths.mjs';

export async function runAlignmentCommand(command, args, {logFile, cwd, env = process.env} = {}) {
  const log = assertProjectOutput(path.resolve(logFile));
  await fsp.mkdir(path.dirname(log), {recursive: true});
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, env, windowsHide: true});
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.on('error', async error => {
      await fsp.writeFile(log, Buffer.concat(chunks));
      reject(new Error(`Alignment command failed to start: ${error.message}`));
    });
    child.on('close', async (code, signal) => {
      await fsp.writeFile(log, Buffer.concat(chunks));
      if (code === 0) resolve({code, signal, logFile: log});
      else reject(new Error(`Alignment command failed with exit code ${code}${signal ? ` (${signal})` : ''}. Diagnostics: ${log}`));
    });
  });
}
