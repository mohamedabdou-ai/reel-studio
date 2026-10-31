import type {ChapterPalette} from '../core/chapters.ts';
import {sceneVideoSources} from '../core/scene-media.ts';
import type {ProjectScenes} from '../core/scene-media.ts';
import type {MaskShape} from '../core/mask-geo.ts';

export const OVERLAY_KINDS=['whiteout','leak','bloom','burn','paper-tear','page-turn','pen-dot-curtain','pixel-curtain','magazine-flip','paper-swap'] as const;

export const GRAPHICS_ENTRANCE_KINDS=['whip-pan','clip-wipe','light-scan','iris','keyhole','blinds','dot-zoom','zoom-through','ink-slab','lens-zoom','paper-pull'] as const;
export const TRANSITION_KINDS=[...OVERLAY_KINDS,...GRAPHICS_ENTRANCE_KINDS,'hue-crossfade'] as const;

export const TRANSITION_DIRS=['rtl','ltr','up','down'] as const;

export type TransitionKind=(typeof TRANSITION_KINDS)[number];
export type OverlayKind=(typeof OVERLAY_KINDS)[number];
export type EntranceKind=(typeof GRAPHICS_ENTRANCE_KINDS)[number];
export type TransitionDir=(typeof TRANSITION_DIRS)[number];
export type TransitionEntry={atFrame:number;durationInFrames:number;kind:TransitionKind;dir?:TransitionDir;shape?:MaskShape;origin?:{x:number;y:number}};



export type TransitionScene={id:string;fromFrame:number;durationInFrames:number;layout:string;family:string;data?:unknown;chapter?:ChapterPalette};
export type Box={x:number;y:number;width:number;height:number};

// Node-safe policy metadata is shared by validation and the React registry.
export type TransitionContext={scene:TransitionScene;dir?:TransitionDir;hasVideo?:boolean};
export type TransitionRule={lead?:number;tail?:number;freezeOutgoing?:boolean;needsOutgoing?:boolean;fullFrame?:boolean;phase:'entrance'|'overlay';centred:boolean;allowed:(ctx:TransitionContext)=>string|null;allowedOutgoing?:(ctx:TransitionContext)=>string|null};
const rule=(kind:TransitionKind,phase:'entrance'|'overlay',centred=false):TransitionRule=>({phase,centred,
  allowed:({scene,dir,hasVideo})=>{
    if(phase==='entrance'&&kind!=='clip-wipe'&&scene.layout==='presenter')return `${kind} cannot run on presenter scene ${scene.id}: it would move or tint graphics across the creator (rule 15).`;
    if(kind==='whip-pan'){
      if(hasVideo)return `whip-pan at ${scene.fromFrame} would decode scene ${scene.id}'s video once per echo (core/mblur.tsx); use clip-wipe or light-scan.`;
      if(scene.layout==='split'&&(dir==='up'||dir==='down'))return `whip-pan at ${scene.fromFrame} on split scene ${scene.id} may only travel rtl or ltr; up/down is not clipped to the panel and would smear onto the presenter window below the seam.`;
    }
    return null;
  }});
export const TRANSITION_RULES:Record<TransitionKind,TransitionRule>={
  whiteout:rule('whiteout','overlay',true),leak:rule('leak','overlay'),bloom:rule('bloom','overlay'),burn:rule('burn','overlay'),
  'whip-pan':rule('whip-pan','entrance'),'clip-wipe':rule('clip-wipe','entrance'),'light-scan':rule('light-scan','entrance'),
  'hue-crossfade':rule('hue-crossfade','entrance'),
  // V4 entrances affect only the incoming graphics panel/takeover, never presenter plates.
  iris:rule('iris','entrance'),keyhole:rule('keyhole','entrance'),blinds:rule('blinds','entrance'),
  'dot-zoom':rule('dot-zoom','entrance'),'zoom-through':rule('zoom-through','entrance'),
  'paper-tear':rule('paper-tear','overlay',true),'page-turn':rule('page-turn','overlay',true),'pen-dot-curtain':rule('pen-dot-curtain','overlay',true),
  'ink-slab': {...rule('ink-slab','entrance'),lead:10,tail:12,fullFrame:true,allowed:()=>null},
  'lens-zoom': {...rule('lens-zoom','entrance'),lead:14,tail:14,freezeOutgoing:true,needsOutgoing:true,allowedOutgoing:()=>null},
  'paper-pull': {...rule('paper-pull','entrance'),lead:14,tail:14,freezeOutgoing:true,needsOutgoing:true,fullFrame:true,allowed:({scene})=>scene.layout==='takeover'?null:'paper-pull requires takeover sheets'},
  'magazine-flip': {...rule('magazine-flip','overlay',true),lead:15,tail:7,needsOutgoing:true,allowed:({scene})=>scene.layout==='presenter'?'magazine-flip requires takeover or split graphics':null},
  'paper-swap': {...rule('paper-swap','overlay',true),lead:12,fullFrame:true},
  'pixel-curtain':rule('pixel-curtain','overlay',true),
};
export const isCentredKind=(kind:TransitionKind):boolean=>TRANSITION_RULES[kind]?.centred??false;

export const isOverlayKind=(kind:TransitionKind):kind is OverlayKind=>(OVERLAY_KINDS as readonly string[]).includes(kind);
export const isEntranceKind=(kind:TransitionKind):kind is EntranceKind=>(GRAPHICS_ENTRANCE_KINDS as readonly string[]).includes(kind);

export function sceneEntrance(transitions:readonly TransitionEntry[]|undefined,scene:{fromFrame:number}):(TransitionEntry&{kind:EntranceKind})|null{
  for(const t of transitions??[])if(isEntranceKind(t.kind) && t.atFrame===scene.fromFrame)return t as TransitionEntry&{kind:EntranceKind};
  return null;
}

export function hueCrossfadeFor(transitions:readonly TransitionEntry[]|undefined,scenes:readonly TransitionScene[],index:number):{from:ChapterPalette;to:ChapterPalette;durationInFrames:number}|null{
  const scene=scenes[index],previous=scenes[index-1];
  const t=(transitions??[]).find(x=>x.kind==='hue-crossfade' && x.atFrame===scene?.fromFrame);
  if(!t || !scene?.chapter || !previous?.chapter)return null;
  return {from:previous.chapter,to:scene.chapter,durationInFrames:t.durationInFrames};
}


export function entranceBox(layout:string,seam:number):Box{
  return layout==='split'?{x:0,y:0,width:1080,height:seam}:{x:0,y:0,width:1080,height:1920};
}




function mountsVideo(scene:TransitionScene,projectScenes?:ProjectScenes):boolean{
  return sceneVideoSources(scene,projectScenes).length>0;
}

export function graphicsTransitionIssues(transitions:readonly TransitionEntry[],scenes:readonly TransitionScene[],projectScenes?:ProjectScenes):string[]{
  const issues:string[]=[];
  const entrances=new Map<number,number>(),hues=new Map<number,number>();
  for(const t of transitions){
    if(!Object.hasOwn(TRANSITION_RULES,t.kind)){issues.push(`Unknown transition kind: ${String(t.kind)}.`);continue;}
    if(t.dir!==undefined && !isEntranceKind(t.kind))issues.push(`Transition at ${t.atFrame}: dir applies only to graphics entrances.`);
    if((t.shape!==undefined||t.origin!==undefined)&&!['clip-wipe','iris','keyhole','dot-zoom'].includes(t.kind))issues.push(`Transition at ${t.atFrame}: shape and origin apply only to clip-wipe, iris, keyhole and dot-zoom.`);
    if(t.shape!==undefined&&t.kind!=='clip-wipe'&&t.shape!==(t.kind==='keyhole'?'keyhole':'circle'))issues.push(`${t.kind} uses its own mask shape; omit shape or use ${t.kind==='keyhole'?'keyhole':'circle'}.`);
    const policy=TRANSITION_RULES[t.kind];
    if((policy.lead || policy.tail || policy.needsOutgoing) && t.dir!==undefined)issues.push(t.kind+' has a fixed direction; omit dir.');
    if(isOverlayKind(t.kind) && !policy.lead && !policy.needsOutgoing)continue;
    const index=scenes.findIndex(s=>s.fromFrame===t.atFrame);
    if(index<0){issues.push(`${t.kind} at ${t.atFrame} must start on a scene's first frame; it animates that scene's graphics layer.`);continue;}
    const scene=scenes[index];
    if(policy.lead || policy.tail || policy.needsOutgoing){
      const previous=scenes[index-1];
      if(!previous || previous.fromFrame+previous.durationInFrames!==scene.fromFrame)issues.push(t.kind+' requires two adjacent scenes at the cut.');
      if(policy.needsOutgoing && policy.centred && Math.ceil(t.durationInFrames/2)>(policy.lead??0))issues.push(t.kind+' duration starts before its drawing lead; shorten the transition.');
      if(previous && policy.needsOutgoing){const issue=(policy.allowedOutgoing??policy.allowed)({scene:previous,hasVideo:mountsVideo(previous,projectScenes)});if(issue)issues.push(issue);}
      if(t.atFrame<(policy.lead??0))issues.push(t.kind+' incoming lead must fit before the cut.');
      if(previous && (policy.lead??0)>previous.durationInFrames)issues.push(t.kind+' lead is longer than the outgoing scene.');
      if(transitionDrawingTail(t)>scene.durationInFrames)issues.push(t.kind+' tail is longer than the incoming scene.');
      if(policy.needsOutgoing && (mountsVideo(scene,projectScenes) || previous && mountsVideo(previous,projectScenes)))issues.push(t.kind+' requires graphics without scene video.');
    }
    if(t.durationInFrames>scene.durationInFrames)issues.push(`${t.kind} at ${t.atFrame} is longer than scene ${scene.id}.`);
    const allowed=TRANSITION_RULES[t.kind].allowed({scene,dir:t.dir,hasVideo:mountsVideo(scene,projectScenes)});
    if(allowed)issues.push(allowed);
    if(t.kind==='hue-crossfade'){
      if(!scene.chapter || !scenes[index-1]?.chapter)issues.push(`hue-crossfade at ${t.atFrame} needs a chapter on scene ${scene.id} and on the scene before it.`);
      hues.set(index,(hues.get(index)??0)+1);
    }else entrances.set(index,(entrances.get(index)??0)+1);
  }
  for(const [index,count] of entrances)if(count>1)issues.push(`Scene ${scenes[index].id} has ${count} graphics entrances; use one.`);
  for(const [index,count] of hues)if(count>1)issues.push(`Scene ${scenes[index].id} has ${count} hue crossfades; use one.`);
  const windows=transitions.filter(t=>TRANSITION_RULES[t.kind]?.lead || TRANSITION_RULES[t.kind]?.needsOutgoing).map(t=>({t,start:t.atFrame-(TRANSITION_RULES[t.kind].lead??0),end:t.atFrame+transitionDrawingTail(t)})).sort((a,b)=>a.start-b.start);
  for(let i=1;i<windows.length;i++)if(windows[i].start<windows[i-1].end)issues.push('Two-scene drawing windows overlap; leave enough settled time between transitions.');
  return issues;
}

/** Whether removing this scene also removes a transition's required drawing partner. */
export function transitionUsesOutgoing(t:TransitionEntry,scene:TransitionScene):boolean {
  const policy=TRANSITION_RULES[t.kind];
  return Boolean(policy.lead || policy.tail || policy.needsOutgoing) && t.atFrame===scene.fromFrame+scene.durationInFrames;
}

/** A configured retention tail must also cover a longer authored transition duration. */
export function transitionDrawingTail(t:TransitionEntry):number {
  const rule=TRANSITION_RULES[t.kind];
  return rule.tail===undefined?0:Math.max(rule.tail,rule.centred?Math.ceil(t.durationInFrames/2):t.durationInFrames);
}

/** Speech must clear a presenter revealed on either side of a scene transition.
 * Use the real effect interval, including the pre-cut half of centred overlays. */
export function sceneCaptionOpacity(transitions:readonly TransitionEntry[]|undefined,scenes:readonly TransitionScene[],frame:number):number{
  let opacity=1;
  for(const t of transitions??[]){
    const centred=TRANSITION_RULES[t.kind].centred;
    const start=t.atFrame-(centred?Math.floor(t.durationInFrames/2):0);
    const end=t.atFrame+(centred?Math.ceil(t.durationInFrames/2):t.durationInFrames);
    const during=scenes.filter(s=>s.fromFrame<end&&s.fromFrame+s.durationInFrames>start);
    let covered=start;
    const allTakeover=during.every(s=>{
      if(s.layout!=='takeover'||s.fromFrame>covered)return false;
      covered=Math.max(covered,s.fromFrame+s.durationInFrames);return true;
    });
    if(allTakeover&&covered>=end)continue;
    if(frame>=start&&frame<end)return 0;
    if(frame>=end&&frame<end+6)opacity=Math.min(opacity,(frame-end+1)/6);
  }
  return opacity;
}
