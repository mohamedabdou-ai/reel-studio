import path from 'node:path';
import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ROOT,checkedPath,digest} from './job-paths.mjs';
import {projectScenePackSchema} from '../../engine/src/project-scenes/schema.ts';
import {hasStyleSystem} from '../../engine/src/style-kit/system/zones.ts';
const ENGINE=path.join(ROOT,'engine'),engineRequire=createRequire(path.join(ENGINE,'package.json'));
const within=(parent,file)=>{const rel=path.relative(parent,file);return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));};
const VIDEO_COMPONENTS=new Set(['OffthreadVideo','Video','Html5Video']);
const VIDEO_GUIDANCE='Project scenes cannot mount video directly. Add a "clip" field to the scene contract and draw it with SceneClip from "@reel-studio/core/clip", so the file is hashed, probed and checked.';
const nameOf=node=>node?.name??node?.value;
/** Direct uses of Remotion's video components or @remotion/media in a project file. A guardrail for authored code, not a sandbox. */
function videoUses(tree){
  const found=[],namespaces=new Set();
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    const declaration=node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration';
    if(declaration&&node.importKind!=='type'&&node.exportKind!=='type'&&typeof node.source?.value==='string'){
      const from=node.source.value;
      if(from==='@remotion/media'||from.startsWith('@remotion/media/'))found.push(`module ${from}`);
      if(from==='remotion'){
        if(node.type==='ExportAllDeclaration')found.push("export * from 'remotion'");
        for(const spec of node.specifiers??[]){
          if(spec.type==='ImportNamespaceSpecifier'||spec.type==='ImportDefaultSpecifier'){namespaces.add(spec.local.name);continue;}
          if(spec.type==='ExportNamespaceSpecifier'){found.push("export * as ... from 'remotion'");continue;}
          const imported=nameOf(spec.imported??spec.local);
          if(VIDEO_COMPONENTS.has(imported))found.push(`${imported} from 'remotion'`);
        }
      }
    }
    if(node.type==='VariableDeclarator'&&node.init?.type==='CallExpression'&&node.init.callee?.name==='require'){
      const from=node.init.arguments?.[0]?.value;
      if(from==='@remotion/media')found.push('module @remotion/media');
      if(from==='remotion'){
        if(node.id?.type==='ObjectPattern'){for(const prop of node.id.properties??[]){const key=nameOf(prop.key);if(VIDEO_COMPONENTS.has(key))found.push(`${key} from 'remotion'`);}}
        else if(node.id?.type==='Identifier')namespaces.add(node.id.name);
      }
    }
    if(node.type==='MemberExpression'&&node.object?.type==='Identifier'&&namespaces.has(node.object.name)){
      const property=node.computed?node.property?.value:node.property?.name;
      if(VIDEO_COMPONENTS.has(property))found.push(`${node.object.name}.${property}`);
    }
    if(node.type==='JSXMemberExpression'&&node.object?.type==='JSXIdentifier'&&namespaces.has(node.object.name)&&VIDEO_COMPONENTS.has(node.property?.name))found.push(`${node.object.name}.${node.property.name}`);
    for(const [key,value] of Object.entries(node)){
      if(key==='loc'||key==='leadingComments'||key==='trailingComments')continue;
      if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
    }
  };
  visit(tree);
  return found;
}
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
  const uses=videoUses(tree);
  if(uses.length)throw new Error(`${VIDEO_GUIDANCE} (${path.relative(ROOT,file).split(path.sep).join('/')}: ${[...new Set(uses)].join(', ')})`);
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
/** In a style with a design system, every project scene the edit uses must import that system (directly or through a helper). */
export function assertStyleSystemImports(edit,metadata,metafile,entryFiles){
  if(!hasStyleSystem(edit.style))return;
  const systemDir=`engine/src/styles/${edit.style}/system/`;
  const rel=file=>path.relative(ROOT,path.resolve(file)).split(path.sep).join('/');
  const inputs=new Map(Object.entries(metafile.inputs).map(([key,value])=>[rel(key),value]));
  const used=new Set(edit.scenes.filter(scene=>scene.family==='project-scene').map(scene=>scene.data.component));
  metadata.scenes.forEach((scene,index)=>{
    if(!used.has(scene.id))return;
    const seen=new Set(),stack=[rel(entryFiles[index])];let found=false;
    while(stack.length && !found){
      const file=stack.pop();if(seen.has(file))continue;seen.add(file);
      if(file.startsWith(systemDir)){found=true;break;}
      for(const item of inputs.get(file)?.imports??[])if(!item.external)stack.push(rel(item.path));
    }
    if(!found)throw new Error(`Project scene ${scene.id} must draw with the ${edit.style} design system: import from "@reel-studio/styles/${edit.style}/system".`);
  });
}
export async function projectSceneBuild(edit){
  const metadata=await resolveProjectScenes(edit);if(!metadata)return null;
  const projectRoot=path.join(ROOT,'Projects',edit.id),packDir=path.posix.dirname(metadata.pack);
  // Registries a plate import pulls in. They stay importable, but every prepare or render of ANY project rewrites them, so they never take part in the identity (a prepared project would otherwise go stale whenever another project is prepared).
  const mutableRegistries=new Set([path.join(ENGINE,'proxies.json'),path.join(ENGINE,'plates.json')]);
  // The font manifest and its tracked template are shared engine metadata that core/fonts.ts imports.
  const sharedMetadata=new Set([path.join(ENGINE,'public','fonts','manifest.json'),path.join(ENGINE,'public','fonts','manifest.template.json'),...mutableRegistries]);
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
        if(!within(projectRoot,resolved.path)&&!within(path.join(ENGINE,'src'),resolved.path)&&!within(path.join(ENGINE,'node_modules'),resolved.path)&&!sharedMetadata.has(resolved.path))return {errors:[{text:'Project scene import is outside the allowed project and engine modules'}]};
        // The analysis hashes project and engine sources only. Installed packages stay unbundled, so their own imports (for example node: modules inside @remotion/media) cannot break it.
        return {path:resolved.path,namespace:resolved.namespace,external:resolved.external||within(path.join(ENGINE,'node_modules'),resolved.path)};
      });
    }}]});
  const paths=[metadata.pack,...Object.keys(result.metafile.inputs).filter(file=>file!=='<stdin>').map(file=>path.relative(ROOT,path.resolve(file)).split(path.sep).join('/'))];
  assertStyleSystemImports(edit,metadata,result.metafile,entryFiles);
  const files=[];
  for(const relative of [...new Set(paths)].sort()){
    const absolute=path.resolve(ROOT,relative);
    if(within(path.join(ENGINE,'node_modules'),absolute)||mutableRegistries.has(absolute))continue;
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
