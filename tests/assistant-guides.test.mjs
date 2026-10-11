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
  const {syncAssistantGuides}=await implementation(),dir=await sandbox(t);
  const source='---\nname: reel-studio\n---\nA canonical guide.\n',old='An older host copy.\n';
  await fs.writeFile(path.join(dir,CANONICAL),source);
  await fs.writeFile(path.join(dir,GENERATED),old);
  const result=await syncAssistantGuides(dir,{check:true});
  assert.equal(result.ok,false);
  assert.equal(await fs.readFile(path.join(dir,CANONICAL),'utf8'),source);
  assert.equal(await fs.readFile(path.join(dir,GENERATED),'utf8'),old);
});

test('sync updates only the generated host copy and the next check passes',async t=>{
  const {syncAssistantGuides}=await implementation(),dir=await sandbox(t);
  const source='---\nname: reel-studio\n---\nShared guide.\n';
  await fs.writeFile(path.join(dir,CANONICAL),source);
  const first=await syncAssistantGuides(dir);
  assert.equal(first.ok,true);assert.equal(first.changed,true);
  assert.deepEqual(await fs.readFile(path.join(dir,CANONICAL)),await fs.readFile(path.join(dir,GENERATED)));
  const checked=await syncAssistantGuides(dir,{check:true});
  assert.equal(checked.ok,true);assert.equal(checked.changed,false);
});

test('a malformed canonical guide is refused before a generated file is changed',async t=>{
  const {syncAssistantGuides}=await implementation(),dir=await sandbox(t);
  await fs.writeFile(path.join(dir,CANONICAL),Buffer.from('\ufeff---\nname: reel-studio\n---\n'));
  await fs.writeFile(path.join(dir,GENERATED),'Keep this host copy.');
  await assert.rejects(syncAssistantGuides(dir),/BOM|UTF-8/);
  assert.equal(await fs.readFile(path.join(dir,GENERATED),'utf8'),'Keep this host copy.');
});

test('the distributed assistants load the same canonical skill',async()=>{
  const {syncAssistantGuides}=await implementation();
  assert.equal((await syncAssistantGuides(ROOT,{check:true})).ok,true,'Run node scripts/sync-assistant-guides.mjs before publishing.');
});
