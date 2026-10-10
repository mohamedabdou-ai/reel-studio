import './project-tmp.mjs';
import path from 'node:path';
import {promises as fs, readFileSync} from 'node:fs';
import {editManifestSchema} from '../../engine/src/prepared-edit/schema.ts';
import {compileEdit} from '../../engine/src/prepared-edit/timeline.ts';
import {EDITION_STYLE_IDS} from '../../engine/src/creative-kit/styles.ts';
import {ROOT,atomicJson,checkedPath,readJson,slug,relativePath,withFileLock,fileSnapshot,digest} from './job-paths.mjs';
import {ffprobeJson,run,writeJson} from './media.mjs';
import {withOutputTransaction} from './delivery.mjs';
import {normalizeCreatorProfile} from './branding.mjs';
import {soundRecipe,validateHits} from './job-sound.mjs';
import {assertPreparedMedia} from './prepared-media.mjs';
import {verifyKineticAssets} from './prepared-props.mjs';
import {buildPreparedHeadGuide} from './head-guide.mjs';


export function assertEditionManifest(manifest){
  if(!EDITION_STYLE_IDS.includes(manifest.style)) throw new Error(`style must be one of ${EDITION_STYLE_IDS.join(', ')}.`);
  if(manifest.footage?.pip!==undefined) throw new Error('Picture-in-picture is not available in this edition.');
  return manifest;
}
const relative=p=>path.relative(ROOT,p).split(path.sep).join('/');
const frameRate=v=>{const [n,d]=(v.avg_frame_rate??v.r_frame_rate??'0/1').split('/').map(Number);return n/d;};
export async function inspectEditSource(source){
  const absolute=await checkedPath(source,{mustExist:true});
  const probe=await ffprobeJson(absolute);
  const v=probe.streams?.find(s=>s.codec_type==='video');
  if(!v) throw new Error('Edit source needs video.');
  const rate=frameRate(v);
  const [rn,rd]=(v.r_frame_rate??'0/1').split('/').map(Number);
  if(!Number.isFinite(rate) || rate<=0 || Math.abs(rate-rn/rd)>0.01) throw new Error('Frame edits need constant cadence. Run node scripts/intake.mjs --source <file> --id <project> and edit the constant-rate copy it writes.');
  if(['smpte2084','arib-std-b67'].includes(v.color_transfer)) throw new Error('HDR footage must be converted first. Run node scripts/intake.mjs --source <file> --id <project> and edit the BT.709 SDR copy it writes.');
  const rotation=Math.abs(v.side_data_list?.find(s=>s.rotation!==undefined)?.rotation??0)%180;
  const width=rotation===90?v.height:v.width, height=rotation===90?v.width:v.height;
  let totalFrames=Number(v.nb_frames);
  if(!Number.isInteger(totalFrames) || totalFrames<1){
    const counted=await run('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','json',absolute]);
    totalFrames=Number(JSON.parse(counted.stdout).streams?.[0]?.nb_read_frames);
  }
  if(!Number.isInteger(totalFrames) || totalFrames<1) throw new Error('Source frame count could not be verified.');
  const identity=await fileSnapshot(source);
  return {source:{path:source,sha256:identity.sha256,fps:rate,width,height,totalFrames},probe,video:v,hasAudio:probe.streams.some(s=>s.codec_type==='audio')};
}

export async function initEditProject({id,source,style='section-deck',creator}){
  slug(id); relativePath(source); assertEditionManifest({style});
  const info=await inspectEditSource(source);
  const manifest=editManifestSchema.parse({version:1,id,purpose:'test',style,...(creator===undefined?{}:{creator:normalizeCreatorProfile(creator)}),source:info.source,
    segments:[{fromFrame:0,toFrame:info.source.totalFrames}],captions:{status:'draft',words:[]},scenes:[],sounds:[],camera:[]});
  const file=`Projects/${id}/edit.json`;
  return withFileLock(`Projects/${id}/edit.lock`,{project:id},async()=>{
    if(await readJson(file,{optional:true})) throw new Error(`Edit already exists: ${file}`);
    await atomicJson(file,manifest,{project:id});
    return {ok:true,manifest:file,source:info.source,next:'Import the complete transcript and author scenes, cuts and sound before rendering.'};
  });
}

export async function loadEditProject(manifestPath,{verifySource=true}={}){
  const manifest=assertEditionManifest(editManifestSchema.parse(await readJson(manifestPath)));
  if(!manifestPath.startsWith(`Projects/${manifest.id}/`)) throw new Error('Manifest must stay in its own project.');
  await checkedPath(manifest.source.path,{mustExist:true});
  if(verifySource){
    const actual=(await inspectEditSource(manifest.source.path)).source;
    if(digest(actual)!==digest(manifest.source)) throw new Error('Source identity, dimensions, cadence or duration changed. Reinspect before editing.');
  }
  const compiled=compileEdit(manifest);
  if(manifest.purpose==='delivery' && compiled.issues.length) throw new Error('Delivery cuts intersect caption words. Resolve the cut boundaries first.');
  return {manifest,compiled};
}

export async function importEditCaptions(manifestPath,captionsPath){
  const {manifest}=await loadEditProject(manifestPath);
  const imported=await readJson(captionsPath);
  const words=Array.isArray(imported)?imported:imported.captions??imported.words;
  if(!Array.isArray(words)) throw new Error('Expected word captions with text/startMs/endMs.');
  const next=editManifestSchema.parse({...manifest,captions:{status:'draft',words:words.map(w=>({
    text:w.text,startMs:w.startMs,endMs:w.endMs,confidence:w.confidence??null,
  }))}});
  return withFileLock(`Projects/${manifest.id}/edit.lock`,{project:manifest.id},async()=>{
    await atomicJson(manifestPath,next,{project:manifest.id});
    return {ok:true,status:'draft',words:next.captions.words.length,manifest:manifestPath};
  });
}

const srtTime=seconds=>{
  const ms=Math.round(seconds*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;
};

const readJsonSync=(absolute)=>{
  try{return JSON.parse(readFileSync(absolute,'utf8'));}catch{return null;}
};






export function preparedDir(id,outDir,inputs=[]){
  if(outDir===undefined)return `Projects/${id}/prepared`;
  relativePath(outDir);
  if(!outDir.startsWith(`Projects/${id}/`) || outDir.split('/').length<3)throw new Error(`Prepared output must stay in Projects/${id}/: ${outDir}`);
  const target=outDir.toLowerCase();



  if(target===`projects/${id.toLowerCase()}/prepared`)throw new Error(`Prepared output equals the default Projects/${id}/prepared; omit --out-dir instead of naming it explicitly.`);
  for(const input of inputs){
    const other=input.toLowerCase();
    if(other===target || other.startsWith(`${target}/`) || target.startsWith(`${other}/`))throw new Error(`Prepared output would overwrite an input: ${input}`);
  }
  const existing=readJsonSync(path.join(ROOT,outDir,'preparation.json'));
  if(existing && typeof existing.manifest==='string' && inputs[0]!==undefined && existing.manifest!==inputs[0]){
    throw new Error(`Prepared output ${outDir} already holds a preparation.json for a different manifest (${existing.manifest}); choose another directory or remove it first.`);
  }
  return outDir;
}

export async function prepareEditProject(manifestPath,{proxy=true,onProgress=()=>{},outDir}={}){
  const start=performance.now();
  const {manifest:m,compiled:c}=await loadEditProject(manifestPath);
  const assets=await verifyKineticAssets(m);
  const base=preparedDir(m.id,outDir,[manifestPath,m.source.path]),opts={project:m.id};
  return withFileLock(`Projects/${m.id}/prepare.lock`,opts,async()=>{



    const head=await buildPreparedHeadGuide(m,{log:onProgress});
    const code=await Promise.all(['scripts/lib/edit-project.mjs','scripts/lib/prepared-media.mjs','engine/src/prepared-edit/schema.ts','engine/src/prepared-edit/timeline.ts','Tools/bin/ffmpeg.exe'].map(p=>fileSnapshot(p)));
    const key=digest({version:1,source:m.source,segments:m.segments,code:code.map(x=>[x.path,x.sha256])});
    const publicSrc=`_prepared/${m.id}/${key}.mp4`;
    const plateFile=`engine/public/${publicSrc}`;
    const plateAbsolute=await checkedPath(plateFile);
    const prior=await fs.readFile(`${plateAbsolute}.prepared.json`,'utf8').then(JSON.parse).catch(()=>null);
    let plateCached=prior?.key===key && await fileSnapshot(plateFile).then(s=>s.sha256===prior.outputHash).catch(()=>false);
    if(!plateCached){
      onProgress('Preparing a continuous footage plate from original source frames.');
      const info=await inspectEditSource(m.source.path);
      await withOutputTransaction(plateAbsolute,async(staged,work)=>{
        if(m.segments.length===1 && m.segments[0].fromFrame===0 && m.segments[0].toFrame===m.source.totalFrames && info.video.codec_name==='h264'){
          await fs.copyFile(await checkedPath(m.source.path,{mustExist:true}),staged);
        }else{
          const filters=[],labels=[];
          m.segments.forEach((s,i)=>{
            const duration=(s.toFrame-s.fromFrame)/m.source.fps;
            filters.push(`[0:v:0]trim=start_frame=${s.fromFrame}:end_frame=${s.toFrame},setpts=PTS-STARTPTS,setsar=1[v${i}]`);
            if(info.hasAudio){
              const fade=Math.min(0.012,duration/8);
              const fades=`${i>0?`,afade=t=in:st=0:d=${fade}`:''}${i<m.segments.length-1?`,afade=t=out:st=${duration-fade}:d=${fade}`:''}`;
              filters.push(`[0:a:0]atrim=start=${s.fromFrame/m.source.fps}:end=${s.toFrame/m.source.fps},asetpts=PTS-STARTPTS,aresample=48000${fades}[a${i}]`);
            }
            labels.push(`[v${i}]${info.hasAudio?`[a${i}]`:''}`);
          });
          filters.push(`${labels.join('')}concat=n=${m.segments.length}:v=1:a=${info.hasAudio?1:0}[v]${info.hasAudio?'[a]':''}`);
          const filterFile=path.join(work,'cut.ffgraph');await fs.writeFile(filterFile,filters.join(';\n'),'utf8');
          await run('ffmpeg',['-v','error','-y','-threads','4','-i',await checkedPath(m.source.path),'-filter_complex_threads','2',
            '-filter_complex_script',filterFile,'-map','[v]',...(info.hasAudio?['-map','[a]']:[]),'-c:v','libx264','-crf','14','-preset','veryfast',
            '-threads','4','-pix_fmt','yuv420p','-fps_mode','passthrough','-c:a','aac','-b:a','320k','-ar','48000','-movflags','+faststart',staged]);
        }
        const p=await ffprobeJson(staged),v=p.streams.find(s=>s.codec_type==='video');
        let countedFrames;
        if(!Number.isInteger(Number(v?.nb_frames))){
          const counted=await run('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','json',staged]);
          countedFrames=Number(JSON.parse(counted.stdout).streams?.[0]?.nb_read_frames);
        }
        const verified=assertPreparedMedia(p,{frames:c.durationInFrames,fps:m.source.fps,hasAudio:info.hasAudio,countedFrames});
        if((await fileSnapshot(m.source.path)).sha256!==m.source.sha256) throw new Error('Source changed while preparing edit.');
        const outputHash=(await fileSnapshot(relative(staged))).sha256;
        await writeJson(`${staged}.prepared.json`,{version:1,key,outputHash,source:m.source,segments:m.segments,durationInFrames:c.durationInFrames,verified});
      },{sidecars:['.prepared.json']});
    }
    const hits=[];
    for(const event of m.sounds){
      const recipe=await soundRecipe(event.recipe);
      const t=event.atFrame/m.source.fps;
      if(t+recipe.duration>(m.signoffFromFrame??c.durationInFrames)/m.source.fps+1e-7) throw new Error(`Sound recipe ${event.recipe} crosses the signoff or edit end.`);
      hits.push(...recipe.hits.map(hit=>({...hit,t:hit.t+t,gain:(hit.gain??1)*event.gain})));
    }
    validateHits(hits,c.durationInFrames/m.source.fps);
    const hitsFile=`${base}/sounds.hits.json`,sfxFile=`${base}/sounds.wav`;
    await atomicJson(hitsFile,hits,opts);
    await run(process.execPath,[path.join(ROOT,'scripts/sfx.mjs'),'--hits',hitsFile,'--dur',String(c.durationInFrames/m.source.fps),'--out',sfxFile],{cwd:ROOT});
    let preview=null;
    if(proxy){
      onProgress('Preparing and verifying the preview proxy.');
      const result=await run(process.execPath,[path.join(ROOT,'scripts/proxy.mjs'),plateFile,'--height','540','--out',plateFile.replace('.mp4','-proxy.mp4')],{cwd:ROOT});
      preview=JSON.parse(result.stdout);
    }
    const props={edit:m,plate:{src:publicSrc,width:m.source.width,height:m.source.height},guides:false,plates:[publicSrc],...(assets.length?{assets}:{}),...(head?{headGuide:head.guide}:{})};
    const propsFile=`${base}/props.json`;
    await atomicJson(propsFile,props,opts);
    await atomicJson(`${base}/timeline.json`,c,opts);
    const srt=c.captionGroups.map((cue,i)=>`${i+1}\n${srtTime(cue.fromFrame/m.source.fps)} --> ${srtTime(cue.toFrame/m.source.fps)}\n${cue.words.map(w=>w.text.trim()).join(' ')}\n`).join('\n');
    const srtFile=await checkedPath(`${base}/captions.srt`,{...opts,write:true});await fs.writeFile(srtFile,srt,'utf8');
    const result={ok:true,manifest:manifestPath,manifestHash:digest(m),propsFile,plate:plateFile,plateCached,proxy:preview?{cached:preview.cached,registered:preview.registered,path:relative(preview.proxy)}:null,
      sfxFile,hits:hits.length,scenes:m.scenes.length,captions:c.words.length,captionStatus:m.captions.status,captionIssues:c.issues,
      omittedWordIndices:c.omittedWordIndices,sourceHash:m.source.sha256,durationInFrames:c.durationInFrames,fps:m.source.fps,headGuide:head?.summary??null,
      prepareSec:+((performance.now()-start)/1000).toFixed(3),outputs:await Promise.all([propsFile,plateFile,sfxFile,`${base}/timeline.json`,`${base}/captions.srt`].map(p=>fileSnapshot(p,{nonempty:false})))};
    await atomicJson(`${base}/preparation.json`,result,opts);
    return result;
  });
}
