// scripts/lib/breakdown-merge.mjs
const pad = n => String(n).padStart(2, '0');
const round = (v, d = 3) => (v == null ? null : +Number(v).toFixed(d));
export const reviewWeights = Object.freeze({text: 3, sfx: 3, transition: 2, bed: 2, tempo: 2, presenter: 2, overlay: 1, camera: 1, cut: 2, event: 1, look: 1});

export const SFX_TYPES = Object.freeze(['pop', 'click', 'ding', 'impact', 'whoosh', 'riser', 'hit']);
export const CUT_TEXT_TUNING=Object.freeze({boundarySec:.1,containmentMin:.9}); // Narrow-margin hypothesis; keep caption-like changes as candidates.
const atTextBoundary=(time,boundary)=>Math.abs(time-boundary)<=CUT_TEXT_TUNING.boundarySec+Number.EPSILON*Math.max(1,Math.abs(time),Math.abs(boundary));
const cutContainment=(cut,text)=>{
  const area=cut[2]*cut[3];
  if(!(area>0))return 0;
  const width=Math.max(0,Math.min(cut[0]+cut[2],text[0]+text[2])-Math.max(cut[0],text[0]));
  const height=Math.max(0,Math.min(cut[1]+cut[3],text[1]+text[3])-Math.max(cut[1],text[1]));
  return width*height/area;
};
export const reportedSfx = sound => (sound?.sfx ?? []).filter(x => x.detection !== 'candidate');
export const confirmedSfx = reportedSfx; // Compatibility name: existence, independent of type confidence.
export function sfxSummary(sound, duration) {
  const count = reportedSfx(sound).length;
  return {reportedSfxCount:count,confirmedSfxCount:count,candidateSfxCount:(sound?.sfxCandidates ?? []).length,
    hitsPerMinute:duration ? round(count*60/duration,1) : null};
}

export const confidenceFor = score => (score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low');

export function itemMeta(score, basis = 'measured', {conflict = null, confirmHow = null} = {}) {
  const confidence = confidenceFor(score ?? 0);
  const status = conflict || confidence === 'low' ? 'needs-confirmation' : 'confirmed';
  const meta = {basis, confidence, status};
  if (conflict) meta.reason = conflict;
  if (status === 'needs-confirmation') meta.confirmHow = confirmHow ?? 'Look at the frames around this moment.';
  return meta;
}

export function speechStats(captions, durationSec) {
  const items = [...captions].sort((a, b) => a.startMs - b.startMs);
  const words = items.reduce((n, c) => n + String(c.text).trim().split(/\s+/u).filter(Boolean).length, 0);
  const spans = [];
  for (const c of items) {
    if (!Number.isFinite(c.startMs) || !Number.isFinite(c.endMs) || c.startMs < 0 || c.endMs <= c.startMs || c.endMs > durationSec * 1000 + 100) throw new Error('Invalid speech timing.');
    const next = {start: round(c.startMs / 1000), end: round(Math.min(durationSec, c.endMs / 1000))};
    const previous = spans.at(-1);
    if (previous && next.start <= previous.end) previous.end = Math.max(previous.end, next.end); else spans.push(next);
  }
  const pauses = [];
  for (let i = 1; i < spans.length; i++) {
    const len = round(spans[i].start - spans[i - 1].end);
    if (len >= 1.2) pauses.push({start: spans[i - 1].end, end: spans[i].start, len});
  }
  return {words, wordsPerMinute: durationSec ? round(words / (durationSec / 60), 1) : null,
    speakingSec: round(spans.reduce((s, x) => s + (x.end - x.start), 0)),
    uncertainWords: items.filter(c => (c.confidence ?? 1) < 0.6).length, pauses, spans};
}

const PRIORITY = {'text-in': 3, 'text-change': 2, 'overlay-in': 2, cut: 1, transition: 1};

export function anchorSfx(sfx, events, window = 0.2) {
  return sfx.map(x => {
    let best = null;
    for (const e of events) {
      const dt = round(x.t - e.t);
      if (Math.abs(dt) > window) continue;
      const priority = e.priority ?? PRIORITY[e.kind], bestPriority = best && (best.e.priority ?? PRIORITY[best.e.kind]);
      if (!best || priority > bestPriority || (priority === bestPriority && Math.abs(dt) < Math.abs(best.dt))) best = {e, dt};
    }
    return {...x, anchor: best ? {kind: best.e.kind, id: best.e.id, dt: best.dt} : null};
  });
}

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy, union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
};
const overlapsInTime = (a, b) => a.start < b.end && b.start < a.end;
export const analysisDuration = prepare => prepare.proxy?.durationSec ?? prepare.probe.videoDurationSec ?? prepare.probe.durationSec;

// OCR geometry only proposes a caption. Resolve its role here, where both the
// picture timeline and the optional speech transcript are available.
function textRole(t, {durationSec, shots, captions, hasAudio}) {
  if (t.kind !== 'caption') return {};
  const held = t.end - t.start;
  const boundaries = shots.slice(1).filter(s => s.start > t.start && s.start < t.end).length;
  if ((t.events ?? []).some(e => e.kind === 'highlight-change') ||
      (held >= 3 && (held >= durationSec * 0.6 || boundaries >= 3)) ||
      !hasAudio || (captions !== null && captions.length === 0)) return {kind: 'label'};
  const tokens = value => String(value ?? '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const visible = tokens(t.text);
  const spoken = (captions ?? []).filter(c => c.startMs / 1000 < t.end && c.endMs / 1000 > t.start);
  const speech = speechStats(spoken, durationSec);
  const overlap = speech.spans.reduce((n, s) => n + Math.max(0, Math.min(t.end, s.end) - Math.max(t.start, s.start)), 0);
  const words = new Set(spoken.flatMap(c => tokens(c.text)));
  if (visible.length && overlap >= held * 0.5 && visible.filter(w => words.has(w)).length >= visible.length * 0.5) return {};
  return {confidence: 'low', status: 'needs-confirmation',
    reason: captions === null ? 'Spoken-word caption role is unverified: no transcript.' : 'Text does not match timed speech closely enough to establish spoken-word captions.',
    confirmHow: 'Compare the text with the original audio; confirm whether it transcribes speech or is an editorial label.'};
}

export function mergeBreakdown({prepare, captions = null, shots, camera, overlays, look, text, sound, presenter = null, loudness = null, analysedAt = new Date().toISOString()}) {
  const durationSec = analysisDuration(prepare);
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Invalid reference duration.');
  if (Math.abs(shots.durationSec - durationSec) > (prepare.proxy?.fps ? 2 / prepare.proxy.fps + .005 : .15)) throw new Error('Shot timeline disagrees with source duration.');
  let cuts = shots.cuts.map((c, i) => ({id: `C${pad(i + 1)}`, t: c.t, kind: c.kind, scale: c.scale ?? null,shotBoundary:c.scope!=='region',
    ...(c.scope ? {scope:c.scope,box:c.box} : {}), ...(c.evidence ? {evidence:c.evidence} : {}), ...itemMeta(c.score)}));
  const transitions = shots.transitions.map((r, i) => ({id: `R${pad(i + 1)}`, start: r.start, end: r.end, kind: r.kind, direction: r.direction ?? null,
    ...(r.scope ? {scope:r.scope,box:r.box} : {}),
    ...itemMeta(r.score, 'measured', r.kind === 'other' ? {conflict: 'transition type not recognised', confirmHow: 'Look at the frame strip and name the transition.'} : {})}));
  const cams = new Map(camera.camera.map(c => [c.shotId, c]));
  const shotItems = shots.shots.map(s => {
    const cam = cams.get(s.id) ?? {label: 'unknown', score: 0.3};
    return {...s, camera: {label: cam.label, zoomPerSec: cam.zoomPerSec ?? null, panXPerSec: cam.panXPerSec ?? null, panYPerSec: cam.panYPerSec ?? null,
      kenBurns: cam.kenBurns ?? false, ...itemMeta(cam.score, 'measured', {confirmHow: 'Watch the shot and name the camera move.'})}};
  });
  const events = camera.camera.flatMap(c => (c.events ?? []).map(e => ({...e, shotId: c.shotId}))).map((e, i) => ({id: `E${pad(i + 1)}`, ...e, ...itemMeta(0.6)}));
  const textItems = text.text.map((t, i) => ({id: `T${pad(i + 1)}`, ...t,
    ...(t.events ? {events:t.events.map((e,j)=>({id:`T${pad(i+1)}.H${pad(j+1)}`,...e,...itemMeta(e.score)}))} : {}),
    ...itemMeta(t.score, 'measured', ['other', 'unknown'].includes(t.entrance) || ['other', 'unknown'].includes(t.exit) ? {conflict: 'text animation not recognised', confirmHow: 'Watch the text entrance and exit.'} : t.score < 0.75 ? {conflict: 'low reading confidence', confirmHow: 'Read the frame and correct the words.'} : {}),
    ...textRole(t, {durationSec, shots: shotItems, captions, hasAudio: prepare.probe.hasAudio})}));
  const cutCandidates=[];
  cuts=cuts.filter(c=>{
    if(c.scope!=='region' || !Array.isArray(c.box))return true;
    const caption=textItems.find(t=>Array.isArray(t.box)
      && (atTextBoundary(c.t,t.start) || atTextBoundary(c.t,t.end))
      && cutContainment(c.box,t.box)>=CUT_TEXT_TUNING.containmentMin);
    if(!caption)return true;
    cutCandidates.push({...c,status:'needs-confirmation',confidence:'low',shotBoundary:false,
      reason:'The changed region is mostly contained in text at an OCR boundary; it may be a caption change.',
      confirmHow:'Watch the region before and after the text boundary.',
      captionEvidence:{textId:caption.id,containment:round(cutContainment(c.box,caption.box),4)}});
    return false;
  });
  const overlayItems = overlays.overlays
    .filter(o => !textItems.some(t => overlapsInTime(o, t) && iou(o.box, t.box) > 0.3))
    .map((o, i) => ({id: `O${pad(i + 1)}`, ...o, ...itemMeta(o.score, 'measured', {conflict: 'overlay detection is best effort', confirmHow: 'Check the frame for a sticker, logo or picture-in-picture.'})}));
  const visualEvents = visualEventsFor({text:textItems,overlays:overlayItems,cuts,transitions});
  const s = prepare.probe.hasAudio ? sound?.sound ?? null : null;
  const weak = s ? [...(s.sfxCandidates ?? []),...(s.sfx ?? []).filter(x=>x.detection==='candidate')] : [];
  const sfxCandidates = weak.map((x,i)=>({...x,id:`Q${pad(i+1)}`,detection:'candidate',status:'needs-confirmation',confidence:'low'}));
  const sfx = s ? anchorSfx((s.sfx ?? []).filter(x=>x.detection!=='candidate'), visualEvents).map((x, i) => {
    const disagree = x.yamnet?.type && x.yamnet.score >= 0.3 && x.yamnet.type !== x.type;
    const meta = itemMeta(x.score, 'measured', disagree
      ? {conflict: `the sound looks like ${x.type} but the label model says ${x.yamnet.type}`, confirmHow: `Listen at ${x.t}s.`} : {confirmHow: `Listen at ${x.t}s.`});
    const candidate = x.status === 'needs-confirmation' || meta.status === 'needs-confirmation';
    return {id: `X${pad(i + 1)}`, ...x, ...meta, ...(candidate ? {status:'needs-confirmation',confidence:'low',confirmHow:x.confirmHow ?? `Listen at ${x.t}s.`} : {}),
      detection:'effect'};
  }) : [];
  const lens = shotItems.map(x => x.len);
  const breakdown = {
    schema: 1, referenceId: prepare.referenceId, source: {name: prepare.source.name, sha256: prepare.source.sha256}, analysedAt, durationSec,
    aspect: prepare.probe.width && prepare.probe.height ? `${prepare.probe.width}x${prepare.probe.height}` : null,
    pace: {cutCount: cuts.length, cutsPerMinute: durationSec ? round(cuts.length / (durationSec / 60), 1) : null,
      shotLen: {min: lens.length ? Math.min(...lens) : null, median: median(lens), max: lens.length ? Math.max(...lens) : null}},
    shots: shotItems, cuts, cutCandidates, transitions, events, text: textItems, overlays: overlayItems,
    look: {...look.look, ...itemMeta(look.look.score)},
    presenter,
    sound: {
      hasAudio: prepare.probe.hasAudio, loudness: prepare.probe.hasAudio ? loudness : null,
      speech: prepare.probe.hasAudio && captions ? speechStats(captions, durationSec) : null,
      speechActivity: s?.speechActivity ?? null, beatFamily: s?.beatFamily ?? null,
      bed: s?.bed ? {...s.bed, ...itemMeta(s.bed.score ?? (s.bed.present === null ? 0.3 : 0.7), 'measured', {confirmHow:'Listen to a pause in the speech.',...(s.bed.present === null ? {conflict:s.bed.reason} : {})})} : null,
      tempo: s?.tempo ? {...s.tempo, ...itemMeta(s.tempo.confidence >= 0.5 ? 0.75 : 0.45, 'measured', {confirmHow: 'Tap along with the music for ten seconds.'})} : null,
      tempoReason: s?.tempoReason ?? (prepare.probe.hasAudio ? null : 'no-audio'),
      beats: s?.beats ?? [], cutsOnBeat: s?.cutsOnBeat ?? null, sfx, sfxCandidates,
      ...sfxSummary({sfx,sfxCandidates},durationSec),
    },
    limitations: [...(prepare.limitations ?? [])],
  };
  if (!prepare.probe.hasAudio) breakdown.limitations.push('The reference has no audio.');
  if (!captions && prepare.probe.hasAudio) breakdown.limitations.push('Speech was not transcribed.');
  if(s?.speechActivity?.spans?.length)breakdown.limitations.push('The voice detector can confirm high-register vibrato or arpeggio instruments over drums as voice; their bed may remain unmeasured.');
  return recomputeBreakdown(breakdown);
}

export function visualEventsFor(b) {
  return [
    ...(b.text ?? []).map(t => ({kind: 'text-in', id: t.id, t: t.start, ...(t.kind==='scene-text' ? {priority:0} : {})})),
    ...(b.text ?? []).flatMap(t => (t.events ?? []).map(e => ({kind:'text-change',id:e.id,t:e.t}))),
    ...(b.overlays ?? []).map(o => ({kind: 'overlay-in', id: o.id, t: o.start})),
    ...(b.cuts ?? []).map(c => ({kind: 'cut', id: c.id, t: c.t})),
    ...(b.transitions ?? []).map(r => ({kind: 'transition', id: r.id, t: r.start})),
  ];
}

// Rebuild derived values after review; no stale counters, anchors or queue ids.
export function recomputeBreakdown(b) {
  const duration = b.durationSec;
  if (b.pace) {
    const lens = (b.shots ?? []).map(s => {s.len=round(s.end-s.start);return s.len;});
    b.pace = {cutCount: b.cuts.length, cutsPerMinute: duration ? round(b.cuts.length * 60 / duration, 1) : null,
      shotLen: {min: lens.length ? Math.min(...lens) : null, median: median(lens), max: lens.length ? Math.max(...lens) : null}};
  }
  if (b.sound) {
    const legacyCandidates=(b.sound.sfx ?? []).filter(x=>x.detection==='candidate' && x.status!=='confirmed');
    b.sound.sfxCandidates=[...(b.sound.sfxCandidates ?? []),...legacyCandidates];
    b.sound.sfxCandidates=b.sound.sfxCandidates.map((x,i)=>({...x,id:`Q${pad(i+1)}`,detection:'candidate'}));
    b.sound.sfx=(b.sound.sfx ?? []).filter(x=>!legacyCandidates.includes(x));
    b.sound.sfx = anchorSfx(b.sound.sfx ?? [], visualEventsFor(b));
    b.sound.sfx = b.sound.sfx.map(x=>({...x,detection:'effect'}));
    Object.assign(b.sound,sfxSummary(b.sound,duration));
    if (b.sound.cutsOnBeat) {
      const beats = b.sound.beats ?? [], cuts = b.cuts ?? [];
      if (!beats.length || cuts.length < 4) b.sound.cutsOnBeat = {share: null, chance: null, synced: null};
      else {
        const gaps = beats.slice(1).map((t, i) => t - beats[i]).filter(x => x > 0);
        const period = median(gaps), share = cuts.filter(c => beats.some(t => Math.abs(c.t - t) <= .08)).length / cuts.length;
        const chance = period ? Math.min(1, .16 / period) : null;
        b.sound.cutsOnBeat = {share: round(share), chance: round(chance), synced: chance == null ? null : share > chance + .2};
      }
    }
  }
  if (b.presenter?.perShot) {
    const ids = new Set((b.shots ?? []).map(s => s.id));
    b.presenter.perShot = b.presenter.perShot.filter(p => ids.has(p.shotId));
  }
  const queue = [];
  const add = (item, group, id = item?.id) => { if (item?.status === 'needs-confirmation' && id) queue.push({id, weight: reviewWeights[group] ?? 1}); };
  for (const [field, group] of [['text','text'], ['cuts','cut'], ['events','event'], ['transitions','transition'], ['overlays','overlay']]) for (const item of b[field] ?? []) add(item, group);
  for (const shot of b.shots ?? []) add(shot.camera, 'camera', shot.id);
  for (const x of b.sound?.sfx ?? []) add(x, 'sfx');
  add(b.sound?.bed, 'bed', 'sound.bed'); add(b.sound?.tempo, 'tempo', 'sound.tempo'); add(b.look, 'look', 'look');
  add(b.presenter, 'presenter', 'presenter');
  b.reviewQueue = queue.sort((a, b) => b.weight - a.weight).map(x => x.id);
  return b;
}
