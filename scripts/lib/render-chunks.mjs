import './project-tmp.mjs';
import path from 'node:path';
import {promises as fs,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {ROOT,run} from './media.mjs';
import {assertProjectOutput} from './project-paths.mjs';
import {acquireRenderLock} from './render-lock.mjs';

export const CHUNK_POLICY={version:1,audio:'one-full-duration-track',scan:'decode-count-and-black-intervals',cache:'exact-key-only'};
export const chunkProfile=preset=>preset==='ultrafast'?'Constrained Baseline':'High';
export const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
export async function contentHash(file){const hash=createHash('sha256');for await(const data of createReadStream(file))hash.update(data);return hash.digest('hex');}
const referencedFiles=(props,engineRoot)=>{
  const files=[];
  const collect=value=>{
    if(!value||typeof value!=='object')return;
    for(const [key,item]of Object.entries(value)){
      if(typeof item==='string'&&['src','path'].includes(key)){
        if(/^https?:|^data:/i.test(item))throw new Error('Chunk resume requires local, immutable media inputs.');
        files.push(path.isAbsolute(item)?item:key==='src'?path.join(engineRoot,'public',item):path.resolve(ROOT,item));
      }else if(typeof item==='object')collect(item);
    }
  };collect(props);return files;
};

// Content hashes identify a revision; stat identity prevents an in-flight change
// (including edit-then-restore) from mixing pixels under that revision.
export async function createRenderInputGuard({engineRoot,props,files=[]}){
  const snapshot=async()=>{
    const rows=[];
    const add=async file=>{const stat=await fs.lstat(file,{bigint:true});if(stat.isSymbolicLink())throw new Error('Render input scan refuses symbolic links.');rows.push([path.resolve(file),String(stat.dev),String(stat.ino),String(stat.size),String(stat.mtimeNs),String(stat.ctimeNs)]);return stat;};
    const tree=async dir=>{await add(dir);for(const entry of(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())await tree(file);else await add(file);}};
    await tree(path.join(engineRoot,'src'));await tree(path.join(engineRoot,'public'));
    for(const file of [...new Set([...files,...referencedFiles(props,engineRoot)])].sort())await add(file);
    for(const name of ['package.json','package-lock.json','tsconfig.json','proxies.json'])try{await add(path.join(engineRoot,name));}catch(error){if(error.code!=='ENOENT')throw error;}
    return canonical(rows);
  };
  const initial=await snapshot();return {revision:createHash('sha256').update(initial).digest('hex'),check:async()=>{if(await snapshot()!==initial)throw new Error('Render inputs changed while chunks were being produced. Preserve the sources and run the same command again.');}};
}

// Full content hashes are deliberate: stat/head/tail keys miss same-size edits.
export async function renderIdentity({engineRoot,props,settings,policy=CHUNK_POLICY,files=[]}){
  const hash=createHash('sha256').update(canonical({props,settings,policy}));
  const tree=async(dir)=>{
    let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){throw new Error(`Render input scan failed: ${dir}`,{cause:error});}
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      const file=path.join(dir,entry.name);
      if(entry.isSymbolicLink())throw new Error(`Render input scan refuses a symbolic link: ${file}`);
      if(entry.isDirectory())await tree(file);
      else if(entry.isFile())hash.update(path.relative(engineRoot,file)).update(await contentHash(file));
      else throw new Error(`Render input scan found a non-regular file: ${file}`);
    }
  };
  await tree(path.join(engineRoot,'src'));await tree(path.join(engineRoot,'public'));
  for(const name of ['package.json','package-lock.json','tsconfig.json','proxies.json']){
    const file=path.join(engineRoot,name);
    try{hash.update(name).update(await contentHash(file));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  // Props may refer to originals or audio outside engine/public.
  for(const file of [...new Set([...files,...referencedFiles(props,engineRoot)])].sort())hash.update(path.resolve(file)).update(await contentHash(file));
  return hash.digest('hex');
}

export function chunkBudget({frames,chunkFrames,jobs=1,fps,width=1080,height=1920,freeRamBytes,freeDiskBytes,png=false,videoMaxBitsPerSec=25e6}){
  for(const [key,n]of Object.entries({frames,chunkFrames,jobs,fps,width,height,freeRamBytes,freeDiskBytes}))if(!Number.isFinite(n)||n<0||(['frames','chunkFrames','jobs','fps','width','height'].includes(key)&&n===0))throw new Error(`Invalid chunk budget ${key}`);
  const seconds=frames/fps,needRamBytes=((width*height/1e6)+2)*1024**3*jobs;
  const frameBytes=(png?2.8:0.6)*1024**2*(width*height/(1080*1920));
  const spillBytes=freeRamBytes<needRamBytes?Math.ceil(Math.min(frames,chunkFrames*jobs)*frameBytes):0;
  const retainedBytes=Math.ceil(seconds*videoMaxBitsPerSec/8*1.15);
  // Raw assembly and staged final coexist until all final gates pass.
  const assemblyBytes=retainedBytes*2,audioBytes=Math.ceil(seconds*48000*2*4*2),reserveBytes=2*1024**3;
  const needDiskBytes=spillBytes+retainedBytes+assemblyBytes+audioBytes+reserveBytes;
  return {ok:freeDiskBytes>=needDiskBytes,needDiskBytes,needRamBytes,spillBytes,retainedBytes,assemblyBytes,audioBytes,reserveBytes,message:`Chunk budget ${(needDiskBytes/1024**3).toFixed(2)} GiB required; ${(freeDiskBytes/1024**3).toFixed(2)} GiB free (${jobs} render job(s)).`};
}

export function chunkRanges(frames,chunkFrames){
  if(!Number.isInteger(frames)||frames<1||!Number.isInteger(chunkFrames)||chunkFrames<1)throw new Error('Chunk frames must be positive integers.');
  const ranges=[];for(let from=0;from<frames;from+=chunkFrames)ranges.push([from,Math.min(frames-1,from+chunkFrames-1)]);return ranges;
}

export async function renderChunks({cacheRoot=path.join(ROOT,'state/cache/render-chunks'),key,frames,chunkFrames,jobs=1,render,validate,assertInputs=async()=>{},log=()=>{}}){
  if(!/^[a-f0-9]{64}$/.test(key)||!Number.isInteger(jobs)||jobs<1||jobs>2)throw new Error('Chunk identity and queue size are invalid (jobs: 1-2).');
  const ranges=chunkRanges(frames,chunkFrames),dir=assertProjectOutput(path.join(cacheRoot,key));
  await fs.mkdir(dir,{recursive:true});
  const lockPath=assertProjectOutput(path.join(dir,'render.lock'));
  const lock=await acquireRenderLock(lockPath,{label:'Chunk cache'});
  let cursor=0,failure=null,reused=0;const parts=new Array(ranges.length);
  try{
    const worker=async()=>{
      while(!failure&&cursor<ranges.length){
        await assertInputs();
        const index=cursor++,range=ranges[index],file=assertProjectOutput(path.join(dir,`${range[0]}-${range[1]}.mp4`)),marker=`${file}.json`;
        let info;try{info=JSON.parse(await fs.readFile(marker,'utf8'));}catch(error){if(!['ENOENT'].includes(error.code)&&!(error instanceof SyntaxError))throw error;}
        if(info?.version===1&&info.key===key&&canonical(info.range)===canonical(range)){
          try{
            const stat=await fs.stat(file);
            if(stat.size!==info.bytes||await contentHash(file)!==info.sha256)throw new Error('Cached chunk bytes changed.');
            const checked=await validate(file,range);
            await assertInputs();
            if(canonical(checked)!==canonical(info.media))throw new Error('Cached chunk media changed.');
            parts[index]={file,range,media:checked,reused:true};reused++;log(`chunk ${index+1}/${ranges.length}: verified cache`);continue;
          }catch(error){log(`chunk ${index+1}: cache rejected (${error.message})`);}
        }
        await fs.rm(marker,{force:true});
        const pending=`${file}.pending-${process.pid}.mp4`;
        try{
          await render({range,out:pending,index});
          const media=await validate(pending,range),stat=await fs.stat(pending);
          if(!stat.isFile()||stat.size===0)throw new Error('Rendered chunk is empty.');
          const metadata={version:1,key,range,bytes:stat.size,sha256:await contentHash(pending),media};
          await assertInputs();
          await fs.rename(pending,file);
          const temporary=`${marker}.pending`;await fs.writeFile(temporary,JSON.stringify(metadata),'utf8');await fs.rename(temporary,marker);
          parts[index]={file,range,media,reused:false};log(`chunk ${index+1}/${ranges.length}: rendered and verified`);
        }catch(error){failure??=error;await fs.rm(pending,{force:true});throw error;}
      }
    };
    const results=await Promise.allSettled(Array.from({length:Math.min(jobs,ranges.length)},worker));
    if(failure)throw failure;const rejected=results.find(r=>r.status==='rejected');if(rejected)throw rejected.reason;
    return {key,parts,reused,rendered:parts.length-reused,directory:dir};
  }finally{await lock.release();}
}

export async function mediaContract(file,{decode=true}={}){
  const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_streams','-of','json',file]);
  const v=JSON.parse(stdout).streams?.[0];
  if(!v)throw new Error('Media scan found no video.');
  const rational=value=>{const[n,d]=String(value).split('/').map(Number);return n/d;};
  const media={codec:v.codec_name,profile:v.profile,width:v.width,height:v.height,fps:rational(v.avg_frame_rate),pixelFormat:v.pix_fmt,frames:Number(v.nb_read_frames)};
  if(!Number.isInteger(media.frames)||media.frames<1||!Number.isFinite(media.fps))throw new Error('Media scan could not measure frame count or cadence.');
  if(decode)await run('ffmpeg',['-v','error','-xerror','-i',file,'-map','0:v:0','-an','-f','null','-']);
  return media;
}

export async function validateChunk(file,range,expected){
  const media=await mediaContract(file);
  if(media.frames!==range[1]-range[0]+1)throw new Error('Chunk frame count disagrees with its range.');
  for(const key of ['width','height','codec','profile','pixelFormat'])if(expected[key]!==undefined&&media[key]!==expected[key])throw new Error(`Chunk ${key} disagrees with render settings.`);
  if(Math.abs(media.fps-expected.fps)>.00001)throw new Error('Chunk cadence disagrees with render settings.');
  const {stderr}=await run('ffmpeg',['-hide_banner','-nostats','-loglevel','info','-xerror','-i',file,'-map','0:v:0','-an','-vf','scale=160:-2,blackdetect=d=0:pic_th=0.98:pix_th=0.02','-f','null','-']);
  if(!/frame=\s*\d+/.test(stderr))throw new Error('Chunk visual scan returned no completed frame measurement.');
  const blackRanges=[...stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map(match=>[
    range[0]+Math.floor(Number(match[1])*expected.fps+1e-5),
    Math.min(range[1],range[0]+Math.max(Math.floor(Number(match[1])*expected.fps+1e-5),Math.ceil(Number(match[2])*expected.fps-1e-5)-1))
  ]);
  for(const [from,to]of blackRanges)if(!(expected.allowBlackRanges??[]).some(([a,b])=>a<=from&&b>=to))throw new Error(`Chunk contains undeclared black frames ${from}-${to}. Review the scene; declare only intentional intervals with --intentional-black a-b.`);
  return {...media,scan:{complete:true,blackRanges}};
}

export async function assembleChunks({parts,audio,out,fps,frames,workDir=path.dirname(out)}){
  const list=path.join(workDir,'chunks.ffconcat');
  await fs.writeFile(list,parts.map(part=>`file '${part.file.replaceAll('\\','/').replaceAll("'","'\\''")}'\nduration ${(part.range[1]-part.range[0]+1)/fps}`).join('\n')+'\n','utf8');
  await run('ffmpeg',['-v','error','-xerror','-y','-f','concat','-safe','0','-i',list,...(audio?['-i',audio]:[]),'-map','0:v:0',...(audio?['-map','1:a:0']:[]),'-c:v','copy',...(audio?['-c:a','aac','-b:a','320k','-ar','48000','-ac','2']:['-an']),'-t',String(frames/fps),'-movflags','+faststart+negative_cts_offsets',out]);
  const checked=await mediaContract(out);if(checked.frames!==frames||Math.abs(checked.fps-fps)>.00001)throw new Error('Assembled chunk frame count or cadence failed.');return checked;
}
