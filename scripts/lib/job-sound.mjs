import { finite, object, readJson } from './job-paths.mjs';

const OPTION_NAMES = {
  whoosh: ['dur', 'seed', 'lo', 'hi'], whooshSoft: ['seed'], impact: ['dur', 'f0', 'f1', 'seed'],
  pop: ['freq', 'dur', 'seed'], click: ['dur', 'seed', 'fc'], riser: ['dur', 'seed'],
  swipe: ['dur', 'seed'], paper: ['dur', 'seed'], chime: ['dur', 'seed'], tick: ['seed'],
  keyTap: ['dur', 'seed', 'fc'], mouseClick: ['dur', 'seed', 'fc'], whooshShort: ['dur', 'seed', 'f0', 'f1'],
};
export const SOUND_NAMES = Object.freeze(Object.keys(OPTION_NAMES));

export function validateHits(hits, duration) {
  finite(duration, 0.01, 600, 'sound duration');
  if (!Array.isArray(hits) || hits.length > 4000) throw new Error('SFX hits must be an array with at most 4000 entries.');
  for (const [index, hit] of hits.entries()) {
    object(hit, ['t', 'sound', 'gain', 'pan', 'opts'], `hit ${index}`);
    if (!SOUND_NAMES.includes(hit.sound)) throw new Error(`Unknown sound: ${String(hit.sound)}`);
    finite(hit.t, 0, duration, 'hit time');
    if (hit.t === duration) throw new Error('A sound must start before the stem ends.');
    if (hit.gain !== undefined) finite(hit.gain, 0, 2, 'hit gain');
    if (hit.pan !== undefined) finite(hit.pan, -1, 1, 'hit pan');
    const opts = object(hit.opts ?? {}, OPTION_NAMES[hit.sound], 'sound option');
    for (const [key, value] of Object.entries(opts)) {
      if (key === 'dur') finite(value, 0.005, 5, 'effect duration');
      else if (key === 'seed') finite(value, 0, 4294967295, 'seed', { integer: true });
      else finite(value, 20, 10000, `effect ${key}`);
    }
  }
  return hits;
}

export async function loadSoundCatalog() {
  const catalog = object(await readJson('Sound-Kits/catalog.json'), ['version', 'sampleRate', 'provenance', 'sounds', 'recipes'], 'sound catalog');
  if (catalog.version !== 1 || catalog.sampleRate !== 48000 || !Array.isArray(catalog.recipes)) throw new Error('Unsupported sound catalog.');
  const ids = new Set();
  for (const recipe of catalog.recipes) {
    object(recipe, ['id', 'name', 'use', 'duration', 'hits'], 'recipe');
    if (typeof recipe.id !== 'string' || !/^[a-z0-9-]+$/.test(recipe.id) || ids.has(recipe.id)) throw new Error('Recipe IDs must be unique lowercase slugs.');
    ids.add(recipe.id);
    validateHits(recipe.hits, recipe.duration);
  }
  return catalog;
}

export async function soundRecipe(id) {
  const catalog = await loadSoundCatalog();
  const recipe = catalog.recipes.find((item) => item.id === id);
  if (!recipe) throw new Error(`Unknown sound recipe: ${String(id)}`);
  return recipe;
}
