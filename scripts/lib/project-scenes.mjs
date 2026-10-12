import path from 'node:path';
import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ROOT,checkedPath,digest} from './job-paths.mjs';
import {projectScenePackSchema} from '../../engine/src/project-scenes/schema.ts';
const ENGINE=path.join(ROOT,'engine'),engineRequire=createRequire(path.join(ENGINE,'package.json'));
const within=(parent,file)=>{const rel=path.relative(parent,file);return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));};
function staticImports(file,source){
  const parser=engineRequire('@babel/parser'),tree=parser.parse(source,{sourceType:'unambiguous',plugins:['typescript','jsx']});
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    const importing=node.type==='ImportExpression'||(node.type==='CallExpression'&&(node.callee?.type==='Import'||(node.callee?.type==='Identifier'&&node.callee.name==='require')));
    if(importing){
      const first=node.source??node.arguments?.[0];if(!first||(first.type!=='StringLiteral'&&!(first.type==='TemplateLiteral'&&first.expressions.length===0)))throw new Error('Project scene imports must use literal module paths so dependencies and bundle changes can be tracked');
    }
    for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
  };visit(tree);
}
async function regularProjectPath(file,id){
  if(typeof file!=='string'||!file.startsWith(`Projects/${id}/`))throw new Error('Scene pack and entries must belong to their project');
  return checkedPath(file,{mustExist:true,project:id});
}
export async function loadProjectScenePack(pack,{id}){
  const absolute=await regularProjectPath(pack,id),raw=await fs.readFile(absolute,'utf8');
  if(Buffer.byteLength(raw)>1024*1024)throw new Error('Scene pack exceeds the metadata limit');
  const parsed=projectScenePackSchema.parse(JSON.parse(raw));
  for(const scene of parsed.scenes)await regularProjectPath(path.posix.join(path.posix.dirname(pack),scene.entry),id);
  return {pack,scenes:parsed.scenes};
}
export async function resolveProjectScenes(edit){
  if(!edit.projectScenes)return null;
  const loaded=await loadProjectScenePack(edit.projectScenes.pack,{id:edit.id});
  if(digest(loaded)!==digest(edit.projectScenes))throw new Error('Scene pack contract changed. Reload projectScenePack and prepare the manifest again.');
  return loaded;
}
export async function projectSceneBuild(edit){
  const metadata=await resolveProjectScenes(edit);if(!metadata)return null;
  const projectRoot=path.join(ROOT,'Projects',edit.id),packDir=path.posix.dirname(metadata.pack);
  const entryFiles=metadata.scenes.map(scene=>path.join(ROOT,packDir,scene.entry));
  const source=metadata.scenes.map((scene,index)=>`import Scene${index} from ${JSON.stringify(entryFiles[index].split(path.sep).join('/'))};`).join('\n')+`\nexport const PROJECT_SCENES = {${metadata.scenes.map((scene,index)=>`${JSON.stringify(scene.id)}:{Component:Scene${index},contract:${JSON.stringify(scene)}}`).join(',')}};\n`;
  const esbuild=engineRequire('esbuild');
  const result=await esbuild.build({stdin:{contents:source,resolveDir:ENGINE,loader:'tsx'},bundle:true,write:false,outdir:path.join(ROOT,'state','tmp','scene-analysis'),platform:'browser',format:'esm',jsx:'automatic',nodePaths:[path.join(ENGINE,'node_modules')],alias:{'@reel-studio':path.join(ENGINE,'src')},logLevel:'silent',metafile:true,
    plugins:[{name:'project-scene-imports',setup(build){
      build.onResolve({filter:/.*/},async args=>{
        if(args.kind==='entry-point'||args.pluginData?.checked)return;
        if(args.path.startsWith('http:')||args.path.startsWith('https:')||args.path.startsWith('node:'))return {errors:[{text:'Project scene imports must be local browser modules'}]};
        const resolved=await build.resolve(args.path,{kind:args.kind,resolveDir:args.resolveDir,pluginData:{checked:true}});
        if(resolved.errors.length)return resolved;
        if(!within(projectRoot,resolved.path)&&!within(path.join(ENGINE,'src'),resolved.path)&&!within(path.join(ENGINE,'node_modules'),resolved.path))return {errors:[{text:'Project scene import is outside the allowed project and engine modules'}]};
        return {path:resolved.path,namespace:resolved.namespace,external:resolved.external};
      });
    }}]});
  const paths=[metadata.pack,...Object.keys(result.metafile.inputs).filter(file=>file!=='<stdin>').map(file=>path.relative(ROOT,path.resolve(file)).split(path.sep).join('/'))];
  const files=[];
  for(const relative of [...new Set(paths)].sort()){
    const absolute=path.resolve(ROOT,relative);
    if(within(path.join(ENGINE,'node_modules'),absolute))continue;
    await checkedPath(relative,{mustExist:true});
    const bytes=await fs.readFile(absolute);files.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex')});
    if(within(projectRoot,absolute)&&/\.[cm]?[jt]sx?$/.test(absolute))staticImports(absolute,bytes.toString('utf8'));
  }
  const hash=digest({metadata,files});
  const dir=path.join(ROOT,'state','cache','project-scenes',hash);await fs.mkdir(dir,{recursive:true});
  const registry=path.join(dir,'registry.tsx');
  await fs.writeFile(registry,source,'utf8');
  return {hash,registry,files,metadata,engineRegistry:path.join(ENGINE,'src','project-scenes','registry.ts')};
}
