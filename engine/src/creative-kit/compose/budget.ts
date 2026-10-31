// engine/src/creative-kit/compose/budget.ts
// A conservative, Node-safe height estimate at the minimum sizes. Validation uses it to refuse pages that cannot fit.
import {pageRegions,type ComposePart,type ComposeScene} from './schema.ts';
import {systemZones} from '../../style-kit/system/zones.ts';
import type {AdaptedData} from './adapters/kinetic.ts';

export {pageRegions};

export const PAGE_GAP=28;

export const TYPE = {
  headline: [60, 112], body: [44, 60], line: [44, 54], quote: [52, 96], list: [46, 64], detail: [36, 44],
  chat: [46, 58], card: [48, 72], step: [46, 62], stepNo: [96, 150], mark: [130, 210], number: [200, 340],
} as const;
export const sized = (k: keyof typeof TYPE, scale: number) => Math.min(TYPE[k][1], Math.round(TYPE[k][0] * scale));
const GLYPH = 0.58;
const lines = (text: string, size: number, width: number) => Math.max(1, Math.ceil(text.length * size * GLYPH / Math.max(1, width)));
const block = (text: string, size: number, width: number, lh: number) => Math.round(lines(text, size, width) * size * lh);

/** Ticket drawing and budget share the same width/size search; the drawing supplies font measurements. */
export function ticketStubPlan(text:string,width:number,measure=(value:string,size:number,_numeric:boolean)=>Array.from(value).length*size*GLYPH){
  const numeric=/^[\p{Number}\p{Symbol}\p{Punctuation}\s]+$/u.test(text),max=Math.max(0,width*0.3),base=Math.min(150,max);
  // Prefer a readable single line, using the full permitted stub width first.
  for(let size=54;size>=(numeric?30:40);size--){
    const need=measure(text,size,numeric)+32;
    if(need<=max)return {width:Math.max(base,need),size,lines:[text],numeric,fits:true};
  }
  const words=text.trim().split(/\s+/);
  const choices=numeric?[[text]]:[[text],...words.slice(1).map((_,i)=>[words.slice(0,i+1).join(' '),words.slice(i+1).join(' ')])];
  if(!numeric&&words.length===1){const chars=Array.from(text);for(let i=1;i<chars.length;i++)choices.push([chars.slice(0,i).join(''),chars.slice(i).join('')]);}
  for(let size=54;size>=30;size--){
    const ranked=choices.map(lines=>({lines,need:Math.max(...lines.map(line=>measure(line,size,numeric)))+32})).sort((a,b)=>a.need-b.need);
    const one=ranked.find(p=>p.lines.length===1&&p.need<=base);
    const best=one??ranked[0];
    if(best.need<=max)return {width:Math.max(base,best.need),size,lines:best.lines,numeric,fits:true};
  }
  const best=choices.map(lines=>({lines,need:Math.max(...lines.map(line=>measure(line,30,numeric)))})).sort((a,b)=>a.need-b.need)[0];
  return {width:max,size:30,lines:best.lines,numeric,fits:false};
}

/** Conservative height of a part at a type scale. Port: budget.ts estimatePartHeight(part, width, scale = 1). */
/** Natural height of a screen plate at full size: address bar, blocks, gaps and padding. */
export function screenNatural(part: Extract<ComposePart, {kind: 'screen'}>, width: number): number {
  const inner = width - 104;
  const h = part.blocks.map((b: any) => b.kind === 'heading' ? block(b.text, 60, inner, 1.2) : b.kind === 'text' ? Math.min(3, lines(b.text, 44, inner)) * 57
    : b.kind === 'row' ? 76 : b.kind === 'stat' ? (b.text ? 170 : 124) : b.kind === 'button' ? 96 : 300);
  const chrome = (part.title ? Math.min(2, lines(part.title, 54, inner)) * 70 : 0) + (part.url ? 44 : 0);
  return 18 + 24 + chrome + (chrome ? 30 : 10) + h.reduce((a: number, b: number) => a + b, 0) + 30 * (h.length - 1) + 48;
}
type MediaPart=Extract<ComposePart|AdaptedData['parts'][number],{kind:'media'}>;
/** Same plate aspect for drawing and budgeting; dimensionless sources retain the existing 16:9 fallback. */
export const mediaAspect=(part:MediaPart,clip?:{width:number;height:number}):number=>{
  if(clip)return clip.height/clip.width;
  const s=part.source;
  if(s.kind==='image')return s.height/s.width;
  if(s.kind==='compare')return s.before.height/s.before.width;
  if(s.kind==='sequence'&&s.steps[0]?.clip)return s.steps[0].clip.height/s.steps[0].clip.width;
  return 9/16;
};
/** B-roll has no caption gap to reserve; other plates retain their approved spacing. */
export const mediaPlatePadding=(part:MediaPart)=>24+(part.caption?64:0)-(part.source.kind==='sequence'&&part.source.steps.every(step=>step.clip)&&!part.caption?24:0);
export const mediaNatural = (part: MediaPart, width: number) => {
  const s=part.source,plateWidth=s.kind==='pair'?Math.max(0,(width-PAGE_GAP)/2):width;
  const height=s.kind==='sequence'?Math.max(0,...s.steps.map(step=>Math.min(width*mediaAspect(part,step.clip),720))):Math.min(plateWidth*mediaAspect(part),720);
  return Math.round(height)+mediaPlatePadding(part);
};
/** Flexible parts shrink only after minimum type: plates to 50 %, screens and steps to 80 %. */
export const SHRINK_FLOOR = {media: 0.5, screen: 0.8, steps: 0.8} as const;

/** One-line steps keep ten pixels clear on each side of a row boundary. */
export const stepsRowMinimum=(titleBox:number,detailBox=0)=>titleBox+detailBox+20;
export function stepsMetrics(part:Extract<ComposePart,{kind:'steps'}>,width:number,scale=1,shrink=1){
  const natural=part.items.reduce((h,i)=>h+Math.max(Math.round(sized('stepNo',scale)*0.85),block(i.title,sized('step',scale),width-220,1.3)+(i.detail?block(i.detail,sized('detail',scale),width-220,1.3):0))+14,-14);
  const minimumRow=Math.max(...part.items.map(i=>stepsRowMinimum(Math.round(40*1.3),i.detail?Math.round(34*1.3):0)));
  const minimumHeight=minimumRow*part.items.length;
  // Preserve the approved unshrunk row geometry. A short box stops at the text floor.
  const height=shrink===1?natural:Math.max(Math.round(natural*Math.max(SHRINK_FLOOR.steps,shrink)),minimumHeight);
  return {natural,minimumRow,minimumHeight,height,effectiveFloor:Math.max(SHRINK_FLOOR.steps,minimumHeight/natural)};
}

/** Conservative height of a part at a type scale and a shrink factor. Port: budget.ts estimatePartHeight(part, width, scale = 1, shrink = 1);
 * validation calls it at scale 1 and the shrink floor. */
export function estimatePartHeight(part: ComposePart|MediaPart, width: number, scale = 1, shrink = 1): number {
  switch (part.kind) {
    case 'kicker': return 44;
    case 'headline': {
      const words = part.text.trim().split(/\s+/), n = words.length, kc = Math.min(n, n <= 3 ? 1 : n <= 6 ? 2 : 3);
      const thin = words.slice(0, n - kc), key = words.slice(n - kc);
      while (thin.length && Array.from(thin[thin.length - 1] as string).length <= 3) key.unshift(thin.pop()!);
      const S = sized('headline', scale);
      return Math.round(((thin.length ? lines(thin.join(' '), S, width) : 0) + lines(key.join(' '), S * 1.08, width)) * S * 1.2);
    }
    case 'line': return Math.round(sized('line', scale) * 1.3)*(lines(part.text,34,width-40)>1?2:1);
    case 'body': return block(part.text, sized('body', scale), width, 1.24);
    case 'number': { const S = sized('number', scale); return Math.round(S * 0.82) + (part.label || part.unit ? 36 + Math.round(sized('line', scale) * 1.3) * ((part.label ? 1 : 0) + (part.unit ? 1 : 0)) : 0); }
    case 'bars': return part.items.length * Math.round(part.items.length <= 3 ? 124 * Math.min(scale, 1.25) : 96) + (part.unit ? 64 : 0);
    case 'ring': return Math.min(width, Math.round(300 * scale)) + (part.label ? 70 : 0);
    case 'quote': return block(part.text, sized('quote', scale), width - 120, 1.2) + 86;
    case 'list': return part.items.reduce((h: number, i: any) => h + Math.max(Math.round(sized('list', scale) * 1.6), block(i.text, sized('list', scale), width - 150, 1.34) + (i.detail ? block(i.detail, sized('detail', scale), width - 150, 1.3) : 0)) + 30, -30);
    case 'card': { if (part.variant === 'stamp') return 200; const st = part.variant === 'ticket' ? ticketStubPlan(part.value??'',width).width : 0; return 80 + block(part.title, sized('card', scale) * 1.06, width - 92 - st, 1.25) + (part.body ? 12 + block(part.body, sized('detail', scale), width - 92 - st, 1.35) : 0) + (part.value && part.variant !== 'follow' && part.variant !== 'ticket' ? 20 + Math.round(sized('card', scale) * 1.5) : 0) + (part.variant === 'follow' ? 116 : 0); }
    case 'chat': {const thread=part.messages.every(m=>m.author);return part.messages.reduce((h: number, m: any, i: number) => h + block(m.text, (!thread&&i === part.messages.length - 1 ? Math.round(sized('chat', scale) * 1.3) : sized('chat', scale)) * 1.06, width - 84, 1.34) + (thread?Math.round(Math.max(30,Math.round(sized('chat',scale)*0.62))*1.3)+12:0) + 34, -34);}
    case 'screen': return Math.round(screenNatural(part, width) * Math.max(SHRINK_FLOOR.screen, shrink));
    case 'steps': return stepsMetrics(part,width,scale,shrink).height;
    case 'media': { const cap = mediaPlatePadding(part); return Math.round((mediaNatural(part, width) - cap) * Math.max(SHRINK_FLOOR.media, shrink)) + cap; }
    case 'marks': return sized('mark', scale) + (part.label ? 76 : 0);
    case 'rule': return 20;
  }
  return 100;
}

/** Height of a page at the minimum sizes, using the same regions and columns the layout engine uses. */
export function estimatePageHeight(parts:readonly ComposePart[],arrangement:ComposeScene['data']['arrangement'],width:number):number{
  const {head,body,foot}=pageRegions(parts);
  const full=(list:readonly ComposePart[])=>list.reduce((h,p)=>h+estimatePartHeight(p,width,1,SHRINK_FLOOR.media),0);
  const half=(width-PAGE_GAP)/2;
  let bodyHeight:number;
  if(arrangement==='two-column' || arrangement==='grid'){
    bodyHeight=0;
    for(let i=0;i<body.length;i+=2)bodyHeight+=Math.max(...body.slice(i,i+2).map(p=>estimatePartHeight(p,half,1,SHRINK_FLOOR.media)));
    bodyHeight+=PAGE_GAP*Math.max(0,Math.ceil(body.length/2)-1);
  }else bodyHeight=full(body)+PAGE_GAP*Math.max(0,body.length-1);
  const regions=[head.length?full(head)+PAGE_GAP*(head.length-1):0,bodyHeight,foot.length?full(foot)+PAGE_GAP*(foot.length-1):0].filter(h=>h>0);
  return regions.reduce((a,b)=>a+b,0)+PAGE_GAP*Math.max(0,regions.length-1);
}

export function validateComposeBudget(scene:ComposeScene,style:string):string[]{
  const zones=systemZones(style);
  if(!zones)return [`${scene.id}: style ${style} has no design system for composed pages`];
  const zone=zones[scene.layout],need=estimatePageHeight(scene.data.parts,scene.data.arrangement,zone.width);
  if(need<=zone.height)return [];
  const largest=[...scene.data.parts].filter(p=>!p.emphasis).sort((a,b)=>estimatePartHeight(b,zone.width,1,SHRINK_FLOOR.media)-estimatePartHeight(a,zone.width,1,SHRINK_FLOOR.media))[0]??scene.data.parts[0];
  return [`${scene.id}: the page needs about ${need}px but the ${scene.layout} page holds ${zone.height}px; drop or shorten part ${largest.id}`];
}
