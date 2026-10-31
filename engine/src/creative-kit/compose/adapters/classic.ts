// engine/src/creative-kit/compose/adapters/classic.ts
import type {ComposeData} from '../schema.ts';
import {cue,clampFrame,finish,cardLabel,type AdapterScene} from './types.ts';

export function introToCompose(s:AdapterScene<{kicker:string;title:string;subtitle:string}>,fps=30):ComposeData{
  return finish(s,{arrangement:'stack',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:s.data.kicker},
    {id:'title',kind:'headline',at:{frame:cue(s,1,fps)},text:s.data.title},
    {id:'subtitle',kind:'body',at:{frame:cue(s,2,fps)},text:s.data.subtitle},
  ]},fps);
}
export function proofToCompose(s:AdapterScene<{label:string;value:number;suffix?:string;source:string}>,fps=30):ComposeData{
  return finish(s,{arrangement:'hero',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:cardLabel('proof',s.data)},
    {id:'label',kind:'headline',at:{frame:cue(s,1,fps)},text:s.data.label},
    {id:'value',kind:'number',at:{frame:cue(s,2,fps)},value:s.data.value,...(s.data.suffix?{suffix:s.data.suffix}:{}),emphasis:true},
    {id:'source',kind:'line',at:{frame:cue(s,4,fps)},text:s.data.source},
  ]},fps);
}
export function processToCompose(s:AdapterScene<{title:string;steps:{title:string;detail:string}[]}>,fps=30):ComposeData{
  return finish(s,{arrangement:'stack',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:cardLabel('how',s.data)},
    {id:'title',kind:'headline',at:{frame:cue(s,1,fps)},text:s.data.title},
    {id:'steps',kind:'steps',at:{frame:cue(s,2,fps)},items:s.data.steps.map((step,i)=>({title:step.title,detail:step.detail,offsetFrames:i*22}))},
  ]},fps);
}
export function comparisonToCompose(s:AdapterScene<{title:string;beforeTitle:string;beforeDetail:string;afterTitle:string;afterDetail:string}>,fps=30):ComposeData{
  return finish(s,{arrangement:'two-column',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:cardLabel('beforeAfter',s.data)},
    {id:'title',kind:'headline',at:{frame:cue(s,1,fps)},text:s.data.title},
    {id:'before',kind:'card',at:{frame:cue(s,2,fps)},title:s.data.beforeTitle,body:s.data.beforeDetail},
    {id:'after',kind:'card',at:{frame:cue(s,3,fps)},title:s.data.afterTitle,body:s.data.afterDetail},
  ]},fps);
}
export function commentToCompose(s:AdapterScene<{keyword:string;promise:string}>,fps=30):ComposeData{
  return finish(s,{arrangement:'stack',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:cardLabel('comment',s.data)},
    {id:'title',kind:'headline',at:{frame:cue(s,1,fps)},text:cardLabel('template',s.data)},
    {id:'input',kind:'card',variant:'input',at:{frame:cue(s,2,fps)},title:s.data.keyword,body:s.data.promise},
    {id:'line',kind:'line',at:{frame:cue(s,4,fps)},text:cardLabel('templateLine',s.data)},
  ]},fps);
}
export function followToCompose(s:AdapterScene<{handle:string;message:string}>,fps=30):ComposeData{
  return finish(s,{arrangement:'hero',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:cardLabel('follow',s.data)},
    {id:'card',kind:'card',variant:'follow',at:{frame:cue(s,1,fps)},title:s.data.handle,body:s.data.message,value:cardLabel('followButton',s.data).replace(/^\+\s*/,''),pressFrame:clampFrame(s,80,fps),emphasis:true},
    {id:'line',kind:'line',at:{frame:cue(s,3,fps)},text:cardLabel('followLine',s.data)},
  ]},fps);
}
export function chapterQuoteToCompose(s:AdapterScene<{chapter:string;title:string;quote:string;speaker:string;role:string;quoteFrame:number}>,fps=30):ComposeData{
  return finish(s,{arrangement:'hero',parts:[
    {id:'kicker',kind:'kicker',at:{frame:cue(s,0,fps)},text:`${cardLabel('chapter',s.data)} ${s.data.chapter}`},
    {id:'title',kind:'headline',at:{frame:cue(s,1,fps)},text:s.data.title},
    {id:'quote',kind:'quote',at:{frame:clampFrame(s,s.data.quoteFrame,fps)},text:s.data.quote,speaker:s.data.speaker,role:s.data.role,emphasis:true},
  ]},fps);
}
