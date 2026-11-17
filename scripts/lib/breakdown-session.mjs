import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {availableParallelism} from 'node:os';
import {breakdownPaths,breakdownEnvironment} from './breakdown-runtime.mjs';
import {ROOT,assertProjectOutput} from './project-paths.mjs';

export function resourceBudget(cores=availableParallelism(),asrRunning=true){
  cores=Math.max(1,Math.floor(cores));
  const asr=Math.min(4,cores),pool=asrRunning && cores>5?2:1;
  const vision=asrRunning?Math.max(1,Math.min(Math.max(1,asr-1),Math.floor(.6*cores)-asr)):cores;
  return {cores,pool,asr,vision,onnx:vision,asrRunning};
}

export function planSpeech(operation){
  let decide;
  const running=new Promise(resolve=>{decide=resolve;});
  // Always handle rejection immediately, even while the caller awaits the
  // cache/skip decision rather than the final transcript.
  const result=Promise.resolve().then(()=>operation(()=>decide(true))).then(
    value=>{decide(false);return {value};},error=>{decide(false);return {error,failed:true};});
  return {running,async wait(){const r=await result;if(r.failed)throw r.error;return r.value;}};
}

export function assertExecutionUnchanged(before,after){
  const {transcript:oldTranscript,execution:oldExecution,...original}=before;
  const {transcript:newTranscript,execution:newExecution,...current}=after;
  if(JSON.stringify(original)!==JSON.stringify(current))throw new Error('Source or analyser implementation changed during analysis.');
}

export async function overlap(tasks,limit=2,onError=()=>{}){
  const results=new Array(tasks.length);let next=0,failure,failed=false;
  await Promise.allSettled(Array.from({length:Math.min(limit,tasks.length)},async()=>{
    while(next<tasks.length && !failed){const i=next++;try{results[i]=await tasks[i]();}catch(error){if(!failed){failure=error;failed=true;}onError(error);throw error;}}
  }));if(failed)throw failure;return results;
}

export async function analyserSession(workDir,{signal,budget=resourceBudget(undefined,false)}={}){
  signal?.throwIfAborted();
  workDir=assertProjectOutput(workDir);
  // The caller holds the reference lease: existing worker directories are
  // leftovers, never a second active job. Do not follow directory symlinks.
  for(const entry of await fs.readdir(workDir,{withFileTypes:true})){
    if(entry.isDirectory() && entry.name.startsWith('worker-')){
      const leftover=assertProjectOutput(path.join(workDir,entry.name));
      if(path.dirname(leftover)!==workDir)throw new Error('Worker cleanup escaped its work directory');
      await fs.rm(leftover,{recursive:true,force:true});
    }
  }
  const paths=breakdownPaths();const dir=await fs.mkdtemp(path.join(workDir,'worker-'));
  const logFile=assertProjectOutput(path.join(workDir,'logs','worker.log'));await fs.mkdir(path.dirname(logFile),{recursive:true});
  const log=await fs.open(logFile,'w');
  const env=breakdownEnvironment({...process.env,REEL_ANALYSIS_THREADS:String(budget.vision),
    OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1',
    OMP_MAX_ACTIVE_LEVELS:'1'},paths);
  const child=spawn(paths.python,['-m','breakdown','serve','--directory',dir,'--threads',String(budget.vision)],
    {cwd:ROOT,env,windowsHide:true,stdio:['pipe','pipe',log.fd]});
  let pending=null,closed=false,chain=Promise.resolve(),terminationError;
  const fail=error=>{if(pending){pending.reject(error);pending=null;}};
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{try{const result=JSON.parse(line);if(pending && !terminationError){const p=pending;pending=null;result.ok?p.resolve():p.reject(new Error(`Breakdown ${p.name} failed: ${result.error}. Diagnostics: ${p.logFile}`));}}catch(error){terminationError=error;child.kill();}});
  child.stdin.on('error',fail);
  child.on('error',error=>{closed=true;fail(error);});child.on('close',(code,why)=>{closed=true;fail(terminationError??new Error(`Analyser worker exited (${code ?? why}). Diagnostics: ${logFile}`));});
  // Wait for close before rejecting active work: Windows must release staged
  // file handles before runAnalyser removes its attempt directory.
  const abort=()=>{terminationError=signal.reason??new Error('Analysis cancelled');child.kill();};
  signal?.addEventListener('abort',abort,{once:true});
  const exec=(_command,args,{logFile:stageLog}={})=>{
    const task=async()=>{
      if(closed || signal?.aborted)throw signal?.reason??new Error('Analyser worker is closed');
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{terminationError=new Error(`Analyser timed out. Diagnostics: ${logFile}`);child.kill();},20*60_000);
        pending={name:args[2],logFile:stageLog??logFile,resolve:()=>{clearTimeout(timer);resolve();},reject:error=>{clearTimeout(timer);reject(error);}};
        child.stdin.write(JSON.stringify({name:args[2],input:args[args.indexOf('--input')+1],output:args[args.indexOf('--output')+1],threads:args.includes('--threads')?Number(args[args.indexOf('--threads')+1]):undefined,log:stageLog??logFile})+'\n',error=>{if(error)fail(error);});
      });
    };
    const result=chain.then(task);chain=result.catch(()=>{});return result;
  };
  const numericBudget=()=>({vision:budget.vision,onnx:budget.onnx,blas:1});
  exec.cacheIdentity=numericBudget();
  return {exec,get budget(){return budget;},async configure(next){
    await exec(null,['-m','breakdown','configure','--threads',String(next.vision)]);
    budget=next;exec.cacheIdentity=numericBudget();
  },async close(){
    signal?.removeEventListener('abort',abort);child.stdin.end();
    if(!closed)await new Promise(resolve=>{const timer=setTimeout(()=>child.kill(),3000);child.once('close',()=>{clearTimeout(timer);resolve();});});
    lines.close();await log.close();await fs.rm(assertProjectOutput(dir),{recursive:true,force:true});
  }};
}
