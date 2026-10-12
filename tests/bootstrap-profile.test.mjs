import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {ROOT} from '../scripts/lib/job-paths.mjs';
test('first-run profile validation works before engine packages are installed',async t=>{
  const base=path.join(ROOT,'state','tmp','bootstrap-profile');await fs.mkdir(base,{recursive:true});
  const dir=await fs.mkdtemp(path.join(base,'case-'));t.after(async()=>{assert.equal(path.dirname(dir),base);await fs.rm(dir,{recursive:true,force:true});});
  await fs.cp(path.join(ROOT,'scripts'),path.join(dir,'scripts'),{recursive:true});
  await fs.cp(path.join(ROOT,'engine','src'),path.join(dir,'engine','src'),{recursive:true});
  await fs.copyFile(path.join(ROOT,'PROFILE.example.json'),path.join(dir,'PROFILE.json'));
  await fs.copyFile(path.join(ROOT,'versions.lock.json'),path.join(dir,'versions.lock.json'));
  const run=spawnSync(process.execPath,['scripts/profile.mjs','check'],{cwd:dir,encoding:'utf8',windowsHide:true});
  assert.equal(run.status,0,run.stderr);
  assert.equal(JSON.parse(run.stdout).ok,true);
  assert.equal(await fs.stat(path.join(dir,'engine','node_modules')).catch(()=>null),null);
});
