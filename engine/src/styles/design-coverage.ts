// engine/src/styles/design-coverage.ts
// Which scene families each style's design system draws, and in which layouts. Node-safe: preparation and tests read it.
// A family in SYSTEM_PENDING still draws with the shared pre-V4 view under that style; Task 16 empties the list.
import {hasStyleSystem} from '../style-kit/system/zones.ts';

type Layouts='all'|readonly ('split'|'takeover'|'presenter')[];
export const DESIGN_COVERAGE:Readonly<Record<string,Readonly<Record<string,Layouts>>>>=Object.freeze({
  'magazine-interview':Object.freeze({
    intro:'all',proof:'all',process:'all',comparison:'all',comment:'all',follow:'all','chapter-quote':'all',
    checklist:'all',statement:'all',count:'all',verdict:'all',figures:'all','chat-thread':'all','proof-screen':'all',compose:'all',
    'token-lens':'all','meter-receipt':'all','ticket-offer':'all','comment-stack':'all','route-stops':'all','evidence-wipe':'all',
    outcome:'all','image-compare':'all',screens:'all','data-story':'all',
    'kinetic-text':'all','message-board':'all','screen-focus':'all','screen-recording':'all','arabic-type':'all',
    'kinetic-hook':'all','creator-cta':'all','motion-concept':'all',
  }),
});
export const SYSTEM_PENDING:Readonly<Record<string,readonly string[]>>=Object.freeze({
  'magazine-interview':Object.freeze([]),
});
export function drawnByStyle(style:string,family:string,layout:string):boolean{
  const entry=DESIGN_COVERAGE[style]?.[family];
  return entry==='all' || (Array.isArray(entry) && entry.includes(layout as 'split'));
}
export type UndrawnScene={id:string;family:string;layout:string;reason:string};
export function undrawnScenes(edit:{style:string;scenes:readonly {id:string;family:string;layout:string}[]}):UndrawnScene[]{
  if(!hasStyleSystem(edit.style))return [];
  return edit.scenes.filter(s=>s.family!=='project-scene' && !drawnByStyle(edit.style,s.family,s.layout))
    .map(s=>({id:s.id,family:s.family,layout:s.layout,reason:'drawn by the shared pre-V4 view, not the style design system'}));
}
