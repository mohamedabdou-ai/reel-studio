// scripts/lib/breakdown-recipe.mjs
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './project-paths.mjs';
import {confirmedSfx} from './breakdown-merge.mjs';

export const RECIPE_FILE = 'scripts/data/breakdown-recipe.json';
const BANDS_FILE = 'scripts/data/sound-bands.json';
export const FEATURE_VALUES = Object.freeze({
  presenter: ['none', 'some', 'most'], ground: ['light', 'mixed', 'dark'], pace: ['slow', 'medium', 'fast'],
  text: ['low', 'medium', 'high'], captions: ['yes', 'no'], framed: ['yes', 'no'], list: ['yes', 'no'],
  look: ['bw', 'teal-orange', 'vivid', 'muted', 'warm', 'cool', 'natural'], ending: ['yes', 'no'], punches: ['yes', 'no'], beatSync: ['yes', 'no'],
});
export const FEATURE_WEIGHTS = Object.freeze({presenter: 3, framed: 2, list: 2, ground: 2, text: 1, pace: 1, look: 1, captions: 1});
const SWEEP = /^(?:whoosh|swipe|sweep|riser)$/u;
const NUMBERED = /^\s*(?:\d+|[٠-٩]+)\s*[).\-:]/u;
const ENDING_PROMPT = /comment|كومنت|علّق|علق|اكتب/iu;
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : +Number(v).toFixed(d));
const median = values => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const mode = values => { const c = new Map(); for (const v of values) c.set(v, (c.get(v) ?? 0) + 1); let best; for (const [v, n] of c) if (best === undefined || n > c.get(best)) best = v; return best ?? null; };
const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

export const loadRecipeCatalog = () => readJson(RECIPE_FILE);
export const loadSoundBands = () => readJson(BANDS_FILE);

export function validateRecipeCatalog(c) {
  const fail = message => { throw new Error(`Recipe catalogue: ${message}`); };
  if (c?.version !== 1) fail('version must be 1');
  for (const key of ['notice', 'noticeAr']) if (typeof c[key] !== 'string' || !c[key].trim()) fail(`${key} is required`);
  if (!Array.isArray(c.styles) || !c.styles.length) fail('styles are required');
  const ids = new Set();
  for (const s of c.styles) {
    if (!s.id || ids.has(s.id)) fail(`duplicate or missing style id ${s.id}`); ids.add(s.id);
    if (!s.label || !s.labelAr) fail(`${s.id} needs label and labelAr`);
    for (const [key, values] of Object.entries(s.prefers ?? {})) {
      if (!Object.hasOwn(FEATURE_WEIGHTS, key)) fail(`${s.id} prefers unknown feature ${key}`);
      if (!Array.isArray(values) || !values.length || values.some(v => !FEATURE_VALUES[key].includes(v))) fail(`${s.id} has an invalid ${key} value`);
    }
  }
  const rules = new Set();
  for (const r of c.families ?? []) {
    if (!r.id || rules.has(r.id)) fail(`duplicate or missing family rule ${r.id}`); rules.add(r.id);
    for (const [key, values] of Object.entries(r.when ?? {})) if (!FEATURE_VALUES[key] || !values.every(v => FEATURE_VALUES[key].includes(v))) fail(`${r.id} has an invalid condition ${key}`);
    if (!Array.isArray(r.families) || r.families.some(f => !f.id || (f.onlyIn && !ids.has(f.onlyIn)))) fail(`${r.id} has an invalid family list`);
    if (!r.note || !r.noteAr) fail(`${r.id} needs note and noteAr`);
  }
  return c;
}

function coverage(items, duration) {
  const spans = items.map(i => [Math.max(0, i.start), Math.min(duration, i.end)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0, start = null, end = null;
  for (const [a, b] of spans) {
    if (end === null || a > end) { if (end !== null) total += end - start; start = a; end = b; }
    else end = Math.max(end, b);
  }
  if (end !== null) total += end - start;
  return duration ? total / duration : 0;
}

export function recipeFeatures(b) {
  const d = b.durationSec, text = (b.text ?? []).filter(t => t.kind !== 'scene-text');
  const onScreen = text.filter(t => t.kind !== 'caption');
  const share = b.presenter?.share, level = b.look?.metrics?.meanLevel;
  const changes = (b.cuts?.length ?? 0) + (b.transitions?.length ?? 0);
  const perMinute = d ? changes * 60 / d : null;
  const cov = coverage(onScreen, d);
  const region = [...(b.cuts ?? []), ...(b.transitions ?? [])].filter(x => x.scope === 'region').length;
  const steps = text.reduce((n, t) => n + (t.events ?? []).filter(e => e.kind === 'highlight-change').length, 0);
  const numbered = onScreen.reduce((n, t) => n + String(t.text ?? '').split('\n').filter(line => NUMBERED.test(line)).length, 0);
  const punches = (b.events ?? []).filter(e => ['punch-in', 'punch-out'].includes(e.kind)).length;
  const synced = b.sound?.cutsOnBeat?.synced;
  return {
    presenter: !Number.isFinite(share) ? 'unknown' : share < 0.05 ? 'none' : share < 0.6 ? 'some' : 'most',
    ground: !Number.isFinite(level) ? 'unknown' : level >= 60 ? 'light' : level <= 35 ? 'dark' : 'mixed',
    pace: perMinute == null ? 'unknown' : perMinute < 15 ? 'slow' : perMinute < 35 ? 'medium' : 'fast',
    text: cov < 0.2 ? 'low' : cov < 0.6 ? 'medium' : 'high',
    captions: text.some(t => t.kind === 'caption' && t.status !== 'needs-confirmation') ? 'yes'
      : text.some(t => t.kind === 'caption') ? 'unknown' : 'no',
    framed: region >= 2 || (b.overlays ?? []).some(o => o.kind === 'pip') ? 'yes' : 'no',
    list: steps >= 3 || numbered >= 3 ? 'yes' : 'no',
    look: b.look?.label && FEATURE_VALUES.look.includes(b.look.label) ? b.look.label : 'unknown',
    ending: text.some(t => t.end >= d * 0.75 && ENDING_PROMPT.test(String(t.text ?? ''))) ? 'yes' : 'no',
    punches: punches >= 2 ? 'yes' : 'no',
    beatSync: synced == null ? 'unknown' : synced ? 'yes' : 'no',
    measures: {changesPerMinute: round(perMinute, 1), textCoverage: round(cov), regionChanges: region, highlightSteps: steps, numberedLines: numbered,
      meanLevel: Number.isFinite(level) ? level : null, presenterShare: Number.isFinite(share) ? share : null},
  };
}

export function scoreStyles(features, styles) {
  const known = Object.keys(FEATURE_WEIGHTS).filter(k => features[k] && features[k] !== 'unknown');
  const total = known.reduce((s, k) => s + FEATURE_WEIGHTS[k], 0);
  return styles.map((style, order) => {
    const matched = [], missed = [];
    let points = 0;
    for (const k of known) {
      const want = style.prefers?.[k];
      if (!want) continue;
      if (want.includes(features[k])) { points += FEATURE_WEIGHTS[k]; matched.push(k); }
      else { points -= FEATURE_WEIGHTS[k]; missed.push(k); }
    }
    return {id: style.id, label: style.label, labelAr: style.labelAr, score: total ? round(points / total) : 0, matched, missed, order};
  }).sort((a, b) => b.score - a.score || a.order - b.order).map(({order, ...rest}) => rest);
}

export function matchFamilies(features, rules) {
  return (rules ?? []).filter(rule => Object.entries(rule.when).every(([k, values]) => values.includes(features[k])))
    .map(rule => ({id: rule.id, families: rule.families.map(f => ({...f})), note: rule.note, noteAr: rule.noteAr}));
}

const luminance = hex => {
  const m = /^#?([0-9a-f]{6})$/iu.exec(String(hex ?? ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
const majority = (items, test) => items.filter(test).length * 2 > items.length;

export function captionLook(b) {
  const items = (b.text ?? []).filter(t => t.kind === 'caption');
  if (!items.length) return {present: false, status: 'confirmed', evidence: []};
  const box = majority(items, t => t.style?.box), stroke = majority(items, t => t.style?.stroke), highlight = majority(items, t => t.style?.highlight);
  const boxColour = mode(items.map(t => t.style?.box).filter(Boolean));
  const words = median(items.map(t => String(t.text ?? '').trim().split(/\s+/u).filter(Boolean).length));
  const skin = highlight ? 'karaoke' : stroke ? 'bold-outline' : box && luminance(boxColour) > 0.7 ? 'paper-tag' : box ? null : 'soft-shadow';
  const pending = items.filter(t => t.status === 'needs-confirmation').length;
  return {present: true, status: pending ? 'needs-confirmation' : 'confirmed', presentation: box ? 'pill' : 'minimal', skin, grouping: words <= 1.5 ? 'single' : words <= 4 ? 'compact' : 'clauses', wordsPerCue: words,
    zone: mode(items.map(t => t.zone)), sizePct: round(median(items.map(t => t.sizePct)), 4), fill: mode(items.map(t => t.style?.fill).filter(Boolean)),
    pending, evidence: items.map(t => t.id)};
}

export function soundRecipe(b, bands, nearestId, styleIds) {
  const s = b.sound;
  if (!s || s.hasAudio === false) return {measured: false, reason: s?.hasAudio === false ? 'no-audio' : 'not-measured'};
  const hpm = s.hitsPerMinute;
  if (!Number.isFinite(hpm)) return {measured: false, reason: 'not-measured'};
  const all = Object.entries(bands.bands), inside = ([, [lo, hi]]) => hpm >= lo && hpm <= hi;
  const tones = all.filter(([key]) => key !== 'podcast' && !styleIds.has(key));
  let keys, isInside = true;
  if (bands.bands[nearestId] && inside([nearestId, bands.bands[nearestId]])) keys = [nearestId];
  else if (bands.bands[nearestId]) { keys = [nearestId]; isInside = false; }
  else if (tones.some(inside)) keys = tones.filter(inside).map(([key]) => key);
  else if (bands.bands.podcast && inside(['podcast', bands.bands.podcast])) keys = ['podcast'];
  else { keys = [tones.map(([key, [lo, hi]]) => [key, Math.min(Math.abs(hpm - lo), Math.abs(hpm - hi))]).sort((x, y) => x[1] - y[1])[0][0]]; isInside = false; }
  const bed = s.bed ? {present: s.bed.present ?? null, levelDb: s.bed.levelDb ?? null, speechToBedDb: s.bed.speechToBedDb ?? null} : null;
  const under = bed?.present === true ? {value: 9, reason: 'the reference carries music under the voice'}
    : hpm >= 57 ? {value: 9, reason: 'dense effects'} : {value: 7, reason: 'sparse effects'};
  const sfxTypes = {};
  const typed=confirmedSfx(s).filter(x=>x.type!=='hit' && x.typeConfidence!=='low' && x.status!=='needs-confirmation');
  for (const x of typed) sfxTypes[x.type] = (sfxTypes[x.type] ?? 0) + 1;
  return {measured: true, hitsPerMinute: hpm, band: {keys, range: bands.bands[keys[0]], inside: isInside}, under, bed, sfxTypes,
    sweeps: typed.filter(x => SWEEP.test(x.type)).length, cutsOnBeat: s.cutsOnBeat?.synced ?? null};
}

export function buildRecipe(b, {catalog = loadRecipeCatalog(), bands = loadSoundBands()} = {}) {
  validateRecipeCatalog(catalog);
  const features = recipeFeatures(b);
  const ranked = scoreStyles(features, catalog.styles);
  return {schema: 1, referenceId: b.referenceId, basis: 'inferred', notice: catalog.notice, noticeAr: catalog.noticeAr, features,
    style: {nearest: ranked[0], alternatives: ranked.slice(1, 3)},
    families: matchFamilies(features, catalog.families),
    captions: captionLook(b),
    sound: soundRecipe(b, bands, ranked[0]?.id, new Set(catalog.styles.map(s => s.id))),
    presenter: b.presenter ? {share: b.presenter.share, size: b.presenter.size, status: b.presenter.status} : null};
}

const pct = v => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : 'unknown');
export function renderRecipeMarkdown(r) {
  const f = r.features, m = f.measures, n = r.style.nearest;
  const rows = [
    ['presenter', f.presenter, `face in ${pct(m.presenterShare)} of sampled frames`], ['ground', f.ground, `mean level ${m.meanLevel ?? 'unknown'}`],
    ['pace', f.pace, `${m.changesPerMinute ?? 'unknown'} picture changes per minute`], ['text', f.text, `on screen ${pct(m.textCoverage)} of the time`],
    ['framed', f.framed, `${m.regionChanges} changes inside a panel`], ['list', f.list, `${m.highlightSteps} highlight steps, ${m.numberedLines} numbered lines`],
    ['captions', f.captions, ''], ['look', f.look, ''], ['ending', f.ending, 'inferred from the closing words'], ['punches', f.punches, ''], ['beatSync', f.beatSync, ''],
  ].map(([k, v, x]) => `| ${k} | ${v} | ${x} |`);
  const alt = r.style.alternatives.map(a => `\`${a.id}\` ${a.score}`).join(', ') || 'none';
  const fam = r.families.length ? r.families.map(x => `- ${x.id}: ${x.families.map(y => `\`${y.id}\`${y.onlyIn ? ` (only in ${y.onlyIn})` : ''}`).join(', ') || 'no scene'} — ${x.note}`).join('\n') : '- No structure-specific suggestion.';
  const c = r.captions;
  const cap = c.present ? `${c.status === 'needs-confirmation' ? 'Candidate caption look (needs-confirmation): ' : ''}presentation \`${c.presentation}\`, skin ${c.skin ? `\`${c.skin}\`` : 'none (basic presentation)'}, grouping \`${c.grouping}\` (median ${c.wordsPerCue} words per cue), zone ${c.zone}, size ${c.sizePct}${c.pending ? `; ${c.pending} caption cues need confirmation` : ''}.` : 'No spoken-word captions were identified.';
  const s = r.sound;
  const snd = !s.measured ? (s.reason === 'no-audio' ? 'The reference has no audio.' : 'Sound was not measured.')
    : [`Band ${s.band.keys.map(k => `\`${k}\``).join(' / ')} ${s.band.range.join('–')} cues per minute (measured ${s.hitsPerMinute}${s.band.inside ? '' : ', outside the band'}).`,
      `Start \`--under\` ${s.under.value} (${s.under.reason}).`,
      `Bed: ${s.bed?.present === true ? `present${s.bed.levelDb != null ? ` at ${s.bed.levelDb} dB` : ''}` : s.bed?.present === false ? 'none' : 'unknown'}.`,
      `Effects: ${Object.entries(s.sfxTypes).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.${s.sweeps ? ` ${s.sweeps} air sweeps: the studio places sweeps only when the brief sets "sweeps": true.` : ''}`,
      `Cuts on beat: ${s.cutsOnBeat == null ? 'unknown' : s.cutsOnBeat ? 'yes' : 'no'}.`].join(' ');
  const pr = r.presenter ? `Face visible in ${pct(r.presenter.share)} of sampled frames (${r.presenter.size}, ${r.presenter.status}).` : 'Presenter share was not measured.';
  return `# Studio recipe\n\n${r.notice}\n\nAll of it is \`inferred\` from the measured breakdown.\n\n## Measured shape\n\n| Feature | Value | Measure |\n|---|---|---|\n${rows.join('\n')}\n\n## Nearest shipped style\n\n\`${n.id}\` (${n.label} · ${n.labelAr}), score ${n.score}. Matched: ${n.matched.join(', ') || 'none'}. Missed: ${n.missed.join(', ') || 'none'}. Alternatives: ${alt}.\n\n## Scene families\n\n${fam}\n\n## Captions\n\n${cap}\n\n## Sound\n\n${snd}\n\n## Presenter\n\n${pr}\n`;
}
