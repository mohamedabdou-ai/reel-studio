import {EASE,clamp01,mix} from '../core/motion.ts';
import {CHAPTER_MIN_CONTRAST,contrastRatio,readableShift,relativeLuminance} from '../core/chapters.ts';



export const CAPTION_EMPHASIS_KINDS=['accent','underline','pop'] as const;
export type CaptionEmphasisKind=(typeof CAPTION_EMPHASIS_KINDS)[number];
export type CaptionEmphasis={sourceIndex:number;kind:CaptionEmphasisKind};

export const STATIC_CAPTION_STYLES=['split-canvas','section-deck'] as const;
export const POP_FRAMES=4;
export const POP_FROM=1.12;
const HEX=/^#[0-9a-fA-F]{6}$/;

export function emphasisBySource(list:readonly CaptionEmphasis[]|undefined):Map<number,CaptionEmphasisKind>{
  return new Map((list??[]).map(e=>[e.sourceIndex,e.kind] as const));
}

export function captionEmphasisIssues(style:string,wordCount:number,list:readonly {sourceIndex:number;kind:string}[]|undefined):string[]{
  const issues:string[]=[];let last=-1;
  for(const e of list??[]){
    if(e.sourceIndex>=wordCount)issues.push(`Caption emphasis names word ${e.sourceIndex}, outside the ${wordCount} caption words.`);
    if(e.sourceIndex<=last)issues.push('Caption emphasis must be strictly ordered by sourceIndex, one kind per word.');
    if(e.kind==='pop' && (STATIC_CAPTION_STYLES as readonly string[]).includes(style))issues.push(`Caption emphasis 'pop' animates a word; the ${style} DNA keeps caption pills static.`);
    last=e.sourceIndex;
  }
  return issues;
}



export function captionEmphasisInk(t:{accent:string;accentInk?:string;pill:string}):string{
  if(!HEX.test(t.pill) || !HEX.test(t.accent))return t.accentInk??t.accent;
  if(contrastRatio(t.accent,t.pill)>=CHAPTER_MIN_CONTRAST)return t.accent;
  const toward=relativeLuminance(t.pill)>0.5?'#000000':'#FFFFFF';
  return readableShift(t.accent,[t.pill],toward,CHAPTER_MIN_CONTRAST);
}


export function popScale(frame:number,fromFrame:number,probe:boolean):number{
  if(probe || frame<fromFrame)return 1;
  return mix(POP_FROM,1,EASE.land(clamp01((frame-fromFrame+1)/POP_FRAMES)));
}

export const underlineMetrics=(fontSize:number)=>({thickness:Math.max(3,Math.round(fontSize*0.08)),offset:Math.round(fontSize*0.18)});
