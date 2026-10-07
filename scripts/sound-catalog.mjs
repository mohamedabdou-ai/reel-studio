import './lib/project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ROOT, atomicJson, checkedPath, cliArgs, ensureOutput, finite, relativePath, slug, withFileLock } from './lib/job-paths.mjs';
import { loadSoundCatalog, soundRecipe, validateHits } from './lib/job-sound.mjs';

async function renderRecipe(id, output, gain) {
  relativePath(output);
  const project = slug(output.split('/')[1], 'project');
  if (!/\.wav$/i.test(output)) throw new Error('Sound output must be a .wav file.');
  const options = { project };
  await checkedPath(output, { ...options, write: true });
  const hitsPath = output.replace(/\.wav$/i, '.hits.json');
  await checkedPath(hitsPath, { ...options, write: true });
  const recipe = await soundRecipe(id);
  const hits = structuredClone(recipe.hits).map((hit) => ({ ...hit, gain: (hit.gain ?? 1) * gain }));
  validateHits(hits, recipe.duration);
  return withFileLock(`${output}.lock`, options, async () => {
    const temporary = `${output}.${randomUUID()}.tmp.wav`;
    const tempHits = `${hitsPath}.${randomUUID()}.tmp.json`;
    const tempAbsolute = await ensureOutput(temporary, options);
    try {
      await atomicJson(tempHits, hits, options);
      const environment = { ...process.env };
      delete environment.NODE_OPTIONS;
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(ROOT, 'scripts/sfx.mjs'), '--hits', tempHits,
          '--dur', String(recipe.duration), '--out', temporary], {
          cwd: ROOT, shell: false, windowsHide: true, env: environment, stdio: ['ignore', 'ignore', 'pipe'],
        });
        let errorText = '';
        child.stderr.on('data', (part) => { errorText = (errorText + part).slice(-4000); });
        child.once('error', reject);
        child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`SFX synthesis failed (${code ?? signal}): ${errorText}`)));
      });
      const buffer = await fs.readFile(tempAbsolute);
      if (buffer.length !== 44 + Math.round(recipe.duration * 48000) * 4 || buffer.toString('ascii', 0, 4) !== 'RIFF'
        || buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.readUInt32LE(24) !== 48000) {
        throw new Error('SFX returned an invalid or truncated WAV.');
      }
      const final = await checkedPath(output, { ...options, write: true });
      await atomicJson(hitsPath, hits, options);
      await fs.rename(tempAbsolute, final);
      return { ok: true, recipe: id, out: output, hits: hitsPath, duration: recipe.duration, sampleRate: 48000, gain,
        synthesizer: 'scripts/sfx.mjs' };
    } finally {
      for (const file of [temporary, tempHits]) {
        const absolute = await checkedPath(file, { ...options, write: true });
        await fs.unlink(absolute).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      }
    }
  });
}

try {
  const args = cliArgs(process.argv.slice(2), ['out', 'gain']);
  const [action = 'list', id, ...extra] = args._;
  if (extra.length) throw new Error('Too many positional arguments.');
  let result;
  if (action === 'list' && !id && !args.out && !args.gain) result = { ok: true, ...await loadSoundCatalog() };
  else if (action === 'show' && id && !args.out && !args.gain) result = { ok: true, recipe: await soundRecipe(id) };
  else if (action === 'render' && id && args.out) result = await renderRecipe(id, args.out, finite(Number(args.gain ?? 1), 0, 2, 'gain'));
  else throw new Error('Usage: node scripts/sound-catalog.mjs list | show <recipe> | render <recipe> --out Projects/<project>/audio.wav [--gain 0..2]');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`sound-catalog: ${error.message}`);
  process.exitCode = 1;
}
