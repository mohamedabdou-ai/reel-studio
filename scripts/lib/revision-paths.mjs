import './project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {assertProjectOutput} from './project-paths.mjs';
import {ROOT} from './project-paths.mjs';

const normalized=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
const identity=async file=>{
  const stat=await fs.stat(file,{bigint:true}).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  return {path:normalized(file),real:stat?normalized(await fs.realpath(file)):null,stat};
};

/** Preserve every source and accepted companion, including Windows case aliases. */
export async function assertRevisionDestinations(output,inputs,{sidecars=['.qc.json']}={}){
  const sources=await Promise.all(inputs.map(identity));
  for(const target of [path.resolve(output),...sidecars.map(suffix=>`${path.resolve(output)}${suffix}`)]){
    const candidate=await identity(target);
    for(const source of sources){
      if(candidate.path===source.path||(candidate.real&&candidate.real===source.real)||(candidate.stat&&source.stat&&candidate.stat.dev===source.stat.dev&&candidate.stat.ino===source.stat.ino))throw new Error('Revision output or companion aliases a source input. Choose a new output and preserve the originals.');
    }
    assertProjectOutput(target);
  }
}

export async function assertPreparedRevisionDestinations(output,props,{propsFile,extraInputs=[],sidecars=['.qc.json','.range.json']}={}){
  const inputs=[...extraInputs];if(propsFile)inputs.push(path.resolve(propsFile),`${path.resolve(propsFile)}.qc.json`);
  const collect=value=>{
    if(!value||typeof value!=='object')return;
    for(const [key,item]of Object.entries(value)){
      if(typeof item==='string'&&['path','src','sfx'].includes(key)){
        if(/^[a-z]+:|^data:/i.test(item)&&!path.isAbsolute(item))continue;
        const absolute=path.isAbsolute(item)?item:path.resolve(ROOT,key==='src'?`engine/public/${item}`:item);
        inputs.push(absolute,`${absolute}.qc.json`,`${absolute}.prepared.json`);
      }else if(item&&typeof item==='object')collect(item);
    }
  };
  collect(props);
  await assertRevisionDestinations(output,[...new Set(inputs)],{sidecars});
}
