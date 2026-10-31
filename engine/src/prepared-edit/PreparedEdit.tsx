import {getStyleCaption} from '../styles/themes';
import {CAPTION_DESIGNS} from '../styles/caption-designs';
import {staticCaptionsFor,clauseCaptionsFor,aliasPolicy,aliasFontOverride} from '../styles/style-compat.ts';
import {familyDesign} from '../styles/family-designs';
import {ArabicTypeSceneView} from '../arabic-type/scene';
import {FiguresSceneView} from '../creative-kit/figures/scene';
import {figuresSceneSchema} from '../creative-kit/figures/schema.ts';
import {ChatThreadSceneView} from '../creative-kit/chat-thread/scene';
import {chatThreadSceneSchema} from '../creative-kit/chat-thread/schema.ts';
import React from "react";
import {Sequence, useCurrentFrame, type CalculateMetadataFunction} from "remotion";
import {SafeRoot, CanvasFill, FRAME, useProbe, type SafeProps} from "../core/safe";
import {ContinuousWindowPlate,type WindowGeo} from "../core/plate";
import {TRANSITIONS} from './transition-registry';
import {PipPlate} from "../core/device";
import {fitToWidth, measure, safeWidthFor} from "../core/type";
import {EDITOR_FONT_ROLE} from "../core/editor-font-roles";
import {SceneCamera} from "../core/scene-camera";
import {CreativeFonts, getSceneGeometry} from "../creative-kit/primitives";
import {DigitsProvider} from "../creative-kit/digits";
import {displayDigitList, displayDigits} from "../core/digits.ts";
import {ChapterThemeProvider, TypographyProvider, useSceneTheme} from "../creative-kit/chapter-theme";
import {useBrandTheme} from "../creative-kit/brand-theme";
import {IntroScene, ProofScene, ProcessScene, ComparisonScene, CommentGateScene, FollowScene} from "../creative-kit/scenes";
import {editManifestSchema, type EditManifest, type EditScene} from "./schema.ts";
import {sceneDrawingWindows,drawingClock} from './drawing-timeline.ts';
import {mergeTheme} from '../core/chapters.ts';
import {TRANSITION_RULES,sceneCaptionOpacity} from './graphics-transitions.ts';
import {compileEdit} from "./timeline.ts";
import {fittingCaptionCue} from './caption-fit.ts';
import {isLegacyStyle} from '../styles/registry.ts';
import {layoutCaptionOpacity,footageFrameState,type LayoutTransition,type SceneLayoutName} from "./footage.ts";
import {CAPTION_STRETCH_TATWEELS,captionEmphasisInk,emphasisBySource,popScale,stretchCaptionAmount,stretchCaptionWord,underlineMetrics} from "./caption-emphasis.ts";
import {stretchRoom,stretchWidths} from '../creative-kit/kinetic-words-logic.ts';
import {stretchWord} from '../arabic/kashida.ts';
import {CaptionSkinWord,captionSkinPaint,spokenWordIndex} from './caption-skins';
import {entranceBox,hueCrossfadeFor,isOverlayKind,sceneEntrance} from "./graphics-transitions.ts";
import {preparedPlateList} from "./plates.ts";
import {getStaticFiles} from "@remotion/studio";
import proxyRegistry from "../../proxies.json";
import {resolvePreviewSource,type ProxyRegistry} from "../core/preview-source";
import {KineticSceneRenderer} from "../creative-kit/kinetic/scenes";
import {kineticSceneSchema} from "../creative-kit/kinetic/schema.ts";
import {footageVisibility,captionOverlayVisible,captionHiddenByScene,captionLoweredByScene} from "./visibility.ts";
import {headGuideSchema,headGuideIssues,headBoxForScene,type HeadGuide} from "./head-guide.ts";
import {PRESENTER_CAPTION_CENTER,type HeadBoxPx} from "../creative-kit/head-clear.ts";
import {librarySceneSchema} from '../motion-library/schema.ts';
import {LibrarySceneRenderer} from '../motion-library/scenes';
import {PreparedPlateProvider,ScreenRecordingScene} from '../screen-recording/ScreenRecordingScene';
import {screenRecordingSceneSchema} from '../screen-recording/schema.ts';
import {semanticSceneSchema} from '../creative-kit/semantic/schema.ts';
import {SemanticSceneRenderer} from '../creative-kit/semantic/scenes';
import {ProofScreenScene} from '../creative-kit/proof-screen/scene';
import {ProjectScene} from '../project-scenes/ProjectScene';
import {styleSceneSchema} from '../styles/scenes.ts';
import {StyleSceneRenderer} from '../styles/scene-renderers';
import {LookLayer} from '../looks/layer';
import {lookCaptionGuard} from '../looks/captions.ts';
import type {MouthTable} from '../styles/cartoon/scenes/math.ts';
export type {MouthTable};

export type PreparedEditProps = SafeProps & {
  edit:EditManifest|null;
  plate:{src:string;width:number;height:number}|null;
  plates?:string[];
  __editorPreview?:boolean;
  __editorSkipHiddenVideo?:boolean;
  __editorMediaSelection?:{source:string;selected:string;proxyRequested:boolean};

  headGuide?:HeadGuide;
  /** The cartoon mouth table (prepared/mouth.json); without it a cartoon mouth stays closed. */
  mouth?:MouthTable;
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

export const SceneLayer:React.FC<{scene:EditScene;sectionIndex?:number;style:EditManifest["style"];geometry:WindowGeo;aspect:number;seam:number;headBox?:HeadBoxPx|null;words?:ReturnType<typeof compileEdit>['words'];mouth?:MouthTable}> = ({scene,sectionIndex,style,geometry,aspect,seam,headBox=null,words=[],mouth})=>{
  const Design=familyDesign(style,scene.family);
  if(Design)return <Design sectionIndex={sectionIndex} scene={scene} style={style} geometry={geometry} aspect={aspect} seam={seam} headBox={headBox} words={words}/>;
  if(scene.family==='arabic-type')return <ArabicTypeSceneView scene={scene} style={style}/>;
  if(scene.family==='project-scene')return <ProjectScene component={scene.data.component} values={scene.data.values} style={style} layout={scene.layout} motion={scene.motion} durationInFrames={scene.durationInFrames} seam={seam} headBox={headBox}/>;
  const styled=styleSceneSchema.safeParse(scene);
  if(styled.success)return <StyleSceneRenderer scene={styled.data} style={style} words={words} mouth={mouth} geometry={geometry} aspect={aspect} headBox={headBox}/>;
  if(scene.family==='figures')return <FiguresSceneView scene={figuresSceneSchema.parse(scene)} style={style}/>;
  if(scene.family==='chat-thread')return <ChatThreadSceneView scene={chatThreadSceneSchema.parse(scene)} style={style}/>;
  const semantic=semanticSceneSchema.safeParse(scene);
  if(scene.family==='proof-screen')return <ProofScreenScene scene={scene} style={style}/>;
  if(semantic.success)return <SemanticSceneRenderer scene={semantic.data} style={style} words={words}/>;
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
  const baseTheme=useSceneTheme(edit.style);
  const digits=edit.digits??null;
  const skin=edit.captions.skin;
  const emphasis=React.useMemo(()=>emphasisBySource(edit.captions.emphasis),[edit.captions.emphasis]);
  if(!captionOverlayVisible(edit))return null;
  let cue=compiled.captionGroups.find(c=>frame>=c.fromFrame && frame<c.toFrame);
  if(!cue) return null;
  const scene=edit.scenes.find(s=>frame>=s.fromFrame && frame<s.fromFrame+s.durationInFrames);
  const theme=skin && scene?.chapter?mergeTheme(baseTheme,scene.chapter):baseTheme;
  if(scene?.family==='creator-cta' || captionHiddenByScene(scene))return null;
  const band=safeWidthFor(center-64,128,"organic",{inset:32});
  const modern=!isLegacyStyle(edit.style);
  const fontFamily=edit.fontFamily??aliasFontOverride(edit.style,edit.styleAlias);
  const role=fontFamily?{...EDITOR_FONT_ROLE.caption,fontFamily,fontWeight:700}
    :modern?{...EDITOR_FONT_ROLE.caption,fontFamily:theme.ar,fontWeight:800}:EDITOR_FONT_ROLE.caption;
  const reserveText=(text:string,sourceIndex:number)=>emphasis.get(sourceIndex)==='stretch'&&!staticCaptionsFor(edit.style,edit.styleAlias)?stretchWord(text,CAPTION_STRETCH_TATWEELS):text;
  if(fontFamily || cue.words.some(word=>reserveText(word.text,word.sourceIndex)!==word.text)){
    const original=new Map(cue.words.map(word=>[word.sourceIndex,word]));
    const reservedCue={...cue,words:cue.words.map(word=>({...word,text:reserveText(word.text,word.sourceIndex)}))};
    const fitted=fittingCaptionCue(reservedCue,frame,text=>fitToWidth(displayDigits(text,digits),{fontFamily:role.fontFamily,fontWeight:role.fontWeight,fontSize:30},band.width-60,{min:30,max:30}).fits);
    cue={...fitted,words:fitted.words.map(word=>original.get(word.sourceIndex)!)};
  }
  const captionDesign=getStyleCaption(edit.style)?.design;
  const CaptionDesign=captionDesign?CAPTION_DESIGNS[captionDesign]:undefined;
  if(CaptionDesign && !skin)return <CaptionDesign text={displayDigitList(cue.words.map(w=>w.text.trim()),digits).join(' ')} scene={scene} center={center}/>;
  const text=cue.words.map(w=>w.text.trim()).join(" ");
  // What is drawn: the same words with the chosen digits. The reading side below still follows the recorded words.
  const shown=displayDigitList(cue.words.map(w=>w.text.trim()),digits);
  const reserved=shown.map((text,index)=>reserveText(text,cue.words[index].sourceIndex));
  const fit=fitToWidth(reserved.join(" "),{fontFamily:role.fontFamily,fontWeight:role.fontWeight,fontSize:50},band.width-60,{min:30,max:50});
  if(!fit.fits) throw new Error(`Caption does not fit safely: ${text}`);
  // The cue is chunked and sized with the longest form of every stretching word (above), so neither changes while a word stretches.
  // Inside that cue a stretching word takes the room of its current width, measured at every whole count of tatweels and linear between
  // counts, so the words around it glide apart and back and nothing steps. The caption is centred: both sides move by half the growth.
  // The probe keeps the widest box; a word with no legal slot never grows and keeps the plain box it always had.
  const rooms=cue.words.map((word,index)=>{
    if(probe!==null || emphasis.get(word.sourceIndex)!=='stretch' || staticCaptionsFor(edit.style,edit.styleAlias))return null;
    const widths=stretchWidths(shown[index],form=>measure(form,{fontFamily:role.fontFamily,fontWeight:role.fontWeight,fontSize:fit.fontSize}).width,CAPTION_STRETCH_TATWEELS);
    if(!(widths[widths.length-1]>widths[0]))return null;
    return {widest:widths[widths.length-1],room:stretchRoom(widths,stretchCaptionAmount(frame,word.fromFrame,word.toFrame,edit.source.fps,false))};
  });
  const spare=rooms.reduce((sum,room)=>room===null?sum:sum+room.widest-room.room,0);
  const height=Math.ceil(fit.fontSize*role.lineHeight)+22;
  const width=Math.min(band.width,Math.ceil(fit.width-spare)+60);
  const clauseCaption=edit.captions.grouping===undefined?clauseCaptionsFor(edit.style,edit.styleAlias):edit.captions.grouping==='clauses';
  const enter=clauseCaption?1:Math.min(1,(frame-cue.fromFrame+1)/4);


  const themed=modern||edit.brand!==undefined;
  const presentation=edit.captions.presentation??aliasPolicy(edit.style,edit.styleAlias)?.captionsPresentation??'pill';
  const paint=skin?captionSkinPaint(skin,theme.accent,scene && scene.layout!=='presenter'?theme.background:undefined,Boolean(CaptionDesign)):null;
  const plainBackground=paint?.background??(presentation==='minimal'?'transparent':presentation==='ink-strip'?'#102027':themed?theme.pill:'#ffffff');
  // Under a look, a caption with no backing of its own gets a chip in the look's colours (looks/captions.ts), so it never sits on filtered pixels.
  // A skin keeps its spoken-word highlight on that chip, drawn in the chip's two colours; its own shadows and outlines give way to the chip.
  const guard=lookCaptionGuard(edit.look,plainBackground);
  const background=guard?.background??plainBackground;
  const wordColor=guard?.wordColor??paint?.color??(presentation==='pill'?(themed?theme.pillText:'#102c35'):'#ffffff');
  const ink=(guard?null:paint?.ink)??(emphasis.size?captionEmphasisInk({accent:theme.accent,accentInk:theme.accentInk,pill:guard?background:presentation==='minimal'?'#102027':background}):wordColor);
  const underline=underlineMetrics(fit.fontSize);
  const spoken=spokenWordIndex(cue.words,frame);
  return <div data-caption-skin={skin} style={{position:"absolute",left:Math.round(band.left+(band.width-width)/2),top:Math.round(center-height/2),
    width,height,borderRadius:presentation==='ink-strip'?3:modern?9:18,background,color:wordColor,display:"flex",alignItems:"center",justifyContent:"center",
    opacity:enter,transform:`translateY(${Math.round((1-enter)*6)}px)`,boxShadow:presentation==='minimal'&&!guard?'none':'0 3px 15px #00000020',
    textShadow:presentation==='minimal'&&!guard?'0 2px 4px #000, 1px 0 #000, -1px 0 #000, 0 -1px #000':undefined,...(guard?null:paint?.style)}}>
    <div dir={/[؀-ۿ]/.test(text)?'rtl':'ltr'} style={{...fit.style,fontSynthesis:role.fontSynthesis,lineHeight:String(role.lineHeight),whiteSpace:"pre",textAlign:"center"}}>
      {cue.words.map((word,index)=>{
        const kind=emphasis.get(word.sourceIndex);
        const style:React.CSSProperties=kind===undefined?{color:skin==='karaoke'?'inherit':wordColor}
          :kind==='underline'?{color:wordColor,textDecorationLine:'underline',textDecorationColor:ink,textDecorationThickness:underline.thickness,textUnderlineOffset:underline.offset,textDecorationSkipInk:'none'}
          :kind==='pop'?{color:ink,display:'inline-block',transform:`scale(${popScale(frame,word.fromFrame,probe!==null)})`,transformOrigin:'50% 60%'}
          :{color:ink};
        const stretching=kind==='stretch'&&!staticCaptionsFor(edit.style,edit.styleAlias);
        const label=stretching?stretchCaptionWord(shown[index],frame,word.fromFrame,word.toFrame,edit.source.fps,probe!==null):shown[index];
        const room=rooms[index];
        const content=!stretching?label
          :room!==null?<span style={{display:'inline-flex',justifyContent:'center',verticalAlign:'baseline',width:Math.round(room.room*100)/100}}>{label}</span>
          :<span style={{display:'inline-grid',verticalAlign:'baseline'}}><span aria-hidden="true" style={{gridArea:'1 / 1',visibility:'hidden'}}>{reserved[index]}</span><span style={{gridArea:'1 / 1',textAlign:'center'}}>{label}</span></span>;
        const node=<span style={style}>{content}</span>;
        return <React.Fragment key={word.sourceIndex}>{index>0?" ":null}{skin?<CaptionSkinWord skin={skin} active={index===spoken} sourceIndex={word.sourceIndex} probe={probe!==null} chip={guard}>{node}</CaptionSkinWord>:node}</React.Fragment>;
      })}
    </div>
  </div>;
};







// Confine scene and transition z-indices below speech, including when LookLayer is a pass-through.
const PictureStack:React.FC<{children:React.ReactNode}>=({children})=>
  <div data-drawing-picture="" style={{position:'absolute',inset:0,isolation:'isolate'}}>{children}</div>;

const ScenePresentation:React.FC<{edit:EditManifest;index:number;sectionIndex?:number;geometry:WindowGeo;aspect:number;seam:number;
  transition:LayoutTransition|null;clipTop:number|null;contentShift:number;headBox:HeadBoxPx|null;words:ReturnType<typeof compileEdit>['words'];mouth?:MouthTable;lead?:number;outgoing?:React.ReactNode;outgoingProps?:Partial<import('./transition-registry').TransitionProps>;drawingTransition?:NonNullable<EditManifest['transitions']>[number];cameraFrame?:number;raw?:boolean}> = ({edit,index,sectionIndex,geometry,aspect,seam,transition,clipTop,contentShift,headBox,words,mouth,lead=0,outgoing,outgoingProps,drawingTransition,cameraFrame,raw=false})=>{
  const scene=edit.scenes[index];
  const entrance=raw?null:drawingTransition && TRANSITION_RULES[drawingTransition.kind].needsOutgoing?drawingTransition:sceneEntrance(edit.transitions,scene);
  const hue=hueCrossfadeFor(edit.transitions,edit.scenes,index);
  let layer:React.ReactNode=<SceneLayer sectionIndex={sectionIndex} scene={scene} style={edit.style} geometry={geometry} aspect={aspect} seam={seam} headBox={headBox} words={words} mouth={mouth}/>;
  // The scene's own camera move wraps the layer itself, so entrances and transitions below carry the moving scene.
  // In a split scene it moves the graphics panel only: clipped at the seam, so nothing reaches the presenter window below.
  if(scene.camera)layer=<SceneCamera camera={scene.camera} sceneId={scene.id} durationInFrames={scene.durationInFrames} frameOverride={cameraFrame} area={scene.layout==='split'?entranceBox('split',seam):undefined}>{layer}</SceneCamera>;
  if(entrance){
    const Component=TRANSITIONS[entrance.kind].Component;
    layer=<Component {...entrance} atFrame={lead} fps={edit.source.fps} box={TRANSITION_RULES[entrance.kind].fullFrame?entranceBox('takeover',seam):entranceBox(scene.layout,seam)} outgoing={outgoing} {...outgoingProps} timingManaged>{layer}</Component>;
  }
  if(hue){
    const height=scene.layout==='split'?seam:undefined;
    const Component=TRANSITIONS['hue-crossfade'].Component;
    layer=<Component {...hue} atFrame={0} fps={edit.source.fps} height={height}>{layer}</Component>;
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
  // The probe measures nominal scene coverage, not the retained leaf of a page turn.
  const drawingWindows=React.useMemo(()=>edit?sceneDrawingWindows(edit.scenes,props.probe?(edit.transitions??[]).filter(t=>t.kind!=='magazine-flip'):edit.transitions):[],[edit,props.probe]);
  const sectionIndices=React.useMemo(()=>{
    let sectionIndex=0;
    return edit?.scenes.map(scene=>scene.layout==='takeover'?++sectionIndex:undefined)??[];
  },[edit]);

  const theme=useBrandTheme(edit?.style??"section-deck",edit?.brand??null);
  if(!edit || !props.plate || !compiled) return <SafeRoot {...props}><CanvasFill background="#142d3d"/>
    <div style={{position:"absolute",left:150,top:650,width:700,color:"white",fontSize:42}}>Prepare an edit manifest to preview footage, captions, scenes and sound.</div>
  </SafeRoot>;
  const probe=Boolean(props.probe);
  const plate=props.plate;
  const geometry=getSceneGeometry(edit.style,"split");
  const aspect=plate.height/plate.width;
  const handoverIndex=probe?-1:drawingWindows.findIndex((window,index)=>{
    const t=window.incoming;
    return index>0 && t && TRANSITIONS[t.kind].pictureMasks && frame>=window.renderFromFrame && frame<t.atFrame+(TRANSITION_RULES[t.kind].centred?Math.ceil(t.durationInFrames/2):t.durationInFrames);
  });
  const handover=handoverIndex>=0?drawingWindows[handoverIndex].incoming:undefined;
  const outgoingScene=handover?edit.scenes[handoverIndex-1]:undefined;
  // A takeover has no footage to retain. Reveal the incoming split window beneath its turning sheet.
  const incomingWindow=Boolean(handover && outgoingScene?.layout==='takeover' && edit.scenes[handoverIndex].layout==='split');
  const layoutFrame=handover?(incomingWindow?Math.max(frame,handover.atFrame):Math.min(frame,handover.atFrame-1)):frame;
  const nominalState=footageFrameState(edit,frame,{aspect,canvasHeight:geometry.canvasHeight,probe});
  const state=handover?footageFrameState(edit,frame,{aspect,canvasHeight:geometry.canvasHeight,probe,layoutFrame}):nominalState;
  const seam=state.seam;
  const active=edit.scenes.find(s=>frame>=s.fromFrame&&frame<s.fromFrame+s.durationInFrames);
  const captionCenterFor=(layout:SceneLayoutName,scene=active)=>layout==='presenter'?PRESENTER_CAPTION_CENTER:layout==='takeover'&&getStyleCaption(edit.style)?getStyleCaption(edit.style)!.takeoverCenter:edit.footage?(layout==='split'?seam:PRESENTER_CAPTION_CENTER):layout==='takeover'&&captionLoweredByScene(scene)?PRESENTER_CAPTION_CENTER:getSceneGeometry(edit.style,layout).captionCenter;
  const captionOpacity=getStyleCaption(edit.style)?.hideDuringTransitions?Math.min(layoutCaptionOpacity(edit.layoutTransitions,frame),edit.presenter===false?1:sceneCaptionOpacity(edit.transitions,edit.scenes,frame)):1;
  const usesPictureMasks=(edit.transitions??[]).some(t=>TRANSITIONS[t.kind].pictureMasks);
  const pip=edit.footage?.pip;
  return <SafeRoot {...props}><ChapterThemeProvider chapter={edit.brand??null}><TypographyProvider fontFamily={edit.fontFamily??aliasFontOverride(edit.style,edit.styleAlias)??null}><DigitsProvider digits={edit.digits??null}><PreparedPlateProvider plate={plate}><CreativeFonts>
    <PictureStack><LookLayer look={edit.look}>
    <CanvasFill background={theme.background}/>
    {                                                                                  }
    {usesPictureMasks?<div data-drawing-plate={incomingWindow?'split':outgoingScene?.layout} style={{position:'absolute',inset:0}}><ContinuousWindowPlate src={plate.src} geo={state.geo} sourceAspect={aspect} visible={footageVisibility(edit,layoutFrame,props.__editorSkipHiddenVideo!==false)}/></div>
      :<ContinuousWindowPlate src={plate.src} geo={state.geo} sourceAspect={aspect} visible={footageVisibility(edit,frame,props.__editorSkipHiddenVideo!==false)}/>}
    {edit.scenes.map((scene,index)=>{
      const window=drawingWindows[index];
      if(window.renderEndFrame<=window.renderFromFrame)return null;
      const incoming=window.incoming, policy=incoming && TRANSITIONS[incoming.kind];
      const previous=edit.scenes[index-1], previousWindow=drawingWindows[index-1];
      let outgoing:React.ReactNode, outgoingProps:Partial<import('./transition-registry').TransitionProps>|undefined;
      const outgoingEnd=incoming?incoming.atFrame+(policy?.centred?Math.ceil(incoming.durationInFrames/2):incoming.durationInFrames):0;
      if(policy?.needsOutgoing && previous && frame<outgoingEnd){
        const clock=drawingClock(previous,previousWindow.lead,frame,policy.freezeOutgoing);
        const heldFrame=policy.freezeOutgoing?Math.min(frame,scene.fromFrame-1):frame;
        const held=footageFrameState(edit,heldFrame,{aspect,canvasHeight:geometry.canvasHeight,probe,layoutFrame:Math.min(heldFrame,scene.fromFrame-1)});
        const previousHead=headBoxForScene(props.headGuide,previous.id);
        outgoing=<Sequence from={frame-window.renderFromFrame-clock.graphics} layout="none"><ScenePresentation raw edit={edit} index={index-1} sectionIndex={sectionIndices[index-1]} geometry={held.geo} aspect={aspect} seam={held.seam} transition={held.transition} clipTop={held.clipTop} contentShift={held.contentShift} headBox={previousHead} words={compiled.words} mouth={props.mouth} cameraFrame={clock.camera}/></Sequence>;
        outgoingProps=policy.outgoingProps?.({scene:previous,style:edit.style,sectionIndex:sectionIndices[index-1],geometry:held.geo,aspect,seam:held.seam,headBox:previousHead,words:compiled.words,font:edit.fontFamily});
      }
      // During pre-roll the outgoing layer is above the incoming layer. At the nominal cut
      // entrance drawings take over; retained tails remain behind them.
      const overlap=Boolean(window.incoming || window.outgoing);
      return <Sequence key={scene.id} from={window.renderFromFrame} durationInFrames={window.renderEndFrame-window.renderFromFrame} style={overlap?{zIndex:frame<scene.fromFrame?1:index+2,clipPath:frame<scene.fromFrame && !policy?.pictureMasks?(state.layout==='presenter'?'inset(0 0 100% 0)':state.layout==='split'?`inset(0px 0px ${FRAME.height-seam}px 0px)`:undefined):undefined}:undefined}>
        <ScenePresentation edit={edit} index={index} sectionIndex={sectionIndices[index]} geometry={index===handoverIndex?nominalState.geo:state.geo} aspect={aspect} seam={seam} transition={state.transition} words={compiled.words}
          lead={window.lead} outgoing={outgoing} outgoingProps={outgoingProps} drawingTransition={incoming} cameraFrame={overlap?drawingClock(scene,window.lead,frame).camera:undefined}
          clipTop={state.clipTop} contentShift={state.contentShift} headBox={headBoxForScene(props.headGuide,scene.id)} mouth={props.mouth}/>
      </Sequence>;
    })}
    {





                                                                                                 }
    {pip && active && pip.sceneIds.includes(active.id)?<PipPlate src={plate.src} win={{x:pip.x,y:pip.y,width:pip.width,height:pip.height,radius:pip.radius,plate:pip.plate}} muted/>:null}
    </LookLayer>
    {(edit.transitions??[]).map((transition,index)=>{
      if(!isOverlayKind(transition.kind) || TRANSITION_RULES[transition.kind].needsOutgoing) return null;
      const Component=TRANSITIONS[transition.kind].Component;
      return <Component key={index} {...transition} fps={edit.source.fps} paper={theme.background} ink={theme.accent}/>;
    })}
    </PictureStack>
    {/* Speech follows the manifest cut, independently of picture masks, retained layouts and overlays. */}
    <div data-caption-layer="" style={{position:'absolute',inset:0,isolation:'isolate',pointerEvents:'none'}}>
      {captionOpacity===0?null:captionOpacity<1?<div data-layout-caption-fade="" style={{opacity:captionOpacity}}><CaptionTrack edit={edit} compiled={compiled} center={captionCenterFor(nominalState.layout)}/></div>:<CaptionTrack edit={edit} compiled={compiled} center={captionCenterFor(nominalState.layout)}/>}
    </div>
  </CreativeFonts></PreparedPlateProvider></DigitsProvider></TypographyProvider></ChapterThemeProvider></SafeRoot>;
};
