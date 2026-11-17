import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SCRIPT=path.join(ROOT,'scripts','sync-assistant-guides.mjs');
const CANONICAL='.agents/skills/reel-studio/SKILL.md';
const GENERATED='.claude/skills/reel-studio/SKILL.md';
async function sandbox(t){
  const base=path.join(ROOT,'state','tmp','assistant-guides');
  await fs.mkdir(base,{recursive:true});
  const dir=await fs.mkdtemp(path.join(base,'case-'));
  t.after(async()=>{
    const relative=path.relative(base,dir);
    assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    await fs.rm(dir,{recursive:true,force:true});
  });
  for(const file of [CANONICAL,GENERATED])await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true});
  return dir;
}
async function implementation(){
  assert.ok(existsSync(SCRIPT),'The assistant-guide synchronization entrypoint is missing.');
  return import(pathToFileURL(SCRIPT).href);
}

test('checking host-guide drift reports it without changing either file',async t=>{
  const {syncAssistantGuides,GUIDES}=await implementation(),dir=await sandbox(t),guides=GUIDES.filter(guide=>guide.kind==='skill');
  const source='---\nname: reel-studio\n---\nA canonical guide.\n',old='An older host copy.\n';
  await fs.writeFile(path.join(dir,CANONICAL),source);
  await fs.writeFile(path.join(dir,GENERATED),old);
  const result=await syncAssistantGuides(dir,{check:true,guides});
  assert.equal(result.ok,false);
  assert.equal(await fs.readFile(path.join(dir,CANONICAL),'utf8'),source);
  assert.equal(await fs.readFile(path.join(dir,GENERATED),'utf8'),old);
});

test('sync updates only the generated host copy and the next check passes',async t=>{
  const {syncAssistantGuides,GUIDES}=await implementation(),dir=await sandbox(t),guides=GUIDES.filter(guide=>guide.kind==='skill');
  const source='---\nname: reel-studio\n---\nShared guide.\n';
  await fs.writeFile(path.join(dir,CANONICAL),source);
  const first=await syncAssistantGuides(dir,{guides});
  assert.equal(first.ok,true);assert.equal(first.changed,true);
  assert.deepEqual(await fs.readFile(path.join(dir,CANONICAL)),await fs.readFile(path.join(dir,GENERATED)));
  const checked=await syncAssistantGuides(dir,{check:true,guides});
  assert.equal(checked.ok,true);assert.equal(checked.changed,false);
});

test('a malformed canonical guide is refused before a generated file is changed',async t=>{
  const {syncAssistantGuides,GUIDES}=await implementation(),dir=await sandbox(t),guides=GUIDES.filter(guide=>guide.kind==='skill');
  await fs.writeFile(path.join(dir,CANONICAL),Buffer.from('\ufeff---\nname: reel-studio\n---\n'));
  await fs.writeFile(path.join(dir,GENERATED),'Keep this host copy.');
  await assert.rejects(syncAssistantGuides(dir,{guides}),/BOM|UTF-8/);
  assert.equal(await fs.readFile(path.join(dir,GENERATED),'utf8'),'Keep this host copy.');
});

test('the distributed assistants load the same canonical skill',async()=>{
  const {syncAssistantGuides,GUIDES}=await implementation();
  const guides=GUIDES.filter(guide=>guide.kind==='skill');
  assert.equal((await syncAssistantGuides(ROOT,{check:true,guides})).ok,true,'Run node scripts/sync-assistant-guides.mjs before publishing.');
});

const AGENT_CANONICAL='instructions/agents/analysis.md';
const AGENT_GENERATED='.claude/agents/reel-analysis.md';
const AGENT_SOURCE=`---
name: reel-analysis
role: analysis
description: Measure and transcribe the named recording; return observations with timecodes.
model: haiku
tools:
  - Read
  - Bash(node scripts/intake.mjs *)
  - Bash(node engine/tools/transcribe.mjs *)
writes:
  - Projects/<id>/production/<run>/tasks/<task>/
  - Projects/<id>/transcript/
returns: result.json, analysis.md
---
## Job

Measure first.

## Inputs you may read

The packet.

## Steps

1. Run intake.

## Return

analysis.md

## Never

Edit the source.

## Knowledge

Measure before you guess.
`;

async function agentSandbox(t){
  const dir=await sandbox(t);
  for(const file of [AGENT_CANONICAL,AGENT_GENERATED])await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true});
  return dir;
}

test('an agent definition is rendered as a Claude agent with tool names only and a generated notice',async t=>{
  const {syncAssistantGuides,GUIDES}=await implementation(),dir=await agentSandbox(t);
  const guides=GUIDES.filter(guide=>guide.role==='analysis');
  assert.equal(guides.length,1);
  await fs.writeFile(path.join(dir,AGENT_CANONICAL),AGENT_SOURCE);
  const result=await syncAssistantGuides(dir,{guides});
  assert.equal(result.ok,true);assert.equal(result.changed,true);
  const generated=await fs.readFile(path.join(dir,AGENT_GENERATED),'utf8');
  assert.match(generated,/^---\nname: reel-analysis\ndescription: Measure and transcribe the named recording; return observations with timecodes\.\ntools: Read, Bash\nmodel: haiku\n---\n/);
  assert.match(generated,/<!-- Generated from instructions\/agents\/analysis\.md by scripts\/sync-assistant-guides\.mjs\. Do not edit\. -->\n## Job\n\nMeasure first\.\n/);
  assert.ok(generated.endsWith('Measure before you guess.\n'));
  assert.equal((await syncAssistantGuides(dir,{check:true,guides})).ok,true);
});

test('a malformed agent definition is refused before the generated file changes',async t=>{
  const {syncAssistantGuides,GUIDES}=await implementation(),dir=await agentSandbox(t);
  const guides=GUIDES.filter(guide=>guide.role==='analysis');
  await fs.writeFile(path.join(dir,AGENT_GENERATED),'keep');
  const cases=[
    [AGENT_SOURCE.replace('model: haiku','model: opus'),/model/],
    [AGENT_SOURCE.replace('Measure and transcribe the named recording;','Measure the named recording: transcribe it;'),/plain YAML scalar/],
    [AGENT_SOURCE.replace('name: reel-analysis','name: analysis'),/name/],
    [AGENT_SOURCE.replace('  - Projects/<id>/production/<run>/tasks/<task>/\n',''),/writes/],
    [AGENT_SOURCE.replace('Measure first.','x'.repeat(6*1024+1)),/6 KB|size/],
    [Buffer.from('\ufeff'+AGENT_SOURCE),/BOM|UTF-8/],
  ];
  for(const [source,pattern]of cases){
    await fs.writeFile(path.join(dir,AGENT_CANONICAL),source);
    await assert.rejects(syncAssistantGuides(dir,{guides}),pattern);
    assert.equal(await fs.readFile(path.join(dir,AGENT_GENERATED),'utf8'),'keep');
  }
});

test('check reports every drifted guide by name',async t=>{
  const {syncAssistantGuides,GUIDES}=await implementation(),dir=await agentSandbox(t);
  const guides=GUIDES.filter(guide=>guide.kind==='skill'||guide.role==='analysis');
  await fs.writeFile(path.join(dir,CANONICAL),'---\nname: reel-studio\n---\nA guide.\n');
  await fs.writeFile(path.join(dir,AGENT_CANONICAL),AGENT_SOURCE);
  const result=await syncAssistantGuides(dir,{check:true,guides});
  assert.equal(result.ok,false);
  assert.deepEqual(result.guides.filter(guide=>!guide.ok).map(guide=>guide.generated).sort(),[AGENT_GENERATED,GENERATED].sort());
});

test('CRLF line endings on a checkout are not drift and the copy is left untouched',async t=>{
  const {syncAssistantGuides,GUIDES,parseAgentDefinition,renderClaudeAgent}=await implementation(),dir=await agentSandbox(t);
  const guides=GUIDES.filter(guide=>guide.role==='analysis');
  const crlf=text=>Buffer.from(text.replace(/\n/g,'\r\n'),'utf8');
  const copy=crlf(renderClaudeAgent(parseAgentDefinition(AGENT_SOURCE,'analysis'),AGENT_CANONICAL));
  assert.ok(copy.includes(13));
  await fs.writeFile(path.join(dir,AGENT_CANONICAL),crlf(AGENT_SOURCE));
  await fs.writeFile(path.join(dir,AGENT_GENERATED),copy);
  const checked=await syncAssistantGuides(dir,{check:true,guides});
  assert.equal(checked.ok,true);assert.equal(checked.changed,false);
  const synced=await syncAssistantGuides(dir,{guides});
  assert.equal(synced.ok,true);assert.equal(synced.changed,false);
  assert.deepEqual(await fs.readFile(path.join(dir,AGENT_GENERATED)),copy);
});

test('nothing is written until every guide validates',async t=>{
  const {syncAssistantGuides,GUIDES}=await implementation(),dir=await agentSandbox(t);
  const guides=GUIDES.filter(guide=>guide.kind==='skill'||guide.role==='analysis');
  assert.deepEqual(guides.map(guide=>guide.kind),['skill','agent']);
  await fs.writeFile(path.join(dir,CANONICAL),'---\nname: reel-studio\n---\nA fresh guide.\n');
  await fs.writeFile(path.join(dir,GENERATED),'A stale host copy.\n');
  await fs.writeFile(path.join(dir,AGENT_CANONICAL),AGENT_SOURCE.replace('model: haiku','model: opus'));
  await assert.rejects(syncAssistantGuides(dir,{guides}),/model/);
  assert.equal(await fs.readFile(path.join(dir,GENERATED),'utf8'),'A stale host copy.\n');
  assert.equal(existsSync(path.join(dir,AGENT_GENERATED)),false);
});

test('every distributed agent definition has a current generated copy',async()=>{
  const {syncAssistantGuides,GUIDES,AGENT_ROLES}=await implementation();
  assert.deepEqual(AGENT_ROLES,['analysis','editorial','assets','sound','edit','qa','delivery','breakdown','eval-judge']);
  assert.equal(GUIDES.length,1+AGENT_ROLES.length);
  const result=await syncAssistantGuides(ROOT,{check:true});
  assert.equal(result.ok,true,`Drifted: ${result.guides.filter(guide=>!guide.ok).map(guide=>guide.generated).join(', ')}. Run node scripts/sync-assistant-guides.mjs.`);
});

test('a named finished reference is routed to the breakdown worker in every guide',async()=>{
  const read=file=>fs.readFile(path.join(ROOT,file),'utf8').then(text=>text.split(/\r?\n/));
  const skill=(await read(CANONICAL)).join(' ');
  for(const phrase of ['«فكّك الريل ده»','"break down this reel"','«اعمل تسجيلي بنفس أسلوب الريل ده»','(../../../instructions/agents/breakdown.md)','never replace your style choice'])assert.ok(skill.includes(phrase),phrase);
  const learningLines=await read('instructions/STYLE-LEARNING.md'),learning=learningLines.join(' ');
  const steps=learningLines.filter(line=>/^[0-9]+[.] /.test(line)).map(line=>line.slice(0,2));
  assert.deepEqual(steps,['1.','2.','3.','4.'],'The inspection steps keep one numbering.');
  const third=learningLines.find(line=>line.startsWith('3. '));
  for(const kept of ['Run the breakdown first','agents/breakdown.md','needs-confirmation','Inspect motion frame by frame','do not establish easing, audio cues or sequence','If only part of a reference is available'])assert.ok(third.includes(kept),kept);
  assert.equal(learning.split('Inspect the opening, middle, important idea transitions and ending').length,2,'The coverage sentence appears once.');
  assert.ok(!learning.includes('You cannot hear the reference'));
  for(const kept of ['breakdown.mjs inspect','STYLE_DNA.proposal.json','status: "draft"','baseStyle: null','suggestions, never decisions'])assert.ok(learning.includes(kept),kept);
  const readme=await read('instructions/agents/README.md');
  const firstRule=readme[readme.indexOf('## Staffing rule')+2];
  assert.match(firstRule,/^- A named finished reference.*breakdown worker first, alone/);
  const managerLines=await read('instructions/PRODUCTION-MANAGER.md'),manager=managerLines.join(' ');
  const firstRow=managerLines[managerLines.findIndex(line=>line.startsWith('| --- |'))+1];
  assert.ok(firstRow.startsWith('| breakdown | `agents/breakdown.md` · sonnet |'),'The breakdown row leads the team table.');
  assert.ok(manager.includes('breakdown first when the request names a finished reference'));
  assert.match(manager,/Supported input roles are source, reference,/);
  assert.match(manager,/roles are the team's breakdown, analysis,/);
});
test("the listener step belongs to the manager, needs the creator's yes and a key the creator saves themselves",async()=>{
  const read=file=>fs.readFile(path.join(ROOT,file),'utf8').then(text=>text.split(/\r?\n/));
  const learningLines=await read('instructions/STYLE-LEARNING.md'),learning=learningLines.join(' ');
  for(const kept of ['breakdown.mjs listen','--consent yes','listener-key','--heard-by creator','estimateUsd','dataUse','keyPresent','GEMINI_API_KEY','review-ears.template.json'])assert.ok(learning.includes(kept),kept);
  assert.match(learning,/creator to run `node scripts\/breakdown\.mjs listener-key` in their own terminal/);
  assert.match(learning,/Never ask for the key in chat and never type it/);
  assert.match(learning,/Run `listen` without consent\. It sends nothing/);
  assert.match(learning,/Never fill a sound answer from images or from your own guess/);
  assert.match(learning,/never receives the creator's own recordings/);
  assert.ok(learning.indexOf('Optional: let the listener hear the reference')>0&&learning.indexOf('Optional: let the listener hear the reference')<learning.indexOf('## Give every claim an evidence record'));
  assert.deepEqual(learningLines.filter(line=>/^[0-9]+[.] /.test(line)).map(line=>line.slice(0,2)),['1.','2.','3.','4.'],'The listener step adds no numbered inspection step.');
  const worker=(await read('instructions/agents/breakdown.md')).join(' ');
  const never=worker.slice(worker.indexOf('## Never'),worker.indexOf('## Knowledge'));
  for(const kept of ['listen --consent','listener-key','apply-review --heard-by'])assert.ok(never.includes(kept),kept);
  assert.match(worker,/`heard` now means the listener or the creator's ear; a `needs-confirmation` heard item is not a rule/);
  const manager=(await read('instructions/PRODUCTION-MANAGER.md')).join(' ');
  assert.match(manager,/`listen` and the creator's ear answers are manager actions after the creator's yes/);
  const skill=(await read(CANONICAL)).join(' ');
  for(const phrase of ['«خلّي Gemini يسمع الريل»','"let it listen"',"only with the creator's yes for that reference"])assert.ok(skill.includes(phrase),phrase);
  const claude=(await read(GENERATED)).join(' ');
  assert.ok(claude.includes('«خلّي Gemini يسمع الريل»'),'The generated Claude copy carries the listener routing.');
  const claudeWorker=(await read('.claude/agents/reel-breakdown.md')).join(' ');
  assert.ok(claudeWorker.includes('listen --consent')&&claudeWorker.includes('listener-key'),'The generated worker keeps the Never list.');
});
