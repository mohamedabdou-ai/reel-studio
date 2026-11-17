import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../scripts/lib/job-paths.mjs';
import {createProductionPlan,claimProductionTask} from '../scripts/lib/production-manager.mjs';
import {acceptTask,densityCheck} from '../scripts/lib/production-accept.mjs';
import {planEditorBrief} from '../scripts/lib/editor-director.mjs';
import {profileToBrief} from '../scripts/lib/branding.mjs';
import {run} from '../scripts/lib/media.mjs';

const profile=JSON.parse(await fs.readFile(new URL('../PROFILE.example.json',import.meta.url),'utf8'));
const words=[{text:'قبل',startMs:0,endMs:300,confidence:1},{text:'ما',startMs:320,endMs:500,confidence:1},{text:'تبدأ',startMs:520,endMs:900,confidence:1},{text:'خطة',startMs:920,endMs:1300,confidence:1},{text:'جديدة',startMs:1320,endMs:1700,confidence:0.4}];
const ids=report=>Object.fromEntries(report.checks.map(item=>[item.id,item.status]));

async function fixture(t,role,inputRole='copy'){
  const id=`accept-test-${randomUUID().slice(0,8)}`,root=`Projects/${id}`;
  await fs.mkdir(path.join(ROOT,root),{recursive:true});
  t.after(async()=>{assert.match(id,/^accept-test-/);await fs.rm(path.join(ROOT,root),{recursive:true,force:true});});
  const put=async(file,data)=>{await fs.mkdir(path.dirname(path.join(ROOT,file)),{recursive:true});await fs.writeFile(path.join(ROOT,file),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n','utf8');return file;};
  const copy=await put(`${root}/copy.md`,'Illustrative copy.');
  const request=await put(`${root}/production-request.json`,{version:1,id,runId:'r1',mode:'graphics',interaction:'delegated',objective:'Accept-test run.',inputs:[{role:inputRole,path:copy}],tasks:[{id:'t1',role,objective:'Do the role.',dependsOn:[]}]});
  await createProductionPlan(request);
  const task=`${root}/production/r1/tasks/t1`;
  return {id,root,task,put};
}

test('analysis: measurements, transcript, cut table with original ids and question rows',async t=>{
  const f=await fixture(t,'analysis');
  await f.put(`${f.task}/intake.json`,{edit:`${f.root}/source/x.mp4`,plateFps:30,deliveryFps:30});
  await f.put(`${f.task}/analysis.md`,'# Analysis\n\n## Measurements\n\n- plateFps: 30\n- deliveryFps: 30\n\n## Visual moments\n\n| Observation | Source time | Uncertainty |\n| --- | --- | --- |\n| cursor presses Save | 12.4 | none |\n');
  await f.put(`${f.task}/cut-table.md`,'| ID | Kind | From | To | Length | Words removed | Decision |\n| --- | --- | --- | --- | --- | --- | --- |\n| 1 | silence | 2.10 | 3.00 | 0.90 | none | auto |\n| 3 | retake | 8.00 | 9.50 | 1.50 | «…» | question |\n');
  await f.put(`${f.task}/questions.md`,'1. Row 3 retake.\n');
  await f.put(`${f.task}/privacy.md`,'No screen content.\n');
  await f.put(`${f.root}/transcript/captions.json`,words);
  const report=await acceptTask({role:'analysis',task:f.task});
  assert.equal(report.ok,true,JSON.stringify(report.checks));
  assert.equal(JSON.parse(await fs.readFile(path.join(ROOT,f.task,'accept.json'),'utf8')).basisHash,null);
  assert.ok(JSON.parse(await fs.readFile(path.join(ROOT,f.task,'accept.json'),'utf8')).ok);
  await f.put(`${f.task}/cut-table.md`,'| ID | Kind | From | To | Length | Words removed | Decision |\n| --- | --- | --- | --- | --- | --- | --- |\n| 3 | retake | 8.00 | 9.50 | 1.50 | «…» | auto |\n');
  const bad=await acceptTask({role:'analysis',task:f.task});
  assert.equal(bad.ok,false);assert.equal(ids(bad)['cut-kinds'],'fail');
  await f.put(`${f.task}/intake.json`,{edit:`${f.root}/source/x.mp4`});
  assert.equal(ids(await acceptTask({role:'analysis',task:f.task})).intake,'fail','intake.json needs the measured rates');
});

test('editorial: plan.json and the table agree; more than three text-only beats in a row fails',async t=>{
  const f=await fixture(t,'editorial');
  const beats=[{id:'b1',kind:'visual',fromSec:0,toSec:3,family:'intro',libraryKey:'scene:intro',textOnly:false},{id:'b2',kind:'text',fromSec:3,toSec:5,family:'statement',libraryKey:'',textOnly:true},{id:'b3',kind:'comment',fromSec:5,toSec:7,family:'comment',libraryKey:'scene:comment',textOnly:false},{id:'b4',kind:'presenter',fromSec:7,toSec:9,family:'follow',libraryKey:'',textOnly:false}];
  const row=b=>`| ${b.id.slice(1)} | ${b.id} | ${b.kind} | «…» 0–3 | one idea | A → B → C | cue on «…» | split | none | ${b.family} | ${b.libraryKey||'-'} | subtitle | readability |`;
  const table=['| # | Beat id | Kind | Phrase / time | Takeaway | Visual action | Timing | Layout | Assets | Implementation | Library key | Text/sound | Review concern |','| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  const plan={version:1,style:'section-deck',reason:'presenter stays with a demo',takeaway:'t',purpose:'explainer',tone:'calm',ending:{comment:true,follow:true},beats:beats.map(b=>({...b,kind:b.kind==='comment'?'visual':b.kind}))};
  await f.put(`${f.task}/plan.json`,plan);
  await f.put(`${f.task}/EDITORIAL_PLAN.md`,`Style: section-deck — presenter stays with a demo\nTakeaway: t\n\n${[...table,...beats.map(row)].join('\n')}\n`);
  await f.put(`${f.task}/result.json`,{choices:[{key:'scene:intro',context:{},reason:'r'},{key:'scene:comment',context:{},reason:'r'}]});
  const ok=await acceptTask({role:'editorial',task:f.task});
  assert.equal(ok.ok,true,JSON.stringify(ok.checks));
  const many={...plan,beats:[plan.beats[0],...[1,2,3,4].map(n=>({id:`t${n}`,kind:'text',fromSec:n,toSec:n+1,family:'statement',libraryKey:'',textOnly:true})),...plan.beats.slice(2)]};
  await f.put(`${f.task}/plan.json`,many);
  await f.put(`${f.task}/EDITORIAL_PLAN.md`,`Style: section-deck — r\nTakeaway: t\n\n${[...table,...many.beats.map(row)].join('\n')}\n`);
  const bad=await acceptTask({role:'editorial',task:f.task});
  assert.equal(bad.ok,false);assert.equal(ids(bad)['translation-test'],'fail');
  await f.put(`${f.task}/plan.json`,plan);
  await f.put(`${f.task}/EDITORIAL_PLAN.md`,`Style: section-deck — r\nTakeaway: t\n\n${[...table,...[beats[1],beats[0],...beats.slice(2)].map(row)].join('\n')}\n`);
  assert.equal(ids(await acceptTask({role:'editorial',task:f.task}))['plan-table'],'fail','table rows must name the plan beats in order');
  await f.put(`${f.task}/EDITORIAL_PLAN.md`,`Style: section-deck — r\nTakeaway: t\n\n${[...table,...beats.map(row)].join('\n')}\n`);
  await fs.rm(path.join(ROOT,f.task,'result.json'));
  assert.equal(ids(await acceptTask({role:'editorial',task:f.task})).choices,'fail','result.json with the choices is required');
  await f.put(`${f.task}/plan.json`,{...plan,beats:[]});
  const empty=await acceptTask({role:'editorial',task:f.task});
  assert.equal(empty.ok,false);assert.equal(ids(empty)['plan-json'],'fail');
  await f.put(`${f.task}/result.json`,{choices:[{key:'scene:intro',context:{},reason:'r'},{key:'scene:comment',context:{},reason:'r'}]});
  const late=n=>({...plan,beats:[{...plan.beats[0],fromSec:n},...plan.beats.slice(1)]});
  await f.put(`${f.task}/plan.json`,late(2));
  assert.equal(ids(await acceptTask({role:'editorial',task:f.task}))['hook-start'],'pass','a hook may start within 4 s');
  await f.put(`${f.task}/plan.json`,{...late(0),style:'one-shot'});
  assert.equal(ids(await acceptTask({role:'editorial',task:f.task}))['style-line'],'fail','the Style line must name plan.style');
});

test('sound: catalog recipes, minimum gap, nothing after the sign-off, no sweeps',async t=>{
  const f=await fixture(t,'sound');
  await f.put(`${f.root}/production/r1/tasks/edit/edit.json`,{style:'section-deck',source:{fps:30,totalFrames:1800},segments:[{fromFrame:0,toFrame:1800}],signoffFromFrame:1700,scenes:[{id:'f',family:'follow',fromFrame:1500,durationInFrames:150}],sounds:[]});
  const cues=sounds=>({version:1,fps:30,sounds,dropped:[],proxies:{cuesPerMinute:0,minGapSec:0,followCardCues:0,afterSignoff:0},under:7,passage:{fromSec:0,toSec:10},questions:['a','b','c'],band:'calm'});
  const good=Array.from({length:40},(_,i)=>({atFrame:i*36,recipe:'soft-pop',gain:0.4,event:'e',reason:'appear'}));
  await f.put(`${f.task}/cues.json`,cues(good));await f.put(`${f.task}/sound-review.md`,'ok\n');
  const ok=await acceptTask({role:'sound',task:f.task});
  assert.equal(ok.ok,true,JSON.stringify(ok.checks));
  assert.equal(ids(ok)['cue-density'],'pass');
  await f.put(`${f.task}/cues.json`,cues([...good,{atFrame:1500,recipe:'directional-whoosh',gain:0.4,event:'e',reason:'push landing'}]));
  assert.equal(ids(await acceptTask({role:'sound',task:f.task}))['no-sweeps'],'pass');
  await f.put(`${f.task}/cues.json`,cues(good));
  await f.put(`${f.task}/cues.json`,cues([...good,{atFrame:1710,recipe:'whoosh',gain:0.4,event:'e',reason:'x'},{atFrame:1712,recipe:'soft-pop',gain:0.9,event:'e',reason:'x'}]));
  const bad=await acceptTask({role:'sound',task:f.task});
  const status=ids(bad);
  assert.equal(status['before-signoff'],'fail');assert.equal(status['no-sweeps'],'fail');assert.equal(status['min-gap'],'fail');assert.equal(status.gains,'fail');
});

test('qa: sections, a cited safe-zone report, decisions for NEEDS-REVIEW, no acceptance wording',async t=>{
  const f=await fixture(t,'qa');
  const safe=`${f.root}/safe-check-report`;await f.put(`${safe}/summary.md`,'0 violations\n');
  const report=`## File\nx.mp4\n\n## Technical\nPASS probe\n\n## Safe zones\n${safe}\n\n## Head keep-out\nNEEDS-REVIEW frame 120\nDecision: hand at chin, graphic clear.\n\n## Encode\nPASS\n\n## Editorial\nok\n\n## Open problems\nnone\n`;
  await f.put(`${f.task}/QC_REPORT.md`,report);await f.put(`${f.task}/ig-check.json`,{ok:true});
  assert.equal((await acceptTask({role:'qa',task:f.task})).ok,true);
  await f.put(`${f.task}/QC_REPORT.md`,report.replace('Decision: hand at chin, graphic clear.\n','')+'\nThe creator approved it.\n');
  const bad=await acceptTask({role:'qa',task:f.task});
  assert.equal(ids(bad)['needs-review-decided'],'fail');assert.equal(ids(bad)['no-acceptance-wording'],'fail');
  await f.put(`${f.task}/QC_REPORT.md`,report+'\nApproved by the creator.\n');
  assert.equal(ids(await acceptTask({role:'qa',task:f.task}))['no-acceptance-wording'],'fail');
  await f.put(`${f.task}/QC_REPORT.md`,report.replace('Decision: hand at chin, graphic clear.','Decision:'));
  assert.equal(ids(await acceptTask({role:'qa',task:f.task}))['needs-review-decided'],'fail','an empty Decision line is not a decision');
});

test('edit: a planner-built candidate passes validate, text-check and the density band',async t=>{
  const f=await fixture(t,'edit');
  const sourceFile=`${f.root}/source.mp4`,transcript=`${f.root}/words.json`;
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=gray:s=64x96:r=30:d=3','-c:v','libx264','-pix_fmt','yuv420p','-colorspace','bt709',path.resolve(ROOT,sourceFile)]);
  await f.put(transcript,words);
  const brief={version:1,id:f.id,source:sourceFile,transcript,...profileToBrief(profile),purpose:'explainer',tone:'calm',sound:'auto',
    beats:[{id:'opening',fromSec:0,toSec:2,intent:'intro',data:{kicker:'قبل ما تبدأ',title:'خطة جديدة',subtitle:'قبل ما',caption:'جديدة'}}]};
  await f.put(`${f.task}/brief.json`,brief);
  await planEditorBrief(`${f.task}/brief.json`,{out:`${f.task}/edit.json`});
  await f.put(`${f.task}/checks.json`,{version:1,validate:{ok:true},textCheck:{ok:true},explanatoryText:[],evidence:[],cuesPerMinute:0,band:'calm',projectScenes:null});
  const report=await acceptTask({role:'edit',task:f.task,transcript});
  const status=ids(report);
  assert.equal(status.validate,'pass');assert.equal(status['text-check'],'pass');
  assert.equal(status['cue-density'],'warn',JSON.stringify(report.checks));
  assert.equal(status['no-sweeps'],'pass');assert.equal(status.segments,'warn');
  assert.equal(ids(await acceptTask({role:'edit',task:f.task}))['transcript-source'],'warn','without the project transcript the candidate captions are only a fallback');
  await f.put(`${f.root}/transcript/captions.json`,words);
  const own=ids(await acceptTask({role:'edit',task:f.task}));
  assert.equal(own['text-check'],'pass');assert.equal(own['transcript-source'],'warn','the brief names words.json, not the project transcript');
  assert.equal(ids(await acceptTask({role:'edit',task:f.task,transcript}))['transcript-source'],undefined,'the brief transcript was the one checked');
});

test('density is judged only on twenty seconds or more of edited time',()=>{
  const band={key:'calm',range:[30,53]};
  assert.equal(densityCheck(1,3/60,band).status,'warn');
  assert.equal(densityCheck(10,1,band).status,'fail');
  assert.equal(densityCheck(40,1,band).status,'pass');
});

test('malformed or oddly shaped artifacts fail closed and still write accept.json',async t=>{
  const f=await fixture(t,'edit');
  await f.put(`${f.task}/brief.json`,'{not json');
  await f.put(`${f.task}/edit.json`,{version:1});
  await f.put(`${f.task}/checks.json`,{version:1});
  const report=await acceptTask({role:'edit',task:f.task});
  assert.equal(report.ok,false);assert.equal(ids(report)['json-brief.json'],'fail');
  assert.equal(JSON.parse(await fs.readFile(path.join(ROOT,f.task,'accept.json'),'utf8')).ok,false);
  const g=await fixture(t,'assets');
  await g.put(`${g.task}/assets.json`,[null]);
  const odd=await acceptTask({role:'assets',task:g.task});
  assert.equal(odd.ok,false,JSON.stringify(odd.checks));
});

test('assets: at least one row, every path inside the task assets folder',async t=>{
  const f=await fixture(t,'assets');
  await f.put(`${f.task}/assets.json`,[]);
  assert.equal(ids(await acceptTask({role:'assets',task:f.task})).rows,'fail');
  await f.put(`${f.task}/assets/a1.png`,'x');
  const good={id:'a1',path:`${f.task}/assets/a1.png`,source:`${f.root}/copy.md`,licence:'project-capture',how:'crop',revision:1,forBeat:'b1'};
  await f.put(`${f.task}/assets.json`,[good]);
  const ok=await acceptTask({role:'assets',task:f.task});
  assert.equal(ok.ok,true,JSON.stringify(ok.checks));
  await f.put(`${f.task}/assets.json`,[good,{...good,id:'a2',path:`${f.task}/assets/../../../../copy.md`}]);
  assert.equal(ids(await acceptTask({role:'assets',task:f.task}))['inside-task'],'fail');
});

test('sound: the candidate is required, the band follows its brief tone, sweep twins need the brief switch',async t=>{
  const f=await fixture(t,'sound');
  const cues=sounds=>({version:1,fps:30,sounds,dropped:[],proxies:{},under:7,passage:{fromSec:0,toSec:10},questions:['a','b','c']});
  const good=Array.from({length:40},(_,i)=>({atFrame:i*36,recipe:'soft-pop',gain:0.4,event:'e',reason:'appear'}));
  await f.put(`${f.task}/cues.json`,cues(good));await f.put(`${f.task}/sound-review.md`,'ok\n');
  assert.equal(ids(await acceptTask({role:'sound',task:f.task}))['edit-candidate'],'fail');
  const edit=`${f.root}/production/r1/tasks/edit`;
  await f.put(`${edit}/edit.json`,{style:'section-deck',source:{fps:30,totalFrames:1800},segments:[{fromFrame:0,toFrame:1800}],signoffFromFrame:1700,scenes:[],sounds:[]});
  await f.put(`${edit}/brief.json`,{tone:'calm'});
  assert.equal((await acceptTask({role:'sound',task:f.task})).ok,true);
  await f.put(`${edit}/brief.json`,{tone:'energetic'});
  assert.equal(ids(await acceptTask({role:'sound',task:f.task}))['cue-density'],'fail','40 cues/min is under the energetic band');
  await f.put(`${edit}/brief.json`,{tone:'calm'});
  const twin=[...good.slice(1),{atFrame:1600,recipe:'soft-transition-sweep',gain:0.4,event:'e',reason:'transition'}];
  await f.put(`${f.task}/cues.json`,cues(twin));
  assert.equal(ids(await acceptTask({role:'sound',task:f.task}))['no-sweeps'],'fail');
  await f.put(`${edit}/brief.json`,{tone:'calm',sweeps:true});
  assert.equal(ids(await acceptTask({role:'sound',task:f.task}))['no-sweeps'],'pass');
});

test('delivery: ig-check, report, SRT, cover and render present',async t=>{
  const f=await fixture(t,'delivery');
  assert.equal((await acceptTask({role:'delivery',task:f.task})).ok,false);
  await f.put(`${f.task}/ig-check.json`,{ok:true});await f.put(`${f.task}/delivery-report.md`,'done\n');
  await f.put(`${f.task}/${f.id}.srt`,'1\n');await f.put(`${f.task}/${f.id}-cover.jpg`,'x');
  await f.put(`${f.root}/renders/edit-delivery.mp4`,'x');
  const ok=await acceptTask({role:'delivery',task:f.task});
  assert.equal(ok.ok,true,JSON.stringify(ok.checks));
});

test('accept.json carries the claim basis; foreign folders and role mismatches are refused',async t=>{
  const f=await fixture(t,'qa');
  const claim=await claimProductionTask(`${f.root}/production/r1/plan.json`,{task:'t1',agent:'reel-qa'});
  assert.equal((await acceptTask({role:'qa',task:f.task})).basisHash,claim.basisHash);
  await assert.rejects(acceptTask({role:'sound',task:f.task}),/Packet role is qa/);
  await assert.rejects(acceptTask({role:'qa',task:'Outputs/x'}),/owned Projects/);
});

test('breakdown acceptance needs the layers, the visual review, sound questions and a draft DNA', async t => {
  const f = await fixture(t, 'breakdown'), ref = 'ref-444444444444', dir = `Projects/${f.id}/style-analysis/${ref}`;
  await f.put(`${f.task}/breakdown-summary.md`, `# Breakdown\n\nReference ${ref}: 12 shots, 3 need confirmation.\n`);
  await f.put(`${f.task}/questions.md`, '1. sound.tempo: tap along with the music for ten seconds.\n');
  await f.put(`${dir}/breakdown.json`, {schema: 1, referenceId: ref, reviewQueue: ['C02', 'sound.tempo']});
  for (const file of ['BREAKDOWN.md', 'studio-recipe.md', 'report/report.html']) await f.put(`${dir}/${file}`, 'x');
  await f.put(`${dir}/review_tasks.json`, {tasks: []});
  await f.put(`Projects/${f.id}/STYLE_DNA.json`, {status: 'draft', generatedBy: 'breakdown', baseStyle: null, references: [{id: ref}]});
  const report = await acceptTask({role: 'breakdown', task: f.task});
  assert.equal(report.ok, true, JSON.stringify(report.checks));
  await f.put(`${f.task}/questions.md`, 'No questions.\n');
  const bad = await acceptTask({role: 'breakdown', task: f.task});
  assert.equal(ids(bad)[`sound-questions-${ref}`], 'fail');
});

test('breakdown packets retain named reference inputs and acceptance fails for missing artifacts', async t => {
  const f = await fixture(t, 'breakdown', 'reference');
  const packet = JSON.parse(await fs.readFile(path.join(ROOT, f.task, 'packet.json'), 'utf8'));
  assert.equal(packet.role, 'breakdown');
  assert.equal(packet.inputs[0].role, 'reference');
  assert.equal(packet.definition, 'instructions/agents/breakdown.md');
  const report = await acceptTask({role: 'breakdown', task: f.task});
  assert.equal(report.ok, false);
  assert.equal(ids(report).summary, 'fail');
  assert.equal(ids(report).questions, 'fail');
  assert.equal(ids(report).dna, 'fail');
});

test('breakdown DNA acceptance requires explicit baseStyle null in the draft or proposal', async t => {
  const f = await fixture(t, 'breakdown'), ref = 'ref-555555555555';
  await f.put(`${f.task}/breakdown-summary.md`, `# Breakdown\n\nReference ${ref}.\n`);
  await f.put(`${f.task}/questions.md`, 'No sound questions.\n');
  const draft = {status: 'draft', generatedBy: 'breakdown', references: [{id: ref}]};
  const live = `Projects/${f.id}/STYLE_DNA.json`, proposal = `Projects/${f.id}/STYLE_DNA.proposal.json`;
  for (const bad of [draft, {...draft, baseStyle: 'grid-glide'}, {...draft, baseStyle: false}]) {
    await f.put(live, bad); await f.put(proposal, bad);
    assert.equal(ids(await acceptTask({role: 'breakdown', task: f.task})).dna, 'fail');
  }
  await f.put(proposal, {...draft, baseStyle: null});
  assert.equal(ids(await acceptTask({role: 'breakdown', task: f.task})).dna, 'pass');
});
