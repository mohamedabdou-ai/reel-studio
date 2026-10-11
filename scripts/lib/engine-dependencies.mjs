import {promises as fs} from 'node:fs';
import path from 'node:path';
import {findPackageJSON} from 'node:module';
import {pathToFileURL} from 'node:url';

// These entry points are used directly by the render pipeline and browser editor,
// including packages supplied by the pinned Remotion dependency tree.
export const EDITOR_PACKAGES = Object.freeze(['remotion', 'react', 'react-dom', '@remotion/renderer', '@remotion/player', 'esbuild', 'lucide-react']);

const inside = (parent, file) => {
  const relative = path.relative(parent, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export async function moduleDirectoryProblem(root) {
  const realRoot = await fs.realpath(root);
  for (const directory of ['engine', 'engine/node_modules']) {
    const file = path.join(root, ...directory.split('/'));
    const stat = await fs.lstat(file).catch(() => null);
    if (!stat) continue;
    if (!stat.isDirectory() || stat.isSymbolicLink() || !inside(realRoot, await fs.realpath(file))) {
      return {directory, error: `${directory} must be a regular project-local directory, without junctions or symlinks.`};
    }
  }
  return null;
}

export async function checkEngineDependencies(root) {
  const engine = path.join(path.resolve(root), 'engine');
  const modules = path.join(engine, 'node_modules');
  const missing = [], external = [], errors = [], resolved = {};
  try {
    const problem = await moduleDirectoryProblem(root);
    if (problem) return {ok: false, missing, external: [problem.directory], errors, resolved};
  } catch (error) {
    return {ok: false, missing, external, errors: [error.message], resolved};
  }
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(engine, 'package.json'), 'utf8'));
  } catch (error) {
    return {ok: false, missing, external, errors: [`engine/package.json: ${error.message}`], resolved};
  }
  const names = [...new Set([...Object.keys(manifest.dependencies ?? {}), ...EDITOR_PACKAGES])].sort();
  const stat = await fs.lstat(modules).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    return {ok: false, missing: stat ? [] : names, external: stat ? ['engine/node_modules'] : [], errors, resolved};
  }
  const realEngine = await fs.realpath(engine);
  const realModules = await fs.realpath(modules);
  if (!inside(realEngine, realModules)) {
    return {ok: false, missing, external: ['engine/node_modules'], errors, resolved};
  }
  const packageBase = pathToFileURL(path.join(engine, 'package.json'));
  for (const name of names) {
    try {
      // Node's import resolver accepts ESM-only exports as well as CommonJS.
      // require.resolve() alone incorrectly rejects @remotion/media.
      const manifestPath = findPackageJSON(name, packageBase);
      if (!manifestPath) { missing.push(name); continue; }
      const entry = await fs.realpath(manifestPath);
      if (!inside(realModules, entry)) external.push(name);
      else resolved[name] = entry;
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'ENOENT') missing.push(name);
      else errors.push(`${name}: ${error.message}`);
    }
  }
  return {ok: missing.length === 0 && external.length === 0 && errors.length === 0, missing, external, errors, resolved};
}

export function dependencyProblem(result) {
  return [result.missing.length && `Missing engine packages: ${result.missing.join(', ')}`,
    result.external.length && `Engine packages resolve outside this installation: ${result.external.join(', ')}`,
    ...result.errors].filter(Boolean).join('; ');
}
