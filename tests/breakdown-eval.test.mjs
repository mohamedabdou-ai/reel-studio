import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
const exec=promisify(execFile);
test('eval strict mode exposes a missed target and succeeds for an exact empty-case match',async t=>{
  const dir=await fs.mkdtemp(path.join(PROJECT_TMP,'breakdown-eval-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const truth={fps:60,cuts:[{t:1,kind:'cut'}],transitions:[],camera:[],text:[],sound:{bed:false,bpm:null,sfx:[]}};
  const found={cuts:[{t:1.05,kind:'cut'}],transitions:[],shots:[],text:[],sound:{bed:{present:false},tempo:null,sfx:[]}};
  const truthFile=path.join(dir,'truth.json'),breakdownFile=path.join(dir,'breakdown.json');await fs.writeFile(truthFile,JSON.stringify(truth));await fs.writeFile(breakdownFile,JSON.stringify(found));
  const args=['scripts/breakdown-eval.mjs','--breakdown',breakdownFile,'--truth',truthFile,'--strict'];
  await assert.rejects(()=>exec(process.execPath,args,{cwd:ROOT,windowsHide:true}),error=>error.code===1 && JSON.parse(error.stdout).rows.some(r=>r.measure==='cutsF1' && r.pass===false));
  found.cuts[0].t=1;await fs.writeFile(breakdownFile,JSON.stringify(found));const {stdout}=await exec(process.execPath,args,{cwd:ROOT,windowsHide:true});assert.equal(JSON.parse(stdout).rows.some(r=>r.pass===false),false);
});
