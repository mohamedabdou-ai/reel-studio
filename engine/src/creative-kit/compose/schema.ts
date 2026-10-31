// engine/src/creative-kit/compose/schema.ts
import {z} from 'zod';
import {publicAssetSchema} from '../../core/public-asset.ts';
import {clipValueSchema} from '../../core/clip-schema.ts';
import {proofBlockSchema} from '../proof-screen/schema.ts';

const copy=(max:number)=>z.string().min(1).max(max).regex(/\S/,'Text cannot be blank');
const frame=z.number().int().min(0).max(4320000);
const slug=z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const offset=z.number().int().min(0).max(600);
const amount=z.number().finite().min(-999999999).max(999999999).multipleOf(0.01);
const positive=z.number().finite().min(0).max(999999999).multipleOf(0.01);
// Same rule as proof-screen images (proof-screen/schema.ts:7); preparation verifies the bytes and the SVG safety.
const still=publicAssetSchema.refine(src=>/^projects\/[a-z0-9][a-z0-9-]{0,63}\/(?:[^/]+\/)*[^/]+\.(png|jpe?g|webp|svg)$/i.test(src),'Use a named image under projects/<project-id>/');
const sized={width:z.number().int().min(1).max(16384),height:z.number().int().min(1).max(16384)};

/** When a part appears: the source word that triggers it (with an offset in seconds), or a scene-local frame. */
export const composeAtSchema=z.union([
  z.object({word:z.number().int().min(0).max(19999),dt:z.number().finite().min(-2).max(2).optional()}).strict(),
  z.object({frame}).strict(),
]);
const part=<K extends string,S extends z.ZodRawShape>(kind:K,shape:S)=>z.object({id:slug,kind:z.literal(kind),at:composeAtSchema,emphasis:z.boolean().optional(),...shape}).strict();

export const composePartSchema=z.discriminatedUnion('kind',[
  part('kicker',{text:copy(38)}),
  part('headline',{text:copy(100)}),
  part('line',{text:copy(90)}),
  part('body',{text:copy(160)}),
  part('number',{value:amount,suffix:z.string().max(8).optional(),label:copy(60).optional(),unit:copy(35).optional(),rollFrames:z.number().int().min(1).max(180).optional()}),
  part('bars',{items:z.array(z.object({label:copy(60),value:positive,offsetFrames:offset.optional()}).strict()).min(2).max(5),max:positive.optional(),unit:copy(35).optional()}),
  part('ring',{value:positive,max:positive.refine(v=>v>0,'The maximum must be above zero'),label:copy(60).optional()}),
  part('quote',{text:copy(180),speaker:copy(48),role:copy(64).optional()}),
  part('list',{items:z.array(z.object({text:copy(64),detail:copy(80).optional(),mark:z.enum(['check','cross','none']).optional()}).strict()).min(1).max(6),staggerFrames:z.number().int().min(0).max(60).optional()}),
  part('card',{variant:z.enum(['plain','ticket','input','follow','stamp']).optional(),title:copy(60),body:copy(120).optional(),value:copy(32).optional(),pressFrame:frame.optional()}),
  part('chat',{messages:z.array(z.object({from:z.enum(['them','me']),author:copy(28).optional(),text:copy(120),offsetFrames:offset}).strict()).min(1).max(4)}),
  part('screen',{page:z.enum(['web','chat','dashboard']),title:copy(70).optional(),url:copy(100).optional(),blocks:z.array(proofBlockSchema).min(1).max(6),focus:z.number().int().min(0).optional()}),
  part('steps',{items:z.array(z.object({title:copy(28),detail:copy(64).optional(),offsetFrames:offset,image:publicAssetSchema.optional()}).strict()).min(2).max(4)}),
  part('media',{source:z.discriminatedUnion('kind',[
    z.object({kind:z.literal('image'),src:still,...sized}).strict(),
    z.object({kind:z.literal('clip'),clip:clipValueSchema}).strict(),
    z.object({kind:z.literal('compare'),before:z.object({src:still,...sized,label:copy(32)}).strict(),after:z.object({src:still,...sized,label:copy(32)}).strict(),revealFrames:z.number().int().min(1).max(300)}).strict(),
  ]),caption:copy(60).optional()}),
  part('marks',{mark:z.enum(['check','cross']),label:copy(40).optional()}),
  part('rule',{}),
]);

const HEAD=new Set(['kicker','headline']);
const FOOT=new Set(['line','rule']);
const CELL=new Set(['card','number','ring','marks']);
/** Leading kickers and headlines form the head, trailing lines and rules form the foot, everything between is the body. */
export function pageRegions<P extends {kind:string}>(parts:readonly P[]):{head:P[];body:P[];foot:P[]}{
  let start=0;while(start<parts.length && HEAD.has(parts[start].kind))start++;
  let end=parts.length;while(end>start && FOOT.has(parts[end-1].kind))end--;
  return {head:parts.slice(0,start),body:parts.slice(start,end),foot:parts.slice(end)};
}

export const composeDataSchema=z.object({
  paper:z.enum(['navy','cream','auto']).optional(),
  section:copy(40).optional(),
  arrangement:z.enum(['hero','stack','two-column','grid']),
  parts:z.array(composePartSchema).min(1).max(6),
}).strict().superRefine((data,ctx)=>{
  const ids=new Set<string>();
  data.parts.forEach((p,i)=>{if(ids.has(p.id))ctx.addIssue({code:'custom',path:['parts',i,'id'],message:'Part ids must be unique'});ids.add(p.id);});
  const heroes=data.parts.filter(p=>p.emphasis).length;
  if(heroes>1)ctx.addIssue({code:'custom',path:['parts'],message:'At most one part can be emphasised'});
  if(data.arrangement==='hero' && heroes!==1)ctx.addIssue({code:'custom',path:['arrangement'],message:'A hero page needs exactly one emphasised part'});
  const {body}=pageRegions(data.parts);
  if(data.arrangement==='two-column' && body.length!==2 && body.length!==4)ctx.addIssue({code:'custom',path:['arrangement'],message:'Two columns need 2 or 4 body parts between the head and the foot'});
  if(data.arrangement==='grid' && (body.length<2 || body.length>4 || body.some(p=>!CELL.has(p.kind))))ctx.addIssue({code:'custom',path:['arrangement'],message:'A grid holds 2 to 4 cards, numbers, rings or marks'});
  if(body.some(p=>p.kind==='screen') && body.length>1)ctx.addIssue({code:'custom',path:['parts'],message:'A screen fills the page body; pair it only with a kicker, headline, line or rule'});
});

export const composeSceneVariants=[z.object({
  id:slug,family:z.literal('compose'),fromFrame:frame,durationInFrames:frame.min(1),
  layout:z.enum(['split','takeover']),motion:z.enum(['land','stagger','quiet']),data:composeDataSchema,
})] as const;
export const composeSceneSchema=z.discriminatedUnion('family',composeSceneVariants);
export type ComposeScene=z.infer<typeof composeSceneSchema>;
export type ComposeData=z.infer<typeof composeDataSchema>;
export type ComposePart=z.infer<typeof composePartSchema>;
export type ComposeAt=z.infer<typeof composeAtSchema>;

/** Paper is explicit so the page and its live caption always use the same ink. */
export const composePaper=(data:ComposeData):'cream'|'navy'=>data.paper==='cream'?'cream':'navy';

/** Still images a composed page shows; preparation verifies each file. */
export const composeAssets=(scene:ComposeScene):string[]=>scene.data.parts.flatMap(p=>
  p.kind==='media'?(p.source.kind==='image'?[p.source.src]:p.source.kind==='compare'?[p.source.before.src,p.source.after.src]:[])
  :p.kind==='steps'?p.items.flatMap(item=>item.image?[item.image]:[])
  :p.kind==='screen'?p.blocks.flatMap(block=>block.kind==='image'?[block.src]:[]):[]);
