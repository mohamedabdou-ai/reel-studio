// engine/src/creative-kit/compose/adapters/semantic.ts
import type {ComposeData} from '../schema.ts';
import {cue,clampFrame,finish,type AdapterScene} from './types.ts';
type Heading={kicker:string;title:string};
const head=(s:AdapterScene<Heading>,fps=30)=>[
  {id:'kicker',kind:'kicker' as const,at:{frame:cue(s,0,fps)},text:s.data.kicker},
  {id:'title',kind:'headline' as const,at:{frame:cue(s,1,fps)},text:s.data.title},
];
const foot=(s:AdapterScene<unknown>,text:string,fps=30)=>({id:'foot',kind:'line' as const,at:{frame:clampFrame(s,s.durationInFrames,fps)},text});

export function tokenLensToCompose(s:AdapterScene<Heading&{groups:{label:string;tokens:string[];atFrame:number}[];lens:{groupIndex:number;tokenIndex:number;atFrame:number};footer:string}>,fps=30):ComposeData{
  const cards=s.data.groups.map((g,i)=>({id:`group-${i}`,kind:'card' as const,at:{frame:clampFrame(s,g.atFrame,fps)},title:g.label,...(g.tokens.filter((_,j)=>i!==s.data.lens.groupIndex||j!==s.data.lens.tokenIndex).length?{body:g.tokens.filter((_,j)=>i!==s.data.lens.groupIndex||j!==s.data.lens.tokenIndex).join(' · ')}:{}),
    ...(i===s.data.lens.groupIndex?{value:g.tokens[s.data.lens.tokenIndex],pressFrame:clampFrame(s,s.data.lens.atFrame,fps),emphasis:true}:{})}));
  return finish(s,{arrangement:cards.length>=2?'grid':'hero',parts:[...head(s,fps),...cards,foot(s,s.data.footer,fps)]},fps);
}
export function meterReceiptToCompose(s:AdapterScene<Heading&{rows:{label:string;value:number;atFrame:number}[];maximum:number;unit:string;source:string}>,fps=30):ComposeData{
  const first=s.data.rows[0].atFrame;
  return finish(s,{arrangement:'hero',parts:[...head(s,fps),
    {id:'meter',kind:'bars',at:{frame:clampFrame(s,first,fps)},items:s.data.rows.map(r=>({label:r.label,value:r.value,offsetFrames:r.atFrame-first})),max:s.data.maximum,unit:s.data.unit,emphasis:true},
    foot(s,s.data.source,fps)]},fps);
}
export function ticketOfferToCompose(s:AdapterScene<Heading&{ticket:{label:string;value:string;detail:string;atFrame:number};footer:string}>,fps=30):ComposeData{
  const {label,value}=s.data.ticket;
  const visible=(text:string)=>Array.from(text.replace(/[\p{Mark}\p{Cf}]/gu,'')).length;
  const shortLabel=visible(label)<=visible(value);
  return finish(s,{arrangement:'hero',parts:[...head(s,fps),
    {id:'ticket',kind:'card',variant:'ticket',at:{frame:clampFrame(s,s.data.ticket.atFrame,fps)},title:shortLabel?value:label,value:shortLabel?label:value,body:s.data.ticket.detail,emphasis:true},
    foot(s,s.data.footer,fps)]},fps);
}
export function commentStackToCompose(s:AdapterScene<Heading&{comments:{author:string;text:string;atFrame:number}[];keyword:string;prompt:string}>,fps=30):ComposeData{
  const first=s.data.comments[0].atFrame;
  return finish(s,{arrangement:'stack',parts:[...head(s,fps),
    {id:'comments',kind:'chat',at:{frame:clampFrame(s,first,fps)},messages:s.data.comments.map(c=>({from:'them' as const,author:c.author,text:c.text,offsetFrames:c.atFrame-first}))},
    foot(s,`${s.data.keyword} · ${s.data.prompt}`,fps)]},fps);
}
export function routeStopsToCompose(s:AdapterScene<Heading&{stops:{label:string;detail:string;atFrame:number;image?:string}[];footer:string}>,fps=30):ComposeData{
  const first=s.data.stops[0].atFrame;
  return finish(s,{arrangement:'stack',parts:[...head(s,fps),
    {id:'route',kind:'steps',at:{frame:clampFrame(s,first,fps)},items:s.data.stops.map(st=>({title:st.label,detail:st.detail,offsetFrames:st.atFrame-first,...(st.image?{image:st.image}:{})}))},
    foot(s,s.data.footer,fps)]},fps);
}
export function evidenceWipeToCompose(s:AdapterScene<Heading&{before:{src:string;width:number;height:number;label:string};after:{src:string;width:number;height:number;label:string};revealFrame:number;revealDurationFrames:number;footer:string}>,fps=30):ComposeData{
  return finish(s,{arrangement:'hero',parts:[...head(s,fps),
    {id:'evidence',kind:'media',at:{frame:clampFrame(s,s.data.revealFrame,fps)},source:{kind:'compare',before:s.data.before,after:s.data.after,revealFrames:s.data.revealDurationFrames},emphasis:true},
    foot(s,s.data.footer,fps)]},fps);
}
