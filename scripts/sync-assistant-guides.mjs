import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const CANONICAL_SKILL='.agents/skills/reel-studio/SKILL.md';
export const GENERATED_SKILL='.claude/skills/reel-studio/SKILL.md';
export const AGENT_DIR='instructions/agents';
export const GENERATED_AGENT_DIR='.claude/agents';
export const AGENT_ROLES=Object.freeze(['analysis','editorial','assets','sound','edit','qa','delivery','breakdown','eval-judge']);
export const AGENT_MODELS=Object.freeze(['haiku','sonnet']);
export const AGENT_TOOLS=Object.freeze(['Read','Grep','Glob','Write','Bash','WebFetch']);
export const AGENT_FILE_LIMIT=6*1024;
const TASK_FOLDER='Projects/<id>/production/<run>/tasks/<task>/';
const JUDGE_FOLDER='state/evals/';
export const GUIDES=Object.freeze([
  {kind:'skill',canonical:CANONICAL_SKILL,generated:GENERATED_SKILL},
  ...AGENT_ROLES.map(role=>({kind:'agent',role,canonical:`${AGENT_DIR}/${role}.md`,generated:`${GENERATED_AGENT_DIR}/reel-${role}.md`})),
]);

function decode(bytes,label){
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)throw new Error(`${label} must use UTF-8 without a BOM.`);
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

/** Minimal YAML subset: `key: value` lines and `key:` followed by `  - item` lines. */
export function parseFrontmatter(text){
  const front={};let key=null;
  for(const raw of text.split('\n')){
    const line=raw.replace(/\r$/,'');
    if(!line.trim())continue;
    const item=/^\s+-\s+(.+)$/.exec(line);
    if(item){if(!key||!Array.isArray(front[key]))throw new Error(`List item without a list key: ${line.trim()}`);front[key].push(item[1].trim());continue;}
    const pair=/^([a-zA-Z][a-zA-Z0-9-]*):\s*(.*)$/.exec(line);
    if(!pair)throw new Error(`Unreadable frontmatter line: ${line}`);
    key=pair[1];front[key]=pair[2]===''?[]:pair[2].trim();
  }
  return front;
}

export function parseAgentDefinition(text,role){
  if(Buffer.byteLength(text,'utf8')>AGENT_FILE_LIMIT)throw new Error(`${role}: an agent definition must stay within 6 KB (size limit).`);
  const match=/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if(!match)throw new Error(`${role}: an agent definition needs frontmatter between --- lines.`);
  const front=parseFrontmatter(match[1]),body=match[2].replace(/\r\n/g,'\n');
  const expectName=`reel-${role}`;
  if(front.name!==expectName)throw new Error(`${role}: frontmatter name must be ${expectName}.`);
  if(front.role!==role)throw new Error(`${role}: frontmatter role must be ${role}.`);
  if(typeof front.description!=='string'||!front.description.trim())throw new Error(`${role}: description must be one non-empty line.`);
  // The generated copy writes the description as a plain YAML scalar, so it must not hold ": ", " #" or a leading indicator.
  if(/: | #|^[-?:,\[\]{}#&*!|>'"%@`]/.test(front.description))throw new Error(`${role}: description must be a plain YAML scalar (no ": ", " #" or leading indicator).`);
  if(!AGENT_MODELS.includes(front.model))throw new Error(`${role}: model must be one of ${AGENT_MODELS.join(', ')}.`);
  if(!Array.isArray(front.tools)||!front.tools.length)throw new Error(`${role}: tools must list at least one tool.`);
  for(const tool of front.tools){const name=tool.replace(/\(.*\)$/,'');if(!AGENT_TOOLS.includes(name))throw new Error(`${role}: unknown tool ${tool}.`);}
  const firstWrite=role==='eval-judge'?JUDGE_FOLDER:TASK_FOLDER;
  if(!Array.isArray(front.writes)||front.writes[0]!==firstWrite)throw new Error(`${role}: writes must start with ${firstWrite}.`);
  if(typeof front.returns!=='string'||!front.returns.trim())throw new Error(`${role}: returns must name the result files.`);
  for(const heading of ['## Job','## Inputs you may read','## Steps','## Return','## Never','## Knowledge'])if(!body.includes(`\n${heading}\n`)&&!body.startsWith(`${heading}\n`))throw new Error(`${role}: body is missing the section ${heading}.`);
  return {front,body};
}

export function renderClaudeAgent({front,body},canonical){
  const tools=[...new Set(front.tools.map(tool=>tool.replace(/\(.*\)$/,'')))].join(', ');
  return `---\nname: ${front.name}\ndescription: ${front.description}\ntools: ${tools}\nmodel: ${front.model}\n---\n<!-- Generated from ${canonical} by scripts/sync-assistant-guides.mjs. Do not edit. -->\n${body}`;
}

/** A checkout with core.autocrlf may hold CRLF copies; drift means different text, not different line endings. */
function sameText(previous,expected){
  const lf=bytes=>bytes.toString('utf8').replace(/\r\n/g,'\n');
  return lf(previous)===lf(expected);
}

async function readOptional(file){return fs.readFile(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});}

async function renderGuide(root,guide){
  const source=await fs.readFile(path.join(root,guide.canonical));
  if(guide.kind==='skill'){
    const text=decode(source,'Canonical skill');
    if(!/^---\r?\nname: reel-studio\r?\n/.test(text))throw new Error('Canonical skill must retain the existing reel-studio identity.');
    return source;
  }
  const text=decode(source,`Agent definition ${guide.canonical}`);
  return Buffer.from(renderClaudeAgent(parseAgentDefinition(text,guide.role),guide.canonical),'utf8');
}

/** Both hosts share one authored skill and one set of worker definitions; only the generated copies are written. */
export async function syncAssistantGuides(root,{check=false,guides=GUIDES}={}){
  const rendered=[];
  for(const guide of guides){
    const expected=await renderGuide(root,guide);
    const previous=await readOptional(path.join(root,guide.generated));
    rendered.push({guide,expected,ok:previous!==null&&sameText(previous,expected)});
  }
  const report=rendered.map(({guide,ok})=>({canonical:guide.canonical,generated:guide.generated,ok,changed:false}));
  if(check)return {ok:report.every(item=>item.ok),changed:false,canonical:CANONICAL_SKILL,generated:GENERATED_SKILL,guides:report};
  for(const [index,{guide,expected,ok}]of rendered.entries()){
    if(ok)continue;
    const target=path.join(root,guide.generated);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,expected);
    report[index].ok=true;report[index].changed=true;
  }
  return {ok:true,changed:report.some(item=>item.changed),canonical:CANONICAL_SKILL,generated:GENERATED_SKILL,guides:report};
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
