import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const ENGINE=path.join(ROOT,'engine');
const engineRequire=createRequire(path.join(ENGINE,'package.json'));
const {build}=engineRequire('esbuild');
const harness=readFileSync(path.join(ROOT,'scripts/lib/ssr-frames.mjs'),'utf8');
const grab=name=>{
  const match=harness.match(new RegExp('const '+name+' = `([\\s\\S]*?)`;'));
  if(!match)throw new Error('magazine-design-ssr: missing '+name+' adapter');
  return match[1];
};
const LAYOUT_UTILS=grab('LAYOUT_UTILS'), LOTTIE_STUB=grab('LOTTIE_STUB');
const cache=new Map();

async function loadDesign(module,exportName) {
  const file=module instanceof URL?fileURLToPath(module):path.resolve(ROOT,module);
  const key=JSON.stringify([file,exportName]);
  if(cache.has(key))return cache.get(key);
  const pending=(async()=>{
    const entry=`
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {Internals} from 'remotion';
      import * as design from ${JSON.stringify(file.replaceAll('\\','/'))};
      import {designSet} from './engine/src/style-kit/design-safety';
      import {PreparedPlateProvider} from './engine/src/screen-recording/ScreenRecordingScene';
      import {getSceneGeometry} from './engine/src/creative-kit/primitives';
      import {LOADED_FAMILIES} from './engine/src/core/fonts';
      import {DigitsProvider} from './engine/src/creative-kit/digits';
      const h=React.createElement, C=design[${JSON.stringify(exportName)}];
      if(typeof C!=='function')throw new Error('magazine-design-ssr: export is not a component: '+${JSON.stringify(exportName)});
      function inComposition(node,frame,durationInFrames) {
        const composition={id:'frame',component:()=>null,durationInFrames,fps:30,width:1080,height:1920,defaultProps:{}};
        const metadata={durationInFrames,fps:30,width:1080,height:1920,props:{},defaultProps:{}};
        const before={document:globalThis.document,localStorage:globalThis.localStorage};
        globalThis.document={createElement:()=>({getContext:()=>null}),fonts:{forEach(visit){for(const family of LOADED_FAMILIES)visit({family,status:'loaded'});}}};
        globalThis.localStorage={getItem:()=>null,setItem(){}};
        try {
          return renderToStaticMarkup(h(Internals.RemotionRootContexts,{frameState:{frame},numberOfAudioTags:0,logLevel:'error',audioLatencyHint:'interactive',videoEnabled:true,audioEnabled:true},
            h(Internals.CanUseRemotionHooksProvider,null,
              h(Internals.CompositionManager.Provider,{value:{compositions:[composition],folders:[],currentCompositionMetadata:metadata,currentAssetMetadata:null,canvasContent:{type:'composition',compositionId:'frame'}}},node))));
        } finally {
          for(const [key,value] of Object.entries(before)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
        }
      }
      export function family({scene,frame,seam,headBox=null,words=[],plate}) {
        seam??=getSceneGeometry('magazine-interview','split').canvasHeight;
        const Design=designSet({[scene.family]:C},{system:'magazine-interview'})[scene.family];
        const geometry={windowTop:seam,windowHeight:1920-seam,videoWidth:486,videoLeft:297,videoTop:seam};
        let node=h(Design,{scene,seam,headBox,words,style:'magazine-interview',sectionIndex:0,geometry,aspect:16/9});
        if(plate)node=h(PreparedPlateProvider,{plate},node);
        return inComposition(node,frame,scene.durationInFrames);
      }
      export function concept({props,frame,digits}) {
        const node=h(React.Fragment,null,h('span',{hidden:true,'data-style-system':'magazine-interview'}),h(C,{...props,sectionIndex:props.sectionIndex??0}));
        return inComposition(digits===undefined?node:h(DigitsProvider,{digits},node),frame,props.durationInFrames);
      }
    `;
    const bundle=await build({
      stdin:{contents:entry,resolveDir:ROOT,loader:'tsx'},nodePaths:[path.join(ENGINE,'node_modules')],
      bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',logLevel:'silent',
      plugins:[{name:'magazine-design-ssr',setup(b){
        b.onResolve({filter:/^@remotion\/layout-utils$/},()=>({path:'layout-utils',namespace:'magazine-design-ssr'}));
        b.onResolve({filter:/^@remotion\/lottie$/},()=>({path:'lottie-stub',namespace:'magazine-design-ssr'}));
        b.onLoad({filter:/^layout-utils$/,namespace:'magazine-design-ssr'},()=>({contents:LAYOUT_UTILS,loader:'js'}));
        b.onLoad({filter:/^lottie-stub$/,namespace:'magazine-design-ssr'},()=>({contents:LOTTIE_STUB,loader:'js',resolveDir:ENGINE}));
        b.onLoad({filter:/creative-kit[\\/]primitives\.tsx$/},({path:file})=>{
          const source=readFileSync(file,'utf8');
          const start=source.indexOf('export const CreativeFonts:'),end=source.indexOf('export const SceneCanvas:',start);
          if(start<0||end<=start)throw new Error('magazine-design-ssr: CreativeFonts gate moved');
          return {contents:source.slice(0,start)+'export const CreativeFonts = ({children}) => <>{children}</>;\n'+source.slice(end),loader:'tsx',resolveDir:path.dirname(file)};
        });
      }}],
    });
    const mod={exports:{}};
    // Other SSR helpers may already have installed a document. Module loading must
    // stay on the server path so core/fonts does not start browser font requests.
    const previousDocument=globalThis.document;
    delete globalThis.document;
    try {
      new Function('require','module','exports',bundle.outputFiles[0].text)(engineRequire,mod,mod.exports);
    } finally {
      if(previousDocument!==undefined)globalThis.document=previousDocument;
    }
    return mod.exports;
  })();
  cache.set(key,pending);
  try{return await pending;}catch(error){cache.delete(key);throw error;}
}

/** Synthetic text metrics compare markup; use browser output for visual review. Paths resolve from the repo root. */
export async function renderFamilyDesign({module,exportName,...args}) {
  return (await loadDesign(module,exportName)).family(args);
}
export async function renderConceptDesign({module,exportName,...args}) {
  return (await loadDesign(module,exportName)).concept(args);
}
