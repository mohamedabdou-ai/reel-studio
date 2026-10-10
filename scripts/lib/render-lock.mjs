import './project-tmp.mjs';
import {promises as fs} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {assertProjectOutput} from './project-paths.mjs';
import {pidAlive} from './render-hygiene.mjs';

const inspect=async file=>{
  let handle;try{
    handle=await fs.open(file,'r');const stat=await handle.stat(),text=await handle.readFile('utf8');
    let owner;try{owner=JSON.parse(text);}catch{owner=null;}
    return {text,owner,identity:[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':')};
  }catch(error){if(error.code==='ENOENT')return null;throw error;}finally{await handle?.close();}
};
const valid=owner=>owner?.version===1&&Number.isSafeInteger(owner.pid)&&owner.pid>0&&typeof owner.token==='string'&&/^[a-f0-9-]{36}$/.test(owner.token);

// Fail closed for legacy/unknown locks and for PID reuse: a live PID is never
// reclaimed. A separate exclusive recovery lock serializes dead-owner cleanup.
export async function acquireRenderLock(value,{label='Output'}={}){
  const file=assertProjectOutput(value),recovery=`${file}.recovery`,owner={version:1,pid:process.pid,token:randomUUID(),createdAt:new Date().toISOString()};
  const busy=()=>new Error(`${label} is already being produced (live or unknown lock owner): ${file}`);
  const create=async()=>{
    if(await inspect(recovery))throw busy();
    const handle=await fs.open(file,'wx');await handle.writeFile(JSON.stringify(owner));await handle.sync();return handle;
  };
  let handle;
  try{handle=await create();}catch(error){
    if(error.code!=='EEXIST')throw error;
    const old=await inspect(file);if(!old||!valid(old.owner)||pidAlive(old.owner.pid))throw busy();
    let guard;try{guard=await fs.open(recovery,'wx');}catch(error){if(error.code==='EEXIST')throw busy();throw error;}
    try{
      await guard.writeFile(JSON.stringify(owner));await guard.sync();
      const current=await inspect(file);
      if(!current||current.identity!==old.identity||current.text!==old.text||!valid(current.owner)||pidAlive(current.owner.pid))throw busy();
      await fs.rm(file);
      handle=await fs.open(file,'wx');await handle.writeFile(JSON.stringify(owner));await handle.sync();
    }finally{await guard.close();await fs.rm(recovery,{force:true});}
  }
  return {owner,release:async()=>{
    await handle.close();const current=await inspect(file);
    if(current?.owner?.token!==owner.token)throw new Error(`${label} lock ownership changed; lock preserved.`);
    await fs.rm(file);
  }};
}
