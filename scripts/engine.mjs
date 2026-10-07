import './lib/project-tmp.mjs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ENGINE } from './lib/bundle.mjs';
import { engineCliArgs } from './lib/engine-cli.mjs';

const args = engineCliArgs(process.argv.slice(2));
const child = spawn(process.execPath, [path.join(ENGINE, 'node_modules/@remotion/cli/remotion-cli.js'), ...args], { cwd: ENGINE, stdio: 'inherit', windowsHide: true });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('close', (code) => { process.exitCode = code ?? 1; });
