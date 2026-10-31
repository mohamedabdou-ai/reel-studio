import {STYLE_ALIASES} from '../styles/registry.ts';
import {STYLE_ALIAS_IDS, normalizeManifestStyle} from '../styles/style-compat.ts';
import {arabicTypeSceneVariants} from '../arabic-type/schema.ts';
import {validateArabicTypeTiming} from '../arabic-type/timing.ts';
import {figuresSceneVariants,figuresSceneSchema} from '../creative-kit/figures/schema.ts';
import {validateFiguresTiming} from '../creative-kit/figures/timing.ts';
import {chatThreadSceneVariants,chatThreadSceneSchema} from '../creative-kit/chat-thread/schema.ts';
import {validateChatThreadTiming} from '../creative-kit/chat-thread/timing.ts';
import {z} from "zod";
import {creatorSchema} from "./creator.ts";
import {introSchema, proofSchema, processSchema, comparisonSchema, commentSchema, followSchema, styleSchema} from "../creative-kit/schema.ts";
import {kineticSceneVariants,kineticSceneSchema,validateKineticTiming} from "../creative-kit/kinetic/schema.ts";
import {foregroundSourceFrame} from "./visibility.ts";
import {librarySceneVariants,librarySceneSchema,validateLibraryTiming} from '../motion-library/schema.ts';
import {screenRecordingVariants,screenRecordingSceneSchema,screenRecordingIssues} from '../screen-recording/schema.ts';
import {semanticSceneVariants,semanticSceneSchema,validateSemanticTiming} from '../creative-kit/semantic/schema.ts';
import {styleSceneVariants,styleSceneSchema,validateStyleSceneTiming,validateStyleSceneWords,styleSceneSequenceIssues} from '../styles/scenes.ts';
import {ownSceneStyle, familySupported} from '../styles/registry.ts';
import {validateChapter,describeIssues,contrastRatio,relativeLuminance,mixToHex,CHAPTER_MIN_CONTRAST} from '../core/chapters.ts';
import {pipAllowed,PIP_REACH} from '../core/pip.ts';
import {TRANSITION_KINDS,TRANSITION_DIRS,graphicsTransitionIssues,isCentredKind} from './graphics-transitions.ts';
import {MASK_SHAPES} from '../core/mask-geo.ts';
import {brollIssues} from './broll.ts';
import {LAYOUT_TRANSITION_MIN_FRAMES,layoutTransitionIssues} from './footage.ts';
import {CAPTION_EMPHASIS_KINDS,captionEmphasisIssues} from './caption-emphasis.ts';
import {compileEdit} from './timeline.ts';
import {projectSceneVariant,projectScenesMetadataSchema,projectSceneIssues} from '../project-scenes/schema.ts';
import {SCENE_CAMERA_MOVES,SCENE_CAMERA_STRENGTHS,sceneCameraIssues} from '../core/camera.ts';
import {proofScreenSceneVariants,proofScreenSceneSchema} from '../creative-kit/proof-screen/schema.ts';
import {validateProofScreenTiming} from '../creative-kit/proof-screen/timing.ts';
import {composeSceneVariants,composeSceneSchema} from '../creative-kit/compose/schema.ts';
import {validateComposeTiming} from '../creative-kit/compose/timing.ts';
import {validateComposeBudget} from '../creative-kit/compose/budget.ts';
import {lookSchema} from '../looks/index.ts';

const frame = z.number().int().min(0).max(4320000);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const coord = z.number().finite();
const sceneBase = z.object({
  id:slug, fromFrame:frame, durationInFrames:frame.min(1),
  layout:z.enum(["split","takeover"]), motion:z.enum(["land","stagger","quiet"]),
});





export const chapterSchema = z.object({ground:hex,accent:hex,ink:hex,onAccent:hex}).strict().superRefine((chapter,ctx)=>{
  const check=validateChapter(chapter);
  if(!check.ok){ctx.addIssue({code:"custom",message:`Chapter palette fails contrast: ${describeIssues(check.issues)}`});return;}
  const light=relativeLuminance(chapter.ground)>=relativeLuminance(chapter.ink);
  const card=mixToHex(chapter.ground,"#FFFFFF",light?0.6:0.07);
  const extra:string[]=[];
  const inkAccent=contrastRatio(chapter.ink,chapter.accent);
  if(inkAccent<CHAPTER_MIN_CONTRAST)extra.push(`ink/accent ${Math.round(inkAccent*100)/100}:1 < ${CHAPTER_MIN_CONTRAST}:1`);
  const inkCard=contrastRatio(chapter.ink,card);
  if(inkCard<CHAPTER_MIN_CONTRAST)extra.push(`ink/card ${Math.round(inkCard*100)/100}:1 < ${CHAPTER_MIN_CONTRAST}:1`);
  if(extra.length)ctx.addIssue({code:"custom",message:`Chapter palette fails contrast: ${extra.join('; ')} (useSceneTheme also paints text on accent and on the derived card)`});
});
const sceneUnion = z.discriminatedUnion("family",[
  sceneBase.extend({family:z.literal("intro"),data:introSchema}),
  sceneBase.extend({family:z.literal("proof"),data:proofSchema}),
  sceneBase.extend({family:z.literal("process"),data:processSchema}),
  sceneBase.extend({family:z.literal("comparison"),data:comparisonSchema}),
  sceneBase.extend({family:z.literal("comment"),data:commentSchema}),
  sceneBase.extend({family:z.literal("follow"),data:followSchema}),
  ...kineticSceneVariants,
  ...librarySceneVariants,
  ...screenRecordingVariants,
  ...semanticSceneVariants,
  ...arabicTypeSceneVariants,
  ...figuresSceneVariants,
  ...chatThreadSceneVariants,
  ...styleSceneVariants,
  ...proofScreenSceneVariants,
  ...composeSceneVariants,
  projectSceneVariant,
]);

// A camera move for a takeover scene (the whole frame) or a split scene (its graphics panel above the seam, clipped there); `at` is the scene frame a snap-zoom lands on. Presenter plates keep the camera[] track.
export const sceneCameraSchema = z.object({move:z.enum(SCENE_CAMERA_MOVES),strength:z.enum(SCENE_CAMERA_STRENGTHS).optional(),at:frame.optional()}).strict();
export const editSceneSchema = z.intersection(sceneUnion,z.object({chapter:chapterSchema.optional(),camera:sceneCameraSchema.optional()}));
const windowGeometry=z.object({windowTop:frame.max(1920),windowHeight:frame.min(1).max(1920),videoWidth:z.number().int().min(1).max(4000),videoLeft:z.number().int().min(-4000).max(1920),videoTop:z.number().int().min(-8000).max(1920)}).strict();



export const footagePipSchema = z.object({
  x:coord.min(0).max(1080), y:coord.min(0).max(1920), width:coord.min(120).max(1080), height:coord.min(120).max(1920), radius:coord.min(0).max(960),
  plate:z.object({left:coord.min(-16000).max(0),top:coord.min(-16000).max(0),width:coord.min(1).max(16000),height:coord.min(1).max(16000)}).strict(),
  sceneIds:z.array(slug).min(1).max(300),
}).strict();
export const cameraKeySchema = z.object({
  atFrame:frame, scale:z.number().min(1).max(1.3),
  focusX:z.number().min(0).max(1), focusY:z.number().min(0).max(1),

  ease:z.enum(["smooth","bezierCam"]).optional(),
}).strict();
export const transitionSchema = z.object({atFrame:frame,durationInFrames:frame.min(1).max(120),
  kind:z.enum(TRANSITION_KINDS).default('whiteout'),dir:z.enum(TRANSITION_DIRS).optional(),shape:z.enum(MASK_SHAPES).optional(),
  origin:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).strict().optional()}).strict();
export const layoutTransitionSchema = z.object({atFrame:frame,durationInFrames:z.number().int().min(LAYOUT_TRANSITION_MIN_FRAMES).max(120),
  kind:z.enum(['curtain','window-morph']),from:z.enum(['presenter','split']),to:z.enum(['presenter','split'])}).strict();



export const captionEmphasisSchema = z.object({sourceIndex:z.number().int().min(0).max(19999),kind:z.enum(CAPTION_EMPHASIS_KINDS)}).strict();



const CAPTION_BAND_HALF=64;
import {FONT_CHOICES, CAPTION_GROUPING, CAPTION_PRESENTATION, CAPTION_SKINS, WRITING_STYLES, DIGIT_CHOICES} from '../core/preference-options.ts';
const manifestSchema = z.object({
  version:z.literal(1), id:slug, purpose:z.enum(["test","delivery"]),
  contentMode:z.literal('graphics').optional(),
  projectScenes:projectScenesMetadataSchema.optional(),
  style:styleSchema,
  styleAlias:z.enum(STYLE_ALIAS_IDS).optional(),
  fontFamily:z.enum(FONT_CHOICES).optional(),
  digits:z.enum(DIGIT_CHOICES).optional(),
  writingStyle:z.enum(WRITING_STYLES).optional(),
  look:lookSchema.optional(),
  creator:creatorSchema.optional(),
  brand:chapterSchema.optional(),
  source:z.object({
    path:z.string().min(1).max(2000), sha256:z.string().regex(/^[a-f0-9]{64}$/),
    fps:z.number().finite().min(1).max(120), width:z.number().int().min(2).max(16384),
    height:z.number().int().min(2).max(16384), totalFrames:frame.min(1),
  }).strict(),
  segments:z.array(z.object({fromFrame:frame,toFrame:frame.min(1)}).strict()).min(1).max(300),
  captions:z.object({
    visible:z.boolean().optional(),
    status:z.enum(["draft","reviewed"]), reviewer:z.string().min(1).max(200).optional(),
    mode:z.enum(["words","phrases"]).optional(),
    grouping:z.enum(CAPTION_GROUPING).optional(),
    presentation:z.enum(CAPTION_PRESENTATION).optional(),
    skin:z.enum(CAPTION_SKINS).optional(),
    words:z.array(z.object({
      text:z.string().min(1).max(200).regex(/\S/), startMs:z.number().finite().min(0),
      endMs:z.number().finite().min(0), confidence:z.number().min(0).max(1).nullable(),
    }).strict()).max(20000),
    emphasis:z.array(captionEmphasisSchema).max(2000).optional(),
  }).strict(),
  scenes:z.array(editSceneSchema).max(300),
  sounds:z.array(z.object({atFrame:frame,recipe:slug,gain:z.number().min(0).max(2)}).strict()).max(300),
  camera:z.array(cameraKeySchema).max(10000),
  signoffFromFrame:frame.optional(),
  presenter:z.literal(false).optional(),
  footage:z.object({defaultLayout:z.enum(['presenter','split']).default('split'),full:windowGeometry,split:windowGeometry,pip:footagePipSchema.optional()}).strict().optional(),
  transitions:z.array(transitionSchema).max(300).optional(),
  layoutTransitions:z.array(layoutTransitionSchema).max(100).optional(),
}).strict().superRefine((m,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if(m.styleAlias && STYLE_ALIASES[m.styleAlias]!==m.style)issue('styleAlias must resolve to the manifest style. Remove it when choosing another style.');
  for(const message of projectSceneIssues(m))issue(message);
  let last=0,total=0;
  for(const s of m.segments){
    if(s.fromFrame<last || s.toFrame<=s.fromFrame || s.toFrame>m.source.totalFrames) issue("Source ranges must be ordered, disjoint and inside the source.");
    last=s.toFrame; total+=s.toFrame-s.fromFrame;
  }
  if(total/m.source.fps>600) issue("Prepared edits support up to 10 minutes.");
  if(m.contentMode==='graphics'){
    if(m.presenter!==false)issue('Graphics mode requires presenter:false');
    if(m.captions.status!=='reviewed' || !m.captions.reviewer?.trim())issue('Graphics mode requires reviewed copy and its reviewer');
    if(m.captions.words.length)issue('Graphics mode must not fabricate a caption transcript');
    if(m.footage || m.camera.length || m.layoutTransitions?.length)issue('Graphics mode cannot carry presenter framing or camera tracks');
    let cursor=0;
    for(const scene of m.scenes){
      if(scene.layout!=='takeover' || scene.fromFrame!==cursor)issue('Graphics takeover scenes must cover the complete timeline without gaps');
      cursor=scene.fromFrame+scene.durationInFrames;
    }
    if(cursor!==total)issue('Graphics takeover scenes must cover the complete timeline without gaps');
  }
  last=0; const ids=new Set<string>();
  for(const s of m.scenes){
    if(!familySupported(m.style,s.family))issue(`Style ${m.style} does not support family ${s.family}.`);
    if(ids.has(s.id)) issue("Scene IDs must be unique."); ids.add(s.id);
    if(s.fromFrame<last || s.fromFrame+s.durationInFrames>total) issue("Visual scenes must be ordered, disjoint and inside the edit.");
    last=s.fromFrame+s.durationInFrames;
    for(const message of sceneCameraIssues(s))issue(message);
    if(s.family==='arabic-type')for(const message of validateArabicTypeTiming(s,m.source.fps))issue(message);
    const figures=figuresSceneSchema.safeParse(s);
    if(figures.success)for(const message of validateFiguresTiming(figures.data,m.source.fps))issue(message);
    const chatThread=chatThreadSceneSchema.safeParse(s);
    if(chatThread.success)for(const message of validateChatThreadTiming(chatThread.data,m.source.fps))issue(message);
    const proofScreen=proofScreenSceneSchema.safeParse(s);
    if(proofScreen.success)for(const message of validateProofScreenTiming(proofScreen.data,m.source.fps))issue(message);
    const compose=composeSceneSchema.safeParse(s);
    if(compose.success){
      let words:ReturnType<typeof compileEdit>['words']|null=null;
      if(compose.data.data.parts.some(part=>'word' in part.at)){try{words=compileEdit(m as EditManifest).words;}catch{words=null;}}
      for(const message of validateComposeTiming(compose.data,m.source.fps,words))issue(message);
      for(const message of validateComposeBudget(compose.data,m.style))issue(message);
    }
    const semantic=semanticSceneSchema.safeParse(s);
    if(semantic.success){
      for(const message of validateSemanticTiming(semantic.data,m.source.fps))issue(message);
      if(semantic.data.family==='kinetic-text'){
        let compiled:ReturnType<typeof compileEdit>|undefined;
        try{compiled=compileEdit(m as EditManifest);}
        catch(error){ctx.addIssue({code:'custom',path:['captions','words'],message:`Caption timing needs review: ${error instanceof Error?error.message:'Could not map the word timestamps to video frames.'}`});}
        if(compiled){
          const mapped=compiled.words,indices=semantic.data.data.sourceIndices;
          for(const index of indices){
            const word=mapped.find(item=>item.sourceIndex===index);
            if(!word || word.fromFrame<s.fromFrame || word.toFrame>s.fromFrame+s.durationInFrames)issue(`${s.id}: selected recorded words must survive the cuts and stay inside the scene`);
          }
          if(compiled.issues.some(problem=>indices.includes(problem.wordIndex)))issue(`${s.id}: selected recorded words cannot intersect a cut boundary`);
        }
      }
      if(semantic.data.family==='chapter-quote' && semantic.data.data.cover && m.style!=='magazine-interview')issue(`${s.id}: magazine cover is available only in magazine-interview`);
    }
    const styled=styleSceneSchema.safeParse(s);
    if(styled.success){
      for(const message of validateStyleSceneTiming(styled.data,m.source.fps))issue(message);
      const owner=ownSceneStyle(styled.data.family);
      if(owner!==undefined && owner!==m.style)issue(`${s.id}: ${styled.data.family} scenes are available only in ${owner}`);
      if(styled.data.family==='cartoon' || styled.data.family==='cartoon-ending'){
        // Cartoon times are word anchors: the scene's sentences, cards and counter must resolve on the compiled words.
        let compiled:ReturnType<typeof compileEdit>|undefined;
        try{compiled=compileEdit(m as EditManifest);}catch{compiled=undefined;}
        if(compiled)for(const message of validateStyleSceneWords(styled.data,compiled.words,m.source.fps))issue(message);
      }
    }
    const library=librarySceneSchema.safeParse(s);
    if(library.success)for(const message of validateLibraryTiming(library.data))issue(message);
    const screen=screenRecordingSceneSchema.safeParse(s);
    if(screen.success){
      for(const message of screenRecordingIssues(screen.data,m.source))issue(message);
      if(m.presenter!==false)issue(`${s.id}: screen-recording scenes need a screen-only source (brief sourceKind "screen"); use screen-focus for a separate capture inside a presenter video.`);
    }
    const kinetic=kineticSceneSchema.safeParse(s);
    if(kinetic.success){
      for(const message of validateKineticTiming(kinetic.data))issue(message);
      if(kinetic.data.family==='kinetic-hook' && kinetic.data.data.foreground){
        const foreground=kinetic.data.data.foreground;
        if(s.fromFrame+s.durationInFrames<=total){
          const expected=foregroundSourceFrame(m,s.fromFrame);
          const lastSource=foregroundSourceFrame(m,s.fromFrame+s.durationInFrames-1);
          if(foreground.sourceSha256!==m.source.sha256 || foreground.sourceFromFrame+foreground.trimBeforeFrame!==expected || lastSource!==expected+s.durationInFrames-1)issue('Foreground must match the same continuous source frames as the presenter.');
        }
      }
    }
    if(styled.success && styled.data.family==='layered-speaker' && styled.data.data.foreground){
      // A layered-speaker matte follows the presenter's source frames exactly, like the kinetic hook's.
      const foreground=styled.data.data.foreground;
      if(s.fromFrame+s.durationInFrames<=total){
        const expected=foregroundSourceFrame(m,s.fromFrame);
        const lastSource=foregroundSourceFrame(m,s.fromFrame+s.durationInFrames-1);
        if(foreground.sourceSha256!==m.source.sha256 || foreground.sourceFromFrame+foreground.trimBeforeFrame!==expected || lastSource!==expected+s.durationInFrames-1)issue('Foreground must match the same continuous source frames as the presenter.');
      }
    }
  }
  for(const message of styleSceneSequenceIssues(m.scenes))issue(message);
  if(m.signoffFromFrame!==undefined && m.signoffFromFrame>=total) issue("Signoff must start inside the edit.");
  for(const s of m.sounds) if(s.atFrame>=(m.signoffFromFrame??total)) issue("Sound events must begin before the signoff and edit end.");
  last=-1;
  for(const c of m.camera){if(c.atFrame<=last || c.atFrame>=total) issue("Camera keys must be strictly ordered inside the edit.");last=c.atFrame;}
  last=-1;
  for(const w of m.captions.words){
    if(w.startMs<last || w.endMs<=w.startMs || w.endMs>m.source.totalFrames/m.source.fps*1000+1) issue("Words need ordered, non-overlapping positive intervals within the source.");
    last=w.endMs;
  }
  if(m.captions.status==="reviewed" && !m.captions.reviewer) issue("Reviewed captions need an explicit reviewer.");
  if(m.purpose==="delivery" && (m.captions.status!=="reviewed" || !m.scenes.length)) issue("Delivery requires reviewed captions and authored scenes.");
  for(const transition of m.transitions??[]){
    const tail=isCentredKind(transition.kind)?transition.durationInFrames/2:transition.durationInFrames;
    if(transition.atFrame>=total || transition.atFrame+tail>(m.signoffFromFrame??total))issue('Transitions must finish before the signoff and edit end.');
  }
  if(m.footage){
    const aspect=m.source.height/m.source.width;
    for(const geometry of [m.footage.full,m.footage.split]){
      if(geometry.windowTop+geometry.windowHeight>1920 || geometry.videoLeft>0 || geometry.videoLeft+geometry.videoWidth<1080 || geometry.videoTop>0 || geometry.videoTop+geometry.videoWidth*aspect<geometry.windowHeight)issue('Footage geometry must cover its complete window without exposed edges.');
    }
  }
  for(const message of graphicsTransitionIssues(m.transitions??[],m.scenes,m.projectScenes))issue(message);
  for(const message of brollIssues(m))issue(message);
  for(const message of layoutTransitionIssues(m,total,m.signoffFromFrame))issue(message);
  for(const message of captionEmphasisIssues(m.style,m.captions.words.length,m.captions.emphasis,m.styleAlias))issue(message);
  if(m.footage?.pip){
    const pip=m.footage.pip,policy=pipAllowed(m.style,m.styleAlias),aspect=m.source.height/m.source.width,p=pip.plate;
    if(!policy.allowed)issue(`Picture-in-picture is not part of the ${m.style} style: ${policy.evidence}`);
    if(pip.x+pip.width>1080 || pip.y+pip.height>1920)issue('PiP window must stay inside the 1080x1920 frame.');
    if(pip.radius*2>Math.min(pip.width,pip.height)+1e-6)issue('PiP radius cannot exceed half the window.');
    if(p.left+p.width<pip.width || p.top+p.height<pip.height)issue('PiP plate must cover its complete window without exposed edges.');
    if(Math.abs(p.height-p.width*aspect)>aspect+1)issue('PiP plate must keep the source aspect.');
    for(const id of pip.sceneIds){
      const scene=m.scenes.find(s=>s.id===id);
      if(!scene)issue(`PiP scene ${id} does not exist.`);
      else if(scene.layout!=='takeover')issue(`PiP scene ${id} must be a takeover; the presenter is already on screen in ${scene.layout}.`);
    }



    const pipTop=pip.y-PIP_REACH,pipBottom=pip.y+pip.height+PIP_REACH;
    if(pipBottom>1370-CAPTION_BAND_HALF && pipTop<1370+CAPTION_BAND_HALF)issue('PiP window (with its ring/shadow reach) overlaps the caption band around y=1370; a caption could paint over his face. Use a top corner or a smaller window.');
  }
});

// Keep the existing partial-field validation API used by briefs and editor tools.
export const editManifestSchema = Object.assign(z.preprocess(normalizeManifestStyle, manifestSchema), {shape: manifestSchema.shape});

export type EditManifest = z.infer<typeof editManifestSchema>;
export type EditScene = z.infer<typeof editSceneSchema>;
export type CameraKey = z.infer<typeof cameraKeySchema>;
export type SourceWord = EditManifest["captions"]["words"][number];
export type ChapterSpec = z.infer<typeof chapterSchema>;
export type FootagePip = z.infer<typeof footagePipSchema>;
export type TransitionSpec = z.infer<typeof transitionSchema>;
export type LayoutTransitionSpec = z.infer<typeof layoutTransitionSchema>;
export type CaptionEmphasisSpec = z.infer<typeof captionEmphasisSchema>;
