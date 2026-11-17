import './project-tmp.mjs';
import {runLogged} from './python-venv.mjs';

export async function runAlignmentCommand(command, args, {logFile, cwd, env = process.env} = {}) {
  return await runLogged(command, args, {logFile, cwd, env, label: 'Alignment command'});
}
