// tests/breakdown-score.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {charErrorRate, matchEvents, scoreBreakdown} from '../scripts/lib/breakdown-score.mjs';

test('character error rate counts edits per truth character', () => {
  assert.equal(charErrorRate('سر النجاح', 'سر النجاح'), 0);
  assert.equal(charErrorRate('abcd', 'abed'), 0.25);
  assert.equal(charErrorRate('', ''), 0);
});

test('events match once each within the tolerance', () => {
  const r = matchEvents([1, 2, 3], [1.02, 2.5, 3.01, 3.02], 0.07);
  assert.equal(r.tp, 2);
  assert.equal(r.fp, 2);
  assert.equal(r.fn, 1);
  assert.ok(Math.abs(r.f1 - 4 / 7) < 1e-9);
  assert.equal(r.medianError, 0.01);
});

test('type uncertainty does not remove reported events from local SFX scoring',()=>{
  const truth={fps:30,cuts:[],transitions:[],camera:[],text:[],sound:{bed:false,bpm:null,sfx:[{t:1,type:'pop'}]}};
  const b={cuts:[],transitions:[],shots:[],text:[],overlays:[],sound:{bed:{present:false},sfx:[{t:1,type:'pop',status:'needs-confirmation'},{t:2,type:'click',status:'needs-confirmation'}]}};
  const score=scoreBreakdown(b,truth);
  assert.deepEqual(score.counts.sfx,{tp:1,fp:1,fn:0});
  assert.equal(score.rows.find(r=>r.measure==='sfxF1Local').value,.6667);
});

test('archived candidates are not effects; their recall is informational only',()=>{
  const truth={fps:30,cuts:[],transitions:[],camera:[],text:[],sound:{bed:false,bpm:null,sfx:[{t:1,type:'pop'}]}};
  const b={cuts:[],transitions:[],shots:[],text:[],overlays:[],sound:{bed:{present:false},sfx:[],sfxCandidates:[{t:1,type:'hit'},{t:2,type:'pop'}]}};
  const score=scoreBreakdown(b,truth);
  assert.deepEqual(score.counts.sfx,{tp:0,fp:0,fn:1});
  assert.deepEqual(score.rows.find(r=>r.measure==='sfxCandidateRecall'),{measure:'sfxCandidateRecall',value:1,target:null,pass:null});
  const suite=scoreSuite([{score}]);
  assert.deepEqual(suite.rows.find(r=>r.measure==='sfxCandidateRecall'),{measure:'sfxCandidateRecall',value:1,target:null,pass:null,n:1});
});

test('an unknown effect type still scores as an event and fails only type accuracy',()=>{
  const truth={fps:30,cuts:[],transitions:[],camera:[],text:[],sound:{bed:false,bpm:null,sfx:[{t:1,type:'pop'}]}};
  const b={cuts:[],transitions:[],shots:[],text:[],overlays:[],sound:{bed:{present:false},sfx:[{t:1,type:'hit',typeConfidence:'low'}],sfxCandidates:[]}};
  const score=scoreBreakdown(b,truth);
  assert.equal(score.rows.find(r=>r.measure==='sfxF1Local').value,1);
  assert.equal(score.rows.find(r=>r.measure==='sfxTypeAccuracy').value,0);
});

test('an unmeasured bed is still a miss against no-bed truth',()=>{
  const truth={fps:30,cuts:[],transitions:[],camera:[],text:[],sound:{bed:false,bpm:null,sfx:[]}};
  const b={cuts:[],transitions:[],shots:[],text:[],overlays:[],sound:{bed:{present:null},sfx:[],sfxCandidates:[]}};
  const row=scoreBreakdown(b,truth).rows.find(r=>r.measure==='bedPresent');
  assert.equal(row.value,null);assert.equal(row.pass,false);
});

test('a perfect breakdown passes every gated target', () => {
  const truth = {
    durationSec: 10, fps: 30, cuts: [{t: 2, kind: 'cut'}], transitions: [{start: 5, end: 5.5, kind: 'dissolve', direction: null}], camera: [{start: 2, end: 5, label: 'zoom-in'}],
    text: [{text: 'سر', start: 1, end: 3, zone: 'top', fill: '#fff', stroke: null, box: null, entrance: 'cut'}],
    sound: {bed: true, bpm: 120, sfx: [{t: 4, type: 'pop'}]},
  };
  const breakdown = {
    cuts: [{t: 2, kind: 'cut'}], transitions: [{start: 5, end: 5.5, kind: 'dissolve'}], shots: [{start: 2, end: 5.25, camera: {label: 'zoom-in'}}],
    text: [{text: 'سر', start: 1.05, end: 2.95, entrance: 'cut'}],
    sound: {bed: {present: true}, tempo: {bpm: 121}, sfx: [{t: 4.05, type: 'pop'}]},
  };
  const {rows} = scoreBreakdown(breakdown, truth);
  assert.deepEqual(rows.filter(r => r.pass === false), []);
  assert.equal(rows.find(r => r.measure === 'cutsF1').value, 1);
  assert.equal(rows.find(r => r.measure === 'cameraLabels').value, 1);
});

test('matching maximizes cardinality before total error and keeps original indexes', () => {
  assert.equal(matchEvents([0, .1], [.06, .15], .07).tp, 2);
  assert.deepEqual(matchEvents([.1, 0], [.15, .06], .07).pairs, [[1, 1], [0, 0]]);
  assert.deepEqual(matchEvents([0, 1], [.8, .01, 1.01], 1).pairs, [[0, 1], [1, 2]]);
  assert.equal(matchEvents([], [], .1).f1, 1);
  assert.equal(matchEvents([], [1], .1).f1, 0);
  assert.throws(() => matchEvents([NaN], [], .1), /finite/);
});
test('cut tolerance is two frames at 30 and 60 fps; absent text and music are not failures', () => {
  const truth = {fps: 30, cuts: [{t: 1}], transitions: [], camera: [], text: [], sound: {bed: false, bpm: null, sfx: []}};
  const found = {cuts: [{t: 1.05}], transitions: [], shots: [], text: [], sound: {bed: {present: false}, tempo: null, sfx: []}};
  assert.equal(scoreBreakdown(found, truth).rows.find(r => r.measure === 'cutsF1').pass, true);
  assert.equal(scoreBreakdown(found, {...truth, fps: 60}).rows.find(r => r.measure === 'cutsF1').pass, false);
  assert.equal(scoreBreakdown(found, truth).rows.find(r => r.measure === 'tempoWithin').pass, null);
  assert.equal(scoreBreakdown(found, truth).rows.find(r => r.measure === 'textRecall').value, null);
  assert.throws(() => scoreBreakdown(found, {...truth, fps: 0}), /fps/);
});

test('exact matcher agrees with exhaustive cardinality and error for small event sets',()=>{
  let seed=7; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
  for(let trial=0;trial<60;trial++){
    const a=Array.from({length:4},()=>Math.round(random()*20)/10),b=Array.from({length:4},()=>Math.round(random()*20)/10),tol=.35;
    let bestCount=-1,bestError=Infinity;
    function search(i,used,count,error){
      if(i===a.length){if(count>bestCount || count===bestCount && error<bestError){bestCount=count;bestError=error;}return;}
      search(i+1,used,count,error);
      for(let j=0;j<b.length;j++)if(!used.has(j)&&Math.abs(a[i]-b[j])<=tol+1e-9){used.add(j);search(i+1,used,count+1,error+Math.abs(a[i]-b[j]));used.delete(j);}
    }
    search(0,new Set(),0,0);const result=matchEvents(a,b,tol);const error=result.pairs.reduce((n,[i,j])=>n+Math.abs(a[i]-b[j]),0);
    assert.equal(result.tp,bestCount);assert.ok(Math.abs(error-bestError)<1e-8);
  }
});

test('overlays precision exposes false positives without inventing a gate',()=>{
 const truth={fps:30,cuts:[],transitions:[],camera:[],text:[],overlays:[],sound:{bed:false,bpm:null,sfx:[]}};
 const found={cuts:[],transitions:[],shots:[],text:[],overlays:[{start:0,end:1,kind:'logo',box:[.1,.1,.2,.2]}],sound:{bed:{present:false},sfx:[]}};
 let row=scoreBreakdown(found,truth).rows.find(r=>r.measure==='overlaysPrecision');assert.deepEqual(row,{measure:'overlaysPrecision',value:0,target:null,pass:null});
 truth.overlays=[found.overlays[0]];found.overlays.push({...found.overlays[0]});row=scoreBreakdown(found,truth).rows.find(r=>r.measure==='overlaysPrecision');assert.equal(row.value,.5);
 delete truth.overlays;assert.equal(scoreBreakdown(found,truth).rows.find(r=>r.measure==='overlaysPrecision').value,null);
});

import {scoreSuite} from '../scripts/lib/breakdown-score.mjs';

test('empty reference text has the same unmeasured predicate in every scope and in suite totals', () => {
  const truth = {fps:30,cuts:[],transitions:[],camera:[],text:[],textScope:'captions-only',sound:{bed:false,bpm:null,sfx:[]}};
  const b = {cuts:[],transitions:[],shots:[],text:[{text:'A visible graphic label',start:1,end:2}],sound:{sfx:[]}};
  for(const textScope of ['captions-only','all-visible',undefined]){
    const s = scoreBreakdown(b, {...truth,textScope});
    for (const measure of ['textRecall','textCer']) assert.deepEqual(s.rows.find(r => r.measure === measure), {measure,value:null,target:null,pass:null});
    const suite = scoreSuite([{score:s}]);
    assert.equal(suite.rows.find(r => r.measure === 'textRecall').value, null);
    assert.equal(suite.rows.find(r => r.measure === 'textCer').n, 0);
  }
  const missed = scoreBreakdown({...b,text:[]}, {...truth,text:[{text:'missing caption',start:1,end:2}]});
  assert.equal(missed.rows.find(r => r.measure === 'textRecall').pass, false);
  assert.equal(missed.rows.find(r => r.measure === 'textCer').pass, false);
});

const truthBase = () => ({fps: 30, cuts: [{t: 1, kind: 'jump'}, {t: 5, kind: 'cut'}], transitions: [], camera: [], text: [{text: 'سلام', start: 1, end: 2, entrance: null}],
  sound: {bed: false, bpm: null, sfx: [{t: 2, type: 'pop'}, {t: 4, type: 'impact'}]}, ignore: [{start: 4.5, end: 6}]});
const foundBase = () => ({cuts: [{t: 1, kind: 'jump'}, {t: 5.2, kind: 'cut'}, {t: 5.6, kind: 'cut'}], transitions: [], shots: [], text: [{text: 'سلام', start: 1, end: 2, entrance: 'pop'}],
  sound: {bed: {present: false}, tempo: null, sfx: [{t: 2, type: 'pop', heard: {verdict: 'heard'}}, {t: 4.05, type: 'impact', heard: {verdict: 'not-heard'}}]}, listener: {status: 'merged'}});
const value = (s, m) => s.rows.find(r => r.measure === m).value;

test('ignore windows remove truth and found cuts inside them; null entrances are not scored', () => {
  const s = scoreBreakdown(foundBase(), truthBase());
  assert.equal(value(s, 'cutsF1'), 1);
  assert.deepEqual(s.counts.cuts, {tp: 1, fp: 0, fn: 0});
  assert.equal(value(s, 'textEntranceAccuracy'), null);
});

test('heard F1 counts only what the listener heard and needs a merged listener', () => {
  const s = scoreBreakdown(foundBase(), truthBase());
  assert.equal(value(s, 'sfxF1Local'), 1);
  assert.deepEqual(s.counts.sfxHeard, {tp: 1, fp: 0, fn: 1});
  const local = foundBase(); delete local.listener;
  assert.equal(value(scoreBreakdown(local, truthBase()), 'sfxF1Heard'), null);
});

test('suite totals are micro-averaged and keep tempo octave errors separate', () => {
  const reel = (bpm, found, runSec) => {
    const truth = {...truthBase(), sound: {...truthBase().sound, bpm}}, b = {...foundBase(), sound: {...foundBase().sound, tempo: {bpm: found}}};
    return {suite: 'synthetic', name: `bpm${bpm}`, durationSec: 15, runSec, coldRunSec:runSec,
      timing:{cacheState:'cold',stages:[{stage:'text',cacheHit:false,state:'cold'}]}, score: scoreBreakdown(b, truth)};
  };
  const s = scoreSuite([reel(120, 121, 40), reel(90, 180, 50), reel(140, 100, 45)]);
  assert.equal(s.reels, 3);
  assert.equal(value(s, 'cutsF1'), 1);
  assert.equal(value(s, 'tempoWithin4pct'), +(1 / 3).toFixed(4));
  assert.equal(value(s, 'tempoHalfOrDouble'), +(1 / 3).toFixed(4));
  assert.equal(value(s, 'secondsPer60sMax'), 200);
  assert.equal(s.rows.find(r => r.measure === 'secondsPer60sMax').pass, true);
  assert.equal(value(s, 'bedAccuracy'), 1);
});
test('speed targets exclude mixed, warm, unrecorded and inconsistently labelled cold timings',()=>{
  const entry={durationSec:10,runSec:1,coldRunSec:1,score:scoreBreakdown(foundBase(),truthBase())};
  for(const timing of [null,{cacheState:'mixed',stages:[]},{cacheState:'warm',stages:[]},{cacheState:'cold',stages:[{stage:'asr',cacheHit:true}]}]) {
    const row=scoreSuite([{...entry,timing}]).rows.find(r=>r.measure==='secondsPer60sMax');
    assert.equal(row.value,null);assert.equal(row.pass,null);assert.equal(row.n,0);
  }
});


test('unscored entries do not inflate reel counts or the measurement denominator', () => {
  const scored = {score: scoreBreakdown(foundBase(), truthBase())};
  const suite = scoreSuite([scored, {name: 'unscored'}, {score: {rows: []}}, null]);
  assert.equal(suite.reels, 1);
  assert.equal(suite.rows.find(r => r.measure === 'sfxF1Heard').n, 1);
});

test('heard-only timestamps use the published 0.15 second gate without widening the target', () => {
  const b = foundBase(), truth = truthBase(); truth.sound.sfx = [{t: 2, type: 'pop'}];
  b.sound.sfx = [{id: 'H01', t: 2.16, type: 'pop', heard: {verdict: 'heard-only', type: 'pop'}}];
  assert.deepEqual(scoreBreakdown(b, truth).counts.sfxHeard, {tp: 0, fp: 1, fn: 1});
});
