import { STYLE_IDS } from '../../engine/src/creative-kit/styles.ts';
import { CUE_KINDS, sortCues } from './scene-cues.mjs';

export const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low', 'none']);
export const EVIDENCE_BASES = Object.freeze(['observed', 'inferred', 'authored']);
export const DEFAULT_MAX_PER_SEC = 2.5;
export const DROP_REASONS = Object.freeze(['no-sound-for-kind', 'before-start', 'signoff', 'edit-end', 'density']);

const PRIORITY = new Map(CUE_KINDS.map((kind, index) => [kind, index]));
const ENTRY_KEYS = ['recipe', 'gain', 'leadSec', 'confidence', 'basis', 'evidence'];
const EPS = 1e-7;

const fail = (message) => { throw new Error(message); };
const plainObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
};
const exactKeys = (value, keys, label) => {
  plainObject(value, label);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    fail(`${label} must have exactly these fields: ${expected.join(', ')}.`);
  }
  return value;
};
const number = (value, min, max, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be a number between ${min} and ${max}.`);
  return value;
};
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);


export function validatePalettes(palettes, catalog) {
  exactKeys(palettes, ['version', 'provenance', 'cueKinds', 'styles'], 'style palettes');
  if (palettes.version !== 1) fail('Style palettes version must be 1.');
  if (typeof palettes.provenance !== 'string' || !palettes.provenance.trim()) fail('Style palettes need a provenance note.');
  if (!Array.isArray(palettes.cueKinds) || [...palettes.cueKinds].sort().join() !== [...CUE_KINDS].sort().join()) {
    fail(`cueKinds must list exactly: ${CUE_KINDS.join(', ')}.`);
  }
  const recipes = new Map((catalog?.recipes ?? []).map((recipe) => [recipe.id, recipe]));
  exactKeys(palettes.styles, STYLE_IDS, 'style palette styles');
  for (const style of STYLE_IDS) {
    const palette = exactKeys(palettes.styles[style], ['dna', 'kinds'], `palette ${style}`);
    if (typeof palette.dna !== 'string' || !palette.dna.trim()) fail(`palette ${style} needs its DNA/source document.`);
    exactKeys(palette.kinds, CUE_KINDS, `palette ${style} kinds`);
    for (const kind of CUE_KINDS) {
      const label = `palette ${style}.${kind}`;
      const entry = exactKeys(palette.kinds[kind], ENTRY_KEYS, label);
      if (!CONFIDENCE_LEVELS.includes(entry.confidence)) fail(`${label} confidence must be one of ${CONFIDENCE_LEVELS.join(', ')}.`);
      if (!EVIDENCE_BASES.includes(entry.basis)) fail(`${label} basis must be one of ${EVIDENCE_BASES.join(', ')}.`);
      if ((entry.confidence === 'none') !== (entry.basis === 'authored')) fail(`${label}: confidence 'none' and basis 'authored' go together.`);
      if (typeof entry.evidence !== 'string' || !entry.evidence.trim() || entry.evidence.length > 600) fail(`${label} evidence must be 1..600 characters.`);
      if (entry.recipe === null) {
        if (entry.gain !== 0 || entry.leadSec !== 0) fail(`${label}: a silent kind has gain 0 and leadSec 0.`);
        continue;
      }
      const recipe = recipes.get(entry.recipe);
      if (!recipe) fail(`${label} names an unknown recipe: ${String(entry.recipe)}.`);
      number(entry.gain, 0.01, 2, `${label} gain`);
      number(entry.leadSec, 0, 1, `${label} leadSec`);
      if (entry.leadSec >= recipe.duration) fail(`${label} leadSec must be shorter than ${recipe.id}.`);
    }
  }
  return palettes;
}


export function resolvePalette(palettes, catalog, styleId) {
  validatePalettes(palettes, catalog);
  if (!STYLE_IDS.includes(styleId)) fail(`Unknown style ${JSON.stringify(styleId)}. Choose one of: ${STYLE_IDS.join(', ')}.`);
  const recipes = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));
  const source = palettes.styles[styleId];
  const entries = Object.fromEntries(CUE_KINDS.map((kind) => {
    const entry = source.kinds[kind];
    return [kind, { ...entry, recipe: entry.recipe === null ? null : structuredClone(recipes.get(entry.recipe)) }];
  }));
  return { style: styleId, dna: source.dna, entries };
}


export async function loadStylePalette(styleId) {
  const [{ readJson }, { loadSoundCatalog }] = await Promise.all([import('./job-paths.mjs'), import('./job-sound.mjs')]);
  return resolvePalette(await readJson('Sound-Kits/style-palettes.json'), await loadSoundCatalog(), styleId);
}

const checkOptions = ({ fps, signoffFromFrame, durationInFrames, maxPerSec = DEFAULT_MAX_PER_SEC } = {}) => {
  number(fps, 1, 120, 'fps');
  number(maxPerSec, 0.1, 10, 'maxPerSec');
  if (signoffFromFrame !== undefined && (!Number.isInteger(signoffFromFrame) || signoffFromFrame < 0)) fail('signoffFromFrame must be a non-negative integer.');
  if (durationInFrames !== undefined && (!Number.isInteger(durationInFrames) || durationInFrames < 1)) fail('durationInFrames must be a positive integer.');
  return { fps, signoffFromFrame, durationInFrames, maxPerSec };
};

const checkCues = (cues) => {
  if (!Array.isArray(cues) || cues.length > 20000) fail('cues must be an array (maximum 20000).');
  for (const [index, cue] of cues.entries()) {
    plainObject(cue, `cue ${index}`);
    if (!Number.isInteger(cue.frame) || cue.frame < 0) fail(`cue ${index} frame must be a non-negative integer.`);
    if (!CUE_KINDS.includes(cue.kind)) fail(`cue ${index} kind must be one of ${CUE_KINDS.join(', ')}.`);
    if (typeof cue.sceneId !== 'string') fail(`cue ${index} sceneId must be a string.`);
  }
  return cues;
};

const checkPalette = (palette) => {
  plainObject(palette, 'palette');
  plainObject(palette.entries, 'palette entries');
  for (const kind of CUE_KINDS) {
    const entry = plainObject(palette.entries[kind], `palette entry ${kind}`);
    if (entry.recipe !== null) {
      plainObject(entry.recipe, `palette entry ${kind} recipe`);
      if (!Array.isArray(entry.recipe.hits) || !Number.isFinite(entry.recipe.duration)) fail(`palette entry ${kind} needs a resolved recipe; use resolvePalette().`);
    }
  }
  return palette;
};





export function planSfxEvents(cues, palette, options) {
  const { fps, signoffFromFrame, durationInFrames, maxPerSec } = checkOptions(options);
  checkCues(cues); checkPalette(palette);
  const minGapFrames = fps / maxPerSec;
  const decisions = [], candidates = [];
  for (const cue of sortCues(cues)) {
    const entry = palette.entries[cue.kind];
    const base = { frame: cue.frame, kind: cue.kind, sceneId: cue.sceneId, recipe: entry.recipe?.id ?? null, confidence: entry.confidence ?? null };
    const drop = (reason) => decisions.push({ ...base, atFrame: null, status: 'dropped', reason });
    if (!entry.recipe) { drop('no-sound-for-kind'); continue; }
    const atFrame = cue.frame - Math.round(entry.leadSec * fps);
    if (atFrame < 0) { drop('before-start'); continue; }
    const endSec = atFrame / fps + entry.recipe.duration;
    if (signoffFromFrame !== undefined && endSec > signoffFromFrame / fps + EPS) { drop('signoff'); continue; }
    if (durationInFrames !== undefined && endSec > durationInFrames / fps + EPS) { drop('edit-end'); continue; }
    candidates.push({ cue, base, atFrame, entry });
  }
  const ranked = [...candidates].sort((a, b) => PRIORITY.get(a.cue.kind) - PRIORITY.get(b.cue.kind)
    || a.cue.frame - b.cue.frame || byId(a.cue.sceneId, b.cue.sceneId));
  const accepted = [];
  for (const candidate of ranked) {
    if (accepted.some((kept) => Math.abs(kept.cue.frame - candidate.cue.frame) < minGapFrames - EPS)) {
      decisions.push({ ...candidate.base, atFrame: null, status: 'dropped', reason: 'density' });
    } else {
      accepted.push(candidate);
      decisions.push({ ...candidate.base, atFrame: candidate.atFrame, status: 'placed', reason: null });
    }
  }
  accepted.sort((a, b) => a.atFrame - b.atFrame || PRIORITY.get(a.cue.kind) - PRIORITY.get(b.cue.kind));
  decisions.sort((a, b) => a.frame - b.frame || PRIORITY.get(a.kind) - PRIORITY.get(b.kind) || byId(a.sceneId, b.sceneId));
  return {
    style: palette.style ?? null, fps, maxPerSec, minGapFrames,
    events: accepted.map(({ atFrame, entry }) => ({ atFrame, recipe: entry.recipe.id, gain: entry.gain })),
    decisions,
  };
}


export function expandSoundEvents(events, palette, fps) {
  number(fps, 1, 120, 'fps');
  checkPalette(palette);
  const recipes = new Map(Object.values(palette.entries).filter((entry) => entry.recipe).map((entry) => [entry.recipe.id, entry.recipe]));
  return events.flatMap((event) => {
    const recipe = recipes.get(event.recipe) ?? fail(`Recipe ${String(event.recipe)} is not in the ${String(palette.style)} palette.`);
    const t = event.atFrame / fps;
    return recipe.hits.map((hit) => ({ ...structuredClone(hit), t: hit.t + t, gain: (hit.gain ?? 1) * event.gain }));
  });
}


export function buildSfxHits(cues, palette, options) {
  const { events } = planSfxEvents(cues, palette, options);
  return expandSoundEvents(events, palette, options.fps);
}
