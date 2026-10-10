import './project-tmp.mjs';
import {editManifestSchema} from '../../engine/src/prepared-edit/schema.ts';
import {compileEdit} from '../../engine/src/prepared-edit/timeline.ts';
import {kineticSceneSchema,kineticAssets} from '../../engine/src/creative-kit/kinetic/schema.ts';
import {librarySceneSchema,libraryAssets} from '../../engine/src/motion-library/schema.ts';
import {semanticSceneSchema,semanticAssets} from '../../engine/src/creative-kit/semantic/schema.ts';
import {captureWarnings} from '../../engine/src/motion-library/capture.ts';
import {readJson,fileSnapshot,digest,checkedPath} from './job-paths.mjs';
import {ffprobeJson,run} from './media.mjs';
import {verifyPreparedHeadGuide} from './head-guide.mjs';

let alphaFormats;
export async function hasForegroundAlpha(video){
  if(String(video.tags?.alpha_mode??video.tags?.ALPHA_MODE)==='1')return true;
  alphaFormats??=run('ffprobe',['-v','error','-show_pixel_formats','-of','json']).then(({stdout})=>new Set(JSON.parse(stdout).pixel_formats.filter(format=>format.flags?.alpha===1).map(format=>format.name)));
  return (await alphaFormats).has(video.pix_fmt);
}


export async function verifyKineticAssets(edit){
  const assets=new Map();
  for(const input of edit.scenes){
    const parsed=kineticSceneSchema.safeParse(input),library=librarySceneSchema.safeParse(input),semantic=semanticSceneSchema.safeParse(input);
    if(!parsed.success && !library.success && !semantic.success)continue;
    const scene=parsed.success?parsed.data:library.success?library.data:semantic.data;
    const sources=parsed.success?kineticAssets(parsed.data):library.success?libraryAssets(library.data):semanticAssets(semantic.data);
    for(const src of sources){
      if(!assets.has(src)){
        const file=`engine/public/${src}`,absolute=await checkedPath(file,{mustExist:true});
        const identity=await fileSnapshot(file),probe=await ffprobeJson(absolute);
        const video=probe.streams?.find(s=>s.codec_type==='video');
        if(!video?.width || !video.height)throw new Error(`Scene asset is not a decodable image/video: ${src}`);
        assets.set(src,{...identity,src,absolute,video});
      }
      const isMoving=(scene.family==='kinetic-hook' && scene.data.foreground?.src===src) || ((scene.family==='screens' || scene.family==='screen-focus') && scene.data.steps.some(step=>step.src===src&&step.kind==='video'));
      if(!isMoving && !['png','mjpeg','webp','gif','bmp','tiff','svg'].includes(assets.get(src).video.codec_name))throw new Error(`Static scene asset must contain an image: ${src}`);
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
    if(scene.family==='kinetic-hook' && scene.data.foreground){
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
  return props;
}
