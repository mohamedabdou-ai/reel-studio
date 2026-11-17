import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {ROOT} from './project-paths.mjs';
import {checkedPath} from './job-paths.mjs';
import {acquireFileLease} from './python-venv.mjs';
import {confirmedSfx, sfxSummary} from './breakdown-merge.mjs';

// scripts/lib/breakdown-dna.mjs
const pad2 = n => String(n).padStart(2, '0');
export function tc(sec) {
  const cs = Math.round(Math.max(0, Number(sec) || 0) * 100);
  return `${pad2(Math.floor(cs / 6000))}:${pad2(Math.floor(cs / 100) % 60)}.${pad2(cs % 100)}`;
}
const BASIS = {measured: 'measured', seen: 'observed', heard: 'observed', inferred: 'inferred'};
const RANK = {observed: 0, measured: 1, inferred: 2};
const CONF = {high: 2, medium: 1, low: 0};
const pending = x => x?.status === 'needs-confirmation';
const pct = v => Number.isFinite(v) ? `${Math.round(v * 100)}%` : 'unknown';

function recurring(key, items, valueOf, claimOf) {
  const counts = new Map();
  for (const it of items) { const v = valueOf(it); if (v == null) continue; counts.set(v, [...(counts.get(v) ?? []), it]); }
  if (!counts.size) return null;
  const [value, agree] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  return {key, kind: 'recurring', value, claim: claimOf(value, agree.length, items.length), support: agree, exceptions: items.filter(x => !agree.includes(x)).map(x => x.id), agreement: agree.length / items.length};
}
function presence(key, items, total, claim) {
  return items.length ? {key, kind: 'recurring', value: true, claim, support: items, exceptions: [], agreement: total ? Math.min(1, items.length / total) : 1} : null;
}
const global = (key, item, value, claim) => (item ? {key, kind: 'global', value, claim, support: [item], exceptions: [], agreement: 1} : null);
const measure = (key, value, claim, support = []) => ({key, kind: 'measure', value, claim, support, exceptions: [], agreement: null});
const captionKey = t => `${t.style?.box ? 'boxed' : 'unboxed'}${t.style?.stroke ? ' with an outline' : ''}${t.style?.highlight ? ' with a highlighted word' : ''}`;

export function deriveTraits(b, recipe) {
  const traits = [], push = t => { if (t) traits.push(t); };
  const cuts = b.cuts ?? [], trans = b.transitions ?? [], shots = b.shots ?? [], text = (b.text ?? []).filter(t => t.kind !== 'scene-text'), d = b.durationSec;
  const onScreen = text.filter(t => t.kind !== 'caption'), whole = {start: 0, end: d};
  push(recurring('cuts.kind', cuts, c => c.kind, (v, n, of) => `Shots change with a ${v} (${n} of ${of} cuts).`));
  const region = [...cuts, ...trans].filter(x => x.scope === 'region');
  push(presence('picture.panel-switch', region, cuts.length + trans.length, `Content switches inside a framed panel while the rest of the frame stays still (${region.length} of ${cuts.length + trans.length} picture changes).`));
  push(recurring('transitions.kind', trans, r => r.kind + (r.direction ? `-${r.direction}` : ''), (v, n, of) => `Transitions are ${v} (${n} of ${of}).`));
  push(recurring('camera.move', shots.map(s => ({...s.camera, id: s.id, start: s.start, end: s.end})), c => c.label, (v, n, of) => `The camera is ${v} in ${n} of ${of} shots.`));
  const punches = (b.events ?? []).filter(e => ['punch-in', 'punch-out'].includes(e.kind));
  push(presence('camera.punch', punches, shots.length, `Punch-ins or punch-outs happen ${punches.length} times across ${shots.length} shots.`));
  push(recurring('text.zone', onScreen, t => t.zone, (v, n, of) => `On-screen words sit in the ${v} zone (${n} of ${of} text elements).`));
  push(recurring('text.entrance', onScreen.filter(t => t.entrance !== 'present-at-start'), t => t.entrance, (v, n, of) => `On-screen words enter with ${v} (${n} of ${of}).`));
  push(recurring('text.fill', onScreen, t => t.style?.fill?.toLowerCase() ?? null, (v, n, of) => `On-screen words are filled ${v} (${n} of ${of}).`));
  const steps = text.flatMap(t => (t.events ?? []).filter(e => e.kind === 'highlight-change'));
  push(presence('text.highlight-steps', steps, steps.length, `A highlight steps through lines that stay on screen (${steps.length} steps).`));
  if (recipe?.captions?.present) {
    const trait = recurring('captions.look', text.filter(t => t.kind === 'caption'), captionKey, (v, n, of) => `Spoken-word captions are ${v} (${n} of ${of}).`);
    if (trait) push({...trait, status: recipe.captions.status});
  }
  const pips = (b.overlays ?? []).filter(o => o.kind === 'pip');
  push(presence('overlay.frame-in-frame', pips, pips.length, `A framed picture sits inside the frame (${pips.length} overlay${pips.length === 1 ? '' : 's'}).`));
  push(recurring('overlay.kind', (b.overlays ?? []).filter(o => o.kind !== 'pip'), o => o.kind, (v, n, of) => `Overlays are ${v}s (${n} of ${of}).`));
  if (b.look) push(global('look.colour', {...b.look, id: 'look', ...whole}, b.look.label, `The colour look is ${b.look.label} (saturation ${b.look.metrics?.saturation ?? 'unknown'}, mean level ${b.look.metrics?.meanLevel ?? 'unknown'}).`));
  const s = b.sound;
  if (s?.bed) push(global('sound.bed', {...s.bed, id: 'sound.bed', ...whole}, s.bed.present, s.bed.present === true ? `A music bed runs under the reel (level ${s.bed.levelDb ?? 'unknown'} dB).` : s.bed.present === false ? 'No music bed was found.' : 'Whether a music bed runs is unknown.'));
  if (s?.tempo?.bpm) push(global('sound.tempo', {...s.tempo, id: 'sound.tempo', ...whole}, s.tempo.bpm, `The music tempo is about ${s.tempo.bpm} BPM (alternatives ${(s.tempo.alternatives ?? []).join(', ') || 'none'}).`));
  // Failure to measure a beat is report-only, never evidence for a style rule.
  const sfx = confirmedSfx(s);
  push(recurring('sound.effect-type', sfx.filter(x=>x.type!=='hit' && x.typeConfidence!=='low' && x.status!=='needs-confirmation'), x => x.type, (v, n, of) => `Effects are mostly ${v} (${n} of ${of}).`));
  if (sfx.length) {
    const anchored = sfx.filter(x => x.anchor);
    push({key: 'sound.effects-on-picture', kind: 'recurring', value: true, claim: `Effects land on picture or text changes (${anchored.length} of ${sfx.length} within 0.2 s).`,
      support: anchored, exceptions: sfx.filter(x => !x.anchor).map(x => x.id), agreement: anchored.length / sfx.length});
  }
  if (s?.cutsOnBeat?.synced != null) push(global('sound.cuts-on-beat', {id: 'sound.cutsOnBeat', basis: 'measured', confidence: 'medium', status: 'confirmed', ...whole}, s.cutsOnBeat.synced,
    `Cuts ${s.cutsOnBeat.synced ? 'follow' : 'do not follow'} the beat (${pct(s.cutsOnBeat.share)} on beat, chance ${pct(s.cutsOnBeat.chance)}).`));
  push(measure('pace', {cutsPerMinute: b.pace?.cutsPerMinute ?? null, medianShotSec: b.pace?.shotLen?.median ?? null, minShotSec: b.pace?.shotLen?.min ?? null, maxShotSec: b.pace?.shotLen?.max ?? null},
    `Pace: ${b.pace?.cutsPerMinute ?? 'unknown'} cuts per minute, median shot ${b.pace?.shotLen?.median ?? 'unknown'} s (${b.pace?.shotLen?.min ?? '?'}–${b.pace?.shotLen?.max ?? '?'} s).`, cuts));
  const cov = recipe?.features?.measures?.textCoverage ?? null;
  push(measure('text.density', {elements: onScreen.length, coverage: cov}, `On-screen words: ${onScreen.length} elements covering ${cov == null ? 'an unknown share' : pct(cov)} of the time.`, onScreen));
  if (s?.speech) push(measure('speech.rate', {wordsPerMinute: s.speech.wordsPerMinute, pauses: s.speech.pauses.length}, `Speech: ${s.speech.wordsPerMinute} words per minute, ${s.speech.pauses.length} pauses of 1.2 s or more.`));
  if (s?.hasAudio) {
    const rate = sfxSummary(s,d).hitsPerMinute;
    push(measure('sound.density', {hitsPerMinute:rate}, `Reported effects: ${rate ?? 'unknown'} per minute.`, sfx));
  }
  if (b.presenter) push(measure('presenter.share', {share: b.presenter.share, size: b.presenter.size, faceHeight: b.presenter.faceHeight},
    `A face is visible in ${pct(b.presenter.share)} of sampled frames (${b.presenter.size}).`, [{...b.presenter, id: 'presenter', ...whole}]));
  return traits;
}

export function classify(trait) {
  const support = trait.support ?? [], waiting = support.filter(pending).length;
  if (trait.status === 'needs-confirmation') return {trait: 'uncertain', why: 'the aggregate look needs confirmation'};
  if (support.length && waiting / support.length > 0.5) return {trait: 'uncertain', why: `${waiting} of ${support.length} supporting items need confirmation`};
  if (trait.kind === 'measure') return {trait: 'adaptive', why: 'content-dependent measure'};
  if (trait.kind === 'global') return {trait: 'invariant', why: 'one whole-reel measurement'};
  if (support.length < 3) return {trait: 'uncertain', why: `seen only ${support.length} time${support.length === 1 ? '' : 's'}`};
  if (trait.agreement >= 0.8) return {trait: 'invariant', why: `${support.length} examples, ${pct(trait.agreement)} agree`};
  return {trait: 'adaptive', why: `varies: ${pct(trait.agreement)} follow the most common choice`};
}

function shotOf(item, shots) {
  if (/^S\d+$/u.test(String(item.id ?? ''))) return item.id;
  if (item.shotId) return item.shotId;
  const t = Number.isFinite(item.t) ? item.t : item.start;
  return shots.find(s => t >= s.start && t < s.end)?.id ?? null;
}
const span = x => (Number.isFinite(x.t) ? tc(x.t) : `${tc(x.start)}–${tc(x.end)}`);

export function evidenceRow(b, t) {
  const ref = b.referenceId, base = `style-analysis/${ref}`, support = t.support ?? [];
  const timed = support.filter(x => Number.isFinite(x.t) || (Number.isFinite(x.start) && Number.isFinite(x.end)));
  const timecodes = timed.length ? [...timed.slice(0, 6).map(span), ...(timed.length > 6 ? [`(+${timed.length - 6} more)`] : [])] : [`${tc(0)}–${tc(b.durationSec)}`];
  const basis = support.length ? support.map(x => BASIS[x.basis] ?? 'measured').sort((x, y) => RANK[y] - RANK[x])[0] : 'measured';
  const levels = support.map(x => CONF[x.confidence] ?? 1), low = levels.length ? Math.min(...levels) : 1;
  const confidence = t.trait === 'uncertain' || low === 0 ? 'low' : t.trait === 'invariant' && low === 2 ? 'high' : 'medium';
  const stills = [...new Set(support.map(x => shotOf(x, b.shots ?? [])).filter(Boolean))].slice(0, 3).map(id => `${base}/report/stills/${id}.jpg`);
  return {id: `${ref}:${t.key}`, referenceId: ref, timecodes, claim: t.claim, basis, confidence,
    reason: `${t.why}; ${support.length} supporting item${support.length === 1 ? '' : 's'}, ${support.filter(pending).length} need confirmation`,
    artifacts: [`${base}/breakdown.json`, `${base}/timeline.md`, ...stills], trait: t.trait, exceptions: t.exceptions};
}

const resolveHint = t => {
  const waiting = (t.support ?? []).find(pending);
  return waiting?.confirmHow ? `${waiting.confirmHow} (${t.why})` : `${t.why}; a second named reference or a review would settle it.`;
};

export function buildDna(refs, {now = new Date().toISOString()} = {}) {
  if (!refs.length) throw new Error('Draft DNA needs at least one breakdown.');
  const perRef = refs.map(({breakdown: b, recipe}) => ({b, recipe, traits: deriveTraits(b, recipe).map(t => ({...t, ...classify(t)}))}));
  const evidence = perRef.flatMap(({b, traits}) => traits.map(t => evidenceRow(b, t)));
  const single = refs.length === 1, observedInvariants = [], adaptiveVariables = [], uncertainTraits = [];
  for (const key of [...new Set(perRef.flatMap(r => r.traits.map(t => t.key)))]) {
    const present = perRef.map(r => ({ref: r.b.referenceId, t: r.traits.find(t => t.key === key)})).filter(h => h.t);
    const evidenceIds = present.map(h => `${h.ref}:${key}`), first = present[0].t;
    const same = new Set(present.map(h => JSON.stringify(h.t.value))).size === 1;
    if (present.length < refs.length || present.some(h => h.t.trait === 'uncertain')) {
      uncertainTraits.push({key, trait: first.claim, resolveBy: present.length < refs.length ? `Seen in ${present.length} of ${refs.length} references; confirm it or name another reference.` : resolveHint(present.find(h => h.t.trait === 'uncertain').t), evidence: evidenceIds});
    } else if (present.every(h => h.t.trait === 'invariant') && same) {
      const levels = evidenceIds.map(id => evidence.find(r => r.id === id).confidence);
      observedInvariants.push({key, rule: first.claim, evidence: evidenceIds, confidence: levels.includes('low') ? 'low' : levels.every(l => l === 'high') ? 'high' : 'medium',
        exceptions: present.flatMap(h => h.t.exceptions), provisional: single});
    } else {
      adaptiveVariables.push({key, variable: first.claim, observed: present.map(h => ({referenceId: h.ref, value: h.t.value})), evidence: evidenceIds});
    }
  }
  const votes = new Map();
  for (const {recipe} of perRef) { const id = recipe?.style?.nearest?.id; if (id) votes.set(id, (votes.get(id) ?? 0) + 1); }
  const suggested = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    version: 1, status: 'draft', generatedBy: 'breakdown', generatedAt: now, baseStyle: null,
    suggestedBaseStyle: {id: suggested, alternatives: perRef[0].recipe?.style?.alternatives?.map(a => a.id) ?? [], basis: 'inferred', note: 'A suggestion from the studio recipe; the manager chooses the style by judgement.'},
    scope: single ? 'Draft from one named reference: every rule is provisional until more references or a reviewed sample support it.' : `Draft from ${refs.length} named references.`,
    review: null,
    references: perRef.map(({b}) => ({id: b.referenceId, name: b.source.name, sha256: b.source.sha256, inspected: `${tc(0)}–${tc(b.durationSec)} (whole file, automatic breakdown)`,
      breakdown: `style-analysis/${b.referenceId}/breakdown.json`, report: `style-analysis/${b.referenceId}/report/report.html`, needsConfirmation: (b.reviewQueue ?? []).length, limitations: b.limitations ?? []})),
    observedInvariants, adaptiveVariables, uncertainTraits, applicationLogic: [], antiPatterns: [],
    limitations: [...new Set(perRef.flatMap(({b}) => [...(b.limitations ?? []), ...(b.rejected?.length ? [`Rejected in review (${b.referenceId}): ${b.rejected.join(', ')}.`] : [])]))],
    sampleReview: null, evidence,
  };
}

const cell = v => String(Array.isArray(v) ? v.join(', ') : v ?? '').replaceAll('|', '\\|').replaceAll('\n', ' / ');
const rows = (head, list) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${list.map(r => `| ${r.map(cell).join(' | ')} |`).join('\n')}`;

export function renderDnaMarkdown(dna) {
  const sug = dna.suggestedBaseStyle;
  return [`# Style DNA (draft)`, '',
    `Status: draft · generated by the reference breakdown on ${dna.generatedAt.slice(0, 10)}. Nothing here is approved; the manager and the creator decide. Base style: not chosen${sug.id ? ` (suggestion \`${sug.id}\`${sug.alternatives.length ? `, alternatives ${sug.alternatives.map(a => `\`${a}\``).join(', ')}` : ''})` : ''}.`, '',
    `Scope: ${dna.scope}`, '',
    '## References', '', rows(['Id', 'File', 'Inspected', 'Needs confirmation'], dna.references.map(r => [r.id, r.name, r.inspected, r.needsConfirmation])), '',
    '## Observed invariants', '', dna.observedInvariants.length ? rows(['Key', 'Rule', 'Evidence', 'Confidence', 'Exceptions'], dna.observedInvariants.map(x => [x.key, x.rule, x.evidence, x.confidence, x.exceptions])) : 'None yet.',
    ...(dna.observedInvariants.some(x => x.provisional) ? ['', 'Provisional: one reference only, so these hold inside that reel and may not generalise.'] : []), '',
    '## Adaptive variables', '', dna.adaptiveVariables.length ? rows(['Key', 'Variable', 'Observed', 'Evidence'], dna.adaptiveVariables.map(x => [x.key, x.variable, x.observed.map(o => `${o.referenceId}: ${JSON.stringify(o.value)}`), x.evidence])) : 'None.', '',
    '## Uncertain traits', '', dna.uncertainTraits.length ? rows(['Key', 'Trait', 'Resolve by', 'Evidence'], dna.uncertainTraits.map(x => [x.key, x.trait, x.resolveBy, x.evidence])) : 'None.', '',
    '## Application logic', '', 'To be written by the editorial worker for the new content (STYLE-LEARNING.md, "Transfer the grammar into the actual edit").', '',
    '## Anti-patterns', '', 'To be written with the application logic.', '',
    '## Limitations', '', ...(dna.limitations.length ? dna.limitations.map(l => `- ${l}`) : ['None recorded.']), '',
    '## Sample review', '', 'None yet.', ''].join('\n');
}

export function renderEvidenceMarkdown(b, evidenceRows) {
  return [`# Evidence: ${b.referenceId}`, '', `Reference: ${b.source.name} (sha256 ${b.source.sha256}). Generated from the automatic breakdown; change it through a review, not by hand.`, '',
    rows(['id', 'referenceId', 'timecodes', 'claim', 'basis', 'confidence', 'reason', 'artifacts', 'trait', 'exceptions'],
      evidenceRows.map(r => [r.id, r.referenceId, r.timecodes, r.claim, r.basis, r.confidence, r.reason, r.artifacts, r.trait, r.exceptions])), ''].join('\n');
}

const sha = text => createHash('sha256').update(text).digest('hex');
async function readOptional(file) {
  try { return await fsp.readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const proposalName = rel => {
  const ext = path.posix.extname(rel);
  return `${rel.slice(0, -ext.length)}.proposal${ext}`;
};
const generatedDraft = text => {
  try { const old = JSON.parse(text); return old?.status === 'draft' && old.generatedBy === 'breakdown'; }
  catch { return false; }
};

// A project lease covers the complete ledger transaction. Reference leases, when
// needed, are acquired by the caller in sorted order before this lease.
export async function writeDnaFiles(projectDir, files, {now = new Date()} = {}) {
  const relative = path.relative(ROOT, path.resolve(projectDir)).split(path.sep).join('/');
  if (!/^Projects\/[a-z0-9][a-z0-9-]{0,63}$/u.test(relative)) throw new Error('DNA needs an owned project directory.');
  const project = relative.split('/')[1];
  const output = rel => checkedPath(`${relative}/${rel}`, {write: true, project});
  const entries = Object.entries(files);
  if (!entries.length || entries.some(([rel, text]) => typeof text !== 'string' || !/^(?:STYLE_DNA\.(?:json|md)|style-analysis\/ref-[0-9a-f]{12}\.md)$/u.test(rel))) throw new Error('Invalid DNA output file.');
  if (Object.hasOwn(files, 'STYLE_DNA.json') !== Object.hasOwn(files, 'STYLE_DNA.md')) throw new Error('Write the DNA JSON and Markdown together.');
  if (Object.hasOwn(files, 'STYLE_DNA.json') && !generatedDraft(files['STYLE_DNA.json'])) throw new Error('Generated DNA must remain a breakdown draft.');
  const stamp = new Date(now).toISOString().replace(/[:.]/gu, '-');
  const lock = await output('style-analysis/dna.lock');
  const release = await acquireFileLease(lock, {label: 'Project DNA'});
  const temporary = [];
  try {
    const ledgerRel = 'style-analysis/dna-ledger.json';
    const ledgerFile = await output(ledgerRel), ledgerText = await readOptional(ledgerFile);
    let ledger;
    try { ledger = ledgerText === null ? {schema: 1, files: {}} : JSON.parse(ledgerText); }
    catch { throw new Error('DNA ledger is corrupt; preserve the files and recover its revision before retrying.'); }
    if (ledger?.schema !== 1 || !ledger.files || typeof ledger.files !== 'object' || Array.isArray(ledger.files)
      || Object.values(ledger.files).some(hash => typeof hash !== 'string' || !/^[0-9a-f]{64}$/u.test(hash))) throw new Error('DNA ledger is corrupt; preserve the files before retrying.');
    const snapshots = new Map([[ledgerRel, ledgerText]]), replaceable = {};
    const snapshot = async rel => {
      const text = await readOptional(await output(rel));
      snapshots.set(rel, text);
      return text;
    };
    for (const [rel] of entries) {
      const current = await snapshot(rel);
      replaceable[rel] = current === null || (ledger.files[rel] === sha(current) && (rel !== 'STYLE_DNA.json' || generatedDraft(current)));
    }
    if (Object.hasOwn(files, 'STYLE_DNA.json') && !(replaceable['STYLE_DNA.json'] && replaceable['STYLE_DNA.md'])) {
      replaceable['STYLE_DNA.json'] = replaceable['STYLE_DNA.md'] = false;
    }
    const written = [], proposals = [], revisions = [], planned = [];
    // Preflight the entire batch, including proposals, before writing any output.
    for (const [rel, text] of entries) {
      const target = replaceable[rel] ? rel : proposalName(rel);
      const current = target === rel ? snapshots.get(rel) : await snapshot(target);
      if (target !== rel && current !== null && (ledger.files[target] !== sha(current) || (rel === 'STYLE_DNA.json' && !generatedDraft(current)))) {
        throw new Error(`Protected DNA proposal conflict: ${target} is edited or untracked. Preserve or merge it before retrying.`);
      }
      planned.push({rel: target, text, current});
      (target === rel ? written : proposals).push(target);
    }
    // Use the locked snapshots and report scope loss only for a live replacement.
    const replaced = planned.find(item => item.rel === 'STYLE_DNA.json' && item.current !== null);
    const referenceIds = text => {
      const refs = JSON.parse(text).references;
      return Array.isArray(refs) ? refs.map(r => r?.id).filter(id => typeof id === 'string') : [];
    };
    const nextRefs = new Set(replaced ? referenceIds(replaced.text) : []);
    const removedReferences = replaced ? [...new Set(referenceIds(replaced.current))].filter(id => !nextRefs.has(id)).sort() : [];
    const unchanged = async rel => {
      if (await readOptional(await output(rel)) !== snapshots.get(rel)) throw new Error(`DNA changed while writing ${rel}; refusing a stale save.`);
    };
    const checkSnapshots = async () => { for (const rel of snapshots.keys()) await unchanged(rel); };
    await checkSnapshots();
    const stage = async (rel, text) => {
      const file = await output(`${rel}.${randomUUID()}.tmp`);
      await fsp.mkdir(path.dirname(file), {recursive: true});
      temporary.push(file);
      await fsp.writeFile(file, text, {encoding: 'utf8', flag: 'wx'});
      return file;
    };
    for (const item of planned) item.staged = await stage(item.rel, item.text);
    // Immutable recovery copies precede every replacement, including proposals.
    // UUID plus the source-path digest avoids same-time/basename collisions.
    const backups = [...planned.filter(item => item.current !== null)];
    if (ledgerText !== null) backups.push({rel: ledgerRel, current: ledgerText});
    for (const item of backups) {
      const rel = `style-analysis/dna-revisions/${stamp}-${randomUUID()}-${sha(item.rel).slice(0, 12)}-${path.posix.basename(item.rel)}`;
      const target = await output(rel);
      await fsp.mkdir(path.dirname(target), {recursive: true});
      await fsp.writeFile(target, item.current, {encoding: 'utf8', flag: 'wx'});
      revisions.push(rel);
    }
    const nextLedger = {schema: 1, files: {...ledger.files}};
    for (const item of planned) nextLedger.files[item.rel] = sha(item.text);
    const stagedLedger = await stage(ledgerRel, `${JSON.stringify(nextLedger, null, 2)}\n`);
    await checkSnapshots();
    for (const item of planned) {
      // Also guard human saves that happen after staging started.
      await unchanged(item.rel);
      await fsp.rename(item.staged, await output(item.rel));
    }
    await unchanged(ledgerRel);
    // A failed promotion never publishes a ledger claiming the batch succeeded.
    await fsp.rename(stagedLedger, await output(ledgerRel));
    return {written, proposals, revisions, removedReferences};
  } finally {
    try { for (const file of temporary) await fsp.rm(file, {force: true}); }
    finally { await release(); }
  }
}
