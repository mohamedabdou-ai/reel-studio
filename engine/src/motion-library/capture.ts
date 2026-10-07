import {EASE,clamp01,envF,mix,px,toFrame} from '../core/motion.ts';
import {focusGeometry,FOCUS_VIEWPORT,type Size} from './geometry.ts';
import type {CaptureCallout,CursorPoint,FocusRect,ScreenFocusScene,VideoScreenStep} from './schema.ts';

export type CapturePose={left:number;top:number;width:number;height:number};
export type Box={x:number;y:number;width:number;height:number};
export type PoseStep=Pick<VideoScreenStep,'sourceWidth'|'sourceHeight'|'keys'|'moveFrames'>;


export const CAMERA_SPEED_WARN_PX_PER_SEC=600;

export const MIN_HOLD_SEC=1;

export const CURSOR_TRAVEL_SEC=0.5;
export const CLICK_RIPPLE_SEC=0.4;
export const CALLOUT_DRAW_SEC=0.4;
export const CALLOUT_EXIT_FRAMES=4;
export const CALLOUT_PAD=8;
export const CHIP={width:320,height:60,pointer:16,gap:6,margin:8} as const;
export const ARROW={length:130,gap:10,head:26,margin:8} as const;
const WHOLE:FocusRect={x:0,y:0,width:1,height:1};

const poseOf=(g:ReturnType<typeof focusGeometry>):CapturePose=>({left:g.image.left,top:g.image.top,width:g.image.width,height:g.image.height});


export function keyPose(step:PoseStep,index:number,viewport:Size=FOCUS_VIEWPORT):CapturePose{
  const source={width:step.sourceWidth,height:step.sourceHeight};
  if(index<0)return poseOf(focusGeometry(source,WHOLE,viewport,1,0));
  const key=step.keys[index];
  return poseOf(focusGeometry(source,key.focus,viewport,key.zoom,1));
}


export function capturePoseRaw(step:PoseStep,frame:number,viewport:Size=FOCUS_VIEWPORT):CapturePose{
  let index=-1;
  step.keys.forEach((key,i)=>{if(frame>=key.atFrame)index=i;});
  if(index<0)return keyPose(step,-1,viewport);
  const from=keyPose(step,index-1,viewport),to=keyPose(step,index,viewport);
  const p=EASE.inOut((frame-step.keys[index].atFrame)/step.moveFrames);
  return {left:mix(from.left,to.left,p),top:mix(from.top,to.top,p),width:mix(from.width,to.width,p),height:mix(from.height,to.height,p)};
}


export function capturePose(step:PoseStep,frame:number,viewport:Size=FOCUS_VIEWPORT):CapturePose{
  const raw=capturePoseRaw(step,frame,viewport);
  return {left:px(raw.left),top:px(raw.top),width:px(raw.width),height:px(raw.height)};
}


export function captureRectToViewport(rect:FocusRect,pose:CapturePose):Box{
  return {x:px(pose.left+rect.x*pose.width),y:px(pose.top+rect.y*pose.height),width:px(rect.width*pose.width),height:px(rect.height*pose.height)};
}




export function visibleSpeed(a:CapturePose,b:CapturePose,viewport:Size=FOCUS_VIEWPORT):number{
  let peak=0;
  for(const vx of [0,viewport.width])for(const vy of [0,viewport.height]){
    const sx=(vx-a.left)/a.width,sy=(vy-a.top)/a.height;
    peak=Math.max(peak,Math.hypot(b.left+sx*b.width-vx,b.top+sy*b.height-vy));
  }
  return peak;
}

export type CursorState={x:number;y:number;click:number;appear:number};



export function cursorAt(points:readonly CursorPoint[],frame:number,fps:number):CursorState|null{
  if(!points.length || frame<points[0].atFrame)return null;
  let i=0;
  for(let n=1;n<points.length;n++)if(frame>=points[n].atFrame)i=n;
  const here=points[i],next=points[i+1];
  let x=here.x,y=here.y;
  if(next){
    const travel=Math.max(1,Math.min(next.atFrame-here.atFrame,toFrame(CURSOR_TRAVEL_SEC,fps)));
    const p=EASE.inOut((frame-(next.atFrame-travel))/travel);
    x=mix(here.x,next.x,p);y=mix(here.y,next.y,p);
  }
  const rippleF=Math.max(2,toFrame(CLICK_RIPPLE_SEC,fps));
  let click=0;
  for(let n=i;n>=0;n--)if(points[n].click){click=clamp01((frame-points[n].atFrame+1)/rippleF);break;}
  return {x,y,click,appear:clamp01((frame-points[0].atFrame+1)/4)};
}



export function calloutState(callout:CaptureCallout,frame:number,fps:number,probe:boolean):{draw:number;opacity:number}|null{
  if(frame<callout.atFrame || (callout.untilFrame!==undefined && frame>=callout.untilFrame))return null;
  if(probe)return {draw:1,opacity:1};
  const drawF=Math.max(1,toFrame(CALLOUT_DRAW_SEC,fps));
  return {draw:EASE.land((frame-callout.atFrame+1)/drawF),opacity:envF(frame,callout.atFrame,callout.untilFrame??Number.MAX_SAFE_INTEGER,1,CALLOUT_EXIT_FRAMES)};
}


export function circleAround(target:Box){
  const radius=px(Math.hypot(target.width,target.height)/2+CALLOUT_PAD);
  return {radius,left:px(target.x+target.width/2)-radius,top:px(target.y+target.height/2)-radius};
}


export function markBounds(kind:CaptureCallout['kind'],target:Box):Box{
  if(kind==='rect')return {x:target.x-CALLOUT_PAD,y:target.y-CALLOUT_PAD,width:target.width+2*CALLOUT_PAD,height:target.height+2*CALLOUT_PAD};
  if(kind==='circle'){const c=circleAround(target);return {x:c.left,y:c.top,width:2*c.radius,height:2*c.radius};}
  return target;
}

export type ChipPlacement={left:number;top:number;direction:'up'|'down';pointerPosition:number;bodyTop:number};


export function chipPlacement(mark:Box,viewport:Size=FOCUS_VIEWPORT):ChipPlacement{
  const full=CHIP.height+CHIP.pointer,center=mark.x+mark.width/2;
  const left=px(Math.min(Math.max(CHIP.margin,center-CHIP.width/2),viewport.width-CHIP.margin-CHIP.width));
  const below=mark.y+mark.height+CHIP.gap;
  const fitsBelow=below+full<=viewport.height-CHIP.margin;
  const top=px(fitsBelow?below:Math.max(CHIP.margin,mark.y-CHIP.gap-full));
  const pointerPosition=Math.min(0.88,Math.max(0.12,(center-left)/CHIP.width));
  return {left,top,direction:fitsBelow?'up':'down',pointerPosition,bodyTop:top+(fitsBelow?CHIP.pointer:0)};
}




export function arrowPath(target:Box,viewport:Size=FOCUS_VIEWPORT):string{
  const tx=px(target.x+target.width/2);
  const above=target.y-ARROW.gap-ARROW.length*0.8>=ARROW.margin;
  const ty=px(above?target.y-ARROW.gap:target.y+target.height+ARROW.gap);
  const sx=px(tx+(tx>viewport.width/2?-1:1)*ARROW.length*0.6);
  const sy=px(ty+(above?-1:1)*ARROW.length*0.8);
  const length=Math.hypot(sx-tx,sy-ty),ux=(sx-tx)/length,uy=(sy-ty)/length;
  const barb=(angle:number)=>{
    const c=Math.cos(angle),s=Math.sin(angle);
    return `${px(tx+ARROW.head*(ux*c-uy*s))} ${px(ty+ARROW.head*(ux*s+uy*c))}`;
  };
  return `M ${sx} ${sy} L ${tx} ${ty} L ${barb(Math.PI/6)} L ${tx} ${ty} L ${barb(-Math.PI/6)}`;
}

const inside=(box:Box,viewport:Size)=>box.x>=0 && box.y>=0 && box.x+box.width<=viewport.width && box.y+box.height<=viewport.height;


export function captureIssues(scene:ScreenFocusScene,viewport:Size=FOCUS_VIEWPORT):string[]{
  const issues:string[]=[];
  scene.data.steps.forEach((step,i)=>{
    if(step.kind!=='video')return;
    const end=scene.data.steps[i+1]?.atFrame??scene.durationInFrames;
    const where=`${scene.id}: step ${i+1}`;
    step.keys.forEach((key,k)=>{
      const earliest=k===0?step.atFrame:step.keys[k-1].atFrame+1;
      const landBy=k+1<step.keys.length?step.keys[k+1].atFrame:end-1;
      if(key.atFrame<earliest || key.atFrame+step.moveFrames>landBy)
        issues.push(`${where}: focus key ${k+1} must start inside the step, after the previous key, and land (atFrame + moveFrames) before the next key/step end.`);
    });
    const fit=Math.min(viewport.width/step.sourceWidth,viewport.height/step.sourceHeight);
    for(let k=-1;k<step.keys.length;k++){
      const scale=keyPose(step,k,viewport).width/step.sourceWidth;
      if(scale>1+1e-9)issues.push(`${where}: ${k<0?'wide view':`focus key ${k+1}`} upscales the capture to ${scale.toFixed(3)} output px per source px; keep zoom <= ${(1/fit).toFixed(2)} or record the capture larger.`);
    }
    step.cursor.forEach((point,n)=>{
      const earliest=n===0?step.atFrame:step.cursor[n-1].atFrame+1;
      if(point.atFrame<earliest || point.atFrame>=end)issues.push(`${where}: cursor waypoint ${n+1} must be strictly after the previous one and inside the step.`);
    });
    step.callouts.forEach((callout,n)=>{
      if(callout.atFrame<step.atFrame || callout.atFrame>=end || (callout.untilFrame!==undefined && (callout.untilFrame<=callout.atFrame || callout.untilFrame>end)))
        issues.push(`${where}: callout ${n+1} must appear inside the step and end (untilFrame) after it appears and by the step end.`);
      if(callout.kind==='label' && callout.text===undefined)issues.push(`${where}: label callout ${n+1} needs text.`);
    });
  });
  return issues;
}



export function captureWarnings(scene:ScreenFocusScene,fps:number,viewport:Size=FOCUS_VIEWPORT):string[]{
  const warnings:string[]=[];
  const limit=CAMERA_SPEED_WARN_PX_PER_SEC/fps,minHold=toFrame(MIN_HOLD_SEC,fps);
  scene.data.steps.forEach((step,i)=>{
    if(step.kind!=='video')return;
    const end=scene.data.steps[i+1]?.atFrame??scene.durationInFrames;
    const where=`${scene.id}: step ${i+1}`;
    step.keys.forEach((key,k)=>{
      let peak=0;
      for(let f=key.atFrame+1;f<=key.atFrame+step.moveFrames;f++)
        peak=Math.max(peak,visibleSpeed(capturePoseRaw(step,f-1,viewport),capturePoseRaw(step,f,viewport),viewport));
      if(peak>limit+1e-9)warnings.push(`${where}: focus key ${k+1} moves the capture ${peak.toFixed(1)} px/frame (advisory limit ${limit.toFixed(1)} at ${fps} fps); raise moveFrames or shorten the move.`);
      const hold=(step.keys[k+1]?.atFrame??end)-(key.atFrame+step.moveFrames);
      if(hold<minHold)warnings.push(`${where}: focus key ${k+1} holds ${hold} frames after landing (< ${MIN_HOLD_SEC} s); give the viewer time to read.`);
    });
    step.cursor.forEach((point,n)=>{
      const pose=capturePoseRaw(step,point.atFrame,viewport);
      const x=pose.left+point.x*pose.width,y=pose.top+point.y*pose.height;
      if(x<0 || y<0 || x>viewport.width || y>viewport.height)warnings.push(`${where}: cursor waypoint ${n+1} is outside the visible capture on frame ${point.atFrame}.`);
    });
    step.callouts.forEach((callout,n)=>{
      if(!inside(captureRectToViewport(callout.rect,capturePose(step,callout.atFrame,viewport)),viewport))
        warnings.push(`${where}: callout ${n+1} is not fully visible when it appears (frame ${callout.atFrame}).`);
    });
  });
  return warnings;
}
