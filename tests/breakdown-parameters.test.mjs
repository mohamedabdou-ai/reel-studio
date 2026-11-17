import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {validateSuiteParameters,parameterAudio,parameterTruth} from '../scripts/lib/breakdown-parameter-fixture.mjs';
import {buildSyntheticSuite} from '../scripts/lib/breakdown-fixture.mjs';
import {ffprobeJson} from '../scripts/lib/media.mjs';
import {createHash} from 'node:crypto';
const file = path.join(ROOT,'tests/fixtures/breakdown-parameters.json');
const parameters = JSON.parse(await fs.readFile(file,'utf8'));
const parameterHash = r => createHash('sha256').update(parameterAudio(r)).digest('hex');

test('parameter timbre defaults preserve the pre-timbre waveform byte for byte',()=>{
  const r=validateSuiteParameters(parameters).reels[0], legacy=structuredClone(r);delete legacy.timbre;
  const pin='544f90da6d484d553b1b4d61e105ba2984b9f55958d4103353fc687791aa5fc3';
  assert.equal(parameterHash(r),pin);assert.equal(parameterHash(legacy),pin);
  const explicit=structuredClone(parameters);explicit.reels[0].timbre={kickClickAmount:0,hatBrightness:0,snareToneHz:190};
  assert.equal(parameterHash(validateSuiteParameters(explicit).reels[0]),pin);
  for(const timbre of [{kickClickAmount:.5},{hatBrightness:1},{snareToneHz:360}]){
    const p=structuredClone(parameters);p.reels[0].timbre=timbre;
    assert.notEqual(parameterHash(validateSuiteParameters(p).reels[0]),pin);
  }
  const p=structuredClone(parameters);p.reels[0].drumPattern={kind:'kickless'};
  const kickless=validateSuiteParameters(p).reels[0];assert.deepEqual(kickless.drumPattern.kickBeats,[]);
  assert.equal(parameterTruth(kickless).sound.bpm,127);assert.notEqual(parameterHash(kickless),pin);
});

test('parameter truth follows phase, gains and effect order, while caption swaps are cut negatives',()=>{
  const r=validateSuiteParameters(parameters).reels[0], truth=parameterTruth(r);
  assert.deepEqual(truth.cuts,[{t:1,kind:'cut'}]); assert.deepEqual(truth.text.map(t=>t.start),[0,.5]);
  assert.equal(truth.sound.bed,false);assert.equal(truth.sound.bpm,127);
  assert.equal(truth.sound.sfx[0].type,'click');assert.equal(truth.sound.sfx[1].type,'ding');
  for(const [i,phase]of [[0,0],[1,.5]]) {const v=(truth.sound.sfx[i].t-r.beatPhaseSec)*r.bpm/60;assert.ok(Math.abs(v-Math.round(v-phase)-phase)<.0001);}
  assert.equal(parameterAudio(r).equals(parameterAudio(r)),true);
  const silent=validateSuiteParameters({schema:1,reels:[{...parameters.reels[0],mode:'silence',effects:[],speech:[]}]}).reels[0];
  assert.equal(parameterAudio(silent).subarray(44).every(v=>v===0),true);assert.equal(parameterTruth(silent).sound.bpm,null);
  const muted=structuredClone(r);muted.gains.sfx=0;assert.deepEqual(parameterTruth(muted).sound.sfx,[]);
});
test('invalid parameters reject ambiguous or unsafe fixtures before generating outputs',()=>{
  for(const mutate of [p=>p.reels.push(p.reels[0]),p=>p.reels[0].name='../bad',p=>p.reels[0].bpm=0,p=>p.reels[0].captions[0].endSec=.51,
    p=>p.reels[0].effects[0].type='unknown',p=>p.reels[0].speech=[{file:'https://example.invalid/voice.wav',durationSec:1}],p=>p.reels[0].mode='silence',
    p=>p.reels[0].pictureSwaps[0]={timeSec:1,...p.reels[0].picture},p=>p.reels[0].effects[0]={type:'riser',timeSec:1.9},p=>p.reels[0].unknown=true]) {
    const p=structuredClone(parameters);mutate(p);assert.throws(()=>validateSuiteParameters(p));
  }
});
test('a small named parameters file builds local speech overlays and preserves original bytes', {timeout:60000},async t=>{
  const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'breakdown-params-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const voiceDir=await fs.mkdtemp(path.join(ROOT,'Projects','breakdown-voice-'));t.after(()=>fs.rm(voiceDir,{recursive:true,force:true}));
  const voiceParams=validateSuiteParameters({schema:1,reels:[{...parameters.reels[0],mode:'bed',effects:[],drumPattern:{kind:'none'}}]}).reels[0];
  const source=path.join(voiceDir,'voice.wav'),bytes=parameterAudio(voiceParams);await fs.writeFile(source,bytes);
  const p=structuredClone(parameters);p.reels[0].effects=[];p.reels[0].drumPattern={kind:'none'};
  p.reels[0].speech=[{file:source,sourceStartSec:.2,targetStartSec:.4,durationSec:.5,gain:.5}];
  const paramsFile=path.join(dir,'params.json');await fs.writeFile(paramsFile,JSON.stringify(p));
  const [reel]=await buildSyntheticSuite(path.join(dir,'generated'),{paramsFile});const probe=await ffprobeJson(reel.video);
  assert.equal(probe.streams.find(s=>s.codec_type==='video').width,160);assert.ok(Math.abs(Number(probe.format.duration)-2)<.07);
  assert.deepEqual(reel.truth.speech.map(s=>[s.start,s.end,s.sourceStartSec]),[[.4,.9,.2]]);assert.match(reel.truth.speech[0].sourceSha256,/^[a-f0-9]{64}$/);
  assert.match(reel.truth.parametersSha256,/^[a-f0-9]{64}$/);
  const mixed=await fs.readFile(path.join(path.dirname(reel.video),'audio.wav'));
  assert.ok(mixed.subarray(44,44+Math.round(.4*48000)*2).every(x=>x===0));
  for(const i of [1,100,2400,23000]) {
    const expected=Math.round(bytes.readInt16LE(44+(Math.round(.2*48000)+i)*2)*.5*.35*32767/32768);
    assert.ok(Math.abs(mixed.readInt16LE(44+(Math.round(.4*48000)+i)*2)-expected)<=1);
  }
  assert.deepEqual(await fs.readFile(source),bytes);assert.deepEqual(JSON.parse(await fs.readFile(reel.truthFile,'utf8')),reel.truth);
  const unapproved=path.join(dir,'unapproved.wav');await fs.writeFile(unapproved,bytes);
  const junction=path.join(voiceDir,'linked');
  try {
    await fs.symlink(dir,junction,'junction');
    const escaped=structuredClone(p);escaped.reels[0].speech[0].file=path.join(junction,'unapproved.wav');
    const escapedFile=path.join(dir,'escaped.json');await fs.writeFile(escapedFile,JSON.stringify(escaped));
    await assert.rejects(buildSyntheticSuite(path.join(dir,'escaped-out'),{paramsFile:escapedFile}),/Raw\/ or Projects/);
  } catch(error) { if(!['EPERM','EACCES','ENOSYS'].includes(error.code))throw error; t.diagnostic('Junction creation unavailable; lexical allow-list checks still run.'); }
  p.reels[0].speech[0].sourceStartSec=10;await fs.writeFile(paramsFile,JSON.stringify(p));
  await assert.rejects(buildSyntheticSuite(path.join(dir,'invalid'),{paramsFile}),/outside the named audio/);
  await assert.rejects(fs.access(path.join(dir,'invalid')));
  p.reels[0].speech[0].sourceStartSec=0;await fs.writeFile(paramsFile,JSON.stringify(p));
  await assert.rejects(buildSyntheticSuite(dir,{paramsFile}),/inside generated/);
});

test('speech role allow-list rejects state and Tools and accepts named Raw or project sources',()=>{
  for(const file of ['state/tmp/unapproved.wav','Tools/unapproved.wav','Raw/../state/unapproved.wav']){
    const p=structuredClone(parameters);p.reels[0].speech=[{file,durationSec:.5}];assert.throws(()=>validateSuiteParameters(p),/Raw\/ or Projects/);
  }
  for(const file of ['Raw/unit-placeholder.wav','Projects/unit-project/voice.wav']){
    const p=structuredClone(parameters);p.reels[0].speech=[{file,durationSec:.5}];assert.equal(validateSuiteParameters(p).reels[0].speech[0].file,file);
  }
});

test('silence schema and AAC output describe a detector check, with exact PCM tested separately',async t=>{
  const schema=JSON.parse(await fs.readFile(path.join(ROOT,'scripts/data/breakdown-parameters.schema.json'),'utf8'));
  assert.match(schema.$defs.reel.properties.mode.description,/AAC/);assert.match(schema.$defs.reel.properties.mode.description,/breakdown-pcm\.test\.mjs/);
  const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'breakdown-silent-codec-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const p=structuredClone(parameters);p.reels[0].mode='silence';p.reels[0].effects=[];p.reels[0].speech=[];
  const file=path.join(dir,'params.json');await fs.writeFile(file,JSON.stringify(p));
  const [reel]=await buildSyntheticSuite(path.join(dir,'out'),{paramsFile:file});
  assert.equal((await fs.readFile(path.join(path.dirname(reel.video),'audio.wav'))).subarray(44).every(x=>x===0),true);
  assert.equal((await ffprobeJson(reel.video)).streams.find(s=>s.codec_type==='audio').codec_name,'aac');
});
