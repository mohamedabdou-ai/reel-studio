// engine/src/creative-kit/compose/layout.ts
import type {Box,Zone} from '../../style-kit/system/types.ts';
import {PAGE_GAP,estimatePartHeight,SHRINK_FLOOR} from './budget.ts';
import {pageRegions,type ComposeData} from './schema.ts';

export type LayoutPart={id:string;kind:string;emphasis?:boolean;sequence?:boolean};
export type Arrangement='hero'|'stack'|'two-column'|'grid';
const LIFT=0.42; // a page block sits slightly above the zone's centre, never stuck to the top

function railed(box:Box,zone:Zone,sequence=false):Box{
  // A sequence ending at the rail does not enter it. Preserve legacy plate geometry.
  if(sequence&&box.y+box.height<=zone.railFromY+1e-6)return box;
  return box.y+box.height>=zone.railFromY && box.x+box.width>zone.railMaxX?{...box,width:Math.max(0,zone.railMaxX-box.x)}:box;
}

export function layoutCompose(arrangement:Arrangement,parts:readonly LayoutPart[],zone:Zone,measure:(id:string,width:number)=>number,dir:'rtl'|'ltr'):{boxes:Record<string,Box>;overflow:number}{
  const {head,body,foot}=pageRegions(parts);
  const half=(zone.width-PAGE_GAP)/2;
  const rows:{items:{part:LayoutPart;width:number;x:number}[];height:number}[]=[];
  const fullRow=(part:LayoutPart)=>rows.push({items:[{part,width:zone.width,x:zone.x}],height:measure(part.id,zone.width)});
  head.forEach(fullRow);
  if(arrangement==='two-column' || arrangement==='grid'){
    for(let i=0;i<body.length;i+=2){
      const pair=body.slice(i,i+2);
      const xs=dir==='rtl'?[zone.x+half+PAGE_GAP,zone.x]:[zone.x,zone.x+half+PAGE_GAP];
      const items=pair.length===1?[{part:pair[0],width:half,x:zone.x+(zone.width-half)/2}]:pair.map((part,j)=>({part,width:half,x:xs[j]}));
      rows.push({items,height:Math.max(...items.map(item=>measure(item.part.id,half)))});
    }
  }else body.forEach(fullRow);
  foot.forEach(fullRow);
  const natural=rows.reduce((h,r)=>h+r.height,0)+PAGE_GAP*Math.max(0,rows.length-1);
  if(arrangement==='hero'){
    const hero=rows.find(r=>r.items.some(item=>item.part.emphasis));
    if(hero)hero.height=Math.max(hero.height,zone.height-(natural-hero.height));
  }
  const total=rows.reduce((h,r)=>h+r.height,0)+PAGE_GAP*Math.max(0,rows.length-1);
  let y=zone.y+Math.max(0,Math.round((zone.height-total)*LIFT));
  const boxes:Record<string,Box>={};
  for(const row of rows){
    for(const item of row.items)boxes[item.part.id]=railed({x:item.x,y,width:item.width,height:row.height},zone,item.part.sequence);
    y+=row.height+PAGE_GAP;
  }
  return {boxes,overflow:Math.max(0,total-zone.height)};
}

export function pickScale(data: ComposeData, zone: Zone, dir: 'rtl' | 'ltr', measure?:(part:ComposeData['parts'][number],width:number,scale:number,shrink:number)=>number|undefined) {
  const byId = new Map<string, ComposeData['parts'][number]>(data.parts.map((p) => [p.id, p]));
  const lay = (s: number, k = 1) => layoutCompose(data.arrangement, data.parts.map((p) => ({id: p.id, kind: p.kind, emphasis: p.emphasis,sequence:p.kind==='media'&&(p.source.kind as string)==='sequence'})), zone, (id, w) => measure?.(byId.get(id)!,w,s,k)??estimatePartHeight(byId.get(id)!, w, s, k), dir);
  // First the type grows (1.8 down to 1.0) with plates at full size; if even the minimum type does not fit, plates and screens shrink.
  for (let s = 1.8; s > 1.0001; s = Math.round((s - 0.05) * 100) / 100) {
    const placed = lay(s);
    if (placed.overflow === 0) return {scale: s, shrink: 1, placed};
  }
  for (let k = 1; k >= SHRINK_FLOOR.media - 1e-9; k = Math.round((k - 0.05) * 100) / 100) {
    const placed = lay(1, k);
    if (placed.overflow === 0) return {scale: 1, shrink: k, placed};
  }
  return {scale: 1, shrink: SHRINK_FLOOR.media, placed: lay(1, SHRINK_FLOOR.media)};
}
