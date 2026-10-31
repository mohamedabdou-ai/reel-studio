// tests/style-system-rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {assertStyleSystemImports} from '../scripts/lib/project-scenes.mjs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';

const abs = (p) => path.join(ROOT, p);
const edit = (style) => ({style, scenes: [{family: 'project-scene', data: {component: 'idea'}}]});
const metadata = {scenes: [{id: 'idea'}, {id: 'unused'}]};
const entries = [abs('Projects/demo/scenes/idea.tsx'), abs('Projects/demo/scenes/unused.tsx')];
const metafile = (imports) => ({inputs: {
  [path.relative(process.cwd(), entries[0])]: {imports: imports.map(p => ({path: path.relative(process.cwd(), abs(p))}))},
  [path.relative(process.cwd(), entries[1])]: {imports: []},
  [path.relative(process.cwd(), abs('Projects/demo/scenes/helper.tsx'))]: {imports: [{path: path.relative(process.cwd(), abs('engine/src/styles/magazine-interview/system/index.ts'))}]},
}});

test('preparation and validation report undrawn scenes', async () => {
  const prepare = await readFile(new URL('../scripts/lib/prepare-report.mjs', import.meta.url), 'utf8');
  const validate = await readFile(new URL('../scripts/lib/editor-director.mjs', import.meta.url), 'utf8');
  assert.match(prepare, /undrawnScenes\(props\.edit\)/);
  assert.match(validate, /undrawnScenes:undrawnScenes\(manifest\)/);
  assert.match(validate, /import \{prepareEditProject\} from '\.\/prepare-report\.mjs'/);
  const legacy = await readFile(new URL('../scripts/edit-project.mjs', import.meta.url), 'utf8');
  assert.match(legacy, /import \{prepareEditProject\} from '\.\/lib\/prepare-report\.mjs'/);
  const keyed = await readFile(new URL('../scripts/lib/edit-project.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(keyed, /undrawnScenes/);
});

// Exercise both real CLIs, their reporting wrapper and atomic report writes without encoding
// or touching a live project. Only the low-level media preparation is replaced; the optional
// coverage hole models a newly added family awaiting its magazine drawing.
async function prepareFixture(entry,{pending=false,race,outDir}={}) {
  await mkdir(path.join(ROOT,'state/tmp'),{recursive:true});
  const root=await mkdtemp(path.join(ROOT,'state/tmp/task22-report-'));
  const project='Projects/report-fixture';
  await mkdir(path.join(root,project),{recursive:true});
  const scene=structuredClone(ARABIC_SCENES.find(s=>s.family==='intro'));
  const manifest={version:1,id:'report-fixture',purpose:'test',style:'magazine-interview',
    source:{path:project+'/source.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:300},
    segments:[{fromFrame:0,toFrame:300}],captions:{status:'draft',words:[]},
    scenes:[{...scene,id:'intro',fromFrame:0,durationInFrames:300,layout:'split'}],sounds:[],camera:[]};
  await writeFile(path.join(root,project,'edit.json'),JSON.stringify(manifest));
  const hook=path.join(root,'sandbox.mjs');
  await writeFile(hook,`import {registerHooks} from 'node:module';import {readFileSync} from 'node:fs';
registerHooks({load(url,ctx,next){
 if(url.endsWith('/scripts/lib/job-paths.mjs'))return {format:'module',shortCircuit:true,source:readFileSync(new URL(url),'utf8').replace("import { ROOT } from './media.mjs';",'const ROOT = '+JSON.stringify(process.env.TASK22_REPORT_ROOT)+';')};
 if(url.endsWith('/engine/src/styles/design-coverage.ts')&&process.env.TASK22_REPORT_PENDING==='yes'){
  const s=readFileSync(new URL(url),'utf8');if(!s.includes("intro:'all'"))throw Error('coverage fixture seam moved');return {format:'module-typescript',shortCircuit:true,source:s.replace("intro:'all'","intro:[]")};
 }
 if(url.endsWith('/scripts/lib/edit-project.mjs')){
  const s=readFileSync(new URL(url),'utf8'),a=s.indexOf('export async function prepareEditProject(');if(a<0)throw Error('preparation fixture seam moved');
  return {format:'module',shortCircuit:true,source:s.slice(0,a)+\`
export async function prepareEditProject(file,{proxy=true,outDir}={}){
 if(proxy!==false)throw Error('no-proxy was not forwarded');
 const m=await readJson(file),base=outDir??'Projects/'+m.id+'/prepared',opts={project:m.id};
 const result={ok:true,manifest:file,manifestHash:digest(m),propsFile:base+'/props.json',plate:'fixture.mp4',plateCached:true,captionIssues:[],omittedWordIndices:[],outputs:[]};
 const props={edit:process.env.TASK22_REPORT_RACE==='props'?{...m,purpose:'changed'}:m};
 await atomicJson(result.propsFile,props,opts);
 await atomicJson(base+'/preparation.json',process.env.TASK22_REPORT_RACE==='report'?{...result,manifestHash:'changed'}:result,opts);
 return result;
}\`};
 }
 return next(url,ctx);
}});`);
  let output,error;
  try{output=await promisify(execFile)(process.execPath,['--import',pathToFileURL(hook).href,entry,'prepare',project+'/edit.json','--no-proxy',...(outDir?['--out-dir',outDir]:[])],{
    cwd:ROOT,windowsHide:true,maxBuffer:4*1024*1024,
    env:{...process.env,TASK22_REPORT_ROOT:root,TASK22_REPORT_PENDING:pending?'yes':'no',TASK22_REPORT_RACE:race??''}});
  }catch(e){error=e;}
  const report=JSON.parse(await readFile(path.join(root,outDir??project+'/prepared','preparation.json'),'utf8'));
  return {output,error,report};
}

for(const entry of ['scripts/editor.mjs','scripts/edit-project.mjs'])for(const pending of [false,true])
test(`${entry} preparation reports ${pending?'an undrawn scene':'no undrawn scenes'} in stdout and on disk`,async()=>{
  const {output,error,report}=await prepareFixture(entry,{pending});
  assert.equal(error,undefined,error?.stderr||error?.message);
  const result=JSON.parse(output.stdout);
  const expected=pending?[{id:'intro',family:'intro',layout:'split',reason:'drawn by the shared pre-V4 view, not the style design system'}]:[];
  assert.deepEqual(result.undrawnScenes,expected);
  assert.deepEqual(report,result);
  const keys=Object.keys(result);
  assert.equal(keys.indexOf('undrawnScenes'),keys.indexOf('captionIssues')+1);
  assert.equal(keys.indexOf('omittedWordIndices'),keys.indexOf('undrawnScenes')+1);
});

test('alternate preparation folders keep the receipt beside the prepared props',async()=>{
  const outDir='Projects/report-fixture/prepared-review';
  const {output,error,report}=await prepareFixture('scripts/edit-project.mjs',{outDir});
  assert.equal(error,undefined,error?.stderr||error?.message);
  assert.deepEqual(report,JSON.parse(output.stdout));
  assert.equal(report.propsFile,outDir+'/props.json');
  assert.deepEqual(report.undrawnScenes,[]);
});

for(const race of ['props','report'])test(`report enrichment refuses a changed ${race} snapshot`,async()=>{
  const {error,report}=await prepareFixture('scripts/editor.mjs',{race});
  assert.ok(error);
  assert.match(error.stderr,/changed during preparation report/);
  assert.equal(Object.hasOwn(report,'undrawnScenes'),false,'a stale receipt must not be enriched');
});

test('a magazine project scene that never reaches the system is refused', () => {
  assert.throws(() => assertStyleSystemImports(edit('magazine-interview'), metadata, metafile(['engine/src/core/safe.ts']), entries), /must draw with the magazine-interview design system/);
});
test('importing the system directly or through a helper passes; unused scenes and other styles are not checked', () => {
  assertStyleSystemImports(edit('magazine-interview'), metadata, metafile(['engine/src/styles/magazine-interview/system/index.ts']), entries);
  assertStyleSystemImports(edit('magazine-interview'), metadata, metafile(['Projects/demo/scenes/helper.tsx']), entries);
  assertStyleSystemImports(edit('section-deck'), metadata, metafile([]), entries);
});

test('cyclic helpers terminate and pass only when they reach the system', () => {
  const graph = metafile(['Projects/demo/scenes/helper.tsx']);
  const helper = graph.inputs[path.relative(process.cwd(), abs('Projects/demo/scenes/helper.tsx'))];
  helper.imports = [{path: path.relative(process.cwd(), entries[0])}];
  assert.throws(() => assertStyleSystemImports(edit('magazine-interview'), metadata, graph, entries), /must draw with/);
  helper.imports.push({path: path.relative(process.cwd(), abs('engine/src/styles/magazine-interview/system/index.ts'))});
  assertStyleSystemImports(edit('magazine-interview'), metadata, graph, entries);
});

test('external imports and similarly named directories cannot satisfy the system rule', () => {
  const external = metafile(['engine/src/styles/magazine-interview/system/index.ts']);
  external.inputs[path.relative(process.cwd(), entries[0])].imports[0].external = true;
  assert.throws(() => assertStyleSystemImports(edit('magazine-interview'), metadata, external, entries), /must draw with/);
  for (const file of ['engine/src/styles/magazine-interview/system-other/index.ts', 'engine/src/styles/section-deck/system/index.ts']) {
    assert.throws(() => assertStyleSystemImports(edit('magazine-interview'), metadata, metafile([file]), entries), /must draw with/);
  }
});

test('each used entry must reach the system independently', () => {
  const manifest = edit('magazine-interview');
  manifest.scenes.push({family: 'project-scene', data: {component: 'unused'}});
  assert.throws(() => assertStyleSystemImports(manifest, metadata, metafile(['engine/src/styles/magazine-interview/system/index.ts']), entries), /Project scene unused must draw with/);
});
