import {z} from "zod";
import {creatorSchema} from "./creator.ts";
import {introSchema, proofSchema, processSchema, comparisonSchema, commentSchema, followSchema, styleSchema} from "../creative-kit/schema.ts";
import {kineticSceneVariants,kineticSceneSchema,validateKineticTiming} from "../creative-kit/kinetic/schema.ts";
import {foregroundSourceFrame} from "./visibility.ts";
import {librarySceneVariants,librarySceneSchema,validateLibraryTiming} from '../motion-library/schema.ts';
import {screenRecordingVariants,screenRecordingSceneSchema,screenRecordingIssues} from '../screen-recording/schema.ts';
import {semanticSceneVariants,semanticSceneSchema,validateSemanticTiming} from '../creative-kit/semantic/schema.ts';
import {validateChapter,describeIssues,contrastRatio,relativeLuminance,mixToHex,CHAPTER_MIN_CONTRAST} from '../core/chapters.ts';
import {pipAllowed,PIP_REACH} from '../core/pip.ts';
import {TRANSITION_KINDS,TRANSITION_DIRS,graphicsTransitionIssues} from './graphics-transitions.ts';
import {LAYOUT_TRANSITION_MIN_FRAMES,layoutTransitionIssues} from './footage.ts';
import {CAPTION_EMPHASIS_KINDS,captionEmphasisIssues} from './caption-emphasis.ts';

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
]);

export const editSceneSchema = z.intersection(sceneUnion,z.object({chapter:chapterSchema.optional()}));
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
  kind:z.enum(TRANSITION_KINDS).default('whiteout'),dir:z.enum(TRANSITION_DIRS).optional()}).strict();
export const layoutTransitionSchema = z.object({atFrame:frame,durationInFrames:z.number().int().min(LAYOUT_TRANSITION_MIN_FRAMES).max(120),
  kind:z.enum(['curtain','window-morph']),from:z.enum(['presenter','split']),to:z.enum(['presenter','split'])}).strict();



export const captionEmphasisSchema = z.object({sourceIndex:z.number().int().min(0).max(19999),kind:z.enum(CAPTION_EMPHASIS_KINDS)}).strict();



const CAPTION_BAND_HALF=64;
import {FONT_CHOICES, CAPTION_GROUPING, CAPTION_PRESENTATION, WRITING_STYLES} from '../core/preference-options.ts';
export const editManifestSchema = z.object({
  version:z.literal(1), id:slug, purpose:z.enum(["test","delivery"]),
  style:styleSchema,
  fontFamily:z.enum(FONT_CHOICES).optional(),
  writingStyle:z.enum(WRITING_STYLES).optional(),
  creator:creatorSchema.optional(),
  brand:chapterSchema.optional(),
  source:z.object({
    path:z.string().min(1).max(2000), sha256:z.string().regex(/^[a-f0-9]{64}$/),
    fps:z.number().finite().min(1).max(120), width:z.number().int().min(2).max(16384),
    height:z.number().int().min(2).max(16384), totalFrames:frame.min(1),
  }).strict(),
  segments:z.array(z.object({fromFrame:frame,toFrame:frame.min(1)}).strict()).min(1).max(300),
  captions:z.object({
    status:z.enum(["draft","reviewed"]), reviewer:z.string().min(1).max(200).optional(),
    mode:z.enum(["words","phrases"]).optional(),
    grouping:z.enum(CAPTION_GROUPING).optional(),
    presentation:z.enum(CAPTION_PRESENTATION).optional(),
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
  let last=0,total=0;
  for(const s of m.segments){
    if(s.fromFrame<last || s.toFrame<=s.fromFrame || s.toFrame>m.source.totalFrames) issue("Source ranges must be ordered, disjoint and inside the source.");
    last=s.toFrame; total+=s.toFrame-s.fromFrame;
  }
  if(total/m.source.fps>600) issue("Prepared edits support up to 10 minutes.");
  last=0; const ids=new Set<string>();
  for(const s of m.scenes){
    if(ids.has(s.id)) issue("Scene IDs must be unique."); ids.add(s.id);
    if(s.fromFrame<last || s.fromFrame+s.durationInFrames>total) issue("Visual scenes must be ordered, disjoint and inside the edit.");
    last=s.fromFrame+s.durationInFrames;
    const semantic=semanticSceneSchema.safeParse(s);
    if(semantic.success){
      for(const message of validateSemanticTiming(semantic.data))issue(message);
      if(semantic.data.family==='chapter-quote' && semantic.data.data.cover && m.style!=='magazine-interview')issue(`${s.id}: magazine cover is available only in magazine-interview`);
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
  }
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
    const tail=transition.kind==='whiteout'?transition.durationInFrames/2:transition.durationInFrames;
    if(transition.atFrame>=total || transition.atFrame+tail>(m.signoffFromFrame??total))issue('Transitions must finish before the signoff and edit end.');
  }
  if(m.footage){
    const aspect=m.source.height/m.source.width;
    for(const geometry of [m.footage.full,m.footage.split]){
      if(geometry.windowTop+geometry.windowHeight>1920 || geometry.videoLeft>0 || geometry.videoLeft+geometry.videoWidth<1080 || geometry.videoTop>0 || geometry.videoTop+geometry.videoWidth*aspect<geometry.windowHeight)issue('Footage geometry must cover its complete window without exposed edges.');
    }
  }
  for(const message of graphicsTransitionIssues(m.transitions??[],m.scenes))issue(message);
  for(const message of layoutTransitionIssues(m,total,m.signoffFromFrame))issue(message);
  for(const message of captionEmphasisIssues(m.style,m.captions.words.length,m.captions.emphasis))issue(message);
  if(m.footage?.pip){
    const pip=m.footage.pip,policy=pipAllowed(m.style),aspect=m.source.height/m.source.width,p=pip.plate;
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

export type EditManifest = z.infer<typeof editManifestSchema>;
export type EditScene = z.infer<typeof editSceneSchema>;
export type CameraKey = z.infer<typeof cameraKeySchema>;
export type SourceWord = EditManifest["captions"]["words"][number];
export type ChapterSpec = z.infer<typeof chapterSchema>;
export type FootagePip = z.infer<typeof footagePipSchema>;
export type TransitionSpec = z.infer<typeof transitionSchema>;
export type LayoutTransitionSpec = z.infer<typeof layoutTransitionSchema>;
export type CaptionEmphasisSpec = z.infer<typeof captionEmphasisSchema>;
