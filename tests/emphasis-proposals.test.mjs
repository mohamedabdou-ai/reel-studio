import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
const exec=promisify(execFile);
const words=[{text:'12',startMs:1000,endMs:1500},{text:'idea',startMs:5000,endMs:5500},{text:'goodbye friend',startMs:10000,endMs:11000}];
function wav() {
  const sampleRate=16000,seconds=12,buf=Buffer.alloc(44+sampleRate*seconds*2);
  buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);
  buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(sampleRate,24);buf.writeUInt32LE(sampleRate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(buf.length-44,40);
  for(let i=0;i<sampleRate*seconds;i++) buf.writeInt16LE(Math.round((i/sampleRate<2?.4:.1)*Math.sin(i*Math.PI*440/sampleRate)*32767),44+i*2);
  return buf;
}
test('generic signoff matching uses only supplied recorded text and no default identity',async()=>{
  const {findSignoff,parseWav,rmsEnvelope,proposeEmphasis}=await import('../scripts/lib/emphasis-score.mjs');
  assert.equal(findSignoff(words),null);
  assert.deepEqual(findSignoff(words,'goodbye friend'),{wordIndex:2,fromMs:10000});
  assert.equal(findSignoff(words,'absent goodbye'),null);
  const audio=parseWav(wav()),envelope=rmsEnvelope(audio.samples,audio.sampleRate);
  const without=proposeEmphasis({words,envelope,fps:30});
  assert.ok(without.proposals.some(p=>p.wordIndex===0));
  assert.ok(without.proposals.every(p=>p.status==='NEEDS-REVIEW' && p.anchor===null));
  const withEnding=proposeEmphasis({words,envelope,fps:30,signoffFromMs:10000});
  assert.ok(withEnding.proposals.every(p=>p.atFrame+45<300));
});
test('emphasis CLI runs on reviewed words without an invented ending and keeps inputs intact',async()=>{
  const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'emphasis-parity-'));
  try {
    const captions=path.join(dir,'words.json'),audio=path.join(dir,'audio.wav');
    const bytes=JSON.stringify({status:'reviewed',reviewer:'Creator',words});
    await fs.writeFile(captions,bytes);await fs.writeFile(audio,wav());
    const out=`Projects/emphasis-test/${path.basename(dir)}.json`;
    const args=['scripts/emphasis.mjs','--captions',captions,'--wav',audio,'--fps','30','--out',out];
    const {stdout}=await exec(process.execPath,args,{cwd:ROOT,windowsHide:true});
    const summary=JSON.parse(stdout);
    assert.equal(summary.signoffFromMs,null);assert.equal(summary.signoffSource,'none');
    const result=JSON.parse(await fs.readFile(path.join(ROOT,out),'utf8'));
    assert.ok(result.proposals.length);assert.deepEqual(Object.keys(result),['version','proposals']);
    assert.equal(await fs.readFile(captions,'utf8'),bytes);
    await fs.writeFile(captions,JSON.stringify({status:'draft',words}));
    await assert.rejects(()=>exec(process.execPath,args,{cwd:ROOT,windowsHide:true}),/reviewed/);
    await fs.rm(path.join(ROOT,out));
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
