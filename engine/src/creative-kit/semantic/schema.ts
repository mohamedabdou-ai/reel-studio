import {z} from 'zod';
import {publicAssetSchema} from '../kinetic/schema.ts';
import {CATALOG,catalogSchema,catalogDemo,getCatalogEntry} from '../../motion-concepts/catalog.ts';
import {minFramesAtFps} from '../../motion-concepts/timeline.ts';
import type {ConceptId} from '../../motion-concepts/types.ts';

const copy=(max:number)=>z.string().min(1).max(max).regex(/\S/,'Text cannot be blank');
const frame=z.number().int().min(0).max(4320000);
const base=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),fromFrame:frame,durationInFrames:frame.min(1),layout:z.enum(['split','takeover']),motion:z.enum(['land','stagger','quiet'])});
const heading={kicker:copy(38),title:copy(100)};
const sourceIndex=z.number().int().min(0).max(19999);
const evidenceImage=z.object({src:publicAssetSchema,width:z.number().int().min(1).max(16384),height:z.number().int().min(1).max(16384),label:copy(32)}).strict();
// Use each original concept schema. The discriminated union also supplies editable nested forms.
const conceptVariants=CATALOG.map(concept=>z.object({concept:z.literal(concept.id),config:catalogSchema(concept.id)}).strict());
export const motionConceptDataSchema:z.ZodType<{concept:ConceptId;config:Record<string,unknown>}>=z.discriminatedUnion('concept',conceptVariants as any);

// Opt-in only: the creator supplies a finished transparent PNG; the runtime never masks a subject.
const magazineCoverSchema=z.object({
  foreground:z.object({src:publicAssetSchema.refine(src=>/\.png$/i.test(src),'Magazine covers require a supplied transparent PNG'),
    sha256:z.string().regex(/^[a-f0-9]{64}$/),width:z.number().int().min(1).max(4096),height:z.number().int().min(1).max(4096)}).strict(),
  box:z.object({x:z.number().finite().min(0).max(1),y:z.number().finite().min(.05).max(.8),
    width:z.number().finite().min(.1).max(1),height:z.number().finite().min(.1).max(.8)}).strict(),
}).strict().superRefine((cover,ctx)=>{
  if(cover.box.x+cover.box.width>1 || cover.box.y+cover.box.height>.82)ctx.addIssue({code:'custom',message:'Cover foreground must fit the safe scene canvas above the speaker attribution.'});
});

export const semanticSceneVariants=[
  base.extend({family:z.literal('message-board'),layout:z.literal('takeover'),data:z.object({
    initialTitle:copy(100),boardTitle:copy(100),focusTitle:copy(100),closingTitle:copy(100),
    items:z.array(z.object({id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),label:copy(64),detail:copy(80).optional()}).strict()).min(3).max(6),
    focusIndex:z.number().int().min(0),gatherFrame:frame,gatherDurationFrames:frame.min(1),focusFrame:frame,focusDurationFrames:frame.min(1),closingFrame:frame.optional(),
  }).strict().superRefine((data,ctx)=>{
    if(new Set(data.items.map(item=>item.id)).size!==data.items.length)ctx.addIssue({code:'custom',message:'Message cards need unique IDs to preserve their identity'});
    if(data.focusIndex>=data.items.length)ctx.addIssue({code:'custom',message:'Focus must identify a supplied message card'});
  })}),
  base.extend({family:z.literal('kinetic-text'),data:z.object({...heading,
    sourceIndices:z.array(sourceIndex).min(1).max(32).refine(indices=>indices.every((value,index)=>index===0||value>indices[index-1]),'Source word indices must be strictly ordered'),
    lang:z.enum(['ar','en']),enter:z.enum(['rise','pop','fade']),
    emphasis:z.array(z.object({sourceIndex,kind:z.enum(['accent','latin','pop','underline','weight'])}).strict()).max(32).optional(),
  }).strict().superRefine((data,ctx)=>{
    if(data.emphasis?.some(mark=>!data.sourceIndices.includes(mark.sourceIndex)))ctx.addIssue({code:'custom',message:'Emphasis must identify a selected recorded word'});
  })}),
  base.extend({family:z.literal('evidence-wipe'),data:z.object({...heading,before:evidenceImage,after:evidenceImage,
    revealFrame:frame,revealDurationFrames:frame.min(1).max(300),dir:z.enum(['rtl','ltr']),footer:copy(90),
  }).strict()}),
  base.extend({family:z.literal('motion-concept'),layout:z.literal('takeover'),data:motionConceptDataSchema}),
  base.extend({family:z.literal('token-lens'),data:z.object({...heading,
    groups:z.array(z.object({label:copy(24),tokens:z.array(copy(18)).min(1).max(6),atFrame:frame}).strict()).min(1).max(3),
    lens:z.object({groupIndex:z.number().int().min(0),tokenIndex:z.number().int().min(0),atFrame:frame}).strict(),footer:copy(90),
  }).strict().superRefine((data,ctx)=>{
    const group=data.groups[data.lens.groupIndex];
    if(!group || data.lens.tokenIndex>=group.tokens.length)ctx.addIssue({code:'custom',message:'Lens must identify a real group and token.'});
    else if(data.lens.atFrame<group.atFrame)ctx.addIssue({code:'custom',message:'Lens cannot precede its group reveal.'});
  })}),
  base.extend({family:z.literal('meter-receipt'),data:z.object({...heading,
    rows:z.array(z.object({label:copy(28),value:z.number().finite().min(0).max(999999).multipleOf(.01),atFrame:frame}).strict()).length(2),
    maximum:z.number().finite().positive().max(999999),unit:copy(16),source:copy(90),
  }).strict().superRefine((data,ctx)=>{
    if(data.rows.some(row=>row.value>data.maximum))ctx.addIssue({code:'custom',message:'Meter values must stay within the shared maximum.'});
  })}),
  base.extend({family:z.literal('ticket-offer'),data:z.object({...heading,
    ticket:z.object({label:copy(32),value:copy(32),detail:copy(80),atFrame:frame}).strict(),footer:copy(90),
  }).strict()}),
  base.extend({family:z.literal('comment-stack'),data:z.object({...heading,
    comments:z.array(z.object({author:copy(28),text:copy(88),atFrame:frame}).strict()).min(1).max(3),keyword:copy(20),prompt:copy(64),
  }).strict()}),
  base.extend({family:z.literal('chapter-quote'),data:z.object({chapter:copy(10),title:copy(100),quote:copy(180),speaker:copy(48),role:copy(64),quoteFrame:frame,cover:magazineCoverSchema.optional()}).strict()}),
  base.extend({family:z.literal('route-stops'),data:z.object({...heading,
    stops:z.array(z.object({label:copy(28),detail:copy(64),atFrame:frame,image:publicAssetSchema.optional()}).strict()).min(2).max(4),footer:copy(90),
  }).strict()}),
] as const;
export const semanticSceneSchema=z.discriminatedUnion('family',semanticSceneVariants);
export type SemanticScene=z.infer<typeof semanticSceneSchema>;
export const semanticFamilies=semanticSceneVariants.map(schema=>schema.shape.family.value);

// Every reveal uses a local frame authored from the approved words, never inferred speech.
export function validateSemanticTiming(scene:SemanticScene,fps=30):string[]{
  const issues:string[]=[];
  const inside=(at:number)=>{if(at>=scene.durationInFrames)issues.push(`${scene.id}: activation must land inside its scene`);};
  const ordered=(values:number[])=>{
    let previous=-1;
    for(const value of values){inside(value);if(value<=previous)issues.push(`${scene.id}: activations must be strictly ordered`);previous=value;}
  };
  switch(scene.family){
    case 'message-board':{
      const data=scene.data,gatherEnd=data.gatherFrame+data.gatherDurationFrames,focusEnd=data.focusFrame+data.focusDurationFrames;
      if(data.gatherFrame<Math.ceil(fps*.6))issues.push(`${scene.id}: initial messages need a readable hold before gathering`);
      if(data.focusFrame-gatherEnd<Math.ceil(fps*.75))issues.push(`${scene.id}: the organised board needs a readable hold before focusing`);
      if(data.closingFrame!==undefined){
        if(data.closingFrame-focusEnd<Math.ceil(fps))issues.push(`${scene.id}: the focused result needs a readable hold before closing`);
        if(scene.durationInFrames-data.closingFrame<Math.ceil(fps))issues.push(`${scene.id}: closing needs at least one second of readable hold`);
      }else if(scene.durationInFrames-focusEnd<Math.ceil(fps))issues.push(`${scene.id}: the focused result needs at least one second of readable hold`);
      break;
    }
    case 'kinetic-text':break; // Selected words are checked against the cut timeline by the manifest.
    case 'evidence-wipe':
      inside(scene.data.revealFrame);
      if(scene.data.revealFrame+scene.data.revealDurationFrames>scene.durationInFrames)issues.push(`${scene.id}: comparison reveal must finish inside its scene`);
      break;
    case 'motion-concept':{
      const minimum=minFramesAtFps(getCatalogEntry(scene.data.concept).minFrames,fps);
      if(scene.durationInFrames<minimum)issues.push(`${scene.id}: concept needs at least ${minimum} frames at ${fps} fps`);
      break;
    }
    case 'token-lens':ordered(scene.data.groups.map(group=>group.atFrame));inside(scene.data.lens.atFrame);break;
    case 'meter-receipt':ordered(scene.data.rows.map(row=>row.atFrame));break;
    case 'ticket-offer':inside(scene.data.ticket.atFrame);break;
    case 'comment-stack':ordered(scene.data.comments.map(comment=>comment.atFrame));break;
    case 'chapter-quote':
      inside(scene.data.quoteFrame);
      if(scene.data.cover){
        if(scene.layout!=='takeover')issues.push(`${scene.id}: magazine cover needs a takeover layout`);
        if(scene.data.quoteFrame===0)issues.push(`${scene.id}: magazine cover must finish at a positive quoteFrame`);
      }
      break;
    case 'route-stops':ordered(scene.data.stops.map(stop=>stop.atFrame));break;
  }
  return issues;
}

export function semanticAssets(scene:SemanticScene):string[]{
  if(scene.family==='evidence-wipe')return [scene.data.before.src,scene.data.after.src];
  if(scene.family==='motion-concept'){
    const paths:string[]=[];
    const visit=(value:unknown,key='')=>{
      if(typeof value==='string' && /(?:src|icon|image)$/i.test(key) && /\.(?:png|jpe?g|webp|svg)$/i.test(value))paths.push(value);
      else if(Array.isArray(value))value.forEach(item=>visit(item,key));
      else if(value && typeof value==='object')Object.entries(value).forEach(([name,item])=>visit(item,name));
    };
    visit(scene.data.config);return [...new Set(paths)];
  }
  if(scene.family==='chapter-quote'&&scene.data.cover)return [scene.data.cover.foreground.src];
  return scene.family==='route-stops'?scene.data.stops.flatMap(stop=>stop.image?[stop.image]:[]):[];
}

export const semanticTemplateData:Record<SemanticScene['family'],unknown>={
  'message-board':{initialTitle:'Several supplied messages',boardTitle:'One organised board',focusTitle:'One useful result',closingTitle:'Review your next step',
    items:[{id:'question',label:'Your question'},{id:'step',label:'Your practical step'},{id:'result',label:'Your supplied result'}],focusIndex:2,
    gatherFrame:30,gatherDurationFrames:30,focusFrame:90,focusDurationFrames:30},
  'kinetic-text':{kicker:'RECORDED WORDS',title:'The phrase that matters',sourceIndices:[0],lang:'ar',enter:'rise'},
  'evidence-wipe':{kicker:'EVIDENCE',title:'Compare the supplied images',before:{src:'examples/evidence-before.svg',width:640,height:360,label:'Before'},after:{src:'examples/evidence-after.svg',width:640,height:360,label:'After'},revealFrame:12,revealDurationFrames:30,dir:'rtl',footer:'Illustrative images: replace with your actual evidence'},
  'motion-concept':{concept:'panel-reveal',config:catalogDemo('panel-reveal')},
  'token-lens':{kicker:'GROUPING',title:'One idea, several pieces',groups:[{label:'Group A',tokens:['one','idea'],atFrame:6},{label:'Group B',tokens:['clear','steps'],atFrame:24}],lens:{groupIndex:1,tokenIndex:0,atFrame:40},footer:'Replace this with your explanation'},
  'meter-receipt':{kicker:'MEASURE',title:'Compare the same unit',rows:[{label:'Option A',value:25,atFrame:8},{label:'Option B',value:60,atFrame:28}],maximum:100,unit:'units',source:'Illustrative values: add your real source'},
  'ticket-offer':{kicker:'INVITATION',title:'Your next practical session',ticket:{label:'SESSION',value:'One session',detail:'Replace with the real offer',atFrame:12},footer:'Add the actual conditions'},
  'comment-stack':{kicker:'DISCUSSION',title:'Questions worth answering',comments:[{author:'Example viewer',text:'Replace with a real question',atFrame:10}],keyword:'guide',prompt:'Replace with your actual request'},
  'chapter-quote':{chapter:'01',title:'A question to explore',quote:'Replace this with the speaker’s actual words.',speaker:'Speaker name',role:'Speaker role',quoteFrame:20},
  'route-stops':{kicker:'THE ROUTE',title:'Your next useful steps',stops:[{label:'Start',detail:'Choose the question',atFrame:8},{label:'Explore',detail:'Compare the options',atFrame:30},{label:'Review',detail:'Check the result',atFrame:52}],footer:'Replace with your conclusion'},
};
