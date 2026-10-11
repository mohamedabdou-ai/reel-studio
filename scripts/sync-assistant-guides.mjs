import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const CANONICAL_SKILL='.agents/skills/reel-studio/SKILL.md';
export const GENERATED_SKILL='.claude/skills/reel-studio/SKILL.md';

/** Both hosts share one authored skill and the same root instruction guides. */
export async function syncAssistantGuides(root,{check=false}={}){
  const source=await fs.readFile(path.join(root,CANONICAL_SKILL));
  if(source[0]===0xef&&source[1]===0xbb&&source[2]===0xbf)throw new Error('Canonical skill must use UTF-8 without a BOM.');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(source);
  if(!/^---\r?\nname: reel-studio\r?\n/.test(text))throw new Error('Canonical skill must retain the existing reel-studio identity.');
  const target=path.join(root,GENERATED_SKILL);
  const previous=await fs.readFile(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const matches=previous!==null&&previous.equals(source);
  if(check)return {ok:matches,changed:false,canonical:CANONICAL_SKILL,generated:GENERATED_SKILL};
  if(!matches){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,source);}
  return {ok:true,changed:!matches,canonical:CANONICAL_SKILL,generated:GENERATED_SKILL};
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    const args=process.argv.slice(2);
    if(args.some(arg=>arg!=='--check'))throw new Error('Usage: node scripts/sync-assistant-guides.mjs [--check]');
    const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
    const result=await syncAssistantGuides(root,{check:args.includes('--check')});
    process.stdout.write(JSON.stringify(result)+'\n');
    if(!result.ok)process.exitCode=1;
  }catch(error){process.stderr.write(String(error.message)+'\n');process.exitCode=1;}
}
