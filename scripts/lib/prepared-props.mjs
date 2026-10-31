import './project-tmp.mjs';
import {editManifestSchema} from '../../engine/src/prepared-edit/schema.ts';
import {compileEdit} from '../../engine/src/prepared-edit/timeline.ts';
import {kineticSceneSchema,kineticAssets} from '../../engine/src/creative-kit/kinetic/schema.ts';
import {librarySceneSchema,libraryAssets} from '../../engine/src/motion-library/schema.ts';
import {semanticSceneSchema,semanticAssets} from '../../engine/src/creative-kit/semantic/schema.ts';
import {proofScreenSceneSchema,proofScreenAssets} from '../../engine/src/creative-kit/proof-screen/schema.ts';
import {composeSceneSchema,composeAssets} from '../../engine/src/creative-kit/compose/schema.ts';
import {composeClipValues} from '../../engine/src/creative-kit/compose/media.ts';
import {styleSceneSchema,styleSceneAssets,styleSceneAssetClaims} from '../../engine/src/styles/scenes.ts';
import {sceneClipClaims,sceneForeground,sceneVideoSources} from '../../engine/src/core/scene-media.ts';
import {captureWarnings} from '../../engine/src/motion-library/capture.ts';
import {readJson,fileSnapshot,digest,checkedPath} from './job-paths.mjs';
import {ffprobeJson,run} from './media.mjs';
import {verifyPreparedHeadGuide,splitCanvasHeightFor} from './head-guide.mjs';
import {isBrollScene,brollSplitIssues} from '../../engine/src/prepared-edit/broll.ts';
import {verifyPreparedMouth} from './mouth-table.mjs';
import {readFile} from 'node:fs/promises';
import {projectSceneBuild} from './project-scenes.mjs';
import {projectSceneAssets,projectSceneClips} from '../../engine/src/project-scenes/schema.ts';
import {verifyClipMedia} from './clips.mjs';

// SVG is rendered by the browser; FFprobe builds without librsvg cannot probe it.
// Read the intrinsic vector viewport while retaining the same file hash contract.
async function svgVideo(file){
  const text=await readFile(file,'utf8'),root=/<svg\b([^>]*)>/i.exec(text);
  if(!root || !/<\/svg\s*>/i.test(text))throw new Error('SVG asset must contain a complete SVG document.');
  const attr=name=>new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`,'i').exec(root[1])?.[1];
  const view=attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const size=(name,index)=>{const value=attr(name);return value&&/^\d+(?:\.\d+)?(?:px)?$/.test(value)?Number.parseFloat(value):view?.length===4?view[index]:NaN;};
  const width=size('width',2),height=size('height',3);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>16384||height>16384)throw new Error('SVG asset needs a bounded width/height or viewBox.');
  return {codec_type:'video',codec_name:'svg',width,height};
}

const STILL_CODECS=['png','mjpeg','webp','gif','bmp','tiff','svg'];
let alphaFormats;
export async function hasForegroundAlpha(video){
  if(String(video.tags?.alpha_mode??video.tags?.ALPHA_MODE)==='1')return true;
  alphaFormats??=run('ffprobe',['-v','error','-show_pixel_formats','-of','json']).then(({stdout})=>new Set(JSON.parse(stdout).pixel_formats.filter(format=>format.flags?.alpha===1).map(format=>format.name)));
  return (await alphaFormats).has(video.pix_fmt);
}


export async function verifyKineticAssets(edit){
  // A split B-roll scene in a manifest without `footage` sits above the style's own seam, which the manifest rule cannot know. Measure it here, before any file is read; the seam is only computed when such a scene exists.
  const splitScenes=edit.footage?[]:edit.scenes.filter(scene=>isBrollScene(scene)&&scene.layout==='split');
  const tooSmall=splitScenes.flatMap(scene=>brollSplitIssues(scene,splitCanvasHeightFor(edit.style)));
  if(tooSmall.length)throw new Error(tooSmall.join('\n'));
  const assets=new Map();
  for(const input of edit.scenes){
    const parsed=kineticSceneSchema.safeParse(input),library=librarySceneSchema.safeParse(input),semantic=semanticSceneSchema.safeParse(input),styled=styleSceneSchema.safeParse(input);
    const custom=input.family==='project-scene',arabic=input.family==='arabic-type';
    const proofScreen=proofScreenSceneSchema.safeParse(input),compose=composeSceneSchema.safeParse(input);
    if(!parsed.success && !library.success && !semantic.success && !styled.success && !proofScreen.success && !compose.success && !custom && !arabic)continue;
    const scene=parsed.success?parsed.data:library.success?library.data:semantic.success?semantic.data:styled.success?styled.data:input;
    const sources=parsed.success?kineticAssets(parsed.data):library.success?libraryAssets(library.data):semantic.success?semanticAssets(semantic.data):styled.success?styleSceneAssets(styled.data):proofScreen.success?proofScreenAssets(proofScreen.data):compose.success?[...composeAssets(compose.data),...composeClipValues(compose.data).map(clip=>clip.src)]:arabic?(input.data.media?[input.data.media]:[]):[...projectSceneAssets({...edit,scenes:[input]}),...projectSceneClips({...edit,scenes:[input]})];
    for(const src of sources){
      if(!assets.has(src)){
        const file=`engine/public/${src}`,absolute=await checkedPath(file,{mustExist:true});
        const identity=await fileSnapshot(file);
        const video=/\.svg$/i.test(src)?await svgVideo(absolute):(await ffprobeJson(absolute)).streams?.find(s=>s.codec_type==='video');
        if(!video?.width || !video.height)throw new Error(`Scene asset is not a decodable image/video: ${src}`);
        assets.set(src,{...identity,src,absolute,video});
      }
      const isMoving=sceneVideoSources(scene,edit.projectScenes).includes(src);
      if(!isMoving && !['png','mjpeg','webp','gif','bmp','tiff','svg'].includes(assets.get(src).video.codec_name))throw new Error(`Static scene asset must contain an image: ${src}`);
    }
    for(const claim of sceneClipClaims(scene,edit.projectScenes)){
      const asset=assets.get(claim.src);
      if(asset.sha256!==claim.sha256)throw new Error(`Scene clip bytes do not match the supplied hash: ${claim.src}`);
      if(asset.video.width!==claim.width || asset.video.height!==claim.height)throw new Error(`Scene clip dimensions disagree with its provided file: ${claim.src}`);
      await verifyClipMedia(asset,claim,{fps:edit.source.fps});
    }
    if(arabic&&input.data.media){
      const video=assets.get(input.data.media).video;
      if(STILL_CODECS.includes(video.codec_name))throw new Error('Arabic type media must contain a video clip.');
      const available=Number(video.duration??video.tags?.DURATION?.split(':').reduce((a,n)=>a*60+Number(n),0));
      if(!Number.isFinite(available)||available+1/edit.source.fps<input.durationInFrames/edit.source.fps)throw new Error('Arabic type source clip is too short for the scene.');
    }
    const stills=[...(proofScreen.success?proofScreenAssets(proofScreen.data):[]),...(compose.success?composeAssets(compose.data):[])];
    for(const src of stills){
      const asset=assets.get(src);
      if(asset.video.codec_name==='svg'){
        const svg=await readFile(asset.absolute,'utf8');
        if(/<(?:animate\w*|set|script|foreignObject|style)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|\b(?:animation|transition)\s*:|url\s*\(/i.test(svg))throw new Error(`Scene SVG must be static and self-contained: ${src}`);
      }else{
        if(!['png','mjpeg','webp'].includes(asset.video.codec_name))throw new Error(`Scene image must be a single-frame still: ${src}`);
        if(asset.frames===undefined){
          const counted=await run('ffprobe',['-v','error','-select_streams','v:0','-read_intervals','%+#2','-count_frames','-show_entries','stream=nb_read_frames','-of','json',asset.absolute]);
          asset.frames=Number(JSON.parse(counted.stdout).streams?.[0]?.nb_read_frames);
        }
        if(asset.frames!==1)throw new Error(`Scene image must contain exactly one still frame: ${src}`);
      }
    }
    if(scene.family==='evidence-wipe')for(const image of [scene.data.before,scene.data.after]){
      const asset=assets.get(image.src);
      if(asset.video.width!==image.width || asset.video.height!==image.height)throw new Error('Comparison image dimensions disagree with its provided image.');
    }
    if(styled.success)for(const claim of styleSceneAssetClaims(styled.data)){
      const asset=assets.get(claim.src),video=asset.video,still=STILL_CODECS.includes(video.codec_name);
      if(asset.sha256!==claim.sha256)throw new Error(`Scene asset bytes do not match the supplied hash: ${claim.src}`);
      if(video.width!==claim.width || video.height!==claim.height)throw new Error(`Scene asset dimensions disagree with its provided file: ${claim.src}`);
      if(claim.kind==='image' && !still)throw new Error(`Scene media declared as an image contains video: ${claim.src}`);
      if(claim.kind==='video'){
        if(still)throw new Error(`Scene media declared as a video contains an image: ${claim.src}`);
        const available=Number(video.duration??video.tags?.DURATION?.split(':').reduce((a,n)=>a*60+Number(n),0));
        if(!Number.isFinite(available) || available+1/edit.source.fps<claim.frames/edit.source.fps)throw new Error(`Scene video is too short: ${claim.src}`);
      }
    }
    if(scene.family==='chapter-quote' && scene.data.cover){
      const supplied=scene.data.cover.foreground,asset=assets.get(supplied.src);
      if(asset.video.codec_name!=='png')throw new Error('Magazine cover foreground must contain a transparent PNG.');
      if(asset.sha256!==supplied.sha256)throw new Error('Magazine cover foreground bytes do not match the supplied hash.');
      if(asset.video.width!==supplied.width || asset.video.height!==supplied.height)throw new Error('Magazine cover foreground dimensions disagree with its provided image.');
      if(!await hasForegroundAlpha(asset.video))throw new Error('Magazine cover foreground needs an alpha channel.');
      if(!asset.coverAlphaVerified){
        const decoded=await run('ffmpeg',['-v','error','-i',asset.absolute,'-vf','alphaextract','-frames:v','1','-threads','1','-f','rawvideo','-pix_fmt','gray','pipe:1'],{encoding:'buffer'});
        const alpha=decoded.stdout;
        if(!Buffer.isBuffer(alpha) || alpha.length!==supplied.width*supplied.height)throw new Error('Magazine cover foreground alpha could not be verified.');
        let transparent=false,visible=false;
        for(const value of alpha){if(value<255)transparent=true;if(value>0)visible=true;}
        if(!transparent || !visible)throw new Error('Magazine cover foreground must have real transparent pixels and a visible subject.');
        if((await fileSnapshot(asset.path)).sha256!==asset.sha256)throw new Error('Magazine cover foreground bytes changed during transparency verification.');
        asset.coverAlphaVerified=true;
      }
    }
    if(scene.family==='screen-focus')for(let i=0;i<scene.data.steps.length;i++){
      const step=scene.data.steps[i],asset=assets.get(step.src),video=asset.video;
      if(step.kind==='video'){
        if(['png','mjpeg','webp','gif','bmp','tiff','svg'].includes(video.codec_name))throw new Error(`Screen capture declared as a video contains an image: ${step.src}`);
        if(video.width!==step.sourceWidth || video.height!==step.sourceHeight)throw new Error(`Screen capture dimensions disagree with the actual video: ${step.src}`);
        const available=Number(video.duration??video.tags?.DURATION?.split(':').reduce((a,n)=>a*60+Number(n),0));
        const required=(step.trimBeforeFrame+(scene.data.steps[i+1]?.atFrame??scene.durationInFrames)-step.atFrame)/edit.source.fps;
        if(!Number.isFinite(available) || available+1/edit.source.fps<required)throw new Error(`Screen capture video is too short: ${step.src}`);
        continue;
      }
      if(!['png','mjpeg'].includes(video.codec_name))throw new Error(`Focus source must be a single-frame PNG or JPEG; animated formats are unsupported: ${step.src}`);
      if(asset.frames===undefined){
        const counted=await run('ffprobe',['-v','error','-select_streams','v:0','-read_intervals','%+#2','-count_frames','-show_entries','stream=nb_read_frames','-of','json',asset.absolute]);
        asset.frames=Number(JSON.parse(counted.stdout).streams?.[0]?.nb_read_frames);
      }
      if(asset.frames!==1)throw new Error(`Focus source must contain exactly one still frame: ${step.src}`);
      if(video.width!==step.sourceWidth || video.height!==step.sourceHeight)throw new Error(`Focus source dimensions disagree with the actual image: ${step.src}`);
    }
    if(scene.family==='screen-focus')for(const warning of captureWarnings(scene,edit.source.fps))console.warn(`screen-capture advisory: ${warning}`);
    if(sceneForeground(scene)!==null){
      const foreground=scene.data.foreground,asset=assets.get(foreground.src),v=asset.video;
      const [n,d]=(v.avg_frame_rate??v.r_frame_rate??'0/1').split('/').map(Number);
      if(Math.abs(n/d-edit.source.fps)>.001 || !Number.isFinite(n/d))throw new Error('Foreground cadence must match the source.');
      if(Math.abs(v.width/v.height-edit.source.width/edit.source.height)>.001)throw new Error('Foreground aspect must match the source.');
      if(!await hasForegroundAlpha(v))throw new Error('Foreground must contain an alpha channel.');
      if(asset.frames===undefined){
        const counted=await run('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','json',asset.absolute]);
        asset.frames=Number(JSON.parse(counted.stdout).streams?.[0]?.nb_read_frames);
      }
      if(asset.frames!==foreground.frames || asset.frames<foreground.trimBeforeFrame+scene.durationInFrames)throw new Error('Foreground actual frame count disagrees with its declared coverage.');
    }
    if(scene.family==='screens')for(let i=0;i<scene.data.steps.length;i++){
      const step=scene.data.steps[i],asset=assets.get(step.src),v=asset.video;
      const isImage=['png','mjpeg','webp','gif','bmp','tiff','svg'].includes(v.codec_name);
      if(step.kind==='image' && !isImage)throw new Error(`Screen declared as an image contains video: ${step.src}`);
      if(step.kind==='video'){
        if(isImage)throw new Error(`Screen declared as a video contains an image: ${step.src}`);
        const available=Number(v.duration??v.tags?.DURATION?.split(':').reduce((a,n)=>a*60+Number(n),0));
        const required=(step.trimBeforeFrame+(scene.data.steps[i+1]?.atFrame??scene.durationInFrames)-step.atFrame)/edit.source.fps;
        if(!Number.isFinite(available) || available+1/edit.source.fps<required)throw new Error(`Screen video is too short: ${step.src}`);
      }
    }
  }
  return [...assets.values()].map(({path,size,sha256,video,frames})=>({path,size,sha256,width:video.width,height:video.height,...(frames!==undefined?{frames}:{})}));
}


export async function verifyPreparedProps(props){
  if(!props.edit || !props.plate) throw new Error('CLI PreparedEdit rendering needs an authored edit and verified plate; the Studio placeholder cannot be rendered as an edit.');
  const edit=editManifestSchema.parse(props.edit);
  const sceneBuild=await projectSceneBuild(edit);
  if(sceneBuild&&digest(props.projectSceneIdentity)!==digest({hash:sceneBuild.hash,files:sceneBuild.files}))throw new Error('Project scene code changed after preparation. Prepare the project again before rendering.');
  const plate=props.plate;
  if(!plate || typeof plate.src!=='string' || !/^_prepared\/[a-z0-9-]+\/[a-f0-9]{64}\.mp4$/.test(plate.src)
    || plate.src.split('/')[1]!==edit.id || plate.width!==edit.source.width || plate.height!==edit.source.height) throw new Error('Prepared plate path or dimensions disagree with this edit.');
  const file=`engine/public/${plate.src}`;
  const info=await readJson(`${file}.prepared.json`);
  if(info.version!==1 || info.key!==plate.src.split('/')[2].slice(0,-4)
    || digest(info.source)!==digest(edit.source) || digest(info.segments)!==digest(edit.segments)
    || info.durationInFrames!==compileEdit(edit).durationInFrames || info.verified?.frames!==info.durationInFrames
    || Math.abs(info.verified?.fps-edit.source.fps)>0.001) throw new Error('Prepared footage does not match the authored source ranges. Run edit-project prepare again.');
  if((await fileSnapshot(file)).sha256!==info.outputHash) throw new Error('Prepared footage bytes changed; regenerate the plate before rendering.');
  if((await fileSnapshot(edit.source.path)).sha256!==edit.source.sha256) throw new Error('Original source bytes changed after this edit was prepared.');
  const assets=await verifyKineticAssets(edit);
  if(assets.length && digest(assets)!==digest(props.assets))throw new Error('Scene assets changed or were not verified. Run edit-project prepare again.');
  await verifyPreparedHeadGuide({...props,edit});
  await verifyPreparedMouth({...props,edit});
  return props;
}
