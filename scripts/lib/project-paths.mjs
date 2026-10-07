import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const protectedRoots = new Set(['raw', 'reference', '.git']);


export function assertProjectOutput(value) {
  const target = path.resolve(value);
  const relative = path.relative(ROOT, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`Output must be inside the project: ${target}`);
  }
  if (protectedRoots.has(relative.split(path.sep)[0].toLowerCase())) {
    throw new Error(`Source media and Git metadata are read-only: ${target}`);
  }
  let ancestor = target;
  while (true) {
    try { fs.lstatSync(ancestor); break; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  const real = fs.realpathSync(ancestor);
  const realRelative = path.relative(fs.realpathSync(ROOT), real);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative) || protectedRoots.has(realRelative.split(path.sep)[0].toLowerCase())) {
    throw new Error(`Output resolves outside the project or into read-only source media: ${target}`);
  }
  if (ancestor === target && fs.statSync(target).isFile() && fs.statSync(target).nlink > 1) {
    throw new Error(`Output is a shared hard link; refusing to alter source aliases: ${target}`);
  }
  return target;
}
