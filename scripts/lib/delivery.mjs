import './project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { assertProjectOutput } from './project-paths.mjs';
import {acquireRenderLock} from './render-lock.mjs';


export async function withOutputTransaction(output, produceAndValidate, { sidecars = [] } = {}) {
  const target = assertProjectOutput(output);
  if (new Set(sidecars).size !== sidecars.length || sidecars.some((suffix) => !/^\.[a-z][a-z0-9.-]*$/i.test(suffix))) throw new Error('Invalid output companion suffix');
  for (const suffix of sidecars) assertProjectOutput(`${target}${suffix}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const parsed = path.parse(target);
  const lockPath = assertProjectOutput(`${target}.render.lock`);
  const lock = await acquireRenderLock(lockPath);
  let work;
  let preserveWork = false;
  try {
    work = await fs.mkdtemp(path.join(parsed.dir, `.${parsed.name}-pending-`));
    const staged = path.join(work, parsed.base);
    const result = await produceAndValidate(staged, work);
    const stat = await fs.stat(staged);
    if (!stat.isFile() || stat.size === 0) throw new Error('Validated output is missing or empty');
    for (const suffix of sidecars) {
      if (!(await fs.stat(`${staged}${suffix}`).catch(() => null))) throw new Error(`Required output companion is missing: ${suffix}`);
    }
    assertProjectOutput(target);
    const promoted = [];
    try {
      for (const [index, suffix] of sidecars.entries()) {
        const destination = assertProjectOutput(`${target}${suffix}`);
        const previous = await fs.stat(destination).catch(() => null);
        const backup = previous ? path.join(work, `previous-${index}`) : null;
        if (backup) await fs.rename(destination, backup);
        const item = { destination, backup, placed: false };
        promoted.push(item);
        await fs.rename(`${staged}${suffix}`, destination);
        item.placed = true;
      }


      await fs.rename(staged, target);
    } catch (error) {
      const rollbackErrors = [];
      for (const item of promoted.reverse()) {
        try {
          if (item.placed) { assertProjectOutput(item.destination); await fs.rm(item.destination, { recursive: true, force: true }); }
          if (item.backup) await fs.rename(item.backup, item.destination);
        } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      if (rollbackErrors.length) {
        preserveWork = true;
        throw new AggregateError([error, ...rollbackErrors], `Output rollback needs manual recovery; preserved backups in ${work}`);
      }
      throw error;
    }
    return result;
  } finally {
    if (work && !preserveWork) {
      assertProjectOutput(work);
      await fs.rm(work, { recursive: true, force: true });
    }
    await lock.release();
  }
}
