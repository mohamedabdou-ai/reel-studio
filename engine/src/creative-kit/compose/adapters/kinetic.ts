// engine/src/creative-kit/compose/adapters/kinetic.ts
import type {ComposeData} from '../schema.ts';
import type {ClipValue} from '../../../core/clip-schema.ts';
import {cue,clampFrame,finish,type AdapterScene} from './types.ts';

export type AdapterMediaSource=
  {kind:'sequence';steps:{offsetFrames:number;clip?:ClipValue;still?:string;video?:{src:string;trimBeforeFrame:number;fit:'cover'|'contain'};label?:string;title?:string}[]}
  |{kind:'pair';images:{src:string;label:string}[]};
/** Adapter pages may hold media sources that authored pages cannot (sequences and pairs). */
export type AdaptedData=Omit<ComposeData,'parts'>&{parts:(ComposeData['parts'][number]|{id:string;kind:'media';at:{frame:number};emphasis?:boolean;source:AdapterMediaSource;caption?:string})[]};

export function outcomeToCompose(s:AdapterScene<{kicker:string;title:string;items:string[];footer:string}>,fps=30):ComposeData{
  return finish(s,{arrangement:'stack',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:s.data.kicker},
    {id:'title',kind:'headline',at:{frame:cue(s,1,fps)},text:s.data.title},
    {id:'items',kind:'list',at:{frame:cue(s,2,fps)},items:s.data.items.map(text=>({text,mark:'check' as const}))},
    {id:'foot',kind:'line',at:{frame:clampFrame(s,s.durationInFrames,fps)},text:s.data.footer},
  ]},fps);
}
export function dataStoryToCompose(s:AdapterScene<{kicker:string;title:string;sourceNote:string;display:'metric'|'bars';suffix:string;unit:string;animateFrames:number;items:{label:string;value:number;atFrame:number}[]}>,fps=30):ComposeData{
  const first=s.data.items[0];
  const hero=s.data.display==='metric'
    ?{id:'metric',kind:'number' as const,at:{frame:clampFrame(s,first.atFrame,fps)},value:first.value,...(s.data.suffix?{suffix:s.data.suffix}:{}),label:first.label,unit:s.data.unit,rollFrames:s.data.animateFrames,emphasis:true}
    :{id:'bars',kind:'bars' as const,at:{frame:clampFrame(s,first.atFrame,fps)},items:s.data.items.map(i=>({label:i.label,value:i.value,offsetFrames:i.atFrame-first.atFrame})),unit:s.data.unit,emphasis:true};
  return finish(s,{arrangement:'hero',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:s.data.kicker},
    {id:'title',kind:'headline',at:{frame:cue(s,1,fps)},text:s.data.title},
    hero,
    {id:'source',kind:'line',at:{frame:clampFrame(s,s.durationInFrames,fps)},text:s.data.sourceNote},
  ]},fps);
}
export function imageCompareToCompose(s:AdapterScene<{kicker:string;title:string;images:{src:string;label:string}[];stamp:string}>,fps=30):AdaptedData{
  return finish(s,{arrangement:'hero',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:s.data.kicker},
    {id:'title',kind:'headline',at:{frame:cue(s,1,fps)},text:s.data.title},
    {id:'pair',kind:'media',at:{frame:cue(s,2,fps)},source:{kind:'pair',images:s.data.images},emphasis:true},
    {id:'stamp',kind:'line',at:{frame:cue(s,4,fps)},text:s.data.stamp},
  ]},fps);
}
type WindowStep={atFrame:number;title:string;src:string;kind?:'image'|'video';fit?:'cover'|'contain';trimBeforeFrame?:number};
type BrollStep=ClipValue&{atFrame:number;label?:string};
export function screensToCompose(s:AdapterScene<{look?:'window';kicker:string;steps:WindowStep[]}|{look:'broll';steps:BrollStep[]}>,fps=30):AdaptedData{
  if(s.data.look==='broll'){
    return finish(s,{arrangement:'hero',parts:[{id:'clips',kind:'media',at:{frame:0},emphasis:true,source:{kind:'sequence',steps:s.data.steps.map(step=>{
      const {atFrame,label,...clip}=step;return {offsetFrames:atFrame,clip:clip as ClipValue,...(label?{label}:{})};})}}]},fps);
  }
  const data=s.data as {kicker:string;steps:WindowStep[]};
  return finish(s,{arrangement:'hero',parts:[
    {id:'kicker',kind:'kicker',at:{frame:0},text:data.kicker},
    {id:'window',kind:'media',at:{frame:0},emphasis:true,source:{kind:'sequence',steps:data.steps.map(step=>({offsetFrames:step.atFrame,title:step.title,
      ...((step.kind??'image')==='video'?{video:{src:step.src,trimBeforeFrame:step.trimBeforeFrame??0,fit:step.fit??'contain'}}:{still:step.src})}))}},
  ]},fps);
}
