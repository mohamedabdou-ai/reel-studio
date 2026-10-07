import './lib/project-tmp.mjs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from './lib/project-tmp.mjs';
import {parseArgs} from './lib/media.mjs';

const args=parseArgs(process.argv.slice(2),{'older-than':'30'});
for(const key of Object.keys(args))if(!['_','older-than','dry-run'].includes(key))throw new Error(`Unknown option: --${key}`);
if(args._.length)throw new Error('Usage: node scripts/clean-temp.mjs [--older-than 30] [--dry-run]');
const minutes=Number(args['older-than']);if(!Number.isFinite(minutes)||minutes<0)throw new Error('--older-than must be zero or a positive number of minutes.');
const cutoff=Date.now()-minutes*60*1000,dryRun=args['dry-run']===true;
const entries=await fs.readdir(PROJECT_TMP,{withFileTypes:true}).catch(()=>[]);let removed=0,kept=0;
for(const entry of entries){
  const target=path.join(PROJECT_TMP,entry.name),relative=path.relative(PROJECT_TMP,target);
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error(`Unsafe temporary path: ${target}`);
  const stat=await fs.stat(target).catch(()=>null);if(!stat||stat.mtimeMs>cutoff){kept++;continue;}
  if(!dryRun)await fs.rm(target,{recursive:true,force:true});removed++;
}
console.log(JSON.stringify({ok:true,scope:'workspace-only',root:PROJECT_TMP,olderThanMinutes:minutes,dryRun,removed,kept},null,2));
