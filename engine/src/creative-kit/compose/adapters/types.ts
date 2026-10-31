import type {ComposeAt,ComposeData,ComposePart} from '../schema.ts';
import {composeHoldFrames,partSpan} from '../timing.ts';
import type {AdaptedData} from './kinetic.ts';

export type AdapterScene<D>={id:string;layout:string;motion:'land'|'stagger'|'quiet';durationInFrames:number;data:D};
const STEPS={land:[0,6,12,18,24,30],stagger:[0,10,20,30,40,50],quiet:[0,14,28,42,56,70]} as const;
/** The nth reveal frame of the family's motion preset, kept inside the readable window. */
export const cue=(scene:AdapterScene<unknown>,index:number,fps=30)=>Math.max(0,Math.min(STEPS[scene.motion][Math.min(index,5)],scene.durationInFrames-Math.ceil(fps)-1));
export const clampFrame=(scene:AdapterScene<unknown>,frame:number,fps=30)=>Math.max(0,Math.min(frame,scene.durationInFrames-Math.ceil(fps)-1));
/** Adapters author scene-local frame anchors; unresolved words use the conservative origin. */
export const frameOf=(at:ComposeAt)=>'frame' in at?at.frame:0;
/** Latest start that lets this part finish moving before the reading hold. */
export const settle=(scene:AdapterScene<unknown>,part:ComposePart|AdaptedData['parts'][number],fps=30)=>Math.max(0,Math.min(frameOf(part.at),scene.durationInFrames-composeHoldFrames(fps)-partSpan(part,fps)));

/** Settle every part, retaining authored field order and relative tap timing. */
export function finish<D extends ComposeData|AdaptedData>(scene:AdapterScene<unknown>,data:D,fps=30):D{
  const frames=data.parts.map(part=>settle(scene,part,fps));
  // Move preceding cues earlier rather than moving a later cue into the hold.
  for(let i=frames.length-2;i>=0;i--)frames[i]=Math.min(frames[i],frames[i+1]);
  return {...data,parts:data.parts.map((part,i)=>({...part,at:{frame:frames[i]},
    ...(part.kind==='card'&&part.pressFrame!==undefined?{pressFrame:part.pressFrame+frames[i]-frameOf(part.at)}:{})}))};
}

// Exact fixed copy from creative-kit/labels.ts; kept Node-safe until the shared labels are split from core/type.
const ADAPTER_LABELS = {
  proof: {en: 'THE PROOF', ar: 'الدليل'},
  how: {en: 'HOW IT WORKS', ar: 'طريقة العمل'},
  beforeAfter: {en: 'BEFORE / AFTER', ar: 'قبل / بعد'},
  comment: {en: 'ADD A COMMENT', ar: 'اكتب تعليقك'},
  template: {en: 'WANT THE TEMPLATE?', ar: 'احصل على القالب'},
  templateLine: {en: 'Leave the keyword below.', ar: 'اكتب الكلمة في التعليقات'},
  follow: {en: 'FOLLOW FOR MORE', ar: 'تابعني للمزيد'},
  followLine: {en: 'Keep the ideas coming.', ar: 'أفكار جديدة باستمرار'},
  followButton: {en: '+ Follow', ar: '+ متابعة'},
  chapter: {en: 'CHAPTER', ar: 'الفصل'},
} as const;
const FORMATTING = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDCF\uFDF0-\uFDFD\uFE70-\uFEFE]/;
const isArabic=(text:string)=>ARABIC.test(text.replace(FORMATTING,''));
const NOT_COPY = new Set(['src', 'path', 'file', 'image', 'icon', 'logo', 'poster', 'productIcon', 'visualSrc', 'sha256', 'url', 'href', 'id', 'kind',
  'variant', 'fit', 'display', 'dir', 'lang', 'enter', 'layout', 'motion', 'family', 'mode', 'color', 'accent', 'role', 'concept', 'preset']);
const copyStrings = (value: unknown, key = ''): string[] =>
  NOT_COPY.has(key) ? []
    : typeof value === 'string' ? [value]
      : Array.isArray(value) ? value.flatMap((item) => copyStrings(item, key))
        : value && typeof value === 'object' ? Object.entries(value).flatMap(([name, item]) => copyStrings(item, name)) : [];

/** True when the card's visible copy is Arabic. An explicit `lang` decides first; file names and option values never do. */
export const arabicCopy = (data: unknown): boolean => {
  const lang = data && typeof data === 'object' && !Array.isArray(data) ? (data as {lang?: unknown}).lang : undefined;
  if (lang === 'ar' || lang === 'en') return lang === 'ar';
  return copyStrings(data).some((text) => isArabic(text));
};


export const cardLabel=(key:keyof typeof ADAPTER_LABELS,data:unknown):string=>ADAPTER_LABELS[key][arabicCopy(data)?'ar':'en'];
