import path from 'node:path';
import { ROOT, assertProjectOutput } from './project-paths.mjs';

const ENGINE = path.join(ROOT, 'engine');
export function engineCliArgs(raw) {
  const [command = 'studio', ...options] = raw;
  if (!['studio', 'bundle', 'upgrade', 'versions'].includes(command)) throw new Error('Supported: studio, bundle, upgrade, versions. Use scripts/render.mjs for video outputs.');
  const allowed = { studio: ['port', 'no-open'], bundle: ['out-dir'], upgrade: ['version', 'skip-skills'], versions: [] }[command];
  const values = {};
  for (let i = 0; i < options.length; i++) {
    const match = options[i].match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!match || !allowed.includes(match[1])) throw new Error(`Unsupported ${command} option: ${options[i]}`);
    const [, key, inline] = match;
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate option: --${key}`);
    if (['no-open', 'skip-skills'].includes(key)) {
      if (inline !== undefined) throw new Error(`Unsupported value for --${key}`);
      values[key] = true;
    } else {
      const value = inline ?? options[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing --${key} value`);
      values[key] = value;
    }
  }
  if (command === 'bundle') values['out-dir'] = assertProjectOutput(path.resolve(ENGINE, values['out-dir'] ?? 'build'));
  if (values.port && (!/^\d+$/.test(values.port) || Number(values.port) < 1 || Number(values.port) > 65535)) throw new Error('Invalid --port');
  if (values.version && !/^\d+\.\d+\.\d+$/.test(values.version)) throw new Error('--version requires an exact stable version');
  if (command === 'upgrade') values['skip-skills'] = true;
  return [command, ...Object.entries(values).flatMap(([key, value]) => value === true ? [`--${key}`] : [`--${key}`, String(value)])];
}
