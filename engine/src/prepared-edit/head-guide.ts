import {z} from 'zod';
import type {HeadBoxPx} from '../creative-kit/head-clear.ts';

export const HEAD_GUIDE_STATUSES=['ok','hidden','unknown'] as const;
export const HEAD_GUIDE_REASONS=['no-envelope','null-sample','outside-envelope'] as const;
export const headGuideBoxSchema=z.object({
  x:z.number().int().min(0).max(1079),y:z.number().int().min(0).max(1919),
  width:z.number().int().min(1).max(1080),height:z.number().int().min(1).max(1920),
}).strict().superRefine((b,ctx)=>{
  if(b.x+b.width>1080 || b.y+b.height>1920)ctx.addIssue({code:'custom',message:'Head guide box must stay inside the 1080x1920 frame.'});
});
export const headGuideSceneSchema=z.object({
  id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  status:z.enum(HEAD_GUIDE_STATUSES),
  box:headGuideBoxSchema.nullable(),
  visibleFrames:z.number().int().min(0).max(4320000),
  reason:z.enum(HEAD_GUIDE_REASONS).nullable(),
}).strict().superRefine((s,ctx)=>{
  if((s.status==='ok')!==(s.box!==null))ctx.addIssue({code:'custom',message:`Head guide scene ${s.id}: exactly the ok status carries a box.`});
  if((s.status==='unknown')!==(s.reason!==null))ctx.addIssue({code:'custom',message:`Head guide scene ${s.id}: exactly the unknown status carries a reason.`});
});
export const headGuideSchema=z.object({
  version:z.literal(1),
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),
  method:z.enum(['rvm','blazeface','none']),
  scenes:z.array(headGuideSceneSchema).max(300),
}).strict();
export type HeadGuide=z.infer<typeof headGuideSchema>;
export type HeadGuideScene=z.infer<typeof headGuideSceneSchema>;


export function headGuideIssues(guide:HeadGuide,edit:{source:{sha256:string};scenes:readonly {id:string}[]}):string[]{
  const issues:string[]=[];
  if(guide.sourceSha256!==edit.source.sha256)issues.push('it was measured on a different source');
  if(guide.scenes.map(s=>s.id).join('\n')!==edit.scenes.map(s=>s.id).join('\n'))issues.push('its scenes are not the edit scenes in order');
  return issues;
}


export function headBoxForScene(guide:HeadGuide|null|undefined,sceneId:string):HeadBoxPx|null{
  const scene=guide?.scenes.find(s=>s.id===sceneId);
  return scene?.status==='ok'?scene.box:null;
}
