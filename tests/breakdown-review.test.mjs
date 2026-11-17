// tests/breakdown-review.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {reviewedPresenter, findItem, stripTimes, buildReviewTasks, applyReview} from '../scripts/lib/breakdown-review.mjs';
import {buildRecipe} from '../scripts/lib/breakdown-recipe.mjs';
import {deriveTraits} from '../scripts/lib/breakdown-dna.mjs';

const breakdown = () => ({
  text: [{id: 'T01', text: 'سر النجح', start: 1, end: 3, status: 'needs-confirmation', basis: 'measured'}],
  sound: {sfx: [{id: 'X01', t: 4, type: 'pop', status: 'needs-confirmation', basis: 'measured'}]},
  transitions: [{id: 'R01', start: 7, end: 7.5, kind: 'other', status: 'needs-confirmation', basis: 'measured'}],
  overlays: [], shots: [{id: 'S01', start: 0, end: 4, camera: {label: 'unknown', status: 'needs-confirmation', basis: 'measured'}}],
  reviewQueue: ['T01', 'X01', 'R01', 'S01'],
});

test('strip times bracket each kind of item', () => {
  assert.deepEqual(stripTimes(findItem(breakdown(), 'X01')), [3.8, 4, 4.2]);
  assert.deepEqual(stripTimes(findItem(breakdown(), 'R01')), [7, 7.25, 7.5]);
});

test('review tasks follow the queue and write a template', async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-review-'));
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const made = [];
  const makeStrip = async (times, file) => { made.push(times); await fsp.writeFile(file, 'jpg'); };
  const result = await buildReviewTasks({breakdown: breakdown(), prepared: {proxy: {path: 'proxy.mp4'}}, dir, limit: 2, makeStrip});
  assert.deepEqual(result.tasks.map(x => x.id), ['T01', 'X01']);
  assert.equal(made.length, 1);
  assert.equal(result.tasks[1].status, 'audio-required');
  assert.deepEqual(JSON.parse(await fsp.readFile(path.join(dir, 'review-answers.template.json'), 'utf8')).map(a => a.id), ['T01']);
});

test('answers confirm, correct and reject items', () => {
  const next = applyReview(breakdown(), [
    {id: 'T01', verdict: 'correct', value: {text: 'سر النجاح', style: {fill: '#000'}}},
    {id: 'R01', verdict: 'reject'},
    {id: 'S01', verdict: 'correct', value: {label: 'handheld'}},
  ]);
  assert.equal(next.text[0].text, 'سر النجاح');
  assert.equal(next.text[0].style, undefined, 'style is not a reviewable field');
  assert.equal(next.text[0].basis, 'seen');
  assert.equal(next.sound.sfx[0].status, 'needs-confirmation');
  assert.equal(next.sound.sfx[0].reviewedWith, undefined);
  assert.equal(next.transitions.length, 0);
  assert.deepEqual(next.rejected, ['R01']);
  assert.equal(next.shots[0].camera.label, 'handheld');
  assert.deepEqual(next.reviewQueue, ['X01']);
  assert.throws(() => applyReview(breakdown(), [{id: 'Z99', verdict: 'confirm'}]), /Z99/u);
});

test('image evidence never changes sound, bed or tempo for any verdict', () => {
  const b = breakdown(); b.sound.bed = {present: null, status: 'needs-confirmation'}; b.sound.tempo = {bpm: 100, status: 'needs-confirmation'};
  b.reviewQueue.push('sound.bed', 'sound.tempo');
  for (const id of ['X01', 'sound.bed', 'sound.tempo']) for (const verdict of ['confirm', 'correct', 'reject']) assert.throws(() => applyReview(b, [{id, verdict, value: {type: 'ding'}}]), /Audio required/);
  assert.equal(b.sound.sfx.length, 1);
});
test('review recomputes anchors and counters after rejecting visual items', () => {
  const b = breakdown(); b.durationSec = 10; b.cuts = [{id: 'C01', t: 4, kind: 'cut', status: 'needs-confirmation'}]; b.reviewQueue.push('C01');b.shots.push({id:'S02',start:4,end:10,len:6,camera:{label:'static',status:'confirmed'}});
  b.sound.sfx[0].anchor = {id: 'C01'}; b.sound.hitsPerMinute = 999;
  b.pace = {}; b.sound.cutsOnBeat = {synced: true}; b.sound.beats = [4];
  const next = applyReview(b, [{id: 'C01', verdict: 'reject'}]);
  assert.equal(next.pace.cutCount, 0); assert.equal(next.sound.hitsPerMinute, 6); assert.equal(next.sound.sfx[0].anchor, null); assert.equal(next.sound.cutsOnBeat.synced, null);
  assert.equal(next.sound.reportedSfxCount,1);assert.equal(next.sound.candidateSfxCount,0);
});
test('review strips stay ordered inside short clips', () => {
  const times = stripTimes({group: 'text', item: {start: 0, end: .03}}, .03, 60);
  assert.ok(times.every(t => t >= 0 && t < .03)); assert.deepEqual([...times].sort((a,b)=>a-b), times);
});

test('derived sound counters are rebuilt when an authorised upstream source removes an effect',()=>{
 const b=breakdown();b.durationSec=10;b.sound.hitsPerMinute=6;b.sound.sfx=[];const next=applyReview(b,[]);assert.equal(next.sound.hitsPerMinute,0);assert.ok(!next.reviewQueue.includes('X01'));
});

test('rejecting a cut merges adjacent shots and invalidates their camera interpretation',()=>{
 const b=breakdown();b.durationSec=10;b.cuts=[{id:'C01',t:4,kind:'cut',status:'needs-confirmation'}];b.pace={};b.reviewQueue.push('C01');
 b.shots.push({id:'S02',start:4,end:10,len:6,camera:{label:'static',status:'confirmed'}});b.events=[{id:'E01',t:5,kind:'punch-in',shotId:'S02',status:'confirmed'}];
 const n=applyReview(b,[{id:'C01',verdict:'reject'}]);assert.equal(n.shots.length,1);assert.equal(n.shots[0].end,10);assert.equal(n.shots[0].len,10);assert.equal(n.pace.shotLen.min,10);
 assert.equal(n.events[0].shotId,'S01');assert.equal(n.shots[0].camera.status,'needs-confirmation');assert.ok(n.reviewQueue.includes('S01'));assert.equal(n.cuts.length,0);
});

test('rejecting a partial swap preserves the shot and its camera',()=>{
 const b=breakdown();b.durationSec=4;b.pace={};
 b.shots[0].len=4;
 b.cuts=[{id:'C01',t:2,kind:'cut',scope:'region',box:[.2,.2,.3,.3],shotBoundary:false,status:'needs-confirmation'}];
 b.reviewQueue.push('C01');const before=structuredClone(b.shots);
 const n=applyReview(b,[{id:'C01',verdict:'reject'}]);
 assert.deepEqual(n.shots,before);assert.deepEqual(n.cuts,[]);
});
test('rejected camera/look remain low-confidence and semantic corrections use enums',()=>{
 const b=breakdown();b.look={label:'warm',status:'needs-confirmation'};b.reviewQueue.push('look');
 for(const id of ['S01','look']){const n=applyReview(b,[{id,verdict:'reject'}]);const target=id==='look'?n.look:n.shots[0].camera;assert.equal(target.confidence,'low');assert.equal(target.status,'needs-confirmation');assert.equal(target.reviewVerdict,'reject');}
 for(const [id,value] of [['S01',{label:'<script>x</script>'}],['look',{label:'made-up'}],['T01',{kind:'made-up'}],['R01',{direction:'diagonal'}]])assert.throws(()=>applyReview(b,[{id,verdict:'correct',value}]),/Invalid review value/);
});

const presenterBreakdown = () => ({durationSec: 4, cuts: [], shots: [{id: 'S01', start: 0, end: 4, camera: {label: 'static', status: 'confirmed'}}], text: [], events: [], transitions: [], overlays: [], sound: null, look: null,
  presenter: {share: 0.5, multiFaceShare: 0, faceHeight: 0.3, size: 'close', spans: [{start: 0, end: 2}], perShot: [{shotId: 'S01', share: 1}],
    basis: 'measured', confidence: 'low', status: 'needs-confirmation', reason: 'face detection is unsure on this footage', confirmHow: 'Look.'},
  reviewQueue: ['presenter']});

test('presenter review uses frames from where a face was found', () => {
  const b = presenterBreakdown();
  const found = findItem(b, 'presenter');
  assert.equal(found.group, 'presenter');
  assert.deepEqual(stripTimes(found, 4), [1]);
});

test('a reviewer can confirm a presenter or say the faces were drawings', () => {
  const confirmed = applyReview(presenterBreakdown(), [{id: 'presenter', verdict: 'confirm', value: null, note: ''}]);
  assert.equal(confirmed.presenter.status, 'confirmed');
  assert.equal(confirmed.presenter.basis, 'seen');
  assert.equal(confirmed.presenter.share, 0.5);
  assert.deepEqual(confirmed.reviewQueue, []);
  const absent = applyReview(presenterBreakdown(), [{id: 'presenter', verdict: 'correct', value: {present: false}, note: ''}]);
  assert.equal(absent.presenter.share, 0);
  assert.equal(absent.presenter.size, 'none');
  assert.deepEqual(absent.presenter.spans, []);
  assert.deepEqual(absent.presenter.perShot, [{shotId: 'S01', share: 0}]);
  assert.equal(applyReview(presenterBreakdown(), [{id: 'presenter', verdict: 'reject', value: null, note: ''}]).presenter.share, 0);
  assert.throws(() => reviewedPresenter(presenterBreakdown().presenter, {id: 'presenter', verdict: 'correct', value: {}}), /permitted correction/);
});

test('presenter buildReviewTasks reaches the safe image path and preserves audio isolation', async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-review-presenter-'));
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const seen = [];
  const b = presenterBreakdown();
  const {tasks} = await buildReviewTasks({breakdown: b, prepared: {proxy: {fps: 30}}, dir,
    makeStrip: async (times, file) => { seen.push(times); await fsp.writeFile(file, 'synthetic strip'); }});
  assert.equal(tasks[0].id, 'presenter');
  assert.equal(tasks[0].group, 'presenter');
  assert.equal(tasks[0].status, 'images-required');
  assert.equal(path.basename(tasks[0].image), 'presenter.jpg');
  assert.deepEqual(seen, [[1]]);
  assert.match(tasks[0].question, /real person/);
  await assert.rejects(() => buildReviewTasks({breakdown: {...b, reviewQueue: ['../presenter']}, prepared: {proxy: {}}, dir}), /Unsafe review item id/);
});

test('rejecting a cut drops deleted presenter shot IDs and marks merged coverage unknown', () => {
  const b = presenterBreakdown();
  b.cuts = [{id: 'C01', t: 2, kind: 'cut', status: 'needs-confirmation'}];
  b.shots = [{id: 'S01', start: 0, end: 2, camera: {status: 'confirmed'}}, {id: 'S02', start: 2, end: 4, camera: {status: 'confirmed'}}];
  b.presenter.perShot = [{shotId: 'S01', share: 1}, {shotId: 'S02', share: 0}];
  b.reviewQueue.push('C01');
  const next = applyReview(b, [{id: 'C01', verdict: 'reject'}]);
  assert.deepEqual(next.presenter.perShot, [{shotId: 'S01', share: null}]);
  assert.equal(next.presenter.share, 0.5);
  assert.deepEqual(b.presenter.perShot, [{shotId: 'S01', share: 1}, {shotId: 'S02', share: 0}]);
});

test('reviewed presence after missed detections never confirms absence or invents numbers', () => {
  for (const share of [0, .02, null]) {
    const b = presenterBreakdown(); Object.assign(b.presenter, {share, size: 'none', faceHeight: null, spans: []});
    const next = applyReview(b, [{id: 'presenter', verdict: 'correct', value: {present: true}}]);
    const p = next.presenter;
    assert.equal(p.present, true); assert.equal(p.status, 'confirmed'); assert.equal(p.basis, 'seen');
    for (const key of ['share', 'multiFaceShare', 'faceHeight']) assert.equal(p[key], null);
    assert.equal(p.size, 'unknown'); assert.deepEqual(p.spans, []);
    assert.deepEqual(p.perShot, [{shotId: 'S01', share: null}]);
    assert.match(p.note, /remain unknown/);
    const recipe = buildRecipe(next);
    assert.equal(recipe.features.presenter, 'unknown');
    const trait = deriveTraits(next, recipe).find(t => t.key === 'presenter.share');
    assert.match(trait.claim, /unknown/); assert.doesNotMatch(trait.claim, /0%/);
    assert.equal(b.presenter.share, share, 'review must not mutate its input');
  }
});

test('presenter review tasks show measured presence including threshold and unknown cases', async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-presence-current-'));
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  for (const [share, present] of [[0, false], [.049, false], [.05, true], [.5, true], [null, null]]) {
    const b = presenterBreakdown(); b.presenter.share = share;
    const {tasks} = await buildReviewTasks({breakdown: b, prepared: {proxy: {fps: 30}}, dir, makeStrip: async () => {}});
    assert.deepEqual(tasks[0].current, {present});
  }
});

test('presenter confirm rejects contradicting or malformed values without mutating the measure', () => {
  for (const share of [0, .5]) {
    const b = presenterBreakdown(); b.presenter.share = share;
    if (!share) b.presenter.size = 'none';
    const original = structuredClone(b), present = share >= .05;
    for (const value of [{present: !present}, {present: 'false'}, {present: null}])
      assert.throws(() => applyReview(b, [{id: 'presenter', verdict: 'confirm', value}]), /contradicts/);
    assert.deepEqual(b, original);
    for (const value of [null, {present}])
      assert.equal(applyReview(b, [{id: 'presenter', verdict: 'confirm', value}]).presenter.present, present);
  }
  const b = presenterBreakdown(); b.presenter.share = null;
  assert.throws(() => applyReview(b, [{id: 'presenter', verdict: 'confirm'}]), /unknown presenter/);
});


test('ear templates contain audio tasks only and preserve manual drafts on review refresh', async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-ear-template-'));
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const options = {breakdown: breakdown(), prepared: {proxy: {path: 'proxy.mp4'}}, dir, makeStrip: async () => {}};
  const result = await buildReviewTasks(options);
  assert.deepEqual(result.earTemplate.map(x => x.id), ['X01']);
  const file = path.join(dir, 'review-ears.template.json'), draft = '[{"id":"X01","verdict":"confirm"}]';
  await fsp.writeFile(file, draft);
  await buildReviewTasks(options);
  assert.equal(await fsp.readFile(file, 'utf8'), draft);
});
