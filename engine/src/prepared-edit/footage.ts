import {clamp01} from '../core/motion.ts';
import {curtainAt,settleCurtainForProbe,windowGeoAtFrame,type CurtainOptions} from '../core/window-geo.ts';
import {cameraAtFrame} from './timeline.ts';
import {defaultFootageGeometry} from './visibility.ts';

export type Geo={windowTop:number;windowHeight:number;videoWidth:number;videoLeft:number;videoTop:number};
export type LayoutName='presenter'|'split';
export type SceneLayoutName='presenter'|'split'|'takeover';
export type LayoutTransition={atFrame:number;durationInFrames:number;kind:'curtain'|'window-morph';from:LayoutName;to:LayoutName};
export type CameraKeyLike={atFrame:number;scale:number;focusX:number;focusY:number;ease?:'smooth'|'bezierCam'};
export type FootageEdit={
  scenes:readonly {id:string;fromFrame:number;durationInFrames:number;layout:string}[];
  camera:CameraKeyLike[];
  footage?:{defaultLayout:'presenter'|'split';full:Geo;split:Geo};
  layoutTransitions?:readonly LayoutTransition[];
};
export type FootageFrameOptions={aspect:number;canvasHeight:number;probe?:boolean};
export type LayoutTransitionState={geo:Geo;seamY:number;lower:number;upper:number;contentShift:number};
export type FootageFrameState={layout:SceneLayoutName;geo:Geo;seam:number;transition:LayoutTransition|null;
  lower:number;upper:number;clipTop:number|null;contentShift:number};

export const LAYOUT_TRANSITION_MIN_FRAMES=12;
export const CAPTION_FADE_FRAMES=4;
const CANVAS_WIDTH=1080;




export function composeCameraGeometry(geo:Geo,camera:{scale:number;focusX:number;focusY:number},aspect:number):Geo{
  if(camera.scale===1)return geo;
  const anchorX=geo.videoLeft+camera.focusX*geo.videoWidth;
  const anchorY=geo.videoTop+camera.focusY*geo.videoWidth*aspect;
  const videoWidth=Math.round(geo.videoWidth*camera.scale);
  const videoHeight=Math.round(videoWidth*aspect);
  const clamp=(n:number,low:number,high:number)=>Math.round(Math.min(high,Math.max(low,n)));
  return {windowTop:geo.windowTop,windowHeight:geo.windowHeight,videoWidth,
    videoLeft:clamp(anchorX-camera.focusX*videoWidth,CANVAS_WIDTH-videoWidth,0),
    videoTop:clamp(anchorY-camera.focusY*videoHeight,geo.windowHeight-videoHeight,0)};
}

export function footageLayoutAt(edit:FootageEdit,frame:number):SceneLayoutName{
  const active=edit.scenes.find(s=>frame>=s.fromFrame && frame<s.fromFrame+s.durationInFrames);
  return (active?.layout??edit.footage?.defaultLayout??'split') as SceneLayoutName;
}

export function footageGeometryFor(edit:FootageEdit,layout:SceneLayoutName,camera:{scale:number;focusX:number;focusY:number},o:{aspect:number;canvasHeight:number}):Geo{
  if(edit.footage)return composeCameraGeometry(layout==='presenter'?edit.footage.full:edit.footage.split,camera,o.aspect);
  return defaultFootageGeometry({layout,canvasHeight:o.canvasHeight,aspect:o.aspect,scale:camera.scale,focusX:camera.focusX,focusY:camera.focusY});
}

export function activeLayoutTransition(list:readonly LayoutTransition[]|undefined,frame:number):LayoutTransition|null{
  for(const t of list??[])if(frame>=t.atFrame && frame<t.atFrame+t.durationInFrames)return t;
  return null;
}

export function layoutTransitionState(t:LayoutTransition,frame:number,geos:{presenter:Geo;split:Geo},probe:boolean):LayoutTransitionState{
  const end=t.atFrame+t.durationInFrames;
  if(t.kind==='curtain'){
    const opts:CurtainOptions={fromF:t.atFrame,durF:t.durationInFrames,full:geos.presenter,split:geos.split};
    const raw=curtainAt(frame,opts);
    const s=probe?settleCurtainForProbe(raw,opts):raw;
    return {geo:s.geo,seamY:s.seamY,lower:s.lowerCaptionOpacity,upper:s.upperOpacity,contentShift:s.seamY-geos.split.windowTop};
  }
  if(probe){const geo=geos[t.to];return {geo,seamY:geo.windowTop,lower:0,upper:1,contentShift:0};}

  const keys:readonly (readonly [number,Geo])[]=[[t.atFrame-1,geos[t.from]],[end-1,geos[t.to]]];
  const geo=windowGeoAtFrame(frame,keys);
  const lower=clamp01(1-(frame-t.atFrame+1)/CAPTION_FADE_FRAMES);
  const upper=clamp01((frame-(end-CAPTION_FADE_FRAMES)+1)/CAPTION_FADE_FRAMES);
  return {geo,seamY:geo.windowTop,lower,upper,contentShift:0};
}

export function footageFrameState(edit:FootageEdit,frame:number,o:FootageFrameOptions):FootageFrameState{
  const layout=footageLayoutAt(edit,frame);
  const camera=cameraAtFrame(edit.camera,frame);
  const seam=edit.footage?.split.windowTop??o.canvasHeight;
  const transition=activeLayoutTransition(edit.layoutTransitions,frame);
  if(!transition)return {layout,geo:footageGeometryFor(edit,layout,camera,o),seam,transition:null,lower:0,upper:1,clipTop:null,contentShift:0};
  const s=layoutTransitionState(transition,frame,{presenter:footageGeometryFor(edit,'presenter',camera,o),split:footageGeometryFor(edit,'split',camera,o)},o.probe===true);
  const toSplit=transition.to==='split';
  return {layout,geo:s.geo,seam,transition,lower:s.lower,upper:s.upper,clipTop:toSplit?s.seamY:null,contentShift:toSplit?s.contentShift:0};
}

export function layoutTransitionIssues(edit:FootageEdit,total:number,signoffFromFrame?:number):string[]{
  const issues:string[]=[];let lastEnd=0;
  for(const t of edit.layoutTransitions??[]){
    const end=t.atFrame+t.durationInFrames,label=`Layout transition at ${t.atFrame}`;
    if(t.from===t.to)issues.push(`${label}: from and to must differ.`);
    if(t.kind==='curtain' && !(t.from==='presenter' && t.to==='split'))issues.push(`${label}: a curtain descends from presenter to split; use window-morph for other moves.`);



    if(t.kind==='curtain' && edit.footage){
      const {full,split}=edit.footage;
      if(full.windowTop+full.windowHeight!==1920 || split.windowTop+split.windowHeight!==1920 || !(split.windowTop>full.windowTop)){
        issues.push(`${label}: a curtain needs both footage windows to reach the bottom of the frame (windowTop + windowHeight = 1920) and the split window below the full one.`);
      }
    }
    if(t.atFrame<1)issues.push(`${label}: needs one earlier frame in its from layout.`);
    if(t.atFrame<lastEnd)issues.push(`${label}: layout transitions must be ordered and must not overlap.`);
    if(end>(signoffFromFrame??total))issues.push(`${label}: must end before the signoff and edit end.`);
    if(t.atFrame>=1 && footageLayoutAt(edit,t.atFrame-1)!==t.from)issues.push(`${label}: the frame before it must be in the ${t.from} layout.`);
    for(let f=t.atFrame;f<Math.min(end,total);f++)if(footageLayoutAt(edit,f)!==t.to){issues.push(`${label}: frame ${f} is not in the ${t.to} layout.`);break;}
    if(end<total && footageLayoutAt(edit,end)!==t.to)issues.push(`${label}: the first frame after it must be in the ${t.to} layout.`);
    lastEnd=end;
  }
  return issues;
}
