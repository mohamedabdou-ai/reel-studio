import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorStore} from '../engine/src/review-editor/store.ts';
import {createProjectFollower} from '../engine/src/review-editor/shell/live-project.ts';
import {reviewManifest} from './helpers/review-manifest.mjs';
import {saveDraft, loadDraft, createDraftWriter, fingerprint, DRAFT_VERSION} from '../engine/src/review-editor/shell/draft.ts';
import {setCaptionReview} from '../engine/src/review-editor/ops/captions.ts';
import {parseManifest} from '../engine/src/review-editor/validate.ts';

function setup() {
  const manifest = reviewManifest();
  const project = {slug: manifest.id, manifestPath: `Projects/${manifest.id}/edit.json`, manifest,
    manifestRevision: 'a'.repeat(64), plate: null, needsPrepare: true, staticFiles: [],
    hasMotionPlan: false, motionPlanPath: null, exportModes: [], recipes: [], recipeInfo: [], warnings: []};
  const store = createEditorStore(manifest);
  let typing = false;
  const updates = [];
  const follower = createProjectFollower({store, initial: project, blocked: () => typing,
    onProject: next => updates.push(next), onStatus: () => {}, now: () => 1234});
  const incoming = change => {
    const next = structuredClone(project); next.manifestRevision = 'b'.repeat(64);
    change(next); return next;
  };
  return {manifest, store, follower, updates, incoming, typing: value => {typing = value;}};
}

test('an assistant caption and cut update reaches the visible store without reloading', () => {
  const {store, follower, updates, incoming} = setup();
  follower.receive(incoming(next => {
    next.manifest.captions.words[0].text = 'جديد';
    next.manifest.segments = [{fromFrame: 0, toFrame: 90}];
  }));
  const current = store.getSnapshot();
  assert.equal(current.manifest.captions.words[0].text, 'جديد');
  assert.equal(current.durationInFrames, 90);
  assert.equal(current.dirty, false);
  assert.equal(updates.length, 1);
  assert.equal(follower.getStatus().updatedAt, 1234);
  assert.deepEqual(follower.getStatus().changes, ['cuts', 'captions']);
});

test('a typed but uncommitted field and a saved local edit both delay external updates', () => {
  const {store, follower, incoming, typing} = setup();
  const next = incoming(value => {value.manifest.captions.words[0].text = 'المساعد';});
  typing(true);
  follower.receive(next);
  assert.equal(store.getSnapshot().manifest.captions.words[0].text, 'شرح');
  assert.equal(follower.getStatus().pending, true);
  store.apply(value => {const manual = structuredClone(value); manual.captions.words[0].text = 'يدوي'; return manual;}, 'يدوي');
  typing(false); follower.receive(next);
  assert.equal(store.getSnapshot().manifest.captions.words[0].text, 'يدوي');
  assert.equal(store.getSnapshot().dirty, true);
  store.undo(); follower.receive(next);
  assert.equal(store.getSnapshot().manifest.captions.words[0].text, 'المساعد');
  assert.equal(follower.getStatus().pending, false);
});

test('pausing holds the newest update and resuming applies it once', () => {
  const {store, follower, incoming, updates} = setup();
  follower.setEnabled(false);
  follower.receive(incoming(next => {next.manifest.captions.words[0].text = 'الأول';}));
  const latest = incoming(next => {next.manifest.captions.words[0].text = 'الأحدث';});
  follower.receive(latest);
  assert.equal(store.getSnapshot().manifest.captions.words[0].text, 'شرح');
  follower.setEnabled(true);
  assert.equal(store.getSnapshot().manifest.captions.words[0].text, 'الأحدث');
  follower.receive(latest);
  assert.equal(updates.length, 1);
});

test('a newly prepared cut replaces stale preview metadata even when the manifest did not change', () => {
  const {follower, updates, incoming, store} = setup();
  follower.receive(incoming(next => {
    next.plate = {src: '_prepared/live-test/abcd.mp4', width: 1080, height: 1920,
      segments: [{fromFrame: 0, toFrame: 120}], sourceSha256: 'a'.repeat(64)};
    next.needsPrepare = false;
  }));
  assert.equal(updates[0].plate.src, '_prepared/live-test/abcd.mp4');
  assert.equal(updates[0].needsPrepare, false);
  assert.equal(store.getSnapshot().revision, 0, 'metadata refresh must not erase undo history');
});

test('invalid partial writes never replace the last playable edit', () => {
  const {follower, incoming, store, updates} = setup();
  follower.receive(incoming(next => {next.manifest.segments = [{fromFrame: 90, toFrame: 2}];}));
  assert.equal(store.getSnapshot().durationInFrames, 120);
  assert.equal(updates.length, 0);
});

test('acknowledging a viewer save prevents it from being mistaken for an assistant replacement', () => {
  const {follower, incoming, store} = setup();
  store.apply(value => {const manual = structuredClone(value); manual.captions.words[0].text = 'يدوي'; return manual;}, 'يدوي');
  const manual = store.getSnapshot().manifest;
  store.markSaved(manual); follower.saved(manual, 'b'.repeat(64));
  const revision = store.getSnapshot().revision;
  follower.receive(incoming(next => {next.manifest = structuredClone(manual);}));
  assert.equal(store.getSnapshot().revision, revision);
  assert.equal(store.getSnapshot().canUndo, true);
  assert.equal(follower.getStatus().updatedAt, null);
});

test('closing a dirty viewer during an assistant update keeps the older manual draft available for explicit review', () => {
  const {manifest} = setup();
  const manual = structuredClone(manifest); manual.captions.words[0].text = 'يدوي';
  const assistant = structuredClone(manifest); assistant.captions.words[0].text = 'المساعد';
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  saveDraft(storage, 'project', {v: DRAFT_VERSION, base: fingerprint(manifest), savedAt: 1234, manifest: manual});
  assert.equal(loadDraft(storage, 'project', fingerprint(assistant)), null, 'strict callers still refuse a different baseline');
  const reopened = loadDraft(storage, 'project', fingerprint(assistant), {allowStale: true});
  assert.equal(reopened?.manifest.captions.words[0].text, 'يدوي');
  assert.equal(assistant.captions.words[0].text, 'المساعد', 'finding the draft must not restore it automatically');
});

test('saving the newer view preserves a reserved manual draft until the user explicitly dismisses it', () => {
  const {manifest} = setup();
  const manual = structuredClone(manifest); manual.captions.words[0].text = 'يدوي محفوظ';
  const newer = structuredClone(manifest); newer.captions.words[0].text = 'الجديد';
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  saveDraft(storage, 'project', {v: DRAFT_VERSION, base: fingerprint(manifest), savedAt: 1234, manifest: manual});
  const writer = createDraftWriter({storage, key: 'project', getBase: () => fingerprint(newer)});
  writer.pause(true); writer.schedule(newer); writer.clear(); writer.flush();
  assert.equal(loadDraft(storage, 'project', fingerprint(newer), {allowStale: true})?.manifest.captions.words[0].text, 'يدوي محفوظ');
  writer.pause(false); writer.clear(); writer.flush();
  assert.equal(loadDraft(storage, 'project', fingerprint(newer), {allowStale: true}), null, 'dismissed queued drafts must not return on page close');
});

test('saving a newly reviewed caption preserves undo when the server normalizes optional field order', () => {
  const {manifest, follower, store, incoming} = setup();
  const reviewed = setCaptionReview(manifest, {status: 'reviewed', reviewer: 'QA'});
  assert.ok(reviewed.manifest, 'the real caption operation must produce a valid reviewed manifest');
  store.apply(reviewed.manifest, 'مراجعة الكابشن');
  const saved = store.getSnapshot().manifest;
  store.markSaved(saved); follower.saved(saved, 'b'.repeat(64));
  const revision = store.getSnapshot().revision;
  const normalized = parseManifest(saved);
  assert.deepEqual(normalized, saved);
  follower.receive(incoming(next => {next.manifest = normalized;}));
  assert.equal(store.getSnapshot().canUndo, true);
  assert.equal(store.getSnapshot().revision, revision);
  assert.equal(follower.getStatus().updatedAt, null);
});
