import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAsrWords,assessAsrChange} from '../scripts/lib/breakdown-asr-evaluation.mjs';
const reference=['one','two','three'].map((text,i)=>({text,startMs:i*200,endMs:i*200+100}));
test('ASR evaluation reports WER operations, matched-word coverage and boundary timing errors',()=>{
  const result=evaluateAsrWords(reference,[{...reference[0],text:' one! ',startMs:20,endMs:120},{...reference[1],text:'wrong'},
    {text:'extra',startMs:320,endMs:360},reference[2]]);
  assert.equal(result.referenceWords,3);assert.equal(result.hypothesisWords,4);assert.equal(result.wer,2/3);
  assert.equal(result.substitutions,1);assert.equal(result.insertions,1);assert.equal(result.deletions,0);
  assert.equal(result.matchedWords,2);assert.equal(result.timing.meanMs,10);assert.equal(result.timing.p95Ms,20);
});
test('the reviewed-word gate rejects timing regression even when WER improves',()=>{
  const baseline=reference.map((w,i)=>i===1?{...w,text:'wrong'}:w);
  const late=reference.map(w=>({...w,startMs:w.startMs+300,endMs:w.endMs+300}));
  const regression=assessAsrChange(reference,baseline,late);
  assert.ok(regression.after.wer<regression.before.wer);assert.equal(regression.commonReferenceWords,2);assert.equal(regression.noRegression,false);
  assert.equal(assessAsrChange(reference,baseline,reference).noRegression,true);
  assert.equal(assessAsrChange(reference,reference,reference).noRegression,true);
});
