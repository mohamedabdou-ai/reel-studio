// engine/src/style-kit/system/types.ts
import type React from 'react';

/** The closed, style-neutral list of parts a composed page is built from. Every style system draws these its own way. */
export const PART_KINDS = ['kicker','headline','line','body','number','bars','ring','quote','list','card','chat','screen','steps','media','marks','rule'] as const;
export type PartKind = typeof PART_KINDS[number];
export type Box = {x:number;y:number;width:number;height:number};
/** A drawable area. Content whose box reaches railFromY or below must keep x + width <= railMaxX (the platform's right rail). */
export type Zone = Box & {railFromY:number;railMaxX:number};
export type ZoneSet = {takeover:Zone;split:Zone};
export type StyleSystem = {
  id:string;
  zones:(seam?:number)=>ZoneSet;
  partsOff:readonly PartKind[];
  signatureTransition:string;
  Scope:React.FC<{data:unknown;layout:'split'|'takeover';seam:number;durationInFrames:number;children?:React.ReactNode}>;
};
