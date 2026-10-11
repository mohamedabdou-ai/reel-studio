import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const engineRequire=createRequire(new URL('../engine/package.json',import.meta.url));
const {build}=engineRequire('esbuild');
// SSR has no document.fonts or animation frame. Bypass only the asynchronous font
// readiness gate in memory; keep real providers, theme calculations and ConceptStage.
const bundle=await build({stdin:{contents:`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {ChapterThemeProvider,TypographyProvider} from './engine/src/creative-kit/chapter-theme';
  import {getSceneTheme} from './engine/src/creative-kit/primitives';
  import {ConceptStage,useConcept,numberFont,styleShape} from './engine/src/motion-concepts/shared';
  export function capture({font=null,brand=null,chapter=null,style='section-deck'}={}){
    let result;
    function Inspect(){const {theme}=useConcept();result={theme,latinNumber:numberFont(theme,'latin'),arabicNumber:numberFont(theme,'arabic-indic'),shape:styleShape(theme)};return React.createElement('span',null,'Context reached the concept body');}
    let scene=React.createElement(ConceptStage,{style},React.createElement(Inspect));
    if(chapter)scene=React.createElement(ChapterThemeProvider,{chapter},scene);
    const html=renderToStaticMarkup(React.createElement(ChapterThemeProvider,{chapter:brand},React.createElement(TypographyProvider,{fontFamily:font},scene)));
    return {...result,html,base:getSceneTheme(style)};
  }
`,resolveDir:root,loader:'tsx'},nodePaths:[path.join(root,'engine/node_modules')],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent',plugins:[{
  name:'ssr-font-readiness',setup(builder){builder.onLoad({filter:/creative-kit[\\/]primitives\.tsx$/},async({path:file})=>{
    const source=await readFile(file,'utf8');
    const start=source.indexOf('export const CreativeFonts:'),end=source.indexOf('export const SceneCanvas:',start);
    assert.ok(start>=0&&end>start,'The SSR adapter must only replace the isolated font gate');
    return {contents:source.slice(0,start)+'export const CreativeFonts=({children})=><>{children}</>;\n'+source.slice(end),loader:'tsx',resolveDir:path.dirname(file)};
  });}
}]});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(engineRequire,module,module.exports);
const {capture}=module.exports;
const brand={ground:'#FCF6E7',accent:'#D9E9C0',ink:'#102A21',onAccent:'#102A21'};
const chapter={ground:'#EEF4FE',accent:'#B8D4F8',ink:'#102B4B',onAccent:'#102B4B'};

test('integrated concept bodies inherit the selected font and brand while keeping style grammar',()=>{
  const result=capture({font:'Noto Naskh Arabic',brand});
  assert.equal(result.theme.ar,'Noto Naskh Arabic');
  assert.equal(result.theme.display,'Noto Naskh Arabic');
  assert.equal(result.theme.background,brand.ground);
  assert.equal(result.theme.accent,brand.accent);
  assert.equal(result.theme.text,brand.ink);
  assert.match(result.html,/background:#FCF6E7/i,'The actual concept canvas must use the selected brand');
  assert.deepEqual(result.theme.grammar,result.base.grammar);
  assert.equal(result.theme.mono,result.base.mono);
  assert.equal(result.latinNumber,result.theme.display);
  assert.equal(result.arabicNumber,result.theme.ar);
});
test('an authored scene chapter overrides the surrounding brand without losing typography',()=>{
  const result=capture({font:'Tajawal',brand,chapter});
  assert.equal(result.theme.background,chapter.ground);
  assert.equal(result.theme.accent,chapter.accent);
  assert.equal(result.theme.text,chapter.ink);
  assert.equal(result.theme.ar,'Tajawal');
  assert.equal(result.theme.display,'Tajawal');
});
test('standalone concepts retain their original theme and number font policy without overrides',()=>{
  const result=capture();
  assert.deepEqual(result.theme,result.base);
  assert.equal(result.latinNumber,result.base.display);
  assert.equal(result.arabicNumber,result.base.ar);
});
