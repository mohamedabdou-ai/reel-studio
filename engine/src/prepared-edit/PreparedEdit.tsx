import React from "react";
import {Sequence, useCurrentFrame, type CalculateMetadataFunction} from "remotion";
import {SafeRoot, CanvasFill, FRAME, useProbe, type SafeProps} from "../core/safe";
import {ContinuousWindowPlate,type WindowGeo} from "../core/plate";
import {Whiteout,LightLeak,FlashBloom,FilmBurn} from "../core/transitions";
import {WhipPan,LightScan} from "../core/transitions-dir";
import {ClipReveal} from "../core/mask";
import {PipPlate} from "../core/device";
import {fitToWidth, safeWidthFor} from "../core/type";
import {EDITOR_FONT_ROLE} from "../core/editor-font-roles";
import {CreativeFonts, getSceneGeometry} from "../creative-kit/primitives";
import {ChapterCrossfade, ChapterThemeProvider, TypographyProvider, useSceneTheme} from "../creative-kit/chapter-theme";
import {useBrandTheme} from "../creative-kit/brand-theme";
import {IntroScene, ProofScene, ProcessScene, ComparisonScene, CommentGateScene, FollowScene} from "../creative-kit/scenes";
import {editManifestSchema, type EditManifest, type EditScene} from "./schema.ts";
import {compileEdit} from "./timeline.ts";
import {fittingCaptionCue} from './caption-fit.ts';
import {footageFrameState,type LayoutTransition,type SceneLayoutName} from "./footage.ts";
import {captionEmphasisInk,emphasisBySource,popScale,underlineMetrics} from "./caption-emphasis.ts";
import {entranceBox,hueCrossfadeFor,isOverlayKind,sceneEntrance} from "./graphics-transitions.ts";
import {preparedPlateList} from "./plates.ts";
import {getStaticFiles} from "@remotion/studio";
import proxyRegistry from "../../proxies.json";
import {resolvePreviewSource,type ProxyRegistry} from "../core/preview-source";
import {KineticSceneRenderer} from "../creative-kit/kinetic/scenes";
import {kineticSceneSchema} from "../creative-kit/kinetic/schema.ts";
import {footageVisibility} from "./visibility.ts";
import {headGuideSchema,headGuideIssues,headBoxForScene,type HeadGuide} from "./head-guide.ts";
import {PRESENTER_CAPTION_CENTER,type HeadBoxPx} from "../creative-kit/head-clear.ts";
import {librarySceneSchema} from '../motion-library/schema.ts';
import {LibrarySceneRenderer} from '../motion-library/scenes';
import {PreparedPlateProvider,ScreenRecordingScene} from '../screen-recording/ScreenRecordingScene';
import {screenRecordingSceneSchema} from '../screen-recording/schema.ts';
import {semanticSceneSchema} from '../creative-kit/semantic/schema.ts';
import {SemanticSceneRenderer} from '../creative-kit/semantic/scenes';

export type PreparedEditProps = SafeProps & {
  edit:EditManifest|null;
  plate:{src:string;width:number;height:number}|null;
  plates?:string[];
  __editorPreview?:boolean;
  __editorSkipHiddenVideo?:boolean;
  __editorMediaSelection?:{source:string;selected:string;proxyRequested:boolean};

  headGuide?:HeadGuide;
};
export const preparedEditDefaults:PreparedEditProps = {edit:null,plate:null,guides:false,plates:[]};

export const calculatePreparedMetadata:CalculateMetadataFunction<PreparedEditProps> = ({props})=>{
  if(!props.edit || !props.plate) return {durationInFrames:90, fps:30, props:{...props,plates:[]}};
  const edit=editManifestSchema.parse(props.edit);
  if(props.headGuide!==undefined){
    const issues=headGuideIssues(headGuideSchema.parse(props.headGuide),edit);
    if(issues.length)throw new Error(`Head guide does not belong to this edit: ${issues.join("; ")}. Run edit-project prepare again.`);
  }
  if(!/^_prepared\/[a-z0-9-]+\/[a-f0-9]+\.(mp4|mov)$/i.test(props.plate.src)) throw new Error("Prepared footage must be a local, fingerprinted plate.");
  const assets=Object.fromEntries(getStaticFiles().map(file=>[file.name,file]));
  const mediaSelection={source:props.plate.src,proxyRequested:props.__editorPreview===true,
    selected:resolvePreviewSource({source:props.plate.src,transparent:false,isPreview:props.__editorPreview===true,registry:proxyRegistry as ProxyRegistry,assets})};

  return {durationInFrames:compileEdit(edit).durationInFrames,fps:edit.source.fps,width:1080,height:1920,
    props:{...props,edit,plates:preparedPlateList(edit,props.plate.src),__editorMediaSelection:mediaSelection}};
};

export const SceneLayer:React.FC<{scene:EditScene;style:EditManifest["style"];geometry:WindowGeo;aspect:number;seam:number;headBox?:HeadBoxPx|null}> = ({scene,style,geometry,aspect,seam,headBox=null})=>{
  const semantic=semanticSceneSchema.safeParse(scene);
  if(semantic.success)return <SemanticSceneRenderer scene={semantic.data} style={style}/>;
  const screen=screenRecordingSceneSchema.safeParse(scene);
  if(screen.success)return <ScreenRecordingScene scene={screen.data} style={style}/>;
  const library=librarySceneSchema.safeParse(scene);
  if(library.success)return <LibrarySceneRenderer scene={library.data} style={style} seam={seam}/>;
  const kinetic=kineticSceneSchema.safeParse(scene);
  if(kinetic.success)return <KineticSceneRenderer scene={kinetic.data} style={style} geometry={geometry} aspect={aspect} seam={seam} headBox={headBox}/>;
  const options={style,layout:scene.layout==='presenter'?'split' as const:scene.layout,motion:scene.motion,showCaption:false};
  switch(scene.family){
    case "intro":return <IntroScene {...options} data={scene.data}/>;
    case "proof":return <ProofScene {...options} data={scene.data}/>;
    case "process":return <ProcessScene {...options} data={scene.data}/>;
    case "comparison":return <ComparisonScene {...options} data={scene.data}/>;
    case "comment":return <CommentGateScene {...options} data={scene.data}/>;
    case "follow":return <FollowScene {...options} data={scene.data}/>;
  }
};

export const CaptionTrack:React.FC<{edit:EditManifest;compiled:ReturnType<typeof compileEdit>;center:number}> = ({edit,compiled,center})=>{
  const frame=useCurrentFrame();
  const probe=useProbe();
  const theme=useSceneTheme(edit.style);
  const emphasis=React.useMemo(()=>emphasisBySource(edit.captions.emphasis),[edit.captions.emphasis]);
  let cue=compiled.captionGroups.find(c=>frame>=c.fromFrame && frame<c.toFrame);
  if(!cue) return null;
  const scene=edit.scenes.find(s=>frame>=s.fromFrame && frame<s.fromFrame+s.durationInFrames);
  if(scene?.family==='creator-cta')return null;
  const band=safeWidthFor(center-64,128,"organic",{inset:32});
  const modern=edit.style!=='section-deck'&&edit.style!=='split-canvas';
  const role=edit.fontFamily?{...EDITOR_FONT_ROLE.caption,fontFamily:edit.fontFamily,fontWeight:700}
    :modern?{...EDITOR_FONT_ROLE.caption,fontFamily:theme.ar,fontWeight:800}:EDITOR_FONT_ROLE.caption;
  if(edit.fontFamily)cue=fittingCaptionCue(cue,frame,text=>fitToWidth(text,{fontFamily:role.fontFamily,fontWeight:role.fontWeight,fontSize:30},band.width-60,{min:30,max:30}).fits);
  const text=cue.words.map(w=>w.text.trim()).join(" ");
  const fit=fitToWidth(text,{fontFamily:role.fontFamily,fontWeight:role.fontWeight,fontSize:50},band.width-60,{min:30,max:50});
  if(!fit.fits) throw new Error(`Caption does not fit safely: ${text}`);
  const height=Math.ceil(fit.fontSize*role.lineHeight)+22;
  const width=Math.min(band.width,Math.ceil(fit.width)+60);
  const clauseCaption=edit.captions.grouping===undefined?edit.style==="section-deck":edit.captions.grouping==='clauses';
  const enter=clauseCaption?1:Math.min(1,(frame-cue.fromFrame+1)/4);


  const themed=modern||edit.brand!==undefined;
  const presentation=edit.captions.presentation??'pill';
  const background=presentation==='minimal'?'transparent':presentation==='ink-strip'?'#102027':themed?theme.pill:'#ffffff';
  const wordColor=presentation==='pill'?(themed?theme.pillText:'#102c35'):'#ffffff';
  const ink=emphasis.size?captionEmphasisInk({accent:theme.accent,accentInk:theme.accentInk,pill:presentation==='minimal'?'#102027':background}):wordColor;
  const underline=underlineMetrics(fit.fontSize);
  return <div style={{position:"absolute",left:Math.round(band.left+(band.width-width)/2),top:Math.round(center-height/2),
    width,height,borderRadius:presentation==='ink-strip'?3:modern?9:18,background,color:wordColor,display:"flex",alignItems:"center",justifyContent:"center",
    opacity:enter,transform:`translateY(${Math.round((1-enter)*6)}px)`,boxShadow:presentation==='minimal'?'none':'0 3px 15px #00000020',
    textShadow:presentation==='minimal'?'0 2px 4px #000, 1px 0 #000, -1px 0 #000, 0 -1px #000':undefined}}>
    <div dir={/[؀-ۿ]/.test(text)?'rtl':'ltr'} style={{...fit.style,fontSynthesis:role.fontSynthesis,lineHeight:String(role.lineHeight),whiteSpace:"pre",textAlign:"center"}}>
      {cue.words.map((word,index)=>{
        const kind=emphasis.get(word.sourceIndex);
        const style:React.CSSProperties=kind===undefined?{color:wordColor}
          :kind==='underline'?{color:wordColor,textDecorationLine:'underline',textDecorationColor:ink,textDecorationThickness:underline.thickness,textUnderlineOffset:underline.offset,textDecorationSkipInk:'none'}
          :kind==='pop'?{color:ink,display:'inline-block',transform:`scale(${popScale(frame,word.fromFrame,probe!==null)})`,transformOrigin:'50% 60%'}
          :{color:ink};
        return <React.Fragment key={word.sourceIndex}>{index>0?" ":null}<span style={style}>{word.text.trim()}</span></React.Fragment>;
      })}
    </div>
  </div>;
};







const ScenePresentation:React.FC<{edit:EditManifest;index:number;geometry:WindowGeo;aspect:number;seam:number;
  transition:LayoutTransition|null;clipTop:number|null;contentShift:number;headBox:HeadBoxPx|null}> = ({edit,index,geometry,aspect,seam,transition,clipTop,contentShift,headBox})=>{
  const scene=edit.scenes[index];
  const entrance=sceneEntrance(edit.transitions,scene);
  const hue=hueCrossfadeFor(edit.transitions,edit.scenes,index);
  let layer:React.ReactNode=<SceneLayer scene={scene} style={edit.style} geometry={geometry} aspect={aspect} seam={seam} headBox={headBox}/>;
  if(entrance){
    const box=entranceBox(scene.layout,seam),dir=entrance.dir??'rtl';
    if(entrance.kind==='whip-pan')layer=<WhipPan dir={dir} at={0} durF={entrance.durationInFrames} mode="in" box={box}>{layer}</WhipPan>;
    else if(entrance.kind==='clip-wipe')layer=<ClipReveal dir={dir} at={0} durF={entrance.durationInFrames} mode="in" box={box}>{layer}</ClipReveal>;
    else layer=<>{layer}<LightScan bounds={box} at={0} durF={entrance.durationInFrames} dir={dir}/></>;
  }
  if(hue){
    const height=scene.layout==='split'?seam:undefined;
    layer=<><ChapterCrossfade from={hue.from} to={hue.to} atFrame={0} durF={hue.durationInFrames} height={height}/>{layer}</>;
  }
  if(transition && clipTop!==null && scene.fromFrame<transition.atFrame+transition.durationInFrames && scene.fromFrame+scene.durationInFrames>transition.atFrame){
    layer=<div style={{position:"absolute",inset:0,clipPath:`inset(0px 0px ${FRAME.height-clipTop}px 0px)`}}>
      <div style={{position:"absolute",inset:0,transform:`translateY(${Math.round(contentShift)}px)`}}>{layer}</div>
    </div>;
  }
  return scene.chapter?<ChapterThemeProvider chapter={scene.chapter}>{layer}</ChapterThemeProvider>:<>{layer}</>;
};

export const PreparedEdit:React.FC<PreparedEditProps> = (props)=>{
  const frame=useCurrentFrame();
  const edit=React.useMemo(()=>props.edit?editManifestSchema.parse(props.edit):null,[props.edit]);
  const compiled=React.useMemo(()=>edit?compileEdit(edit):null,[edit]);

  const theme=useBrandTheme(edit?.style??"section-deck",edit?.brand??null);
  if(!edit || !props.plate || !compiled) return <SafeRoot {...props}><CanvasFill background="#142d3d"/>
    <div style={{position:"absolute",left:150,top:650,width:700,color:"white",fontSize:42}}>Prepare an edit manifest to preview footage, captions, scenes and sound.</div>
  </SafeRoot>;
  const probe=Boolean(props.probe);
  const plate=props.plate;
  const geometry=getSceneGeometry(edit.style,"split");
  const aspect=plate.height/plate.width;
  const state=footageFrameState(edit,frame,{aspect,canvasHeight:geometry.canvasHeight,probe});
  const seam=state.seam;
  const captionCenterFor=(layout:SceneLayoutName)=>layout==='presenter'?PRESENTER_CAPTION_CENTER:edit.footage?(layout==='split'?seam:PRESENTER_CAPTION_CENTER):getSceneGeometry(edit.style,layout).captionCenter;
  const pip=edit.footage?.pip;
  const active=edit.scenes.find(s=>frame>=s.fromFrame&&frame<s.fromFrame+s.durationInFrames);
  return <SafeRoot {...props}><ChapterThemeProvider chapter={edit.brand??null}><TypographyProvider fontFamily={edit.fontFamily??null}><PreparedPlateProvider plate={plate}><CreativeFonts>
    <CanvasFill background={theme.background}/>
    {                                                                                  }
    <ContinuousWindowPlate src={plate.src} geo={state.geo} sourceAspect={aspect} visible={footageVisibility(edit,frame,props.__editorSkipHiddenVideo!==false)}/>
    {edit.scenes.map((scene,index)=><Sequence key={scene.id} from={scene.fromFrame} durationInFrames={scene.durationInFrames}>
      <ScenePresentation edit={edit} index={index} geometry={state.geo} aspect={aspect} seam={seam} transition={state.transition}
        clipTop={state.clipTop} contentShift={state.contentShift} headBox={headBoxForScene(props.headGuide,scene.id)}/>
    </Sequence>)}
    {





                                                                                                 }
    {pip && active && pip.sceneIds.includes(active.id)?<PipPlate src={plate.src} win={{x:pip.x,y:pip.y,width:pip.width,height:pip.height,radius:pip.radius,plate:pip.plate}} muted/>:null}
    {state.transition?<>
      {state.lower>0?<div style={{position:"absolute",inset:0,opacity:state.lower}}><CaptionTrack edit={edit} compiled={compiled} center={captionCenterFor(state.transition.from)}/></div>:null}
      {state.upper>0?<div style={{position:"absolute",inset:0,opacity:state.upper}}><CaptionTrack edit={edit} compiled={compiled} center={captionCenterFor(state.transition.to)}/></div>:null}
    </>:<CaptionTrack edit={edit} compiled={compiled} center={captionCenterFor(state.layout)}/>}
    {(edit.transitions??[]).map((transition,index)=>{
      if(!isOverlayKind(transition.kind)) return null;
      const at=transition.atFrame/edit.source.fps,dur=transition.durationInFrames/edit.source.fps;
      switch(transition.kind){
        case 'leak':return <LightLeak key={index} at={at} dur={dur}/>;
        case 'bloom':return <FlashBloom key={index} at={at} decaySec={dur}/>;
        case 'burn':return <FilmBurn key={index} at={at} dur={dur}/>;
        default:return <Whiteout key={index} at={at} dur={dur}/>;
      }
    })}
  </CreativeFonts></PreparedPlateProvider></TypographyProvider></ChapterThemeProvider></SafeRoot>;
};
