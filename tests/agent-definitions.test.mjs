import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AGENT_ROLES,AGENT_DIR,parseAgentDefinition} from '../scripts/sync-assistant-guides.mjs';
import {scanPublicationFile} from '../scripts/lib/publication-policy.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const EXPECTED_MODEL={analysis:'haiku',editorial:'sonnet',assets:'haiku',sound:'sonnet',edit:'sonnet',qa:'sonnet',delivery:'haiku',breakdown:'sonnet','eval-judge':'sonnet'};
const FORBIDDEN=[/@[a-z0-9_.]{3,}/i,/eleven_v\d|voice[_ -]?id\s*[:=]/i,/\bviews\b.*\d{3,}/i];

for(const role of AGENT_ROLES){
  test(`${role} definition parses, uses the agreed model and names no private data`,async()=>{
    const relativePath=`${AGENT_DIR}/${role}.md`;
    const bytes=await fs.readFile(path.join(ROOT,relativePath));
    const text=bytes.toString('utf8');
    const {front,body}=parseAgentDefinition(text,role);
    assert.equal(front.model,EXPECTED_MODEL[role]);
    for(const pattern of FORBIDDEN)assert.doesNotMatch(text,pattern,`${role}: ${pattern}`);
    assert.ok(body.includes('## Knowledge'));
    assert.deepEqual(scanPublicationFile(relativePath,bytes),[],`${role}: publication scan`);
  });
}

test('workers never claim the live edit or the creator conversation',async()=>{
  for(const role of AGENT_ROLES.filter(role=>!['eval-judge'].includes(role))){
    const text=await fs.readFile(path.join(ROOT,AGENT_DIR,`${role}.md`),'utf8');
    const {front}=parseAgentDefinition(text,role);
    assert.ok(!front.writes.some(folder=>/edit\.json|brief\.json|^Raw\/|PROFILE\.json|^Outputs\//.test(folder)),`${role} writes a protected path`);
    assert.match(text,/## Never/);
  }
});

test('the breakdown worker may run only its named breakdown commands and stops on protected DNA',async()=>{
  const text=await fs.readFile(path.join(ROOT,AGENT_DIR,'breakdown.md'),'utf8');
  const {front,body}=parseAgentDefinition(text,'breakdown');
  const commands=front.tools.filter(tool=>tool.startsWith('Bash('));
  assert.deepEqual(commands,['inspect','run *','review *','apply-review *','dna *'].map(command=>`Bash(node scripts/breakdown.mjs ${command})`).concat('Bash(node scripts/production.mjs submit *)'));
  assert.ok(!commands.some(tool=>tool.includes('install')||tool.includes('breakdown.mjs *')),'No pattern may reach the installer.');
  assert.equal(front.returns,'result.json, breakdown-summary.md, questions.md');
  assert.deepEqual(front.writes.slice(1),['Projects/<id>/style-analysis/','Projects/<id>/STYLE_DNA.json','Projects/<id>/STYLE_DNA.md']);
  const steps=body.slice(body.indexOf('## Steps'),body.indexOf('## Return'));
  const dnaStep=steps.split('\n').find(line=>line.includes('breakdown.mjs dna '))??'';
  assert.match(dnaStep,/protected.*needs-input/,'A protected DNA conflict returns needs-input.');
  assert.match(steps,/presenter share not measured/);
  assert.match(steps,/## Review limits/);
  assert.match(body,/never force a new run to retry/i);
  assert.doesNotMatch(steps,/reframe\.mjs|breakdown\.mjs install/);
});

test('the breakdown worker reviews the whole queue and asks every remaining question',async t=>{
  const text=await fs.readFile(path.join(ROOT,AGENT_DIR,'breakdown.md'),'utf8');
  const {body}=parseAgentDefinition(text,'breakdown');
  const step=n=>body.split(/\r?\n/).find(line=>line.startsWith(`${n}. `))??'';
  assert.match(step(3),/review --project <id> --ref <ref> --limit <n>/);
  assert.match(step(3),/needsConfirmation/);
  assert.match(step(7),/`reviewQueue` of `breakdown\.json`.*after step 4.*never from `review_tasks\.json`/);
  // The reason for the rule: a queue longer than the default limit loses its tail, here every sound question.
  const {PROJECT_TMP}=await import('../scripts/lib/project-tmp.mjs');
  const {buildReviewTasks}=await import('../scripts/lib/breakdown-review.mjs');
  const pending={basis:'measured',confidence:'low',status:'needs-confirmation'};
  const pictures=Array.from({length:25},(_,i)=>({id:`T${String(i+1).padStart(2,'0')}`,text:'x',start:i,end:i+1,...pending}));
  const breakdown={durationSec:30,text:pictures,shots:[],cuts:[],transitions:[],events:[],overlays:[],look:null,
    sound:{sfx:[{id:'X01',t:4,type:'pop',...pending}],bed:{present:null,...pending},tempo:{bpm:null,...pending}},
    reviewQueue:[...pictures.map(item=>item.id),'X01','sound.bed','sound.tempo']};
  const audio=async limit=>{
    const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'breakdown-worker-queue-'));
    t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const options={breakdown,prepared:{proxy:{path:'proxy.mp4'}},dir,makeStrip:async(times,file)=>fs.writeFile(file,'jpg')};
    const {tasks}=await buildReviewTasks(limit===undefined?options:{...options,limit});
    return tasks.filter(task=>task.status==='audio-required').map(task=>task.id);
  };
  assert.deepEqual(await audio(undefined),[],'The default limit drops the sound questions of a 28-item queue.');
  assert.deepEqual(await audio(breakdown.reviewQueue.length),['X01','sound.bed','sound.tempo'],'The queue length as the limit keeps them.');
});

test('sound bands are ordered positive ranges',async()=>{
  const bands=JSON.parse(await fs.readFile(path.join(ROOT,'scripts/data/sound-bands.json'),'utf8'));
  assert.equal(bands.version,1);
  for(const [key,[lo,hi]]of Object.entries(bands.bands))assert.ok(lo>=0&&hi>lo,`${key}`);
  for(const key of ['grid-glide','calm','editorial','energetic','podcast'])assert.ok(bands.bands[key],`${key} band`);
});
test('the breakdown worker can never be handed the listener, the key or an ear answer',async()=>{
  const {front,body}=parseAgentDefinition(await fs.readFile(path.join(ROOT,AGENT_DIR,'breakdown.md'),'utf8'),'breakdown');
  const commands=front.tools.filter(tool=>tool.startsWith('Bash('));
  assert.ok(!commands.some(tool=>/listen|listener-key/.test(tool)),'No tool pattern names listen or listener-key.');
  const never=body.slice(body.indexOf('## Never'),body.indexOf('## Knowledge'));
  for(const forbidden of ['listen --consent','listener-key','apply-review --heard-by'])assert.ok(never.includes(forbidden),forbidden);
  const steps=body.slice(body.indexOf('## Steps'),body.indexOf('## Return'));
  assert.doesNotMatch(steps,/listen --consent|listener-key|--heard-by/,'No step tells the worker to run them.');
});
