// engine/src/creative-kit/compose/media.ts
/** The clips a composed page plays, for the plate list and the prepare-time clip claims. Duck-typed so core/scene-media stays dependency-free. */
export type ComposeClip={src:string;sha256:string;width:number;height:number;trimBeforeFrame?:number};
export function composeClipValues(scene:{data:unknown}):ComposeClip[]{
  const parts=(scene.data as {parts?:unknown}|null|undefined)?.parts;
  if(!Array.isArray(parts))return [];
  return parts.flatMap((p:any)=>p?.kind==='media' && p?.source?.kind==='clip' && typeof p.source.clip?.src==='string'?[p.source.clip as ComposeClip]:[]);
}
