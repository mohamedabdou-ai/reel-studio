import './project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {ROOT, atomicJson, checkedPath, digest, ensureOutput, fileSnapshot, finite, object, readJson, relativePath, slug, withFileLock} from './job-paths.mjs';
import {ffprobeJson, run} from './media.mjs';
import {withOutputTransaction} from './delivery.mjs';
import {profileToBrief, readProfileFile} from './branding.mjs';
import {planEditorBrief, prepareEditorManifest, renderEditorManifest, validateEditorBrief} from './editor-director.mjs';
import {verifyPreparedProps} from './prepared-props.mjs';

const MAX_CLIP_SEC = 600;
const text = (value, label, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must be nonblank text of at most ${max} characters.`);
  return value;
};
const overlap = (a, b) => {
  a = a.toLowerCase(); b = b.toLowerCase();
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
};
const safeSlug = (value, label) => { slug(value, label); relativePath(value); return value; };
const sec = value => Math.round(value * 1000000) / 1000000;

export function normalizePodcastWords(raw) {
  const words = Array.isArray(raw) ? raw : raw?.words ?? raw?.captions;
  if (!Array.isArray(words) || !words.length || words.length > 200000) throw new Error('A reviewed transcript needs 1 to 200000 recorded words.');
  let lastStart = -1;
  return words.map((word, index) => {
    text(word?.text, `word ${index} text`);
    if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.startMs < 0 || word.endMs <= word.startMs) throw new Error(`Invalid timestamp for word ${index}.`);
    if (word.startMs < lastStart) throw new Error('Transcript words must stay ordered by recorded start time.');
    lastStart = word.startMs;
    const confidence = word.confidence ?? null;
    if (confidence !== null) finite(confidence, 0, 1, 'word confidence');
    return {text: word.text, startMs: word.startMs, endMs: word.endMs, confidence};
  });
}

export function proposePodcastCandidates(rawWords, {durationSec, fps = 30, minSec = 15, maxSec = 90, gapSec = 1.2} = {}) {
  const words = normalizePodcastWords(rawWords);
  finite(durationSec, 0.001, 604800, 'source duration'); finite(fps, 1, 120, 'source fps');
  finite(minSec, 0.001, MAX_CLIP_SEC, 'minimum candidate duration'); finite(maxSec, minSec, MAX_CLIP_SEC, 'maximum candidate duration');
  finite(gapSec, 0.05, 30, 'candidate pause');
  if (words.some(w => w.endMs > durationSec * 1000 + 0.001)) throw new Error('Transcript exceeds the source duration.');
  const candidates = [];
  let start = 0;
  while (start < words.length) {
    let end = start;
    while (end + 1 < words.length) {
      const span = (words[end].endMs - words[start].startMs) / 1000;
      const gap = (words[end + 1].startMs - words[end].endMs) / 1000;
      const nextSpan = (words[end + 1].endMs - words[start].startMs) / 1000;
      if (gap >= gapSec || nextSpan > maxSec || (span >= minSec && /[.!?؟؛]$/u.test(words[end].text))) break;
      end++;
    }
    const fromSec = sec(Math.floor(words[start].startMs / 1000 * fps + 1e-7) / fps);
    const toSec = sec(Math.min(durationSec, Math.ceil(words[end].endMs / 1000 * fps - 1e-7) / fps));
    if (toSec - fromSec >= minSec && toSec - fromSec <= maxSec + 0.000002) {
      const wordIndices = Array.from({length: end - start + 1}, (_, index) => start + index);
      candidates.push({id: `candidate-${String(candidates.length + 1).padStart(4, '0')}`, fromSec, toSec,
        text: words.slice(start, end + 1).map(w => w.text).join(' '), wordIndices,
        reason: end + 1 === words.length ? 'End of reviewed speech.' : 'Reviewed punctuation, pause or bounded window.', selectionApproved: false});
    }
    start = end + 1;
  }
  return {method: 'transcript-boundaries-v1', selectionApproved: false, candidates,
    notices: ['Candidates are literal transcript windows, not an assessment of topic completeness or creative quality.', 'Approve explicit ranges, recorded signoff decisions and authored beats before preparing any media.']};
}

export function podcastClipProjectId(batchId, clipId) {
  safeSlug(batchId, 'batch id'); safeSlug(clipId, 'clip id');
  const readable = `${batchId}--${clipId}`;
  return readable.length <= 64 && !batchId.includes('--') && !clipId.includes('--') ? readable : `${batchId.slice(0, 35)}--${clipId.slice(0, 16)}-${digest([batchId, clipId]).slice(0, 10)}`;
}

export function rebasePodcastClip(clip, rawWords) {
  const words = normalizePodcastWords(rawWords);
  const fromMs = clip.fromSec * 1000, toMs = clip.toSec * 1000;
  const wordIndices = [];
  const selected = words.flatMap((word, index) => {
    if (word.endMs <= fromMs + 0.001 || word.startMs >= toMs - 0.001) return [];
    if (word.startMs < fromMs - 0.001 || word.endMs > toMs + 0.001) throw new Error(`Clip ${clip.id} boundary cuts recorded word ${index}.`);
    wordIndices.push(index);
    return [{...word, startMs: Math.max(0, sec((word.startMs - fromMs) / 1000) * 1000), endMs: sec((word.endMs - fromMs) / 1000) * 1000}];
  });
  if (!selected.length) throw new Error(`Clip ${clip.id} has no reviewed recorded words.`);
  if (selected.length > 20000) throw new Error(`Clip ${clip.id} exceeds the editor's 20000-word limit.`);
  return {words: selected, wordIndices, editor: {...clip.editor,
    beats: clip.editor.beats.map(beat => ({...beat, fromSec: sec(beat.fromSec - clip.fromSec), toSec: sec(beat.toSec - clip.fromSec)}))},
    ...(clip.signoff.mode === 'recorded' ? {signoffFromSec: sec(clip.signoff.fromSec - clip.fromSec)} : {})};
}

export function validatePodcastSelections(raw, {source, words: rawWords, batchId}) {
  object(raw, ['version', 'selectionApproved', 'approvedBy', 'clips'], 'podcast selections');
  if (raw.version !== 1 || raw.selectionApproved !== true) throw new Error('Selections need version 1 and selectionApproved: true after human approval.');
  text(raw.approvedBy, 'selection approver');
  safeSlug(batchId, 'batch id');
  const words = normalizePodcastWords(rawWords);
  if (!Array.isArray(raw.clips) || !raw.clips.length || raw.clips.length > 300) throw new Error('Select 1 to 300 explicitly approved clips.');
  const ids = new Set(), projects = new Set();
  let previousEnd = 0;
  const clips = raw.clips.map(clip => {
    object(clip, ['id', 'fromSec', 'toSec', 'signoff', 'editor', 'ending', 'privacyReviewedBy', 'projectId'], 'podcast clip');
    safeSlug(clip.id, 'clip id');
    if (ids.has(clip.id)) throw new Error('Clip IDs must be unique.'); ids.add(clip.id);
    finite(clip.fromSec, 0, source.durationSec, 'clip start inside source bounds'); finite(clip.toSec, 0, source.durationSec, 'clip end inside source duration');
    if (clip.toSec <= clip.fromSec || clip.toSec - clip.fromSec > MAX_CLIP_SEC + 1e-7) throw new Error('Each selected clip needs a positive duration of at most 600 seconds (ten minutes).');
    if (clip.fromSec < previousEnd) throw new Error('Selected clips must be ordered, disjoint, without overlap.'); previousEnd = clip.toSec;
    if (source.constantFps) for (const edge of [clip.fromSec, clip.toSec]) {
      if (Math.abs(edge * source.fps - Math.round(edge * source.fps)) > 0.0001) throw new Error('Approve whole-frame clip boundaries for a constant-rate source.');
    }
    object(clip.signoff, ['mode', 'text', 'fromSec'], 'clip signoff decision');
    if (!['none', 'recorded'].includes(clip.signoff.mode)) throw new Error('Every clip needs an explicit signoff mode: none or recorded.');
    if (clip.signoff.mode === 'none' && (clip.signoff.text !== undefined || clip.signoff.fromSec !== undefined)) throw new Error('A disabled signoff cannot have text or timing.');
    if (clip.signoff.mode === 'recorded') {
      text(clip.signoff.text, 'recorded signoff', 60); finite(clip.signoff.fromSec, clip.fromSec, clip.toSec - 0.000001, 'recorded signoff start');
      const signoffWords = words.filter(w => w.startMs >= clip.signoff.fromSec * 1000 - 0.001 && w.endMs <= clip.toSec * 1000 + 0.001);
      const normalized = value => value.replace(/[.!?؟،؛]/gu, '').trim().replace(/\s+/g, ' ');
      const recorded = normalized(signoffWords.map(w => w.text).join(' ')), phrase = normalized(clip.signoff.text);
      if (recorded !== phrase && !recorded.startsWith(`${phrase} `)) throw new Error('The approved recorded signoff must match the reviewed transcript at its named time.');
    }
    object(clip.editor, ['purpose', 'tone', 'style', 'sourceKind', 'beats', 'fontFamily', 'captionsGrouping', 'captionsPresentation', 'captionsMode', 'writingStyle', 'sound', 'footage', 'transitions'], 'clip editor');
    if (!Array.isArray(clip.editor.beats) || !clip.editor.beats.length) throw new Error('Each clip needs authored editor beats in original source seconds.');
    const rebased = rebasePodcastClip(clip, words);
    for (const beat of clip.editor.beats) {
      if (beat.fromSec < clip.fromSec || beat.toSec > clip.toSec) throw new Error('Authored beat times must stay inside the selected original source window.');
      if (clip.signoff.mode === 'recorded' && beat.toSec > clip.signoff.fromSec) throw new Error('Authored scenes must finish before the recorded signoff.');
    }
    if (clip.ending !== undefined) {
      object(clip.ending, ['cta', 'followCard'], 'clip ending override');
      if (Object.hasOwn(clip.ending, 'cta') && clip.ending.cta !== null) text(clip.ending.cta, 'comment keyword', 20);
      if (clip.ending.followCard !== undefined && typeof clip.ending.followCard !== 'boolean') throw new Error('followCard must be boolean.');
    }
    if (clip.editor.sourceKind === 'screen') text(clip.privacyReviewedBy, 'screen privacy reviewer');
    const projectId = podcastClipProjectId(batchId, clip.id);
    if (clip.projectId !== undefined && clip.projectId !== projectId) throw new Error('Saved clip project id disagrees with its safe batch identity.');
    if (projects.has(projectId)) throw new Error('Selected clip project paths collide.'); projects.add(projectId);
    for (const input of [source.path, source.transcript].filter(Boolean)) {
      if (overlap(`Projects/${projectId}`, input)) throw new Error('Clip outputs would overwrite a named source or transcript.');
    }
    const result = {...clip, projectId};
    // Validate authored data now; profile-specific endings are checked during prepare/delivery.
    validateEditorBrief({version: 1, id: projectId, source: `Projects/${projectId}/source/window.mkv`, transcript: `Projects/${projectId}/podcast/words.json`,
      creator: {displayName: 'Podcast preview', handle: null, ending: {cta: null, followCard: false, signOff: null}}, ...rebased.editor});
    return result;
  });
  return {...raw, clips};
}

function batchPath(id) { return `Projects/${safeSlug(id, 'batch id')}/podcast/batch.json`; }
async function loadBatch(file) {
  relativePath(file);
  const batch = await readJson(file);
  if (batch?.version !== 1 || file !== batchPath(batch.id)) throw new Error('Podcast batch must stay in its own Projects/<id>/podcast/batch.json.');
  if (!Array.isArray(batch.inputs) || batch.inputs.length !== 2 || !batch.source || !batch.transcriptReview?.reviewedBy) throw new Error('Invalid podcast batch identity or transcript review.');
  batch.inputs.forEach(input => relativePath(input.path));
  if (batch.source.path !== batch.inputs[0].path || batch.transcript !== batch.inputs[1].path) throw new Error('Batch source/transcript identity disagrees with the named inputs.');
  text(batch.transcriptReview.reviewedBy, 'transcript reviewer');
  finite(batch.source.durationSec, 0.001, 604800, 'source duration');
  for (const input of batch.inputs) if (overlap(`Projects/${batch.id}/podcast`, input.path)) throw new Error('Batch outputs overlap a named input.');
  return batch;
}
async function unchanged(inputs) {
  for (const input of inputs) {
    const current = await fileSnapshot(input.path).catch(() => null);
    if (!current || current.sha256 !== input.sha256) return false;
  }
  return true;
}
async function assertInputs(batch) {
  if (!(await unchanged(batch.inputs)) || (batch.selectionInput && !(await unchanged([batch.selectionInput])))) throw new Error('Approved source, transcript or selections changed. Review them and create a new batch; existing clips are preserved.');
}
async function saveBatch(file, batch) { await atomicJson(file, batch, {project: batch.id}); }
const lockBatch = (batch, operation) => withFileLock(`Projects/${batch.id}/podcast/batch.lock`, {project: batch.id}, operation);

export async function proposePodcastBatch({id, source, transcript, reviewedBy, minSec = 15, maxSec = 90}) {
  safeSlug(id, 'batch id'); relativePath(source); relativePath(transcript); text(reviewedBy, 'transcript reviewer');
  if (overlap(source, transcript)) throw new Error('Source and reviewed transcript must be different inputs.');
  for (const input of [source, transcript]) if (overlap(`Projects/${id}/podcast`, input)) throw new Error('Batch outputs would overwrite a named input.');
  const inputs = await Promise.all([source, transcript].map(input => fileSnapshot(input)));
  const words = normalizePodcastWords(await readJson(transcript));
  const file = batchPath(id), parameters = {minSec, maxSec};
  const existing = await readJson(file, {optional: true});
  if (existing) {
    if (digest(existing.inputs) !== digest(inputs) || digest(existing.parameters) !== digest(parameters) || existing.transcriptReview.reviewedBy !== reviewedBy) throw new Error('Batch already exists for different inputs, parameters or review. Choose a new batch id; originals and prior clips are preserved.');
    return {ok: true, cached: true, batch: file, status: existing.selections ? 'selected' : 'needs-selection', candidates: existing.proposals.candidates};
  }
  const probe = await ffprobeJson(await checkedPath(source, {mustExist: true}));
  const video = probe.streams?.find(s => s.codec_type === 'video');
  if (!video || !probe.streams.some(s => s.codec_type === 'audio')) throw new Error('Podcast source needs both recorded video and audio.');
  const ratio = value => { const [n, d] = String(value ?? '0/1').split('/').map(Number); return d ? n / d : 0; };
  const fps = ratio(video.avg_frame_rate) || ratio(video.r_frame_rate);
  const durationSec = Number(video.duration ?? probe.format.duration);
  const sourceInfo = {path: source, sha256: inputs[0].sha256, durationSec, fps, constantFps: Math.abs(fps - ratio(video.r_frame_rate)) < 0.0001,
    width: video.width, height: video.height};
  const proposals = proposePodcastCandidates(words, {durationSec, fps, ...parameters});
  const batch = {version: 1, id, source: sourceInfo, transcript, inputs, parameters,
    transcriptReview: {status: 'reviewed', reviewedBy, sha256: inputs[1].sha256}, proposals, clipStates: {}, createdAt: new Date().toISOString()};
  return lockBatch(batch, async () => {
    if (await readJson(file, {optional: true})) throw new Error('Batch output already exists. Retry with its saved state.');
    if (!(await unchanged(inputs))) throw new Error('Source or transcript changed while proposing.');
    await saveBatch(file, batch);
    return {ok: true, cached: false, batch: file, status: 'needs-selection', candidates: proposals.candidates,
      next: 'Show candidate quotes and original times, obtain explicit selection/signoff decisions, then author approved selections and beats. No footage was cut.'};
  });
}

export async function selectPodcastBatch(file, selectionsFile) {
  const loaded = await loadBatch(file); relativePath(selectionsFile);
  if (overlap(file, selectionsFile)) throw new Error('Selections cannot overwrite the batch manifest.');
  return lockBatch(loaded, async () => {
    const batch = await loadBatch(file); await assertInputs(batch);
    const words = normalizePodcastWords(await readJson(batch.transcript));
    const selections = validatePodcastSelections(await readJson(selectionsFile), {source: {...batch.source, transcript: batch.transcript}, words, batchId: batch.id});
    if (batch.selections) {
      if (digest(batch.selections) !== digest(selections)) throw new Error('Different selections already exist. Use a new batch id to preserve reviewed clips and edits.');
      return {ok: true, cached: true, batch: file, clips: selections.clips.map(c => ({id: c.id, project: c.projectId})), status: 'selected'};
    }
    for (const clip of selections.clips) {
      if (overlap(`Projects/${clip.projectId}`, selectionsFile)) throw new Error('Clip outputs would overwrite the selections input.');
      const directory = await checkedPath(`Projects/${clip.projectId}`, {file: false});
      if (await fs.stat(directory).catch(() => null)) throw new Error(`Clip output collision: Projects/${clip.projectId} already exists.`);
    }
    batch.selectionInput = await fileSnapshot(selectionsFile);
    batch.selections = selections; batch.selectedAt = new Date().toISOString();
    await saveBatch(file, batch);
    return {ok: true, cached: false, batch: file, status: 'selected', clips: selections.clips.map(c => ({id: c.id, project: c.projectId, fromSec: c.fromSec, toSec: c.toSec, signoff: c.signoff})),
      next: 'Prepare the selected projects. Open their live editors and retain privacy, editorial and delivery review gates.'};
  });
}

async function clipOwnership(batch, clip) {
  const base = `Projects/${clip.projectId}`, ownerPath = `${base}/podcast/owner.json`;
  const identity = {version: 1, batch: batchPath(batch.id), sourceSha256: batch.source.sha256, transcriptSha256: batch.inputs[1].sha256,
    selectionHash: digest(clip)};
  const owner = await readJson(ownerPath, {optional: true});
  if (owner) {
    if (digest(owner) !== digest(identity)) throw new Error(`Clip ${clip.id} belongs to a different approved batch or selection.`);
  } else {
    const directory = await checkedPath(base, {file: false});
    if (await fs.stat(directory).catch(() => null)) throw new Error(`Clip output collision: ${base} already exists without this batch's ownership receipt.`);
    await atomicJson(ownerPath, identity, {project: clip.projectId});
  }
  return base;
}

async function extractClip(batch, clip, base, onProgress) {
  const window = `${base}/source/window.mkv`, receiptPath = `${window}.extraction.json`;
  const identity = {version: 1, source: batch.inputs[0], fromSec: clip.fromSec, toSec: clip.toSec, method: 'lossless-window-v1'};
  const receipt = await readJson(receiptPath, {optional: true});
  if (receipt) {
    if (digest(receipt.identity) !== digest(identity) || !(await unchanged([receipt.output]))) throw new Error(`Clip ${clip.id} extracted source changed; it will not be overwritten.`);
    return window;
  }
  if (await fs.stat(await checkedPath(window)).catch(() => null)) throw new Error(`Extracted source output already exists without verified identity: ${window}. Preserve it and inspect before retrying.`);
  onProgress(`Extracting approved window ${clip.id}: ${clip.fromSec}-${clip.toSec}s.`);
  const output = await ensureOutput(window, {project: clip.projectId});
  await withOutputTransaction(output, async staged => {
    await run('ffmpeg', ['-v', 'error', '-ss', String(clip.fromSec), '-i', await checkedPath(batch.source.path, {mustExist: true}), '-t', String(sec(clip.toSec - clip.fromSec)),
      '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'ffv1', '-level', '3', '-threads', '4', '-fps_mode', 'passthrough', '-c:a', 'pcm_s24le', staged]);
    const probe = await ffprobeJson(staged);
    const duration = Number(probe.format?.duration);
    if (!probe.streams?.some(s => s.codec_type === 'video') || !probe.streams.some(s => s.codec_type === 'audio') || !Number.isFinite(duration)
      || Math.abs(duration - (clip.toSec - clip.fromSec)) > Math.max(1 / batch.source.fps, 0.05)) throw new Error('Extracted window does not cover the approved video/audio duration.');
    if (!(await unchanged(batch.inputs))) throw new Error('Named source or transcript changed during extraction.');
    const stagedRelative = path.relative(ROOT, staged).split(path.sep).join('/');
    const outputIdentity = {...await fileSnapshot(stagedRelative), path: window};
    await fs.writeFile(`${staged}.extraction.json`, `${JSON.stringify({identity, output: outputIdentity}, null, 2)}\n`, 'utf8');
  }, {sidecars: ['.extraction.json']});
  return window;
}

async function assertApprovedClipManifest(batch, clip, manifest, words) {
  if (manifest.id !== clip.projectId) throw new Error('Authored manifest does not belong to this approved clip.');
  if (manifest.presenter !== (clip.editor.sourceKind === 'screen' ? false : undefined)) throw new Error('Authored source kind/presenter exemption disagrees with the explicitly selected clip.');
  const intake = await readJson(`Projects/${clip.projectId}/source/intake.json`);
  if (manifest.source?.path !== intake.edit) throw new Error('Authored source changed from the approved extracted window.');
  const rebased = rebasePodcastClip(clip, words);
  const exact = list => normalizePodcastWords(list).map(w => ({text: w.text, startMs: w.startMs, endMs: w.endMs}));
  if (digest(exact(manifest.captions?.words)) !== digest(exact(rebased.words))) throw new Error('Authored captions disagree with the approved recorded words/transcript. Review corrections in a new approved batch; the manual edit is preserved.');
  if (manifest.segments?.length !== 1 || manifest.segments[0].fromFrame !== 0 || manifest.segments[0].toFrame !== manifest.source.totalFrames) throw new Error('Internal cuts changed the approved contiguous window. Review new ranges in a new approved batch; the manual edit is preserved.');
  const signoff = clip.signoff.mode === 'recorded' ? clip.signoff.text : null;
  const atFrame = rebased.signoffFromSec === undefined ? undefined : Math.round(rebased.signoffFromSec * manifest.source.fps);
  if (manifest.creator?.ending?.signOff !== signoff || manifest.signoffFromFrame !== atFrame) throw new Error('Authored signoff disagrees with the explicit per-clip signoff decision. Review a new approved batch; the manual edit is preserved.');
  if (atFrame !== undefined && manifest.scenes.some(s => s.fromFrame + s.durationInFrames > atFrame)) throw new Error('Graphics cross the approved recorded signoff.');
}

function clipsToRun(batch, selectedId) {
  if (!batch.selections) throw new Error('No approved selected clips. Run podcast select after human review.');
  const clips = selectedId === undefined ? batch.selections.clips : batch.selections.clips.filter(c => c.id === selectedId);
  if (!clips.length) throw new Error(`Unknown selected clip: ${selectedId}`);
  return clips;
}

export async function preparePodcastBatch(file, {profile = 'PROFILE.json', noProxy = false, clip: selectedId, onProgress = () => {}} = {}) {
  const loaded = await loadBatch(file); relativePath(profile);
  return lockBatch(loaded, async () => {
    const batch = await loadBatch(file); await assertInputs(batch);
    const profileInput = await fileSnapshot(profile), profileData = await readProfileFile(await checkedPath(profile, {mustExist: true}));
    const words = normalizePodcastWords(await readJson(batch.transcript));
    clipsToRun(batch, selectedId);
    batch.selections = validatePodcastSelections(batch.selections, {source: {...batch.source, transcript: batch.transcript}, words, batchId: batch.id});
    const clips = clipsToRun(batch, selectedId);
    const results = [];
    for (const clip of clips) {
      for (const input of [profile, file, batch.selectionInput.path]) if (overlap(`Projects/${clip.projectId}`, input)) throw new Error('Clip outputs overlap a profile, batch or selections input.');
      const state = batch.clipStates[clip.id] ??= {};
      state.status = 'preparing'; state.error = null; await saveBatch(file, batch);
      try {
        const base = await clipOwnership(batch, clip);
        const window = await extractClip(batch, clip, base, onProgress);
        const intakeResult = await run(process.execPath, [path.join(ROOT, 'scripts/intake.mjs'), '--source', window, '--id', clip.projectId], {cwd: ROOT});
        const intake = JSON.parse(intakeResult.stdout);
        const rebased = rebasePodcastClip(clip, words), fields = profileToBrief(profileData);
        fields.creator.ending = {...fields.creator.ending, ...(clip.ending ?? {}), signOff: clip.signoff.mode === 'recorded' ? clip.signoff.text : null};
        const wordsPath = `${base}/podcast/words.json`, briefPath = `${base}/podcast/brief.json`, manifestPath = `${base}/edit.json`;
        const imported = {words: rebased.words, status: 'reviewed', reviewer: batch.transcriptReview.reviewedBy,
          origin: {source: batch.source.path, transcript: batch.transcript, sourceSha256: batch.source.sha256, wordIndices: rebased.wordIndices, fromSec: clip.fromSec, toSec: clip.toSec}};
        const brief = validateEditorBrief({version: 1, id: clip.projectId, source: intake.edit, transcript: wordsPath, ...fields, ...rebased.editor,
          captionsReviewedBy: batch.transcriptReview.reviewedBy, ...(rebased.signoffFromSec === undefined ? {} : {signoffFromSec: rebased.signoffFromSec})});
        const priorWords = await readJson(wordsPath, {optional: true});
        if (priorWords && digest(priorWords) !== digest(imported)) throw new Error('Imported reviewed words changed; preserve the manual transcript and review before retrying.');
        if (!priorWords) await atomicJson(wordsPath, imported, {project: clip.projectId});
        const priorBrief = await readJson(briefPath, {optional: true});
        if (!priorBrief) await atomicJson(briefPath, brief, {project: clip.projectId});
        const priorManifest = await readJson(manifestPath, {optional: true});
        if (!priorManifest) {
          if (priorBrief && digest(priorBrief) !== digest(brief)) throw new Error('Authored brief or saved profile changed before planning; review it rather than overwriting it.');
          await planEditorBrief(briefPath);
        }
        await assertApprovedClipManifest(batch, clip, await readJson(manifestPath), words);
        // Existing manifests belong to the live editor. Prepare them without replanning or replacing manual work.
        const prepared = await prepareEditorManifest(manifestPath, {noProxy, onProgress});
        if (!(await unchanged(batch.inputs)) || !(await unchanged([profileInput]))) throw new Error('Source, transcript or profile changed during preparation.');
        state.status = 'prepared'; state.manifest = manifestPath; state.brief = briefPath; state.profile ??= profileInput;
        state.preparation = {receipt: await fileSnapshot(`${base}/prepared/preparation.json`), manifestHash: prepared.manifestHash, outputs: prepared.outputs};
        state.preparedAt = new Date().toISOString();
        results.push({id: clip.id, project: clip.projectId, manifest: manifestPath, brief: briefPath, words: wordsPath, originalWindow: {fromSec: clip.fromSec, toSec: clip.toSec},
          signoff: clip.signoff, prepared, liveEditor: {script: 'scripts/review-editor.mjs', args: [manifestPath]}});
        await saveBatch(file, batch);
      } catch (error) {
        state.status = 'failed'; state.error = error.message; await saveBatch(file, batch); throw error;
      }
    }
    return {ok: true, batch: file, status: 'prepared', clips: results,
      next: 'Open each live editor. Verify words, picture/privacy, source order and signoff before delivery. Preparation is not creative approval.'};
  });
}

async function verifiedRender(receipt, manifestHash) {
  if (!receipt?.mediaInputs?.length || receipt.manifestHash !== manifestHash || !(await unchanged([...receipt.outputs, ...receipt.mediaInputs, ...(receipt.optionsInputs ?? [])]))) return false;
  const qc = await readJson(receipt.qc).catch(() => null);
  if (qc?.ok !== true || !qc.inputProps?.edit || qc.outputSha256 !== receipt.outputs[0].sha256 || digest(qc.inputProps.edit) !== manifestHash) return false;
  return receipt.mode !== 'delivery' || (qc.mode === 'deliver' && qc.igCheck?.ok === true && qc.safe?.ok === true);
}

export async function renderPodcastBatch(file, {delivery = false, review = false, approvedBy, optionsFile, clip: selectedId, onProgress = () => {}} = {}, dependencies = {}) {
  const loaded = await loadBatch(file);
  if (delivery && review) throw new Error('Choose one render mode.');
  if (delivery) text(approvedBy, 'delivery approver');
  if (optionsFile !== undefined) relativePath(optionsFile);
  return lockBatch(loaded, async () => {
    const batch = await loadBatch(file); await assertInputs(batch);
    const words = normalizePodcastWords(await readJson(batch.transcript));
    const clips = clipsToRun(batch, selectedId);
    const renderOptions = optionsFile === undefined ? {} : await readJson(optionsFile);
    object(renderOptions, clipsToRun(batch).map(c => c.id), 'clip render options');
    const optionsInput = optionsFile === undefined ? null : await fileSnapshot(optionsFile);
    const results = [];
    for (const clip of clips) {
      const state = batch.clipStates[clip.id];
      if (!state?.manifest) throw new Error(`Clip ${clip.id} is not prepared. Run podcast prepare first.`);
      const options = renderOptions[clip.id] ?? {};
      object(options, ['motionPlan', 'motionCrop', 'faceReviewedBy', 'voice', 'concurrency', 'noProxy', 'mediaEngine', 'png', 'crf', 'chunkFrames', 'chunkJobs', 'intentionalBlack'], 'clip render options');
      const manifest = await readJson(state.manifest), manifestHash = digest(manifest);
      if (state.manifest !== `Projects/${clip.projectId}/edit.json`) throw new Error('Saved manifest path disagrees with the approved clip project.');
      await assertApprovedClipManifest(batch, clip, manifest, words);
      const extraInputs = options.motionPlan ? [await fileSnapshot(options.motionPlan)] : [];
      const mode = delivery ? 'delivery' : review ? 'review' : 'preview';
      // The same scene JSON can reference replaced assets or a changed SFX stem. Refresh and verify
      // preparation before any cache decision, then identify actual media bytes rather than mtimes.
      const prepared = await (dependencies.prepareEditorManifest ?? prepareEditorManifest)(state.manifest, {noProxy: delivery || review || !!options.noProxy, onProgress});
      const props = await readJson(prepared.propsFile);
      await (dependencies.verifyPreparedProps ?? verifyPreparedProps)(props);
      if (digest(props.edit) !== manifestHash || digest(await readJson(state.manifest)) !== manifestHash) throw new Error('Authored edit changed during preparation. Save/review the live-editor changes before retrying; no cached output was accepted.');
      const mediaPaths = [...new Set([manifest.source.path, prepared.propsFile, prepared.plate, prepared.sfxFile, ...(props.assets ?? []).map(asset => asset.path)])];
      const mediaInputs = await Promise.all(mediaPaths.map(p => fileSnapshot(p)));
      const key = digest({manifestHash, options, optionsInput, extraInputs, mode, mediaInputs});
      const output = `Projects/${clip.projectId}/renders/podcast-${mode}-${key.slice(0, 16)}.mp4`;
      state.renders ??= {};
      const prior = state.renders[key];
      if (await verifiedRender(prior, manifestHash)) { results.push({id: clip.id, cached: true, ...prior.result}); continue; }
      if (await fs.stat(await checkedPath(output)).catch(() => null)) throw new Error(`Render output already exists without current matching QC: ${output}. Preserve it and inspect before retrying.`);
      if (delivery) { state.deliveryApproval = {approvedBy, manifestHash}; await saveBatch(file, batch); }
      state.status = 'rendering'; state.error = null; await saveBatch(file, batch);
      try {
        if (optionsFile && overlap(`Projects/${clip.projectId}/renders`, optionsFile)) throw new Error('Render options overlap the output directory.');
        const result = await (dependencies.renderEditorManifest ?? renderEditorManifest)(state.manifest, {...options, delivery, review, out: output, onProgress});
        await assertInputs(batch);
        if (optionsInput && !(await unchanged([optionsInput]))) throw new Error('Clip render options changed during rendering.');
        if (!(await unchanged([...extraInputs, ...mediaInputs])) || digest(await readJson(state.manifest)) !== manifestHash) throw new Error('Authored edit, scene assets, prepared media or motion plan changed during rendering.');
        const outputs = await Promise.all([result.output, result.qc, ...(result.safeReport ? [result.safeReport] : [])].map(p => fileSnapshot(p)));
        state.renders[key] = {mode, manifestHash, outputs, qc: result.qc, mediaInputs, optionsInputs: [optionsInput, ...extraInputs].filter(Boolean), result};
        state.status = 'rendered'; state.renderedAt = new Date().toISOString();
        results.push({id: clip.id, cached: false, ...result}); await saveBatch(file, batch);
      } catch (error) { state.status = 'failed'; state.error = error.message; await saveBatch(file, batch); throw error; }
    }
    return {ok: true, batch: file, status: 'rendered', mode: delivery ? 'delivery' : review ? 'review' : 'preview', clips: results,
      next: delivery ? 'Probe, watch and listen to every result; then copy approved exports and run scripts/publish-pack.mjs for each clip using reviewed platform copy. Nothing was posted.' : 'Review each actual video in the live editor; previews are not delivery approval.'};
  });
}

export async function podcastBatchStatus(file) {
  const batch = await loadBatch(file);
  const inputsCurrent = await unchanged([...batch.inputs, ...(batch.selectionInput ? [batch.selectionInput] : [])]);
  const clips = [];
  for (const clip of batch.selections?.clips ?? []) {
    const state = batch.clipStates[clip.id];
    const manifest = state?.manifest ? await readJson(state.manifest).catch(() => null) : null;
    const manifestHash = manifest ? digest(manifest) : null;
    const rendered = [];
    for (const receipt of Object.values(state?.renders ?? {})) if (await verifiedRender(receipt, manifestHash)) rendered.push({mode: receipt.mode, output: receipt.result.output, qc: receipt.qc});
    const prepared = manifestHash && state?.preparation?.manifestHash === manifestHash && await unchanged(state.preparation.outputs);
    const status = !inputsCurrent ? 'inputs-changed' : rendered.length ? 'rendered' : prepared ? 'prepared' : state?.status === 'failed' ? 'failed' : state?.manifest ? 'needs-prepare' : 'selected';
    clips.push({id: clip.id, project: clip.projectId, fromSec: clip.fromSec, toSec: clip.toSec, signoff: clip.signoff,
      status, manifest: state?.manifest ?? null, error: state?.error ?? null, rendered,
      ...(state?.manifest ? {liveEditor: {script: 'scripts/review-editor.mjs', args: [state.manifest]}} : {})});
  }
  return {ok: true, batch: file, status: !inputsCurrent ? 'inputs-changed' : !batch.selections ? 'needs-selection' : clips.every(c => c.status === 'rendered') ? 'rendered' : clips.every(c => c.status === 'prepared') ? 'prepared' : 'in-progress',
    source: batch.source.path, transcript: batch.transcript, transcriptReview: batch.transcriptReview, candidates: batch.proposals.candidates.length,
    selectionApproval: batch.selections ? {approvedBy: batch.selections.approvedBy, selectionApproved: true} : null, clips};
}
