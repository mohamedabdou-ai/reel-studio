// tests/breakdown-merge.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisDuration, recomputeBreakdown, confidenceFor, itemMeta, speechStats, anchorSfx, mergeBreakdown} from '../scripts/lib/breakdown-merge.mjs';
import {summarisePresenter} from '../scripts/lib/breakdown-presenter.mjs';
import {scoreBreakdown} from '../scripts/lib/breakdown-score.mjs';

test('confidence and status follow the score and conflicts', () => {
  assert.equal(confidenceFor(0.8), 'high');
  assert.equal(confidenceFor(0.5), 'medium');
  assert.equal(confidenceFor(0.2), 'low');
  assert.deepEqual(itemMeta(0.9), {basis: 'measured', confidence: 'high', status: 'confirmed'});
  const flagged = itemMeta(0.9, 'measured', {conflict: 'types disagree', confirmHow: 'Listen at 3.2 s.'});
  assert.equal(flagged.status, 'needs-confirmation');
  assert.equal(flagged.reason, 'types disagree');
  assert.equal(itemMeta(0.3).status, 'needs-confirmation');
});

test('speech stats count words, pauses and spans', () => {
  const captions = [{text: 'أهلا بيكم', startMs: 0, endMs: 1000, confidence: 0.9}, {text: 'النهارده', startMs: 2500, endMs: 3000, confidence: 0.4}];
  const stats = speechStats(captions, 6);
  assert.equal(stats.words, 3);
  assert.equal(stats.wordsPerMinute, 30);
  assert.equal(stats.uncertainWords, 1);
  assert.deepEqual(stats.pauses, [{start: 1, end: 2.5, len: 1.5}]);
  assert.deepEqual(stats.spans, [{start: 0, end: 1}, {start: 2.5, end: 3}]);
});

test('sound effects anchor to the strongest nearby visual event', () => {
  const sfx = [{t: 5.05}, {t: 9.0}];
  const events = [{kind: 'cut', id: 'C01', t: 5.0}, {kind: 'text-in', id: 'T01', t: 5.12}];
  const [a, b] = anchorSfx(sfx, events);
  assert.deepEqual(a.anchor, {kind: 'text-in', id: 'T01', dt: -0.07});
  assert.equal(b.anchor, null);
});

const parts = () => ({
  prepare: {referenceId: 'ref-abc', source: {name: 'ref.mp4', sha256: 'f'.repeat(64)}, probe: {durationSec: 10, width: 1080, height: 1920, hasAudio: true}},
  captions: null,
  shots: {durationSec: 10, cuts: [{t: 4, kind: 'cut', scale: null, score: 0.9}], transitions: [{start: 7, end: 7.5, kind: 'other', direction: null, score: 0.4}],
    shots: [{id: 'S01', start: 0, end: 4, len: 4}, {id: 'S02', start: 4, end: 7.25, len: 3.25}, {id: 'S03', start: 7.25, end: 10, len: 2.75}]},
  camera: {camera: [{shotId: 'S01', label: 'static', score: 0.85, events: []}, {shotId: 'S02', label: 'zoom-in', zoomPerSec: 0.05, score: 0.8, events: []}, {shotId: 'S03', label: 'unknown', score: 0.3, events: []}]},
  overlays: {overlays: [{shotId: 'S01', start: 0, end: 4, kind: 'sticker', box: [0.1, 0.8, 0.8, 0.1], score: 0.5}]},
  look: {look: {label: 'warm', metrics: {}, score: 0.6}},
  text: {text: [{text: 'سر النجاح', start: 0.5, end: 3, box: [0.1, 0.8, 0.8, 0.08], zone: 'bottom', sizePct: 0.05, kind: 'caption', style: {fill: '#ffffff'}, entrance: 'cut', exit: 'cut', score: 0.92}]},
  sound: {sound: {bed: {present: true, levelDb: 10, speechToBedDb: null}, tempo: {bpm: 120, alternatives: [60, 240], confidence: 0.7}, beats: [0.5, 1],
    cutsOnBeat: {share: null, chance: null, synced: false}, sfx: [{t: 4.03, dur: 0.06, type: 'pop', strength: 5, onBeat: false, yamnet: {label: 'Bang', type: 'impact', score: 0.5}, score: 0.75}]}},
  loudness: {integratedLUFS: -14, LRA: 5, truePeakDBFS: -1},
  analysedAt: '2026-11-15T00:00:00.000Z',
});

test('OCR boundaries archive caption appearance and disappearance as unscored candidates',()=>{
  // A detailed background can make the image detector accept the changed box;
  // OCR supplies the semantic negative at both edges of the same caption.
  const p=parts(),box=[.1,.8,.8,.08];
  p.shots.cuts=[{t:.5,scope:'region',box,score:.95},{t:3,scope:'region',box,score:.95},
    {t:3.1,scope:'region',box,score:.95},
    {t:3.11,scope:'region',box,score:.95},{t:3,scope:'region',box:[.1,.1,.2,.2],score:.9},
    {t:3,scope:'frame',score:.9}];
  const b=mergeBreakdown(p);
  assert.deepEqual(b.cuts.map(c=>[c.t,c.scope]),[[3.11,'region'],[3,'region'],[3,'frame']]);
  assert.equal(b.cuts[0].shotBoundary,false);assert.deepEqual(b.cuts[0].box,box);
  assert.equal(b.cuts[2].shotBoundary,true);
  assert.equal(b.cutCandidates.length,3);
  for(const c of b.cutCandidates){
    assert.equal(c.status,'needs-confirmation');assert.equal(c.confidence,'low');assert.equal(c.shotBoundary,false);
    assert.equal(c.captionEvidence.textId,'T01');assert.equal(c.captionEvidence.containment,1);
    assert.ok(!b.reviewQueue.includes(c.id));
  }
  const truth={fps:30,cuts:[],transitions:[],camera:[],overlays:[],text:[],sound:{bed:false,bpm:null,sfx:[]}};
  assert.equal(scoreBreakdown(b,truth).counts.cuts.fp,b.cuts.length);
  assert.equal(b.pace.cutCount,b.cuts.length);
});

test('a replacement text panel covering less than ninety percent of the change stays a cut',()=>{
  const p=parts();p.text.text[0]={...p.text.text[0],box:[.1,.3,.8,.32]};
  p.shots.cuts=[{t:3,kind:'cut',scope:'region',box:[.1,.3,.8,.4],score:.95}];
  const b=mergeBreakdown(p);
  assert.equal(b.cuts.length,1);assert.equal(b.cutCandidates.length,0);
  assert.equal(b.cuts[0].status,'confirmed');assert.equal(b.cuts[0].shotBoundary,false);
});

test('caption containment threshold includes ninety percent but not a smaller overlap',()=>{
  const p=parts();p.text.text[0]={...p.text.text[0],box:[0,0,.9,1]};
  p.shots.cuts=[{t:3,kind:'cut',scope:'region',box:[0,0,1,1],score:.95}];
  assert.equal(mergeBreakdown(p).cutCandidates.length,1);
  p.text.text[0].box=[0,0,.899,1];
  assert.equal(mergeBreakdown(p).cuts.length,1);
});

test('merge records no-audio tempo abstention for a reference without audio',()=>{
  const p=parts();p.prepare.probe.hasAudio=false;p.sound=null;
  const b=mergeBreakdown(p);
  assert.equal(b.sound.tempo,null);assert.equal(b.sound.tempoReason,'no-audio');
});

test('bed confidence follows its measured evidence rather than a fixed boolean score',()=>{
  const p=parts();p.sound.sound.bed={present:true,score:.2,evidence:{availableSec:.6,coverage:.2,stability:.5}};
  const weak=mergeBreakdown(p);assert.equal(weak.sound.bed.confidence,'low');assert.equal(weak.sound.bed.status,'needs-confirmation');assert.match(weak.sound.bed.confirmHow,/Listen/);
  p.sound.sound.bed.score=.95;
  const strong=mergeBreakdown(p);assert.equal(strong.sound.bed.confidence,'high');
});

test('thin-evidence absence stays low confidence and voice limitations remain explicit',()=>{
  const p=parts();p.sound.sound.bed={present:false,score:.49,evidence:{observableShare:.1}};
  p.sound.sound.speechActivity={spans:[{start:0,end:10}]};
  const b=mergeBreakdown(p);
  assert.equal(b.sound.bed.status,'needs-confirmation');assert.equal(b.sound.bed.confidence,'low');
  assert.equal(b.sound.bed.confirmHow,'Listen to a pause in the speech.');
  assert.ok(b.limitations.some(x=>/high-register vibrato or arpeggio instruments/.test(x)));
});

test('backend candidates survive merge and review updates confirmed-only density',()=>{
  const p=parts(),base={t:1,dur:.1,type:'pop',strength:8,onBeat:false,yamnet:null,score:.95};
  p.sound.sound.sfx=[{...base,t:2,status:'confirmed',detection:'effect'}];
  p.sound.sound.sfxCandidates=[{...base,status:'needs-confirmation',detection:'candidate',candidateReasons:['below-false-alarm-grade']}];
  const b=mergeBreakdown(p);
  assert.equal(b.sound.sfx.length,1);assert.equal(b.sound.sfxCandidates[0].status,'needs-confirmation');
  assert.equal(b.sound.sfxCandidates[0].detection,'candidate');assert.equal(b.sound.sfxCandidates[0].confidence,'low');
  assert.equal(b.sound.confirmedSfxCount,1);assert.equal(b.sound.candidateSfxCount,1);assert.equal(b.sound.hitsPerMinute,6);
  assert.ok(!b.reviewQueue.includes('Q01'));
  b.sound.sfx.push({...b.sound.sfxCandidates.pop(),id:'X02',status:'confirmed',detection:'effect'});recomputeBreakdown(b);
  assert.equal(b.sound.hitsPerMinute,12);assert.equal(b.sound.candidateSfxCount,0);assert.equal(b.sound.sfx[0].detection,'effect');
});

test('merge builds the breakdown with ids, pace, anchors and a review queue', () => {
  const b = mergeBreakdown(parts());
  assert.equal(b.schema, 1);
  assert.equal(b.referenceId, 'ref-abc');
  assert.deepEqual(b.pace, {cutCount: 1, cutsPerMinute: 6, shotLen: {min: 2.75, median: 3.25, max: 4}});
  assert.equal(b.cuts[0].id, 'C01');
  assert.equal(b.transitions[0].status, 'needs-confirmation');
  assert.equal(b.shots[1].camera.label, 'zoom-in');
  assert.equal(b.text[0].id, 'T01');
  assert.equal(b.overlays.length, 0, 'an overlay that is really the caption is dropped');
  const pop = b.sound.sfx[0];
  assert.equal(pop.id, 'X01');
  assert.equal(pop.anchor.kind, 'cut');
  assert.equal(pop.status, 'needs-confirmation', 'YAMNet disagrees with the spectral type');
  assert.equal(b.sound.hitsPerMinute, 6, 'uncertain type does not reject the measured event');
  assert.deepEqual(b.reviewQueue.slice(0, 3), ['T01', 'X01', 'R01']);
  assert.equal(b.text[0].status, 'needs-confirmation', 'OCR without a transcript cannot confirm spoken-word captions');
  assert.ok(b.reviewQueue.includes('S03'));
});

test('absent audio, text, music and failed transcription remain distinct',()=>{
  const p=parts();p.prepare.probe.hasAudio=false;p.text={text:[]};p.sound=null;p.captions=[];const silent=mergeBreakdown(p);
  assert.equal(silent.sound.hasAudio,false);for(const key of ['bed','tempo','speech','cutsOnBeat'])assert.equal(silent.sound[key],null);assert.equal(silent.text.length,0);
  const uncertain=parts();uncertain.sound.sound.bed={present:null,reason:'insufficient gap'};uncertain.sound.sound.tempo.confidence=.1;
  const b=mergeBreakdown(uncertain);assert.ok(b.reviewQueue.includes('sound.bed'));assert.ok(b.reviewQueue.includes('sound.tempo'));assert.equal(b.sound.speech,null);assert.ok(b.limitations.includes('Speech was not transcribed.'));
  const empty=parts();empty.captions=[];empty.sound.sound.bed={present:false};empty.sound.sound.tempo=null;const noSpeech=mergeBreakdown(empty);assert.equal(noSpeech.sound.speech.words,0);assert.equal(noSpeech.sound.bed.present,false);
});
test('speech overlap is not counted twice',()=>{
 const s=speechStats([{text:'a',startMs:0,endMs:1000},{text:'b',startMs:500,endMs:1500}],2);assert.equal(s.speakingSec,1.5);
});

test('pace recomputation rounds derived shot lengths',()=>{
 const b=mergeBreakdown(parts());b.shots=[{id:'S01',start:3.432,end:5.216,camera:{status:'confirmed'}}];
 const {shotLen}=b.pace;
 const n=structuredClone(b); // The review path recomputes every derived value.
 return import('../scripts/lib/breakdown-merge.mjs').then(({recomputeBreakdown})=>{recomputeBreakdown(n);assert.equal(n.shots[0].len,1.784);assert.equal(n.pace.shotLen.min,1.784);});
});

test('region switches and list emphasis retain evidence and anchor sound after recomputation',async()=>{
  const p=parts();
  p.shots.cuts[0]={...p.shots.cuts[0],scope:'region',box:[.5,.2,.4,.5]};
  p.shots.transitions[0]={...p.shots.transitions[0],kind:'dissolve',score:.7,scope:'region',box:[.5,.2,.4,.5]};
  p.text.text[0].events=[{t:2,kind:'highlight-change',lineIndex:1,score:.7}];
  p.overlays.overlays=[{start:0,end:10,kind:'pip',box:[.5,.2,.4,.5],score:.6,evidence:'moving rectangle within still surround'}];
  p.sound.sound.sfx=[{t:2.04,score:.8},{t:4.03,score:.8},{t:7.04,score:.8}];
  const b=mergeBreakdown(p);
  assert.equal(b.cuts[0].scope,'region');assert.deepEqual(b.cuts[0].box,[.5,.2,.4,.5]);
  assert.equal(b.transitions[0].scope,'region');
  assert.equal(b.overlays[0].basis,'measured');assert.equal(b.overlays[0].status,'needs-confirmation');
  assert.equal(b.text.length,1);assert.equal(b.text[0].events[0].id,'T01.H01');
  assert.deepEqual(b.sound.sfx.map(x=>x.anchor.kind),['text-change','cut','transition']);
  const {recomputeBreakdown}=await import('../scripts/lib/breakdown-merge.mjs');
  b.text=[];recomputeBreakdown(b);assert.equal(b.sound.sfx[0].anchor,null);
});

test('text within a video panel does not override a measured picture switch',()=>{
  const p=parts();p.text.text[0]={...p.text.text[0],kind:'scene-text',start:4.01};
  const b=mergeBreakdown(p);assert.equal(b.sound.sfx[0].anchor.kind,'cut');
});

test('a pending presenter measurement joins the review queue', () => {
  const b = {durationSec: 4, cuts: [], shots: [], text: [], events: [], transitions: [], overlays: [], sound: null, look: null,
    presenter: {share: 0.5, size: 'close', spans: [{start: 0, end: 2}], perShot: [], basis: 'measured', confidence: 'low', status: 'needs-confirmation'}};
  assert.deepEqual(recomputeBreakdown(b).reviewQueue, ['presenter']);
  b.presenter.status = 'confirmed';
  assert.deepEqual(recomputeBreakdown(b).reviewQueue, []);
});

// Validate the presenter field at the merge boundary as well as recomputation.
test('merge retains a measured presenter and represents an unmeasured presenter as null', () => {
  const presenter = {share: .5, size: 'close', spans: [{start: 0, end: 2}], perShot: [{shotId: 'S01', share: .5}], basis: 'measured', confidence: 'high', status: 'confirmed'};
  const measured = mergeBreakdown({...parts(), presenter});
  assert.deepEqual(measured.presenter, presenter);
  assert.ok(!measured.reviewQueue.includes('presenter'));
  assert.equal(mergeBreakdown(parts()).presenter, null);
});

test('presenter and merge use the proxy duration when a sample reaches the source endpoint', () => {
  const p = parts();
  p.prepare.probe.durationSec = 9.99;
  p.prepare.probe.videoDurationSec = 9.99;
  p.prepare.proxy = {durationSec: 10};
  const samples = [{timeSec: 0, faces: []}, {timeSec: 9.99, faces: []}];
  assert.throws(() => summarisePresenter(samples, {durationSec: p.prepare.probe.durationSec}), /timestamp/);
  const durationSec = analysisDuration(p.prepare);
  const presenter = summarisePresenter(samples, {durationSec});
  assert.equal(mergeBreakdown({...p, presenter}).durationSec, durationSec);
  assert.equal(presenter.samples, 2);
  assert.equal(analysisDuration({probe: {videoDurationSec: 4, durationSec: 5}}), 4);
  assert.equal(analysisDuration({probe: {durationSec: 5}}), 5);
});
