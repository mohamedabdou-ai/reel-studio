import './project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {ROOT,run,writeJson,readCachedJson} from './media.mjs';
import {checkedPath} from './job-paths.mjs';
import {withOutputTransaction} from './delivery.mjs';
import {SPEC,gopFrames,levelFor,VUI_BSF} from './ig.mjs';
import {contentHash,mediaContract,canonical} from './render-chunks.mjs';
import {streamSignature,finalMediaGate} from './audio-revision.mjs';
import {compileEdit} from '../../engine/src/prepared-edit/timeline.ts';
import {assertRevisionDestinations,assertPreparedRevisionDestinations} from './revision-paths.mjs';

export function parseFrameRange(value){const match=String(value).match(/^(\d+)-(\d+)$/);if(!match||Number(match[2])<Number(match[1]))throw new Error('--frames requires an inclusive a-b range.');return match.slice(1).map(Number);}
export function assertSpliceCompatibility(base,replacement,range){
  if(!Array.isArray(range)||range.length!==2||range.some(n=>!Number.isSafeInteger(n)||n<0)||range[1]<range[0]||range[1]>=base.frames)throw new Error('Replacement range is outside the base.');
  for(const key of ['codec','profile','width','height','pixelFormat'])if(base[key]!==replacement[key])throw new Error(`Replacement ${key} is incompatible with the base.`);
  if(base.codec!=='h264'||base.profile!=='High'||base.pixelFormat!=='yuv420p'||Math.abs(base.fps-replacement.fps)>.00001)throw new Error('Replacement codec, profile or fps is incompatible with the base.');
  if(replacement.frames!==range[1]-range[0]+1)throw new Error('Replacement frame count disagrees with its range.');
}

export function assertRangeProps(baseProps,nextProps,range,totalFrames){
  const base=baseProps?.edit,next=nextProps?.edit;
  if(!base||!next||canonical({source:base.source,segments:base.segments,plate:baseProps.plate})!==canonical({source:next.source,segments:next.segments,plate:nextProps.plate}))throw new Error('Range revision source or cuts differ from the base. Re-render the complete manifest.');
  if(range[0]===0&&range[1]===totalFrames-1)return;
  const globals=props=>{
    const {__editorPreview:preview,__editorMediaEngine:media,assets,...rest}=props;
    return {...rest,edit:{...props.edit,scenes:[],captions:{...props.edit.captions,words:[]}}};
  };
  if(canonical(globals(baseProps))!==canonical(globals(nextProps)))throw new Error('Range revision changes global picture settings. Re-render the complete manifest.');
  const contained=(from,to)=>from>=range[0]&&to<=range[1]+1;
  const assetsBefore=new Map((baseProps.assets??[]).map(asset=>[asset.path,asset])),assetsAfter=new Map((nextProps.assets??[]).map(asset=>[asset.path,asset]));
  const references=(value,src)=>{
    if(typeof value==='string')return value.replaceAll('\\','/').toLowerCase()===src;
    if(value&&typeof value==='object')return Object.values(value).some(item=>references(item,src));
    return false;
  };
  for(const assetPath of new Set([...assetsBefore.keys(),...assetsAfter.keys()])){
    if(canonical(assetsBefore.get(assetPath))===canonical(assetsAfter.get(assetPath)))continue;
    const src=assetPath.replaceAll('\\','/').replace(/^engine\/public\//i,'').toLowerCase();
    const scenes=[...base.scenes,...next.scenes].filter(scene=>references(scene,src));
    if(!scenes.length||scenes.some(scene=>!contained(scene.fromFrame,scene.fromFrame+scene.durationInFrames)))throw new Error('Changed scene asset is used outside the replacement range. Expand the range or restore the original asset.');
  }
  const changes=(before,after)=>{
    const a=new Set(before.map(canonical)),b=new Set(after.map(canonical));
    return [...before.filter(item=>!b.has(canonical(item))),...after.filter(item=>!a.has(canonical(item)))];
  };
  for(const scene of changes(base.scenes,next.scenes))if(!contained(scene.fromFrame,scene.fromFrame+scene.durationInFrames))throw new Error('Scene changes outside the requested replacement range would be lost. Expand the range.');
  const groups=edit=>{
    const emphasis=new Map((edit.captions.emphasis??[]).map(item=>[item.sourceIndex,item.kind]));
    return compileEdit(edit).captionGroups.map(group=>({fromFrame:group.fromFrame,toFrame:group.toFrame,words:group.words.map(word=>({text:word.text,startMs:word.startMs,endMs:word.endMs,sourceIndex:word.sourceIndex,emphasis:emphasis.get(word.sourceIndex)??null}))}));
  };
  for(const group of changes(groups(base),groups(next)))if(!contained(group.fromFrame,group.toFrame))throw new Error('Caption changes outside the requested replacement range would be lost. Expand the range.');
}

// Arbitrary B-frame boundaries cannot safely be packet-cut. Frame trims provide
// exact picture joins; only the lightweight FFmpeg encode repeats, not Remotion.
export function splicePlan({base,replacement,out,range,frames,fps}){
  const [from,to]=range,parts=[],labels=[];
  if(from>0){parts.push(`[0:v:0]trim=end_frame=${from},setpts=PTS-STARTPTS[before]`);labels.push('[before]');}
  parts.push(`[1:v:0]trim=end_frame=${to-from+1},setpts=PTS-STARTPTS[replacement]`);labels.push('[replacement]');
  if(to+1<frames){parts.push(`[0:v:0]trim=start_frame=${to+1},setpts=PTS-STARTPTS[after]`);labels.push('[after]');}
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0,pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1[outv]`);
  const filter=parts.join(';');
  return {filter,args:['-v','error','-xerror','-y','-i',base,'-i',replacement,'-filter_complex',filter,'-map','[outv]','-map','0:a:0','-c:v','libx264','-crf','16','-preset','slow','-profile:v','high','-level:v',levelFor(fps),'-pix_fmt','yuv420p','-g',String(gopFrames(fps)),'-keyint_min',String(gopFrames(fps)),'-sc_threshold','0','-maxrate',SPEC.video.bitrate.vbvMaxrate,'-bufsize',SPEC.video.bitrate.vbvBufsize,'-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-bsf:v',VUI_BSF,'-r',String(fps),'-fps_mode','cfr','-c:a','copy','-movflags','+faststart+negative_cts_offsets',out]};
}

export async function spliceRevision({base,replacement,out,range,channel='organic',pictureGate,motionGate}){
  const resolveInput=file=>checkedPath(path.relative(ROOT,path.resolve(file)).split(path.sep).join('/'),{mustExist:true});
  base=await resolveInput(base);replacement=await resolveInput(replacement);
  await assertRevisionDestinations(out,[base,`${base}.qc.json`,replacement,`${replacement}.qc.json`,`${replacement}.range.json`],{sidecars:['.qc.json','.checks']});
  const [baseMedia,replacementMedia]=await Promise.all([mediaContract(base),mediaContract(replacement)]);
  assertSpliceCompatibility(baseMedia,replacementMedia,range);
  const metadata=await readCachedJson(`${replacement}.range.json`);
  if(!metadata||metadata.version!==1||canonical(metadata.range)!==canonical(range)||metadata.totalFrames!==baseMedia.frames||Math.abs(metadata.fps-baseMedia.fps)>.00001||metadata.sha256!==await contentHash(replacement))throw new Error('Replacement needs valid prepared-manifest range metadata.');
  await assertPreparedRevisionDestinations(out,metadata.props,{sidecars:['.qc.json','.checks']});
  if(typeof pictureGate!=='function'||typeof motionGate!=='function')throw new Error('Range revision requires full-manifest picture and final motion gates.');
  const baseHash=await contentHash(base),audio=await streamSignature(base,'audio');
  const baseReport=await readCachedJson(`${base}.qc.json`);
  if(baseReport?.comp!=='PreparedEdit'||baseReport?.mode!=='deliver'||baseReport.outputSha256!==baseHash)throw new Error('Range revision needs an unchanged delivered PreparedEdit base and its QC report.');
  assertRangeProps(baseReport.inputProps,metadata.props,range,baseMedia.frames);
  return withOutputTransaction(out,async(staged,work)=>{
    const checkDir=`${staged}.checks`;await fs.mkdir(checkDir,{recursive:true});
    const gates=await pictureGate(metadata,checkDir);
    const plan=splicePlan({base,replacement,out:staged,range,frames:baseMedia.frames,fps:baseMedia.fps});
    await run('ffmpeg',plan.args);
    const outputAudio=await streamSignature(staged,'audio');
    if(canonical(outputAudio)!==canonical(audio))throw new Error('Range splice changed the full base audio packets or timing.');
    if(await contentHash(base)!==baseHash)throw new Error('Base changed during range revision.');
    const qc=await finalMediaGate(staged,{channel,expectedFrames:baseMedia.frames,expectedFps:baseMedia.fps});
    qc.igCheck.file=path.resolve(out);
    const motion=await motionGate(staged);
    if(motion?.video)motion.video=path.resolve(out);
    const report={ok:true,operation:'range-revision',comp:'PreparedEdit',mode:'deliver',inputProps:metadata.props,out:path.resolve(out),base,baseSha256:baseHash,range,replacement,outputSha256:await contentHash(staged),unchangedAudio:outputAudio,...qc,...gates,motion,checksDirectory:`${path.resolve(out)}.checks`};
    await writeJson(`${staged}.qc.json`,report);return report;
  },{sidecars:['.qc.json','.checks']});
}
