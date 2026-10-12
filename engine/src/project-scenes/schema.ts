import {z} from 'zod';

export type FieldContract={key:string;type:'string'|'number'|'boolean'|'color'|'asset'|'enum'|'array'|'object';label?:string;required?:boolean;default?:unknown;min?:number;max?:number;options?:string[];items?:FieldContract;fields?:FieldContract[]};
const key=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/).refine(value=>!['constructor','prototype','__proto__'].includes(value),'Reserved field name');
const fieldSchema:z.ZodType<FieldContract>=z.lazy(()=>z.object({
  key,type:z.enum(['string','number','boolean','color','asset','enum','array','object']),label:z.string().min(1).max(100).optional(),
  required:z.boolean().optional(),default:z.json().optional(),min:z.number().finite().optional(),max:z.number().finite().optional(),
  options:z.array(z.string().min(1).max(200)).min(1).max(64).optional(),items:fieldSchema.optional(),fields:z.array(fieldSchema).max(32).optional(),
}).strict());
function fieldIssues(fields:FieldContract[],depth=0):string[]{
  if(depth>6)return ['Field nesting is limited to six levels'];
  const issues:string[]=[],names=new Set<string>();
  for(const field of fields){
    if(names.has(field.key))issues.push(`Duplicate field ${field.key}`);names.add(field.key);
    if(field.min!==undefined&&field.max!==undefined&&field.min>field.max)issues.push(`${field.key}: min exceeds max`);
    if(['string','asset','array'].includes(field.type)&&[field.min,field.max].some(n=>n!==undefined&&(!Number.isInteger(n)||n<0||n>10000)))issues.push(`${field.key}: length bounds must be integers from zero to 10000`);
    if(field.type==='enum'&&(!field.options||new Set(field.options).size!==field.options.length))issues.push(`${field.key}: enum needs distinct options`);
    if(field.type==='array'&&!field.items)issues.push(`${field.key}: array needs an item contract`);
    if(field.type==='object'&&!field.fields)issues.push(`${field.key}: object needs fields`);
    if(field.items)issues.push(...fieldIssues([field.items],depth+1));
    if(field.fields)issues.push(...fieldIssues(field.fields,depth+1));
  }
  return issues;
}
function fieldValue(field:FieldContract):z.ZodType{
  let schema:z.ZodType;
  switch(field.type){
    case 'string':schema=z.string().min(field.min??0).max(field.max??1000);break;
    case 'asset':schema=z.string().min(Math.max(1,field.min??1)).max(field.max??2000).refine(value=>!value.includes('\\')&&!value.includes(':')&&!value.startsWith('/')&&!value.split('/').some(part=>part==='..'||part==='.'||!part),'Asset must be relative to engine/public');break;
    case 'color':schema=z.string().regex(/^#[0-9a-fA-F]{6}$/);break;
    case 'number':{let value=z.number().finite();if(field.min!==undefined)value=value.min(field.min);if(field.max!==undefined)value=value.max(field.max);schema=value;break;}
    case 'boolean':schema=z.boolean();break;
    case 'enum':schema=z.enum(field.options as [string,...string[]]);break;
    case 'array':schema=z.array(fieldValue({...field.items!,required:true})).min(field.min??0).max(field.max??100);break;
    case 'object':schema=valuesSchema(field.fields!);break;
  }
  if(field.default!==undefined)schema=schema.prefault(field.default);
  else if(!field.required)schema=schema.optional();
  schema=schema.meta({...(field.label?{title:field.label}:{}),...(field.type==='asset'?{'x-reel-asset':true}:{})});
  return schema;
}
export function valuesSchema(fields:FieldContract[]):z.ZodType<Record<string,unknown>>{
  const issues=fieldIssues(fields);if(issues.length)throw new Error(issues.join('; '));
  const shape:Record<string,z.ZodType>={};for(const field of fields)shape[field.key]=fieldValue(field);
  return z.object(shape).strict();
}
const entry=z.string().min(1).max(500).refine(value=>!value.includes('\\')&&!value.startsWith('/')&&!value.split('/').some(part=>part==='..'||part==='.'||!part)&&/\.(tsx|jsx)$/.test(value),'Scene entry must be a project-relative TSX or JSX file');
export const projectSceneContractSchema=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),label:z.string().min(1).max(100),entry,fields:z.array(fieldSchema).max(32)}).strict();
export const projectScenePackSchema=z.object({version:z.literal(1),scenes:z.array(projectSceneContractSchema).min(1).max(32)}).strict().superRefine((pack,ctx)=>{
  const ids=new Set<string>();for(const scene of pack.scenes){
    if(ids.has(scene.id))ctx.addIssue({code:'custom',message:`Duplicate scene id ${scene.id}`});ids.add(scene.id);
    for(const message of fieldIssues(scene.fields))ctx.addIssue({code:'custom',message});
    if(!fieldIssues(scene.fields).length){
      const defaults=(fields:FieldContract[])=>{for(const field of fields){
        if(field.default!==undefined&&!fieldValue({...field,default:undefined,required:true}).safeParse(field.default).success)ctx.addIssue({code:'custom',message:`Invalid default for ${field.key}`});
        if(field.fields)defaults(field.fields);if(field.items)defaults([field.items]);
      }};defaults(scene.fields);
    }
  }
});
export type ProjectSceneContract=z.infer<typeof projectSceneContractSchema>;
export const projectScenesMetadataSchema=z.object({pack:z.string().min(1).max(2000),scenes:z.array(projectSceneContractSchema).min(1).max(32)}).strict().superRefine((metadata,ctx)=>{
  const result=projectScenePackSchema.safeParse({version:1,scenes:metadata.scenes});if(!result.success)for(const issue of result.error.issues)ctx.addIssue({...issue,path:['scenes',...issue.path.slice(1)]});
});
export const projectSceneDataSchema=z.object({component:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),values:z.record(z.string(),z.json())}).strict();
export const projectSceneVariant=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),family:z.literal('project-scene'),fromFrame:z.number().int().min(0).max(4320000),durationInFrames:z.number().int().min(1).max(4320000),layout:z.enum(['split','takeover']),motion:z.enum(['land','stagger','quiet']),data:projectSceneDataSchema}).strict();
export function projectSceneIssues(edit:{id:string;projectScenes?:z.infer<typeof projectScenesMetadataSchema>;scenes:{family:string;data:unknown;id:string}[]}):string[]{
  const issues:string[]=[];
  if(edit.projectScenes&&!projectScenesMetadataSchema.safeParse(edit.projectScenes).success)return issues;
  if(edit.projectScenes&&!edit.projectScenes.pack.startsWith(`Projects/${edit.id}/`))issues.push('Scene pack must belong to the same project');
  for(const scene of edit.scenes)if(scene.family==='project-scene'){
    const parsed=projectSceneDataSchema.safeParse(scene.data);if(!parsed.success)continue;
    const data=parsed.data,contract=edit.projectScenes?.scenes.find(item=>item.id===data.component);
    if(!contract){issues.push(`${scene.id}: unknown project scene; load its declared contract`);continue;}
    const result=valuesSchema(contract.fields).safeParse(data.values);
    if(!result.success)issues.push(`${scene.id}: values violate the project scene contract: ${result.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  return issues;
}
export function projectSceneAssets(edit:{projectScenes?:z.infer<typeof projectScenesMetadataSchema>;scenes:{family:string;data:unknown}[]}):string[]{
  const sources=new Set<string>();
  const collect=(field:FieldContract,value:unknown)=>{
    if(value===undefined)return;
    if(field.type==='asset')sources.add(value as string);
    if(field.type==='array')for(const item of value as unknown[])collect(field.items!,item);
    if(field.type==='object')for(const child of field.fields!)collect(child,(value as Record<string,unknown>)[child.key]);
  };
  for(const scene of edit.scenes)if(scene.family==='project-scene'){
    const data=projectSceneDataSchema.parse(scene.data),contract=edit.projectScenes?.scenes.find(item=>item.id===data.component);
    if(!contract)continue;const values=valuesSchema(contract.fields).parse(data.values);
    for(const field of contract.fields)collect(field,values[field.key]);
  }
  return [...sources];
}
