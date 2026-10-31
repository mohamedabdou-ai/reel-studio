import {bundleEngine} from './engine-bundle.mjs';

// Fixed glyph geometry isolates the draw contract from browser font rasterization.
const canvas = `
import {designWarning} from '../style-kit/design-safety';
export {fit,text,fontAt,layout} from './canvas-real';
export const MoveCanvas=()=>null;
const body={id:0,kind:'body',x:0,y:20,w:80,h:20,cx:40,cy:30};
const dot={id:1,kind:'dot',x:20,y:10,w:5,h:5,cx:22.5,cy:12.5};
export const raster=()=>({width:100,height:60,baseline:50,size:40,k:4,ctx:{font:'',measureText:()=>({width:80})}});
export const blobs=()=>[body,dot];
export const drawBlob=(ctx,r,b,x,y,o)=>ctx.drawImage(b.id,x,y,o);
`;

export async function moveLogApi() {
  // Keep the actual fitter/text/layout implementation while replacing only raster helpers.
  const {readFileSync} = await import('node:fs');
  const realPath='engine/src/arabic-type/canvas.ts';
  const actual=readFileSync(new URL('../../'+realPath,import.meta.url),'utf8');
  const stub=canvas.replace("export {fit,text,fontAt,layout} from './canvas-real';",
    actual.slice(actual.indexOf('export const fontAt='),actual.indexOf('/** Measurement'))+
    actual.slice(actual.indexOf('export function fit('),actual.indexOf('export interface Raster')));
  return bundleEngine(`
    import {Decrypt} from './engine/src/arabic-type/moves/decrypt';
    import {PenWrite} from './engine/src/arabic-type/moves/pen-write';
    import {RedactedStamp} from './engine/src/arabic-type/moves/redacted-stamp';
    export const moves={Decrypt,PenWrite,RedactedStamp};
  `,{ssr:true,sourceOverrides:{[realPath]:stub}});
}

export function drawLog(Component,t,look) {
  const log=[];
  const ctx=new Proxy({measureText(value){log.push(['measureText',value]);return {width:value.length*12};}}, {
    get(target,key){return key in target?target[key]:(...args)=>log.push([key,...args]);},
    set(target,key,value){log.push(['set',key,value]);target[key]=value;return true;},
  });
  const props={text:'one two',stamp:'OK',font:'Cairo',size:40,ink:'#fff',accent:'#fc0',fps:30,durationInFrames:240,width:270,height:480,...(look?{look}:{})};
  Component(props).props.draw(ctx,t,props);
  return log;
}

export const sampleTimes=[0,.3,.7,1.5,2.1,7.8];
