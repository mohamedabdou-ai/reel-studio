import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {reviewManifest} from './helpers/review-manifest.mjs';
import * as visibility from '../engine/src/prepared-edit/visibility.ts';
import * as captions from '../engine/src/review-editor/ops/captions.ts';
import {buildEditorPlan,assertDeliveryReady,planEditorBrief} from '../scripts/lib/editor-director.mjs';
import {profileToBrief} from '../scripts/lib/branding.mjs';
import {inspectEditSource,importEditCaptions} from '../scripts/lib/edit-project.mjs';
import {ROOT,run} from '../scripts/lib/media.mjs';

const profile=JSON.parse(await fs.readFile(new URL('../PROFILE.example.json',import.meta.url),'utf8'));
const source={path:'Raw/example.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:90};
const words=[{text:'كلام المصدر',startMs:0,endMs:500,confidence:1}];
const brief=()=>({version:1,id:'caption-choice',source:source.path,transcript:'Projects/caption-choice/words.json',...profileToBrief(profile),purpose:'explainer',tone:'calm',captionsReviewedBy:'Example reviewer',
  beats:[{id:'opening',fromSec:0,toSec:3,intent:'intro',data:{kicker:'Example',title:'An authored idea',subtitle:'Review the meaning',caption:'Example'}}]});

test('a per-video caption visibility choice reaches the manifest without changing profile or speech',()=>{
  const raw=brief(),before=JSON.stringify(raw.preferences);raw.captionsVisible=false;
  let result;assert.doesNotThrow(()=>{result=buildEditorPlan(raw,source,words);});
  assert.equal(result.manifest.captions.visible,false);
  assert.deepEqual(result.manifest.captions.words,words);
  assert.equal(result.manifest.captions.status,'reviewed');
  assert.equal(JSON.stringify(raw.preferences),before);
  assert.equal(buildEditorPlan({...raw,captionsVisible:true},source,words).manifest.captions.visible,true);
});
test('only explicit false hides recording overlays and the live toggle preserves review and words',()=>{
  assert.equal(typeof visibility.captionOverlayVisible,'function');
  const m=reviewManifest();
  assert.equal(visibility.captionOverlayVisible(m),true);
  assert.equal(typeof captions.setCaptionVisibility,'function');
  const hidden=captions.setCaptionVisibility(m,false);
  assert.equal(hidden.ok,true);
  assert.equal(visibility.captionOverlayVisible(hidden.manifest),false);
  assert.deepEqual(hidden.manifest.captions.words,m.captions.words);
  assert.equal(hidden.manifest.captions.status,m.captions.status);
  assert.equal(captions.setCaptionVisibility(hidden.manifest,true).manifest.captions.visible,true);
  const empty={...hidden.manifest,purpose:'delivery',captions:{...hidden.manifest.captions,status:'reviewed',reviewer:'Example reviewer',words:[]}};
  assert.throws(()=>assertDeliveryReady(empty),/nonempty reviewed caption words/);
});
test('the actual CaptionTrack produces no generated overlay when a recording explicitly hides captions',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../engine/package.json',import.meta.url)),{build}=require('esbuild');
  const output=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {CaptionTrack} from './engine/src/prepared-edit/PreparedEdit';export const render=(edit,compiled)=>renderToStaticMarkup(React.createElement(CaptionTrack,{edit,compiled,center:1320}));`,loader:'tsx',resolveDir:root},
    nodePaths:[path.join(root,'engine/node_modules')],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'ssr-frame',setup(builder){builder.onLoad({filter:/prepared-edit[\\/]PreparedEdit\.tsx$/},async({path:file})=>{
      const source=await fs.readFile(file,'utf8');
      assert.ok(source.includes('const frame=useCurrentFrame();'));
      // SSR supplies a frame; the actual CaptionTrack visibility and return path stay intact.
      return {contents:source.replaceAll('const frame=useCurrentFrame();','const frame=5;'),loader:'tsx',resolveDir:path.dirname(file)};
    });}}]});
  const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports);
  const m=reviewManifest();m.captions.visible=false;
  const {compileEdit}=await import('../engine/src/prepared-edit/timeline.ts');
  let html;assert.doesNotThrow(()=>{html=module.exports.render(m,compileEdit(m));},'Hidden overlays must return before browser-only text measurement');
  assert.equal(html,'');
  assert.equal(m.captions.words[0].text,'شرح');
});
test('real planning, replacement planning and transcript import retain the per-video choice',async()=>{
  const id=`caption-visible-${randomUUID()}`,relative=`Projects/${id}`,directory=path.resolve(ROOT,relative);
  assert.ok(directory.startsWith(path.resolve(ROOT,'Projects')+path.sep));
  await fs.mkdir(directory,{recursive:true});
  try{
    const sourceFile=`${relative}/source.mp4`;
    await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=gray:s=64x96:r=30:d=3','-c:v','libx264','-pix_fmt','yuv420p','-colorspace','bt709',path.resolve(ROOT,sourceFile)]);
    const info=await inspectEditSource(sourceFile),transcript=`${relative}/words.json`,briefFile=`${relative}/brief.json`,editFile=`${relative}/edit.json`;
    await fs.writeFile(path.resolve(ROOT,transcript),JSON.stringify(words));
    const raw={...brief(),id,source:sourceFile,transcript,captionsVisible:false};
    await fs.writeFile(path.resolve(ROOT,briefFile),JSON.stringify(raw));
    await planEditorBrief(briefFile);
    assert.equal(JSON.parse(await fs.readFile(path.resolve(ROOT,editFile),'utf8')).captions.visible,false);
    delete raw.captionsVisible;
    await fs.writeFile(path.resolve(ROOT,briefFile),JSON.stringify(raw));
    await planEditorBrief(briefFile,{replace:true});
    assert.equal(JSON.parse(await fs.readFile(path.resolve(ROOT,editFile),'utf8')).captions.visible,false,'Replacement planning must preserve a saved per-video choice when no override is supplied');
    await importEditCaptions(editFile,transcript);
    const imported=JSON.parse(await fs.readFile(path.resolve(ROOT,editFile),'utf8'));
    assert.equal(imported.captions.visible,false);
    assert.deepEqual(imported.captions.words,words);
    assert.equal(imported.captions.status,'draft');
    assert.equal(imported.source.sha256,info.source.sha256);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
