import './project-tmp.mjs';
import path from 'node:path';
import {promises as fs,constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {editManifestSchema} from '../../engine/src/prepared-edit/schema.ts';
import {ROOT,checkedPath,ensureOutput,fileSnapshot,finite,object,readJson,slug,withFileLock} from './job-paths.mjs';
import {inspectEditSource} from './edit-project.mjs';
import {run} from './media.mjs';
import {loadProjectScenePack,resolveProjectScenes} from './project-scenes.mjs';

/** Approved graphic copy is authored data, never a fabricated speech transcript. */
export function normalizeGraphicsSpec(raw,{delivery=false}={}) {
  object(raw,['version','id','style','fps','durationInFrames','fontFamily','creator','reviewedBy','scenes','sounds','transitions','projectScenePack','projectScenes'],'graphics specification');
  if(raw.version!==1)throw new Error('Graphics specification version must be 1.');
  const id=slug(raw.id),fps=raw.fps??30;
  finite(fps,30,60,'graphics fps',{integer:true});
  if(![30,50,60].includes(fps))throw new Error('Graphics fps must be 30, 50 or 60.');
  if(!Array.isArray(raw.scenes)||!raw.scenes.length)throw new Error('Graphics need authored scenes covering the complete timeline.');
  const frames=raw.durationInFrames??Math.max(...raw.scenes.map(scene=>scene.fromFrame+scene.durationInFrames));
  finite(frames,1,fps*600,'graphics durationInFrames',{integer:true});
  if(raw.reviewedBy!==undefined&&(typeof raw.reviewedBy!=='string'||!raw.reviewedBy.trim()||raw.reviewedBy.length>200))throw new Error('reviewedBy must name the reviewer of the authored graphic copy.');
  const reviewed=raw.reviewedBy!==undefined;
  if(!reviewed)throw new Error('Graphics initialization requires reviewed authored copy and reviewedBy.');
  const edit=editManifestSchema.parse({
    version:1,id,purpose:delivery?'delivery':'test',contentMode:'graphics',presenter:false,style:raw.style??'paper-collage',
    ...(raw.projectScenes?{projectScenes:raw.projectScenes}:{}),
    creator:raw.creator??{displayName:'Graphics',handle:null,ending:{cta:null,followCard:false,signOff:null}},
    ...(raw.fontFamily===undefined?{}:{fontFamily:raw.fontFamily}),
    source:{path:`Projects/${id}/graphics-source.mp4`,sha256:'0'.repeat(64),fps,width:1080,height:1920,totalFrames:frames},
    segments:[{fromFrame:0,toFrame:frames}],captions:{status:reviewed?'reviewed':'draft',...(reviewed?{reviewer:raw.reviewedBy.trim()}:{}),words:[]},
    scenes:raw.scenes,sounds:raw.sounds??[],camera:[],...(raw.transitions===undefined?{}:{transitions:raw.transitions}),
  });
  return edit;
}

async function createJsonExclusive(relative,data,options) {
  const destination=await ensureOutput(relative,options);
  const temporary=`${relative}.${randomUUID()}.tmp`;
  const staged=await ensureOutput(temporary,options);
  const body=`${JSON.stringify(data,null,2)}\n`;
  if(Buffer.byteLength(body)>8*1024*1024)throw new Error('Graphics metadata exceeds the project JSON limit.');
  try{
    await fs.writeFile(staged,body,{encoding:'utf8',flag:'wx'});
    await checkedPath(relative,{write:true,...options});
    await fs.copyFile(staged,destination,constants.COPYFILE_EXCL);
  }finally{
    await checkedPath(temporary,{write:true,...options});
    await fs.unlink(staged).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}

/** Create only the explicit project; subsequent editing uses the ordinary manifest. */
export async function initializeGraphicsProject(specFile,{check=false,delivery=false,onProgress=()=>{}}={}) {
  const raw=await readJson(specFile);
  if(raw.projectScenePack)raw.projectScenes=await loadProjectScenePack(raw.projectScenePack,{id:raw.id});
  const edit=normalizeGraphicsSpec(raw,{delivery});
  await resolveProjectScenes(edit);
  const summary={ok:true,id:edit.id,contentMode:'graphics',fps:edit.source.fps,durationInFrames:edit.source.totalFrames,copyStatus:edit.captions.status};
  if(check)return {...summary,stage:'schema-only'};
  const options={project:edit.id};
  const manifestPath=`Projects/${edit.id}/edit.json`,sourcePath=edit.source.path,originPath=`Projects/${edit.id}/graphics-origin.json`;
  const specIdentity=await fileSnapshot(specFile);
  return withFileLock(`Projects/${edit.id}/.graphics-init.lock.json`,options,async()=>{
    for(const output of [manifestPath,sourcePath,originPath]){
      const absolute=await checkedPath(output,{write:true,...options});
      if(await fs.lstat(absolute).catch(error=>{if(error.code==='ENOENT')return null;throw error;}))throw new Error(`Graphics project output already exists: ${output}. Edit the existing manifest; initialization never replaces a project.`);
    }
    const stagedPath=`Projects/${edit.id}/.graphics-source-${randomUUID()}.mp4`;
    const staged=await ensureOutput(stagedPath,options);
    const seconds=edit.source.totalFrames/edit.source.fps;
    try{
      onProgress('Creating a silent generated base plate for the authored graphics.');
      await run(path.join(ROOT,'Tools','bin',process.platform==='win32'?'ffmpeg.exe':'ffmpeg'),[
        '-hide_banner','-v','error','-nostdin','-n','-f','lavfi','-i',`color=c=0x142d3d:s=1080x1920:r=${edit.source.fps}:d=${seconds}`,
        '-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-frames:v',String(edit.source.totalFrames),
        '-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
        '-c:a','aac','-b:a','192k','-t',String(seconds),'-movflags','+faststart',staged,
      ]);
      const measured=await inspectEditSource(stagedPath);
      if(measured.source.totalFrames!==edit.source.totalFrames||measured.source.fps!==edit.source.fps||measured.source.width!==1080||measured.source.height!==1920)throw new Error('Generated graphics plate does not match the authored timeline.');
      const latest=await fileSnapshot(specFile);
      if(latest.sha256!==specIdentity.sha256)throw new Error('Graphics specification changed during initialization; review it and retry.');
      const finalSource=await ensureOutput(sourcePath,options);
      // Exclusive copying preserves concurrent files without requiring hard-link privileges.
      await fs.copyFile(staged,finalSource,constants.COPYFILE_EXCL);
      await fs.unlink(staged);
      const manifest=editManifestSchema.parse({...edit,source:{...measured.source,path:sourcePath}});
      await createJsonExclusive(originPath,{version:1,kind:'generated-silent-graphics-base',spec:specIdentity,source:manifest.source,copyStatus:manifest.captions.status},options);
      await createJsonExclusive(manifestPath,manifest,options);
      return {...summary,manifest:manifestPath,source:sourcePath,next:`node scripts/editor.mjs prepare ${manifestPath}`};
    }finally{
      await checkedPath(stagedPath,{write:true,...options});
      await fs.unlink(staged).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
  });
}
