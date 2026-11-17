import './project-tmp.mjs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run} from './media.mjs';
import {atomicJson, guardedFile} from './breakdown-prepare.mjs';
import {recomputeBreakdown, SFX_TYPES} from './breakdown-merge.mjs';
import {PRESENTER_MIN_SHARE} from './breakdown-presenter.mjs';

const ALLOWED = {text: ['text', 'entrance', 'exit', 'kind'], transition: ['kind', 'direction'], overlay: ['kind'], camera: ['label'], cut: ['kind'], event: ['kind'], look: ['label'], presenter: ['present']};
const ENUMS = {
  presenter: {present: [true, false]},
  text:{kind:['caption','title','label','scene-text'],entrance:['cut','pop','fade','slide','typewriter','word-by-word','other','unknown','present-at-start'],exit:['cut','pop','fade','slide','typewriter','word-by-word','other','unknown','present-at-end']},
  transition:{kind:['fade','flash','dissolve','slide','whip','zoom','blur','glitch','spin','other'],direction:[null,'left','right','up','down']},
  overlay:{kind:['sticker','logo','pip']},
  camera:{label:['static','zoom-in','zoom-out','pan-left','pan-right','tilt-up','tilt-down','pan','tilt','handheld','moving','unknown']},
  cut:{kind:['cut','jump','punch-in','punch-out']},event:{kind:['punch-in','punch-out']},
  look:{label:['bw','teal-orange','vivid','muted','warm','cool','natural','unknown']},
};
function mergeRejectedCut(b,cut) {
  if(cut.scope==='region' || cut.shotBoundary===false)return;
  const boundary=cut.t;
  if((b.cuts??[]).some(c=>Math.abs(c.t-boundary)<.001) || (b.transitions??[]).some(t=>Math.abs((t.start+t.end)/2-boundary)<.001))return;
  const index=(b.shots??[]).findIndex((s,i)=>i<b.shots.length-1 && Math.abs(s.end-boundary)<.001 && Math.abs(b.shots[i+1].start-boundary)<.001);
  if(index<0)throw new Error(`Rejected cut ${cut.id} has no adjacent shot boundary; rebuild the analysis before review.`);
  const left=b.shots[index],right=b.shots[index+1];
  left.end=right.end;left.len=+(left.end-left.start).toFixed(3);
  left.mergedFrom=[...(left.mergedFrom??[left.id]),...(right.mergedFrom??[right.id])];
  left.camera={label:'unknown',zoomPerSec:null,panXPerSec:null,panYPerSec:null,kenBurns:false,basis:'inferred',confidence:'low',status:'needs-confirmation',
    reason:'A cut was rejected; the merged shot camera needs review.',confirmHow:'Watch the complete merged shot.'};
  if (b.presenter?.perShot) {
    b.presenter.perShot = b.presenter.perShot.filter(p => p.shotId !== right.id);
    const merged = b.presenter.perShot.find(p => p.shotId === left.id);
    // Aggregate shares do not contain enough sample data to reweight a merged shot.
    if (merged) merged.share = null;
  }
  b.shots.splice(index+1,1);
  for(const list of [b.events,b.overlays,b.text])for(const item of list??[])if(item.shotId===right.id)item.shotId=left.id;
}
const AUDIO = new Set(['sfx', 'bed', 'tempo']);
const QUESTIONS = {
  presenter: 'Is a real person (not a drawing) on screen in these frames?',

  text: 'Read the words and check their entrance and exit.',
  sfx: 'Audio required: listen at this time to verify the sound effect and type.',
  bed: 'Audio required: listen through speech gaps to verify the music bed.',
  tempo: 'Audio required: tap along with the music to verify tempo.',
  transition: 'Which transition joins these frames?', overlay: 'Is this a sticker, logo or picture-in-picture?',
  camera: 'What does the camera do in this shot?', cut: 'Is this a cut, jump cut or punch-in?',
  event: 'Check the visual event at this time.', look: 'Check the colour look across these frames.',
};
const r3 = v => +v.toFixed(3);
const presenterPresence = item => typeof item.present === 'boolean' ? item.present
  : Number.isFinite(item.share) ? item.share >= PRESENTER_MIN_SHARE : null;
export const reviewIdentity = b => createHash('sha256').update(JSON.stringify(b)).digest('hex');

export function findItem(b, id) {
  for (const [group, list] of [['text', b.text], ['sfx', b.sound?.sfx], ['transition', b.transitions], ['overlay', b.overlays], ['cut', b.cuts], ['event', b.events]]) {
    const item = (list ?? []).find(x => x.id === id);
    if (item) return {group, item};
  }
  if (id === 'sound.bed' && b.sound?.bed) return {group: 'bed', item: b.sound.bed};
  if (id === 'sound.tempo' && b.sound?.tempo) return {group: 'tempo', item: b.sound.tempo};
  if (id === 'presenter' && b.presenter) return {group: 'presenter', item: b.presenter};
  if (id === 'look' && b.look) return {group: 'look', item: b.look};
  const shot = (b.shots ?? []).find(x => x.id === id);
  return shot ? {group: 'camera', item: shot} : null;
}
export function stripTimes({group, item}, duration = Infinity, fps = 30) {
  let times;
  if (group === 'presenter') times = item.spans?.length ? item.spans.slice(0, 3).map(s => (s.start + s.end) / 2) : [0, duration / 2, duration - 1 / fps];
  else if (group === 'look') times = [0, duration / 2, duration - 1 / fps];
  else if (Number.isFinite(item.t)) times = [item.t - .2, item.t, item.t + .2];
  else {
    const pad = group === 'transition' ? 0 : Math.min(.1, (item.end - item.start) / 4);
    times = [item.start + pad, (item.start + item.end) / 2, item.end - pad];
  }
  return times.map(t => r3(Math.max(0, Math.min(Number.isFinite(duration) ? Math.max(0, duration - 1 / fps) : t, t))));
}
async function ffmpegStrip(proxy, times, file) {
  const inputs = times.flatMap(t => ['-ss', String(t), '-i', proxy]);
  const graph = `${times.map((_, i) => `[${i}:v]scale=270:-2[f${i}]`).join(';')};${times.map((_, i) => `[f${i}]`).join('')}hstack=inputs=${times.length}`;
  await run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph, '-frames:v', '1', file]);
}
export async function buildReviewTasks({breakdown, prepared, dir, limit = 25, makeStrip = (times, file) => ffmpegStrip(prepared.proxy.path, times, file)}) {
  if (!Number.isInteger(limit) || limit < 0) throw new Error('Review limit must be a nonnegative integer.');
  await fsp.mkdir(guardedFile(dir, 'review'), {recursive: true});
  const tasks = [];
  for (const id of (breakdown.reviewQueue ?? []).slice(0, limit)) {
    if (!/^(?:[A-Z][0-9]{2,}|sound\.(?:bed|tempo)|look|presenter)$/u.test(id)) throw new Error('Unsafe review item id.');
    const found = findItem(breakdown, id);
    if (!found) throw new Error(`Review queue contains an unknown item: ${id}`);
    const {group, item} = found;
    if (AUDIO.has(group)) {
      tasks.push({id, group, status: 'audio-required', image: null, question: QUESTIONS[group], current: item});
      continue;
    }
    const image = guardedFile(dir, path.join('review', `${id}.jpg`));
    await makeStrip(stripTimes(found, breakdown.durationSec ?? prepared.probe?.durationSec ?? item.end, prepared.proxy.fps ?? 30), image);
    const target = group === 'camera' ? item.camera : item;
    const current = group === 'presenter' ? {present: presenterPresence(item)}
      : Object.fromEntries(ALLOWED[group].map(k => [k, target[k] ?? null]));
    tasks.push({id, group, status: 'images-required', question: QUESTIONS[group], image, current});
  }
  const answersTemplate = tasks.filter(x => !AUDIO.has(x.group)).map(x => ({id: x.id, verdict: null, value: null, note: ''}));
  await atomicJson(guardedFile(dir, 'review_tasks.json'), {schema: 1, breakdownSha256: reviewIdentity(breakdown), rule: 'Answer only from images you opened. Audio claims cannot be changed by image review.', tasks});
  // Preserve a template that may already contain a manual draft.
  const template = guardedFile(dir, 'review-answers.template.json');
  try { await fsp.writeFile(template, `${JSON.stringify(answersTemplate, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'}); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  const earTemplate = tasks.filter(x => AUDIO.has(x.group)).map(x => ({id: x.id, verdict: null, value: null, note: ''}));
  const ears = guardedFile(dir, 'review-ears.template.json');
  try { await fsp.writeFile(ears, `${JSON.stringify(earTemplate, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'}); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  return {tasks, answersTemplate, earTemplate};
}
export function reviewedPresenter(item, answer) {
  if (answer.verdict === 'correct' && typeof answer.value?.present !== 'boolean') throw new Error(`No permitted correction supplied for ${answer.id}.`);
  const current = presenterPresence(item);
  if (answer.verdict === 'confirm') {
    if (current === null) throw new Error('Cannot confirm unknown presenter presence; supply a correction.');
    if (answer.value && Object.hasOwn(answer.value, 'present') && answer.value.present !== current)
      throw new Error('Presenter confirmation contradicts the current presence; use correct instead.');
  }
  const present = answer.verdict === 'reject' ? false : answer.verdict === 'correct' ? answer.value.present : current;
  const {reason, confirmHow, ...rest} = item;
  const base = {...rest, present, basis: 'seen', status: 'confirmed', confidence: 'high', reviewedWith: 'images', reviewVerdict: answer.verdict};
  if (!present) return {...base, share: 0, multiFaceShare: 0, faceHeight: null, size: 'none', spans: [], perShot: (item.perShot ?? []).map(p => ({...p, share: p.share == null ? null : 0})),
    note: 'A reviewer saw no real person; the detections were drawings or false matches.'};
  if (!Number.isFinite(item.share) || item.share < PRESENTER_MIN_SHARE || item.size === 'none')
    return {...base, share: null, multiFaceShare: null, faceHeight: null, size: 'unknown', spans: [],
      perShot: (item.perShot ?? []).map(p => ({...p, share: null})),
      note: 'A reviewer saw a real person missed by the measurement; visibility share, face size and timing remain unknown.'};
  return base;
}

export function applyReview(breakdown, answers) {
  if (!Array.isArray(answers)) throw new Error('Review answers must be an array.');
  const next = structuredClone(breakdown), used = new Set();
  next.rejected = [...(next.rejected ?? [])];
  for (const answer of answers) {
    if (!answer || used.has(answer.id)) throw new Error('Duplicate or invalid review answer.');
    used.add(answer.id);
    const found = findItem(next, answer.id);
    if (!found) throw new Error(`Review answer names an unknown item: ${answer.id}`);
    if (AUDIO.has(found.group)) throw new Error(`Audio required for ${answer.id}; images cannot confirm, correct or reject sound claims.`);
    const target = found.group === 'camera' ? found.item.camera : found.item;
    if (!(breakdown.reviewQueue ?? []).includes(answer.id)) throw new Error(`Item is not pending review: ${answer.id}`);
    if (!['confirm', 'correct', 'reject'].includes(answer.verdict)) throw new Error(`Review answer ${answer.id} has no verdict.`);
    if (found.group === 'presenter') { next.presenter = reviewedPresenter(found.item, answer); continue; }
    if (answer.verdict === 'reject') {
      const lists = {text: next.text, transition: next.transitions, overlay: next.overlays, cut: next.cuts, event: next.events};
      if (lists[found.group]) lists[found.group].splice(lists[found.group].indexOf(found.item), 1);
      else Object.assign(target, {label: 'unknown'});
      if(found.group==='cut')mergeRejectedCut(next,found.item);
      if(!next.rejected.includes(answer.id))next.rejected.push(answer.id);
    } else if (answer.verdict === 'correct') {
      const entries = ALLOWED[found.group].filter(key => answer.value && Object.hasOwn(answer.value, key));
      if (!entries.length) throw new Error(`No permitted correction supplied for ${answer.id}.`);
      for (const key of entries) {
        const value = answer.value[key];
        if (!(key === 'direction' && value === null) && (typeof value !== 'string' || !value.trim() || value.length > 10000)) throw new Error(`Invalid review field: ${key}`);
        if(ENUMS[found.group]?.[key] && !ENUMS[found.group][key].includes(value))throw new Error(`Invalid review value for ${found.group}.${key}: ${value}`);
        target[key] = value;
      }
    }
    const unresolved = (answer.verdict === 'reject' && ['camera','look'].includes(found.group)) || target.label === 'unknown' || target.entrance === 'unknown' || target.exit === 'unknown';
    if(unresolved) {
      Object.assign(target,{basis:'seen',status:'needs-confirmation',confidence:'low',reviewedWith:'images',reviewVerdict:answer.verdict,
        reason:answer.verdict==='reject'?'Previous interpretation was rejected; the replacement is still unknown.':'The reviewed value remains unknown.',confirmHow:'Review the visual evidence and provide a supported interpretation.'});
      continue;
    }
    Object.assign(target, {basis: 'seen', status: 'confirmed', confidence: 'high', reviewedWith: 'images'});
    delete target.reason; delete target.confirmHow;
  }
  return recomputeBreakdown(next);
}

export function applyEarReview(breakdown, answers) {
  if (!Array.isArray(answers)) throw new Error('Ear answers must be an array.');
  const next = structuredClone(breakdown), used = new Set();
  next.rejected = [...(next.rejected ?? [])];
  for (const answer of answers) {
    if (!answer || typeof answer.id !== 'string' || used.has(answer.id)) throw new Error('Duplicate or invalid ear answer.');
    used.add(answer.id);
    const found = findItem(next, answer.id);
    if (!found) throw new Error(`Ear answer names an unknown item: ${answer.id}`);
    if (!AUDIO.has(found.group)) throw new Error(`${answer.id} is a picture item; answer it from images without --heard-by.`);
    if (!(breakdown.reviewQueue ?? []).includes(answer.id)) throw new Error(`Item is not pending review: ${answer.id}`);
    const {group, item} = found, value = answer.value ?? {};
    if (answer.verdict === 'reject') {
      if (group !== 'sfx') throw new Error(`Only a sound effect can be rejected by ear; correct ${answer.id} instead.`);
      next.sound.sfx.splice(next.sound.sfx.indexOf(item), 1);
      if (!next.rejected.includes(answer.id)) next.rejected.push(answer.id);
      continue;
    }
    if (answer.verdict === 'confirm') {
      if (group === 'sfx' && !SFX_TYPES.includes(item.type)) throw new Error('Cannot confirm an unknown sound effect type.');
      const currentKey = group === 'sfx' ? 'type' : group === 'bed' ? 'present' : 'bpm';
      if (Object.hasOwn(value, currentKey) && value[currentKey] !== item[currentKey]) throw new Error('Confirmation contradicts the current value; use correct instead.');
      if (group === 'bed' && typeof item.present !== 'boolean') throw new Error('Cannot confirm an unknown music bed; correct it with present true or false.');
      if (group === 'tempo' && !Number.isFinite(item.bpm)) throw new Error('Cannot confirm an unknown tempo; correct it with bpm.');
    } else if (answer.verdict === 'correct') {
      if (group === 'sfx') {
        if (!SFX_TYPES.includes(value.type)) throw new Error(`Invalid sound effect type for ${answer.id}.`);
        item.type = value.type;
      } else if (group === 'bed') {
        if (typeof value.present !== 'boolean') throw new Error('A music bed correction needs present true or false.');
        item.present = value.present;
      } else {
        if (!Number.isFinite(value.bpm) || value.bpm < 40 || value.bpm > 240) throw new Error('A tempo correction needs bpm between 40 and 240.');
        if (!Number.isFinite(item.bpm) || Math.abs(value.bpm - item.bpm) > 0.5) {
          item.bpm = value.bpm;
          next.sound.beats = [];
          item.note = 'Tempo corrected by ear; the measured beat grid no longer applies and was cleared.';
        }
      }
    } else throw new Error(`Ear answer ${answer.id} has no verdict.`);
    if (group === 'sfx') item.heard = {verdict: /^H[0-9]+$/u.test(item.id) ? 'heard-only' : 'heard', type: item.type};
    Object.assign(item, {basis: 'heard', status: 'confirmed', confidence: 'high', reviewedWith: 'ear', heardBy: 'creator', reviewVerdict: answer.verdict});
    delete item.reason; delete item.confirmHow;
  }
  return recomputeBreakdown(next);
}
