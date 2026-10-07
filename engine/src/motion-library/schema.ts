import {z} from 'zod';
import {publicAssetSchema} from '../creative-kit/kinetic/schema.ts';
import {captureIssues} from './capture.ts';

const text=(max:number)=>z.string().min(1).max(max).regex(/\S/);
const frame=z.number().int().min(0).max(4320000);
const dimension=z.number().int().min(1).max(16384);
const unit=z.number().min(0).max(1);
export const focusRectSchema=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),
  width:z.number().positive().max(1),height:z.number().positive().max(1)}).strict()
  .refine(r=>r.x+r.width<=1.0000001 && r.y+r.height<=1.0000001,'Focus rectangle must stay inside the source image.');

export const captureVideoSchema=publicAssetSchema.refine(p=>/\.(mp4|webm)$/i.test(p),'Screen capture video must be a local .mp4 or .webm file.');

export const focusKeySchema=z.object({atFrame:frame,focus:focusRectSchema,zoom:z.number().min(1).max(3)}).strict();

export const cursorPointSchema=z.object({atFrame:frame,x:unit,y:unit,click:z.boolean().optional()}).strict();

export const captureCalloutSchema=z.object({atFrame:frame,untilFrame:frame.optional(),kind:z.enum(['rect','circle','arrow','label']),
  rect:focusRectSchema,text:text(28).optional()}).strict();

export const imageStepSchema=z.object({kind:z.literal('image').optional(),atFrame:frame,focusFrame:frame,settleFrames:frame.min(1).max(120),title:text(100),label:text(60),
  src:publicAssetSchema,sourceWidth:dimension,sourceHeight:dimension,focus:focusRectSchema,zoom:z.number().min(1).max(3)}).strict();
export const videoStepSchema=z.object({kind:z.literal('video'),atFrame:frame,title:text(100),label:text(60),src:captureVideoSchema,
  sourceWidth:dimension,sourceHeight:dimension,trimBeforeFrame:frame.default(0),moveFrames:frame.min(1).max(120),
  keys:z.array(focusKeySchema).min(1).max(12),cursor:z.array(cursorPointSchema).max(40).default([]),
  callouts:z.array(captureCalloutSchema).max(8).default([])}).strict();
export const screenStepSchema=z.union([imageStepSchema,videoStepSchema]);
const base=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),fromFrame:frame,durationInFrames:frame.min(1),
  motion:z.enum(['land','stagger','quiet'])});
export const librarySceneVariants=[
  base.extend({family:z.literal('screen-focus'),layout:z.literal('takeover'),data:z.object({kicker:text(60),
    steps:z.array(screenStepSchema).min(1).max(6),
  }).strict()}),
  base.extend({family:z.literal('data-story'),layout:z.enum(['split','takeover']),data:z.object({kicker:text(60),title:text(120),
    sourceNote:text(140),display:z.enum(['metric','bars']),suffix:z.string().max(8),unit:text(35),animateFrames:frame.min(1).max(180),
    items:z.array(z.object({label:text(60),value:z.number().finite().min(0).max(999999999).multipleOf(0.01),atFrame:frame}).strict()).min(1).max(5),
  }).strict()}),
] as const;
export const librarySceneSchema=z.discriminatedUnion('family',librarySceneVariants);
export type LibraryScene=z.infer<typeof librarySceneSchema>;
export type ScreenFocusScene=Extract<LibraryScene,{family:'screen-focus'}>;
export type FocusRect=z.infer<typeof focusRectSchema>;
export type ImageScreenStep=z.infer<typeof imageStepSchema>;
export type VideoScreenStep=z.infer<typeof videoStepSchema>;
export type ScreenStep=z.infer<typeof screenStepSchema>;
export type FocusKey=z.infer<typeof focusKeySchema>;
export type CursorPoint=z.infer<typeof cursorPointSchema>;
export type CaptureCallout=z.infer<typeof captureCalloutSchema>;
export const LIBRARY_FAMILIES=['screen-focus','data-story'] as const;

export function validateLibraryTiming(scene:LibraryScene):string[]{
  const issues:string[]=[];
  if(scene.family==='screen-focus'){
    let previous=-1;
    scene.data.steps.forEach((step,i)=>{
      const end=scene.data.steps[i+1]?.atFrame??scene.durationInFrames;
      const focusBad=step.kind==='video'?false:step.focusFrame<step.atFrame || step.focusFrame+step.settleFrames>=end;
      if((i===0 && step.atFrame!==0) || step.atFrame<=previous || focusBad)
        issues.push(`${scene.id}: focus steps must start at zero, be strictly ordered, and finish before their next step/end.`);
      previous=step.atFrame;
    });
    issues.push(...captureIssues(scene));
  }else{
    let previous=-1;
    for(const item of scene.data.items){
      if(item.atFrame<previous || item.atFrame+scene.data.animateFrames>=scene.durationInFrames)
        issues.push(`${scene.id}: data reveals must be ordered and settle before the scene ends.`);
      previous=item.atFrame;
    }
    if(scene.data.display==='metric' && scene.data.items.length!==1)issues.push(`${scene.id}: metric display needs exactly one authored value.`);
    if(scene.data.display==='bars' && scene.data.items.length<2)issues.push(`${scene.id}: bar comparisons need at least two authored values.`);
    if(scene.data.display==='bars' && scene.layout!=='takeover')issues.push(`${scene.id}: bar comparisons need a takeover canvas.`);
  }
  return issues;
}

export function libraryAssets(scene:LibraryScene):string[]{
  return scene.family==='screen-focus'?[...new Set(scene.data.steps.map(step=>step.src))]:[];
}
