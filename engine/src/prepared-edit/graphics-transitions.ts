import type {ChapterPalette} from '../core/chapters.ts';

export const OVERLAY_KINDS=['whiteout','leak','bloom','burn'] as const;

export const GRAPHICS_ENTRANCE_KINDS=['whip-pan','clip-wipe','light-scan'] as const;
export const TRANSITION_KINDS=[...OVERLAY_KINDS,...GRAPHICS_ENTRANCE_KINDS,'hue-crossfade'] as const;

export const TRANSITION_DIRS=['rtl','ltr','up','down'] as const;

export type TransitionKind=(typeof TRANSITION_KINDS)[number];
export type OverlayKind=(typeof OVERLAY_KINDS)[number];
export type EntranceKind=(typeof GRAPHICS_ENTRANCE_KINDS)[number];
export type TransitionDir=(typeof TRANSITION_DIRS)[number];
export type TransitionEntry={atFrame:number;durationInFrames:number;kind:TransitionKind;dir?:TransitionDir};



export type TransitionScene={id:string;fromFrame:number;durationInFrames:number;layout:string;family:string;data?:unknown;chapter?:ChapterPalette};
export type Box={x:number;y:number;width:number;height:number};

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




function mountsVideo(scene:TransitionScene):boolean{
  const data=scene.data as {foreground?:unknown;steps?:readonly {kind?:string}[]}|undefined;
  if(scene.family==='kinetic-hook' && data?.foreground)return true;
  if((scene.family==='screens' || scene.family==='screen-focus') && (data?.steps??[]).some(step=>step?.kind==='video'))return true;
  return false;
}

export function graphicsTransitionIssues(transitions:readonly TransitionEntry[],scenes:readonly TransitionScene[]):string[]{
  const issues:string[]=[];
  const entrances=new Map<number,number>(),hues=new Map<number,number>();
  for(const t of transitions){
    if(t.dir!==undefined && !isEntranceKind(t.kind))issues.push(`Transition at ${t.atFrame}: dir applies only to whip-pan, clip-wipe and light-scan.`);
    if(isOverlayKind(t.kind))continue;
    const index=scenes.findIndex(s=>s.fromFrame===t.atFrame);
    if(index<0){issues.push(`${t.kind} at ${t.atFrame} must start on a scene's first frame; it animates that scene's graphics layer.`);continue;}
    const scene=scenes[index];
    if(t.durationInFrames>scene.durationInFrames)issues.push(`${t.kind} at ${t.atFrame} is longer than scene ${scene.id}.`);
    if(t.kind!=='clip-wipe' && scene.layout==='presenter')issues.push(`${t.kind} cannot run on presenter scene ${scene.id}: it would move or tint graphics across the creator (rule 15).`);
    if(t.kind==='whip-pan'){

      if(mountsVideo(scene))issues.push(`whip-pan at ${t.atFrame} would decode scene ${scene.id}'s video once per echo (core/mblur.tsx); use clip-wipe or light-scan.`);


      if(scene.layout==='split' && (t.dir==='up' || t.dir==='down'))issues.push(`whip-pan at ${t.atFrame} on split scene ${scene.id} may only travel rtl or ltr; up/down is not clipped to the panel and would smear onto the presenter window below the seam.`);
    }
    if(t.kind==='hue-crossfade'){
      if(!scene.chapter || !scenes[index-1]?.chapter)issues.push(`hue-crossfade at ${t.atFrame} needs a chapter on scene ${scene.id} and on the scene before it.`);
      hues.set(index,(hues.get(index)??0)+1);
    }else entrances.set(index,(entrances.get(index)??0)+1);
  }
  for(const [index,count] of entrances)if(count>1)issues.push(`Scene ${scenes[index].id} has ${count} graphics entrances; use one.`);
  for(const [index,count] of hues)if(count>1)issues.push(`Scene ${scenes[index].id} has ${count} hue crossfades; use one.`);
  return issues;
}
