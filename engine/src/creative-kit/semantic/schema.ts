import {z} from 'zod';
import {publicAssetSchema} from '../kinetic/schema.ts';

const copy=(max:number)=>z.string().min(1).max(max).regex(/\S/,'Text cannot be blank');
const frame=z.number().int().min(0).max(4320000);
const base=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),fromFrame:frame,durationInFrames:frame.min(1),layout:z.enum(['split','takeover']),motion:z.enum(['land','stagger','quiet'])});
const heading={kicker:copy(38),title:copy(100)};

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
export function validateSemanticTiming(scene:SemanticScene):string[]{
  const issues:string[]=[];
  const inside=(at:number)=>{if(at>=scene.durationInFrames)issues.push(`${scene.id}: activation must land inside its scene`);};
  const ordered=(values:number[])=>{
    let previous=-1;
    for(const value of values){inside(value);if(value<=previous)issues.push(`${scene.id}: activations must be strictly ordered`);previous=value;}
  };
  switch(scene.family){
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
  if(scene.family==='chapter-quote'&&scene.data.cover)return [scene.data.cover.foreground.src];
  return scene.family==='route-stops'?scene.data.stops.flatMap(stop=>stop.image?[stop.image]:[]):[];
}

export const semanticTemplateData:Record<SemanticScene['family'],unknown>={
  'token-lens':{kicker:'GROUPING',title:'One idea, several pieces',groups:[{label:'Group A',tokens:['one','idea'],atFrame:6},{label:'Group B',tokens:['clear','steps'],atFrame:24}],lens:{groupIndex:1,tokenIndex:0,atFrame:40},footer:'Replace this with your explanation'},
  'meter-receipt':{kicker:'MEASURE',title:'Compare the same unit',rows:[{label:'Option A',value:25,atFrame:8},{label:'Option B',value:60,atFrame:28}],maximum:100,unit:'units',source:'Illustrative values: add your real source'},
  'ticket-offer':{kicker:'INVITATION',title:'Your next practical session',ticket:{label:'SESSION',value:'One session',detail:'Replace with the real offer',atFrame:12},footer:'Add the actual conditions'},
  'comment-stack':{kicker:'DISCUSSION',title:'Questions worth answering',comments:[{author:'Example viewer',text:'Replace with a real question',atFrame:10}],keyword:'guide',prompt:'Replace with your actual request'},
  'chapter-quote':{chapter:'01',title:'A question to explore',quote:'Replace this with the speaker’s actual words.',speaker:'Speaker name',role:'Speaker role',quoteFrame:20},
  'route-stops':{kicker:'THE ROUTE',title:'Your next useful steps',stops:[{label:'Start',detail:'Choose the question',atFrame:8},{label:'Explore',detail:'Compare the options',atFrame:30},{label:'Review',detail:'Check the result',atFrame:52}],footer:'Replace with your conclusion'},
};
