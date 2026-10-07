import './project-tmp.mjs';
import path from 'node:path';
import {ROOT} from './media.mjs';
import {requireFromEngine} from './bundle.mjs';
import {digest} from './job-paths.mjs';
import {buildHeadEnvelope,readHeadEnvelope,headBoxAt,mapHeadRect,manifestFrameState} from './head-envelope.mjs';
import {headGuideSchema,headGuideIssues} from '../../engine/src/prepared-edit/head-guide.ts';
import {HEAD_GUIDE_FAMILIES} from '../../engine/src/creative-kit/head-clear.ts';


export const needsHeadGuide=(edit)=>edit.scenes.some((scene)=>HEAD_GUIDE_FAMILIES.includes(scene.family));

const unionRect=(a,b)=>{
  const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
  return {x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y};
};
















export const CHIN_ALLOWANCE_FRACTION=0.12;




export function padChinBottom(rect,geo,canvasHeight=1920){
  const bottomLimit=Math.min(canvasHeight,geo.windowTop+geo.windowHeight);
  const bottom=Math.min(bottomLimit,rect.y+rect.height+Math.round(rect.height*CHIN_ALLOWANCE_FRACTION));
  return bottom>rect.y?{...rect,height:bottom-rect.y}:rect;
}


export function reduceHeadGuide(edit,envelope,{aspect,splitCanvasHeight=null}){
  const scenes=edit.scenes.map((scene)=>{
    let box=null,visibleFrames=0,reason=null;
    for(let frame=scene.fromFrame;frame<scene.fromFrame+scene.durationInFrames;frame++){
      const state=manifestFrameState(edit,frame,{aspect,splitCanvasHeight});
      if(!state.visible)continue;
      visibleFrames++;
      const at=headBoxAt(envelope,state.sourceFrame);
      if(!at.box){reason??=at.reason;continue;}
      const mapped=mapHeadRect(at.box,state.geo,{sourceAspect:aspect});
      const rect=mapped?padChinBottom(mapped,state.geo):mapped;
      if(rect)box=box?unionRect(box,rect):rect;
    }
    if(reason)return {id:scene.id,status:'unknown',box:null,visibleFrames,reason};
    return {id:scene.id,status:box?'ok':'hidden',box,visibleFrames,reason:null};
  });
  return headGuideSchema.parse({version:1,sourceSha256:edit.source.sha256,method:envelope?.method??'none',scenes});
}




const splitCanvasHeightCache=new Map();


export function splitCanvasHeightFor(style){
  if(splitCanvasHeightCache.has(style))return splitCanvasHeightCache.get(style);
  const {buildSync}=requireFromEngine('esbuild');
  const code=buildSync({entryPoints:[path.join(ROOT,'engine/src/creative-kit/primitives.tsx')],bundle:true,write:false,
    platform:'node',format:'cjs',packages:'external'}).outputFiles[0].text;
  const bundled={exports:{}};
  new Function('require','module','exports',code)(requireFromEngine,bundled,bundled.exports);
  const height=bundled.exports.getSceneGeometry(style,'split').canvasHeight;
  splitCanvasHeightCache.set(style,height);
  return height;
}

const splitFor=(edit)=>edit.footage?null:splitCanvasHeightFor(edit.style);





export async function buildPreparedHeadGuide(edit,{log=()=>{}}={}){
  if(!needsHeadGuide(edit))return null;
  const built=await buildHeadEnvelope({source:edit.source.path,log});
  const envelope=built.envelope.method==='none'?null:built.envelope;
  if(envelope && envelope.source.sha256!==edit.source.sha256)throw new Error(`Head envelope for ${edit.source.path} belongs to another source`);
  if(!envelope){


    const stale=await readHeadEnvelope(edit.source.sha256).catch(()=>null);
    if(stale)throw new Error(`a cached envelope exists but could not be rebuilt: ${built.errors.join('; ')}`);
  }
  const guide=reduceHeadGuide(edit,envelope,{aspect:edit.source.height/edit.source.width,splitCanvasHeight:splitFor(edit)});
  const warning=envelope?null:`no head envelope (${built.errors.join('; ')}); head-aware titles keep their authored position and head-check will not PASS`;
  if(warning)log(`⚠ head guide: ${warning}`);
  return {guide,summary:{method:guide.method,envelope:built.file?path.relative(ROOT,built.file).split(path.sep).join('/'):null,cached:built.cached,errors:built.errors,
    every:envelope && envelope.samples.length>1?envelope.samples[1].frame-envelope.samples[0].frame:null,
    envelopeSha256:envelope?digest(envelope.samples):null,warning,
    scenes:Object.fromEntries(guide.scenes.map((scene)=>[scene.id,scene.status]))}};
}






export function checkHeadGuide(props,envelope,{splitCanvasHeight=null}={}){
  const guide=headGuideSchema.parse(props.headGuide);
  const issues=headGuideIssues(guide,props.edit);
  if(issues.length)throw new Error(`Head guide does not belong to this edit (${issues.join('; ')}). Run edit-project prepare again.`);
  if(!needsHeadGuide(props.edit))throw new Error('Head guide on an edit without head-aware title scenes. Run edit-project prepare again.');
  const expected=reduceHeadGuide(props.edit,envelope,{aspect:props.plate.height/props.plate.width,splitCanvasHeight});
  if(digest(expected)!==digest(guide)){
    const cause=(!envelope && guide.method!=='none')
      ? `the cached head envelope state/cache/head/${guide.sourceSha256}.json is missing`
      : `cached envelope method ${envelope?.method??'none'}, ${envelope?.samples.length??0} samples; if you installed --head-envelope or rebuilt the envelope, run edit-project prepare again`;
    throw new Error(`Head guide no longer matches the cached head envelope or the edit geometry. Run edit-project prepare again. (${cause})`);
  }
  return guide;
}


export async function verifyPreparedHeadGuide(props){
  if(props.headGuide===undefined)return null;
  const envelope=await readHeadEnvelope(props.edit.source.sha256);
  return checkHeadGuide(props,envelope,{splitCanvasHeight:splitFor(props.edit)});
}
