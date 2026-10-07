import { randomUUID } from 'node:crypto';
import { atomicJson, checkedPath, fileSnapshot, finite, object, readJson, slug, withFileLock } from './job-paths.mjs';

export const REVIEW_CATEGORIES = Object.freeze(['timing', 'captions', 'audio', 'visual', 'other']);

export function parseTimecode(value) {
  if (typeof value === 'number') return finite(value, 0, 86400, 'timecode');
  if (typeof value !== 'string') throw new Error('Timecode must be seconds or HH:MM:SS.mmm.');
  if (/^\d+(?:\.\d{1,6})?$/.test(value)) return finite(Number(value), 0, 86400, 'timecode');
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(value);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new Error('Timecode must be seconds or HH:MM:SS.mmm with valid minutes and seconds.');
  return finite(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4] ?? 0}`), 0, 86400, 'timecode');
}

export function formatTimecode(seconds) {
  const milliseconds = Math.round(parseTimecode(seconds) * 1000);
  const hours = Math.floor(milliseconds / 3600000), minutes = Math.floor(milliseconds / 60000) % 60;
  const wholeSeconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

const validText = (text, label = 'text') => {
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error(`${label} must contain 1 to 4000 readable characters.`);
  return text.trim();
};

async function location(project, file) {
  slug(project, 'project');
  const relative = file ?? `Projects/${project}/review-notes.json`;
  if (!relative.endsWith('.json')) throw new Error('Review notes must be saved in a .json file.');
  await checkedPath(relative, { write: true, project });
  return relative;
}

async function loadNotes(project, file) {
  const store = await readJson(file, { optional: true });
  if (!store) return { version: 1, project, notes: [] };
  object(store, ['version', 'project', 'updatedAt', 'notes'], 'review store');
  if (store.version !== 1 || store.project !== project || !Array.isArray(store.notes) || store.notes.length > 10000) throw new Error('Unsupported or malformed review store.');
  const ids = new Set();
  for (const note of store.notes) {
    object(note, ['id', 'createdAt', 'updatedAt', 'startSec', 'endSec', 'category', 'text', 'status', 'media', 'resolution'], 'review note');
    if (typeof note.id !== 'string' || !/^[a-f0-9-]{36}$/.test(note.id) || ids.has(note.id)) throw new Error('Invalid or duplicate review note ID.');
    ids.add(note.id);
    finite(note.startSec, 0, 86400, 'stored start time');
    finite(note.endSec, 0, 86400, 'stored end time');
    if ([note.createdAt, note.updatedAt].some((stamp) => typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp)))) throw new Error('Invalid review note timestamps.');
    if (note.endSec < note.startSec || !REVIEW_CATEGORIES.includes(note.category) || !['open', 'resolved'].includes(note.status)) throw new Error('Invalid note range, category or status.');
    validText(note.text);
    if (note.resolution !== undefined) validText(note.resolution, 'resolution');
    object(note.media, ['path', 'size', 'sha256'], 'review media');
    await checkedPath(note.media.path);
    if (!/^[a-f0-9]{64}$/.test(note.media.sha256) || !Number.isInteger(note.media.size) || note.media.size < 1) throw new Error('Invalid review media revision.');
    if (file.toLowerCase() === note.media.path.toLowerCase()) throw new Error('Review notes cannot overwrite their media.');
  }
  return store;
}

export async function addReviewNote({ project, file, media, at, end, category = 'other', text }) {
  const relative = await location(project, file);
  const startSec = parseTimecode(at), endSec = end === undefined ? startSec : parseTimecode(end);
  if (endSec < startSec) throw new Error('The end time must be at or after the start time.');
  if (!REVIEW_CATEGORIES.includes(category)) throw new Error(`category must be one of ${REVIEW_CATEGORIES.join(', ')}.`);
  const noteText = validText(text);
  if (typeof media !== 'string' || media.toLowerCase() === relative.toLowerCase()) throw new Error('Name the media file explicitly; it cannot be the notes file.');
  await checkedPath(media, { mustExist: true });
  return withFileLock(`${relative}.lock`, { project }, async () => {
    const store = await loadNotes(project, relative);
    if (store.notes.length === 10000) throw new Error('Review file has reached 10000 notes; choose another --file.');
    const stamp = new Date().toISOString();
    const note = { id: randomUUID(), createdAt: stamp, updatedAt: stamp, startSec, endSec, category, text: noteText,
      status: 'open', media: await fileSnapshot(media) };
    store.notes.push(note);
    store.updatedAt = stamp;
    await atomicJson(relative, store, { project });
    return { ok: true, file: relative, note };
  });
}

export async function setReviewStatus({ project, file, id, status, resolution }) {
  const relative = await location(project, file);
  if (!['open', 'resolved'].includes(status) || typeof id !== 'string') throw new Error('A note ID and valid status are required.');
  if (resolution !== undefined) validText(resolution, 'resolution');
  return withFileLock(`${relative}.lock`, { project }, async () => {
    const store = await loadNotes(project, relative);
    const note = store.notes.find((item) => item.id === id);
    if (!note) throw new Error(`No review note has ID ${id}.`);
    note.status = status;
    note.updatedAt = new Date().toISOString();
    if (resolution !== undefined) note.resolution = resolution.trim();
    store.updatedAt = note.updatedAt;
    await atomicJson(relative, store, { project });
    return { ok: true, file: relative, note };
  });
}

export async function listReviewNotes({ project, file, openOnly = false, media }) {
  const relative = await location(project, file);
  if (media !== undefined) await checkedPath(media);
  const store = await loadNotes(project, relative);
  const current = new Map();
  const notes = [];
  for (const note of store.notes) {
    if (openOnly && note.status !== 'open') continue;
    if (media && note.media.path.toLowerCase() !== media.toLowerCase()) continue;
    if (!current.has(note.media.path)) current.set(note.media.path, await fileSnapshot(note.media.path).catch(() => null));
    const snapshot = current.get(note.media.path);
    notes.push({ ...note, timecode: formatTimecode(note.startSec), endTimecode: formatTimecode(note.endSec),
      mediaChanged: !snapshot || snapshot.sha256 !== note.media.sha256, mediaAvailable: !!snapshot });
  }
  notes.sort((a, b) => a.media.path.localeCompare(b.media.path) || a.startSec - b.startSec || a.createdAt.localeCompare(b.createdAt));
  return { ok: true, project, file: relative, notes };
}
