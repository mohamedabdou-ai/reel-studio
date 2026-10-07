import React from 'react';
import {Img,Sequence,staticFile} from 'remotion';
import {CanvasFill,useProbe} from '../core/safe';
import {useClock,EASE,clamp01} from '../core/motion';
import {Footage} from '../core/plate';
import {VectorLayer,DrawPath,rectPath,circlePath,calloutPath} from '../core/draw';
import {fitToWidth} from '../core/type';
import {FitText,type SceneTheme} from '../creative-kit/primitives';
import {useSceneTheme} from '../creative-kit/chapter-theme';
import {getStyleProfile} from '../creative-kit/styles';
import type {StyleFamily} from '../creative-kit/schema';
import type {LibraryScene,ImageScreenStep,VideoScreenStep,CaptureCallout} from './schema';
import {focusGeometry,FOCUS_VIEWPORT} from './geometry';
import {capturePose,captureRectToViewport,cursorAt,calloutState,circleAround,markBounds,chipPlacement,arrowPath,CALLOUT_PAD,CHIP,type CapturePose} from './capture';
import {FrameReveal,DrawProgress,FocusCursor,AnimatedNumber} from './upstream';

type Data<F extends LibraryScene['family']>=Extract<LibraryScene,{family:F}>['data'];
const INK_LEFT=95;
const INK_WIDTH=735;
const isRound=(theme:SceneTheme)=>!theme.grammar || theme.grammar.card==='rounded-ui';

const Heading:React.FC<{theme:SceneTheme;kicker:string;title:string;frame:number;distance:number}>=({theme,kicker,title,frame,distance})=>
  <div style={{position:'absolute',left:INK_LEFT,top:286,width:865}}><FrameReveal frame={frame} duration={18} distance={distance}>
    <FitText text={kicker} theme={theme} width={865} height={36} size={24} min={16} lines={1} role="label" color={theme.accentInk??theme.accent}/>
    <div style={{marginTop:14}}><FitText text={title} theme={theme} width={865} height={158} size={66} min={30} lines={2} role="title" align="right"/></div>
  </FrameReveal></div>;


const ImageFocus:React.FC<{step:ImageScreenStep;frame:number;reveal:number;accent:string}>=({step,frame,reveal,accent})=>{
  const progress=EASE.land(clamp01((frame-step.focusFrame)/step.settleFrames));
  const g=focusGeometry({width:step.sourceWidth,height:step.sourceHeight},step.focus,FOCUS_VIEWPORT,step.zoom,progress);
  return <>
    <Img src={staticFile(step.src)} style={{position:'absolute',left:g.image.left,top:g.image.top,width:g.image.width,height:g.image.height,maxWidth:'none'}}/>
    <div style={{position:'absolute',left:g.box.x,top:g.box.y,width:g.box.width,height:g.box.height,border:`4px solid ${accent}`,borderRadius:8,
      opacity:reveal,boxShadow:'0 0 0 1200px #00000045',boxSizing:'border-box',pointerEvents:'none'}}/>
    {reveal>0?<div style={{position:'absolute',inset:0,opacity:reveal}}><FocusCursor x={g.cursor.x} y={g.cursor.y} progress={clamp01((frame-step.focusFrame-step.settleFrames)/18)} color={accent}/></div>:null}
  </>;
};


const CaptureMark:React.FC<{callout:CaptureCallout;pose:CapturePose;frame:number;fps:number;probe:boolean;accent:string;theme:SceneTheme}>=({callout,pose,frame,fps,probe,accent,theme})=>{
  const state=calloutState(callout,frame,fps,probe);
  if(!state)return null;
  const box=captureRectToViewport(callout.rect,pose);

  const ink=(d:string)=><><DrawPath d={d} stroke={theme.card} strokeWidth={11} progress={state.draw}/><DrawPath d={d} stroke={accent} strokeWidth={5} progress={state.draw}/></>;
  let mark:React.ReactNode=null;
  if(callout.kind==='rect'){
    const shape=rectPath({width:box.width+2*CALLOUT_PAD,height:box.height+2*CALLOUT_PAD,radius:12});
    mark=<VectorLayer x={box.x-CALLOUT_PAD} y={box.y-CALLOUT_PAD} width={shape.width} height={shape.height}>{ink(shape.d)}</VectorLayer>;
  }else if(callout.kind==='circle'){
    const circle=circleAround(box),shape=circlePath({radius:circle.radius});
    mark=<VectorLayer x={circle.left} y={circle.top} width={shape.width} height={shape.height}>{ink(shape.d)}</VectorLayer>;
  }else if(callout.kind==='arrow'){
    mark=<VectorLayer width={FOCUS_VIEWPORT.width} height={FOCUS_VIEWPORT.height}>{ink(arrowPath(box))}</VectorLayer>;
  }
  let chip:React.ReactNode=null;
  if(callout.text!==undefined){
    const at=chipPlacement(markBounds(callout.kind,box));
    const bubble=calloutPath({width:CHIP.width,height:CHIP.height,pointerLength:CHIP.pointer,pointerBaseWidth:28,pointerPosition:at.pointerPosition,pointerDirection:at.direction,radius:14});
    chip=<div style={{position:'absolute',left:at.left,top:at.top+(probe?0:Math.round((1-state.draw)*10)),width:bubble.width,height:bubble.height,opacity:probe?1:clamp01(state.draw*1.5)}}>
      <VectorLayer width={bubble.width} height={bubble.height}><DrawPath d={bubble.d} fill={theme.accent} stroke={theme.card} strokeWidth={3}/></VectorLayer>
      <div style={{position:'absolute',left:15,top:at.bodyTop-at.top+5,width:CHIP.width-30,height:CHIP.height-10,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <FitText text={callout.text} theme={theme} width={CHIP.width-30} height={CHIP.height-10} size={30} min={18} lines={1} role="title" align="center" color={theme.onAccent??'#FFFFFF'}/>
      </div>
    </div>;
  }
  return <div style={{position:'absolute',inset:0,opacity:state.opacity,pointerEvents:'none'}}>{mark}{chip}</div>;
};


const CaptureViewport:React.FC<{step:VideoScreenStep;frame:number;fps:number;accent:string;theme:SceneTheme}>=({step,frame,fps,accent,theme})=>{
  const probe=useProbe()!==null;
  const pose=capturePose(step,frame);
  const cursor=cursorAt(step.cursor,frame,fps);
  return <>
    <div style={{position:'absolute',left:pose.left,top:pose.top,width:pose.width,height:pose.height}}>
      {                                                                                                                            }
      <Sequence from={step.atFrame} layout="none"><Footage src={step.src} muted startFromSec={step.trimBeforeFrame/fps}/></Sequence>
    </div>
    {step.callouts.map((callout,i)=><CaptureMark key={i} callout={callout} pose={pose} frame={frame} fps={fps} probe={probe} accent={accent} theme={theme}/>)}
    {cursor && !probe?<div style={{position:'absolute',inset:0,opacity:cursor.appear}}>
      <FocusCursor x={(pose.left+cursor.x*pose.width)/FOCUS_VIEWPORT.width} y={(pose.top+cursor.y*pose.height)/FOCUS_VIEWPORT.height} progress={cursor.click} color={accent}/>
    </div>:null}
  </>;
};

const SourceFocus:React.FC<{data:Data<'screen-focus'>;theme:SceneTheme;motion:LibraryScene['motion']}>=({data,theme,motion})=>{
  const {frame,fps}=useClock();
  let phase=0;data.steps.forEach((step,i)=>{if(frame>=step.atFrame)phase=i;});
  const step=data.steps[phase],local=frame-step.atFrame;
  const focusFrame=step.kind==='video'?step.keys[0].atFrame:step.focusFrame;
  const reveal=clamp01((frame-focusFrame)/9);
  const accent=theme.accentInk??theme.accent;
  const round=isRound(theme);
  return <><CanvasFill background={theme.background}/>
    <Heading theme={theme} kicker={`${data.kicker} / ${String(phase+1).padStart(2,'0')}`} title={step.title} frame={local} distance={motion==='quiet'?12:28}/>
    <div style={{position:'absolute',left:INK_LEFT,top:514,width:840,height:612,border:`3px solid ${theme.border}`,borderRadius:round?20:3,
      overflow:'hidden',background:theme.card,boxShadow:round?'0 14px 30px #00000016':`8px 8px 0 ${theme.border}`}}>
      <div style={{height:52,borderBottom:`2px solid ${theme.border}`,display:'flex',alignItems:'center',gap:10,padding:'0 20px'}}>
        {[0,1,2].map(i=><div key={i} style={{width:9,height:9,borderRadius:9,background:theme.dim,opacity:.7}}/>)}
        <div style={{marginLeft:'auto'}}><FitText text={data.kicker} theme={theme} role="label" width={600} height={25} size={17} min={12} lines={1} align="right" color={theme.dim}/></div>
      </div>
      <div style={{position:'relative',height:560,width:840,overflow:'hidden'}}>
        {step.kind==='video'
          ?<CaptureViewport key={phase} step={step} frame={frame} fps={fps} accent={accent} theme={theme}/>
          :<ImageFocus step={step} frame={frame} reveal={reveal} accent={accent}/>}
      </div>
    </div>
    <div style={{position:'absolute',left:INK_LEFT,top:1190,width:INK_WIDTH,color:theme.text}}><FrameReveal frame={frame-focusFrame} duration={16} distance={motion==='quiet'?8:20}>
      <FitText text={step.label} theme={theme} width={INK_WIDTH} height={84} size={40} min={22} lines={2} align="right" role="title"/>
      <DrawProgress progress={reveal} color={accent} width={INK_WIDTH} height={8}/>
    </FrameReveal></div>
    <div style={{position:'absolute',left:INK_LEFT,top:1312,width:INK_WIDTH,display:'flex',gap:12}}>
      {data.steps.map((_,i)=><div key={i} style={{height:6,width:i===phase?100:26,background:i===phase?accent:theme.dim,opacity:i===phase?1:.25}}/>)}
    </div>
  </>;
};

const Metric:React.FC<{data:Data<'data-story'>;theme:SceneTheme;frame:number;distance:number;takeover:boolean}>=({data,theme,frame,distance,takeover})=>{
  const item=data.items[0],local=frame-item.atFrame;
  const progress=EASE.land(clamp01(local/data.animateFrames));
  const precision=Number.isInteger(item.value)?0:2;
  const fit=fitToWidth(`${item.value.toFixed(precision)}${data.suffix}`,{fontFamily:theme.display,fontWeight:700,fontSize:168},860,{min:45,max:168});
  if(!fit.fits)throw new Error('Authored metric does not fit its safe display width.');
  return <>
    <div style={{position:'absolute',left:INK_LEFT,top:525,width:860}}><FrameReveal frame={local} duration={data.animateFrames} distance={distance}>
      <div style={{height:210,color:theme.accentInk??theme.accent,...fit.style,lineHeight:1.2,fontVariantNumeric:'tabular-nums'}}><AnimatedNumber from={0} to={item.value} progress={progress} toFixed={precision} postfix={data.suffix}/></div>
      <DrawProgress progress={progress} color={theme.accentInk??theme.accent} width={INK_WIDTH} height={10}/>
    </FrameReveal></div>
    <div style={{position:'absolute',left:INK_LEFT,top:770,width:INK_WIDTH}}>
      <FitText text={item.label} theme={theme} width={INK_WIDTH} height={70} size={38} min={22} lines={1} role="title"/>
      <FitText text={data.unit} theme={theme} width={INK_WIDTH} height={38} size={23} min={16} lines={1} role="label" color={theme.dim}/>
    </div>
    <div style={{position:'absolute',left:INK_LEFT,top:takeover?1180:895}}><FitText text={data.sourceNote} theme={theme} width={INK_WIDTH} height={88} size={20} min={14} lines={3} role="label" color={theme.dim}/></div>
  </>;
};

const DataStory:React.FC<{scene:Extract<LibraryScene,{family:'data-story'}>;theme:SceneTheme;seam:number}>=({scene,theme,seam})=>{
  const {frame}=useClock();
  const {data}=scene,takeover=scene.layout==='takeover',distance=scene.motion==='quiet'?10:28;
  const maximum=Math.max(1,...data.items.map(item=>item.value));
  const rowHeight=Math.min(164,660/data.items.length);
  return <><CanvasFill background={theme.background} style={takeover?undefined:{height:seam,bottom:'auto'}}/>
    <Heading theme={theme} kicker={data.kicker} title={data.title} frame={frame} distance={distance}/>
    {data.display==='metric'?<Metric data={data} theme={theme} frame={frame} distance={distance} takeover={takeover}/>:<>
      {data.items.map((item,i)=>{
        const local=frame-item.atFrame,progress=EASE.land(clamp01(local/data.animateFrames));
        const precision=Number.isInteger(item.value)?0:2;
        const fit=fitToWidth(`${item.value.toFixed(precision)}${data.suffix}`,{fontFamily:theme.display,fontWeight:700,fontSize:40},245,{min:18,max:40});
        if(!fit.fits)throw new Error('Authored chart value does not fit its safe label width.');
        return <div key={i} style={{position:'absolute',left:INK_LEFT,top:540+i*rowHeight,width:INK_WIDTH}}><FrameReveal frame={local} duration={Math.min(18,data.animateFrames)} distance={distance}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:66,gap:22}}>
            <div style={{width:245,height:58,...fit.style,lineHeight:1.3,color:theme.accentInk??theme.accent,fontVariantNumeric:'tabular-nums'}}><AnimatedNumber from={0} to={item.value} progress={progress} toFixed={precision} postfix={data.suffix}/></div>
            <FitText text={item.label} theme={theme} width={465} height={64} size={36} min={20} lines={2} role="title" align="right"/>
          </div>
          <div style={{position:'relative',height:23,marginTop:12,background:theme.card,border:`1px solid ${theme.border}`,borderRadius:isRound(theme)?12:0,overflow:'hidden'}}>
            <div style={{position:'absolute',left:0,top:0,bottom:0,width:Math.max(0,progress*item.value/maximum)*100+'%',background:theme.accentInk??theme.accent}}/>
          </div>
        </FrameReveal></div>;
      })}
      <div style={{position:'absolute',left:INK_LEFT,top:1230,width:INK_WIDTH}}>
        <DrawProgress progress={clamp01(frame/20)} color={theme.border} width={INK_WIDTH} height={5}/>
        <FitText text={`${data.unit} · ${data.sourceNote}`} theme={theme} width={INK_WIDTH} height={90} size={20} min={14} lines={3} role="label" color={theme.dim}/>
      </div>
    </>}
  </>;
};

export const LibrarySceneRenderer:React.FC<{scene:LibraryScene;style:StyleFamily;seam:number}>=({scene,style,seam})=>{
  getStyleProfile(style);
  const theme=useSceneTheme(style);
  return scene.family==='screen-focus'?<SourceFocus data={scene.data} theme={theme} motion={scene.motion}/>:<DataStory scene={scene} theme={theme} seam={seam}/>;
};
