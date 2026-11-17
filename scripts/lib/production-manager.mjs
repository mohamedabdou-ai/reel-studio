import {normalizeStyleId} from '../../engine/src/styles/registry.ts';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ROOT,slug,relativePath,checkedPath,readJson,atomicJson,withFileLock,fileSnapshot} from './job-paths.mjs';

const OWNER='reel-studio-production-handoff-v1';
const ROLES=['breakdown','analysis','editorial','assets','sound','edit','qa','delivery'];
const INPUT_ROLES=['source','reference','transcript','intake','profile','asset','brief','edit','editorial-plan','copy'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now=()=>new Date().toISOString();
function object(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object.`);
  for(const key of Object.keys(value))if(!keys.includes(key))throw new Error(`Unsupported ${label} field: ${key}`);
}
function text(value,label,max=2000){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Invalid ${label}.`);return value;}
function inputScope(file,id){
  relativePath(file);
  if(![`Projects/${id}/`,'Raw/','Reference/','engine/public/'].some(prefix=>file.startsWith(prefix))&&!['PROFILE.json','PROFILE.example.json'].includes(file))throw new Error(`Input must be explicitly in the named project or source/asset scope: ${file}`);
  if(file.startsWith(`Projects/${id}/production/`))throw new Error('A production input cannot depend on its own managed state.');
  return file;
}
export function validateProductionRequest(raw){
  object(raw,['version','id','runId','supervisor','mode','interaction','objective','inputs','constraints','tasks'],'production request');
  if(raw.version!==1)throw new Error('Production request version must be 1.');
  const id=slug(raw.id),runId=slug(raw.runId,'run id'),supervisor=raw.supervisor===undefined?'manager':slug(raw.supervisor,'manager name');
  if(!['recording','graphics'].includes(raw.mode))throw new Error('Mode must be recording or graphics.');
  const interaction=raw.interaction??'delegated';
  if(!['delegated','directed'].includes(interaction))throw new Error('Interaction must be delegated or directed.');
  text(raw.objective,'production objective');
  if(!Array.isArray(raw.inputs)||!raw.inputs.length||raw.inputs.length>64)throw new Error('Name one to64 explicit inputs.');
  const seenInputs=new Set();
  const inputs=raw.inputs.map(item=>{
    object(item,['role','path'],'input');if(!INPUT_ROLES.includes(item.role))throw new Error('Unknown input role.');
    const file=inputScope(item.path,id),key=file.toLowerCase();if(seenInputs.has(key))throw new Error('Input aliases/duplicates are not accepted.');seenInputs.add(key);return {...item};
  });
  if(raw.mode==='recording'&&inputs.filter(item=>item.role==='source').length!==1)throw new Error('Recording work needs exactly one named source input.');
  let constraints=raw.constraints??{};
  object(constraints,['style','fontFamily','captionsGrouping','captionsPresentation','writingStyle','layout','digits'],'constraints');
  if(constraints.style!==undefined)constraints={...constraints,style:normalizeStyleId(constraints.style)};
  for(const [key,value]of Object.entries(constraints))text(value,`constraint ${key}`,100);
  if(constraints.digits!==undefined&&!['latin','arabic-indic'].includes(constraints.digits))throw new Error('constraint digits must be latin or arabic-indic.');
  const defaults=[['analysis','analysis',[]],['editorial','editorial',['analysis']],['edit','edit',['editorial']],['qa','qa',['edit']]]
    .map(([id,role,dependsOn])=>({id,role,dependsOn,objective:{analysis:'Inspect named inputs; separate observation, interpretation and uncertainty.',editorial:'Choose a source-grounded visual action and compatible library mechanisms.',edit:'Author an editable proposal preserving the current manual revision.',qa:'Inspect actual proposal output and report the exact scope of review.'}[role]}));
  const tasks=raw.tasks??defaults;
  if(!Array.isArray(tasks)||!tasks.length||tasks.length>20)throw new Error('Use one to20 bounded tasks.');
  const ids=new Set();let editors=0;
  for(const task of tasks){
    object(task,['id','role','objective','dependsOn'],'task');slug(task.id,'task id');text(task.objective,'task objective');
    if(ids.has(task.id)||!ROLES.includes(task.role))throw new Error('Duplicate task or unknown role.');ids.add(task.id);
    if(task.role==='edit'&&++editors>1)throw new Error('One designated edit worker per project run.');
    if(!Array.isArray(task.dependsOn)||new Set(task.dependsOn).size!==task.dependsOn.length)throw new Error('Invalid task dependencies.');
  }
  const visited=new Set(),active=new Set(),byId=new Map(tasks.map(task=>[task.id,task]));
  function visit(id){if(visited.has(id))return;if(active.has(id))throw new Error('Task dependency cycle.');if(!byId.has(id))throw new Error('Unknown task dependency.');active.add(id);for(const dep of byId.get(id).dependsOn)visit(dep);active.delete(id);visited.add(id);}
  for(const id of ids)visit(id);
  return {...raw,id,runId,supervisor,interaction,constraints,inputs,tasks};
}
const folder=request=>`Projects/${request.id}/production/${request.runId}`;
const packetPath=(state,id)=>`${folder(state.request)}/tasks/${id}/packet.json`;
const writeOptions=state=>({project:state.request.id});
async function snapshotEdit(id){
  const file=`Projects/${id}/edit.json`;
  try{return await fileSnapshot(file);}catch(error){if(error.code==='ENOENT'||/Required input is missing/.test(error.message))return null;throw error;}
}
async function sameFile(snapshot){try{return snapshot?.sha256===(await fileSnapshot(snapshot.path)).sha256;}catch{return false;}}
async function load(plan){
  if(!/^Projects\/[a-z0-9][a-z0-9-]{0,63}\/production\/[a-z0-9][a-z0-9-]{0,63}\/plan\.json$/.test(plan))throw new Error('Use an owned Projects/<id>/production/<run>/plan.json.');
  const state=await readJson(plan);
  if(state?.owner!==OWNER||state.version!==1)throw new Error('Foreign production state.');
  state.request=validateProductionRequest(state.request);
  if(plan!==`${folder(state.request)}/plan.json`)throw new Error('Production identity disagrees with its project path.');
  if(!Array.isArray(state.tasks)||state.tasks.length!==state.request.tasks.length)throw new Error('Damaged production tasks.');
  return state;
}
async function inputsCurrent(state){
  if(!await sameFile(state.requestSnapshot))return false;
  for(const input of state.inputs){inputScope(input.path,state.request.id);if(!await sameFile(input))return false;}
  return true;
}
async function basisCurrent(state,basis){
  const current=await snapshotEdit(state.request.id);
  if((current?.sha256??null)!==(basis.edit?.sha256??null))return false;
  for(const receipt of basis.dependencies)if(!await sameFile(receipt))return false;
  return true;
}
async function statesFor(state){
  const inputsOK=await inputsCurrent(state),computed=new Map();
  async function stateFor(task){
    if(computed.has(task.id))return computed.get(task.id);
    const dependencies=await Promise.all(task.dependsOn.map(id=>stateFor(state.tasks.find(row=>row.id===id))));
    let value=dependencies.some(value=>value!=='completed')?'blocked':'available';
    if(!inputsOK)value='stale';
    else if(task.claim){
      if(!await basisCurrent(state,task.claim.basis))value='stale';
      else if(task.receipt){
        let valid=await sameFile(task.receipt.file);
        for(const item of task.receipt.artifacts)valid&&=await sameFile(item);
        if(valid&&task.receipt.choices?.length){try{await validateChoices(state,task.receipt.choices);}catch{valid=false;}}
        value=valid?(dependencies.some(value=>value!=='completed')?'blocked':task.receipt.outcome==='needs-input'?'needs-input':'completed'):'stale';
      }else value=dependencies.some(value=>value!=='completed')?'blocked':'claimed';
    }
    computed.set(task.id,value);return value;
  }
  for(const task of state.tasks)await stateFor(task);return computed;
}
async function savePacket(state,task){
  const outputRoot=`${folder(state.request)}/tasks/${task.id}`;
  const packet={version:1,owner:OWNER,supervisor:state.request.supervisor,managerRole:'content-production-manager',project:state.request.id,runId:state.request.runId,
    task:task.id,role:task.role,objective:task.objective,mode:state.request.mode,interaction:state.request.interaction,constraints:state.request.constraints,
    inputs:state.inputs,dependsOn:task.dependsOn,outputRoot,
    definition:`instructions/agents/${task.role}.md`,
    acceptance:`node scripts/production-accept.mjs --role ${task.role} --task ${outputRoot}`,
    ...(task.claim?{claim:task.claim}:{}),
    policy:{liveEditWriter:'manager',originals:'read-only',outputs:'task-local proposals only',integration:'Manager uses the existing editor/planner with current revision and manual-draft protections.',truth:'An assignment is not an agent invocation; an artifact receipt is not technical success or creator acceptance.'}};
  await atomicJson(packetPath(state,task.id),packet,writeOptions(state));
}
export async function createProductionPlan(requestFile){
  const raw=await readJson(requestFile),request=validateProductionRequest(raw);
  if(!requestFile.startsWith(`Projects/${request.id}/`)||requestFile.startsWith(`Projects/${request.id}/production/`))throw new Error('Request must live in its named project outside managed output.');
  const plan=`${folder(request)}/plan.json`,options={project:request.id};
  return withFileLock(`${folder(request)}/manager.lock`,options,async()=>{
    let old;try{old=await load(plan);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(old){if(old.requestSnapshot.sha256!==(await fileSnapshot(requestFile)).sha256||hash(old.request)!==hash(request))throw new Error('Request changed; use a new run id.');
      return {ok:true,resumed:true,plan,packets:old.tasks.map(task=>packetPath(old,task.id))};}
    const entries=await fs.readdir(path.join(ROOT,folder(request)));if(entries.some(name=>name!=='manager.lock'))throw new Error('Foreign or incomplete production output; inspect it or choose a new run id.');
    const requestSnapshot=await fileSnapshot(requestFile),inputs=[];
    for(const item of request.inputs)inputs.push({...await fileSnapshot(item.path),role:item.role});
    if(!await sameFile(requestSnapshot))throw new Error('Request changed during creation.');
    const state={version:1,owner:OWNER,createdAt:now(),request,requestSnapshot,inputs,tasks:request.tasks.map(task=>({...task,claim:null,receipt:null}))};
    await atomicJson(plan,state,options);for(const task of state.tasks)await savePacket(state,task);
    return {ok:true,resumed:false,plan,packets:state.tasks.map(task=>packetPath(state,task.id))};
  });
}
async function mutate(plan,operation){
  const initial=await load(plan);
  return withFileLock(`${folder(initial.request)}/manager.lock`,writeOptions(initial),async()=>{
    const state=await load(plan),result=await operation(state);await atomicJson(plan,state,writeOptions(state));return result;
  });
}
export async function claimProductionTask(plan,{task:id,agent}){
  slug(agent,'worker alias');
  return mutate(plan,async state=>{
    const task=state.tasks.find(row=>row.id===id);if(!task)throw new Error('Unknown task.');
    const states=await statesFor(state);
    if(task.claim&&task.claim.agent!==agent)throw new Error('Task is claimed by another owner.');
    if(task.claim&&states.get(id)==='claimed')return {ok:true,packet:packetPath(state,id),basisHash:task.claim.basisHash};
    if(states.get(id)!=='available')throw new Error(`Task is not ready: ${states.get(id)}; resolve inputs/dependencies or start a fresh run.`);
    const basis={project:state.request.id,runId:state.request.runId,task:id,request:state.requestSnapshot,
      inputs:state.inputs.map(({path,sha256})=>({path,sha256})),edit:await snapshotEdit(state.request.id),dependencies:task.dependsOn.map(dep=>state.tasks.find(row=>row.id===dep).receipt.file)};
    if(!await inputsCurrent(state)||!await basisCurrent(state,basis))throw new Error('Input/edit basis changed while claiming.');
    task.claim={agent,at:now(),basis,basisHash:hash(basis)};await savePacket(state,task);
    return {ok:true,packet:packetPath(state,id),basisHash:task.claim.basisHash};
  });
}
async function validateChoices(state,choices){
  if(choices===undefined)return;
  if(!Array.isArray(choices)||choices.length>100)throw new Error('Invalid library choices.');
  const {collectLibraryEditorial,recommendLibrary}=await import('./library-selection.mjs');
  const editorial=await collectLibraryEditorial();
  for(const choice of choices){
    object(choice,['key','context','reason'],'library choice');text(choice.key,'library key',100);text(choice.reason,'choice reason');
    for(const key of ['style','layout']) {
      const fixed=state.request.constraints[key], supplied=choice.context?.[key];
      const normalize=value=>key==='style'?normalizeStyleId(value):value;
      if(fixed&&normalize(supplied)!==normalize(fixed))throw new Error(`Library choice violates fixed ${key} constraint.`);
    }
    if(choice.context?.mode!==state.request.mode)throw new Error('Library choice content mode disagrees with this run.');
    const result=recommendLibrary(editorial,{...choice.context,limit:20});
    if(!result.candidates.some(item=>item.key===choice.key))throw new Error(`Library choice is incompatible with supplied context: ${choice.key}`);
  }
}
export async function submitProductionTask(plan,{task:id,agent,result}){
  slug(agent,'worker alias');
  return mutate(plan,async state=>{
    const task=state.tasks.find(row=>row.id===id);if(!task?.claim||task.claim.agent!==agent)throw new Error('Only the claimed task owner can submit.');
    const states=await statesFor(state);if(states.get(id)!=='claimed')throw new Error(`Task basis/edit/dependencies changed or task already submitted: ${states.get(id)}`);
    const outputRoot=`${folder(state.request)}/tasks/${id}/`;
    if(result!==`${outputRoot}result.json`)throw new Error('Result must use the assigned task output path.');
    const resultSnapshot=await fileSnapshot(result),receipt=await readJson(result);
    object(receipt,['version','task','agent','basisHash','outcome','summary','artifacts','choices','review'],'result; creator acceptance is not recorded by worker receipts');
    if(receipt.version!==1||receipt.task!==id||receipt.agent!==agent||receipt.basisHash!==task.claim.basisHash)throw new Error('Receipt owner/task/basis does not match its claim.');
    if(!['proposal','needs-input'].includes(receipt.outcome))throw new Error('Result is a proposal or needs-input, never creator acceptance.');
    text(receipt.summary,'result summary');
    if(!Array.isArray(receipt.artifacts)||receipt.artifacts.length>32||(!receipt.artifacts.length&&receipt.outcome==='proposal'))throw new Error('A proposal needs real task artifacts.');
    const artifacts=[],seen=new Set();
    for(const item of receipt.artifacts){
      object(item,['path','sha256'],'artifact');relativePath(item.path);
      if(!item.path.startsWith(outputRoot)||[`${outputRoot}packet.json`,result].includes(item.path)||seen.has(item.path.toLowerCase()))throw new Error('Artifact must stay in its task output and cannot alias packet/result.');
      seen.add(item.path.toLowerCase());await checkedPath(item.path,{write:true,project:state.request.id,mustExist:true});
      const actual=await fileSnapshot(item.path);if(actual.sha256!==item.sha256)throw new Error('Artifact hash changed or is forged.');artifacts.push(actual);
    }
    if(receipt.review!==undefined){
      object(receipt.review,['kind','evidence'],'reported review');
      if(!['none','stills','playback'].includes(receipt.review.kind)||!Array.isArray(receipt.review.evidence)
        ||(receipt.review.kind!=='none'&&!receipt.review.evidence.length)
        ||receipt.review.evidence.some(file=>typeof file!=='string'||!seen.has(file.toLowerCase())))throw new Error('Review needs actual hashed task evidence; it does not record acceptance.');
    }
    await validateChoices(state,receipt.choices);
    if(!await inputsCurrent(state)||!await basisCurrent(state,task.claim.basis)||!await sameFile(resultSnapshot))throw new Error('Source, edit revision or receipt changed before submission.');
    for(const item of artifacts)if(!await sameFile(item))throw new Error('Artifact changed before submission.');
    task.receipt={file:resultSnapshot,artifacts,outcome:receipt.outcome,summary:receipt.summary,choices:receipt.choices??[],reportedReview:receipt.review??{kind:'none',evidence:[]},submittedAt:now()};
    return {ok:true,task:id,state:receipt.outcome==='proposal'?'completed':'needs-input',scope:'Verified proposal handoff only; manager review and normal editor integration remain separate.'};
  });
}
/** accept.json beside the task's outputs, written by production-accept.mjs. Fails closed: unreadable reports, a missing or foreign claim basis and stale or blocked tasks are never a pass. */
async function acceptanceOf(state,task,taskState){
  const file=`${folder(state.request)}/tasks/${task.id}/accept.json`;
  let report;
  try{report=await readJson(file);}
  catch(error){if(error.code==='ENOENT')return null;if(/Invalid JSON|too large/i.test(error.message))return {ok:false,checkedAt:null,file};throw error;}
  if(!report||typeof report!=='object'||Array.isArray(report))return {ok:false,checkedAt:null,file};
  const bound=typeof task.claim?.basisHash==='string'&&report.basisHash===task.claim.basisHash;
  return {ok:report.ok===true&&bound&&!['stale','blocked'].includes(taskState),checkedAt:typeof report.checkedAt==='string'?report.checkedAt:null,file};
}
export async function productionStatus(plan){
  const state=await load(plan),states=await statesFor(state);
  return {ok:true,plan,supervisor:state.request.supervisor,managerRole:'content-production-manager',interaction:state.request.interaction,constraints:state.request.constraints,
    scope:'Task-local proposal handoffs; no agent invocation, live-edit merge, technical pass or creator acceptance is inferred.',creatorAcceptance:'not-recorded',
    tasks:await Promise.all(state.tasks.map(async task=>({id:task.id,role:task.role,state:states.get(task.id),agent:task.claim?.agent??null,packet:packetPath(state,task.id),dependsOn:task.dependsOn,receipt:task.receipt??null,acceptance:await acceptanceOf(state,task,states.get(task.id))})))};
}
