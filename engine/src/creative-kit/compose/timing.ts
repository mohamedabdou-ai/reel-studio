// engine/src/creative-kit/compose/timing.ts
import type {ComposeAt,ComposePart,ComposeScene} from './schema.ts';
import type {AdaptedData} from './adapters/kinetic.ts';

type TimingPart=ComposePart|AdaptedData['parts'][number];
type TimingScene=Omit<ComposeScene,'data'>&{data:ComposeScene['data']|AdaptedData};

export type ComposeWord={sourceIndex:number;fromFrame:number;toFrame:number};
export const composeHoldFrames=(fps:number)=>Math.ceil(fps);

/** A scene-local frame, or null when the word was cut away or starts outside the scene (the cartoon rule). */
export function resolveComposeAt(at:ComposeAt,scene:{fromFrame:number;durationInFrames:number},words:readonly ComposeWord[],fps:number):number|null{
  if('frame' in at)return at.frame;
  const word=words.find(w=>w.sourceIndex===at.word);
  if(!word || word.fromFrame<scene.fromFrame || word.fromFrame>=scene.fromFrame+scene.durationInFrames)return null;
  return word.fromFrame-scene.fromFrame+Math.round((at.dt??0)*fps);
}

// The drawing wraps whole words without splitting them. A word per line is a
// Node-safe upper bound, including minimum-size fallback and balanced breaks.
const lineBound=(text:string)=>Math.max(1,text.trim().split(/\s+/).filter(Boolean).length);
const headlineSpan=(text:string,stagger:number)=>{
  const words=text.trim().split(/\s+/),n=words.length,kc=Math.min(n,n<=3?1:n<=6?2:3);
  const thin=words.slice(0,n-kc),key=words.slice(n-kc);
  while(thin.length && Array.from(thin[thin.length-1]).length<=3)key.unshift(thin.pop()!);
  // Headline's last key row also thickens: row stagger + 14 + key index * 2 + 14.
  return (lineBound(text)-1)*stagger+14+(key.length-1)*2+14;
};

/** Frames after `at` until the approved magazine drawing stops changing.
 * Durations are authored in frames, independent of fps. Word-anchored absolute
 * press cues use a conservative origin of zero until the validator resolves `at`.
 * The input caret is explicitly marked data-idle and exempt from the reading hold.
 * compose-render.test.mjs locks these bounds to the real registered drawing. */
export function partSpan(part:TimingPart,fps=30):number{
  switch(part.kind){
    case 'kicker':return 4+22; // Kicker's gold line.
    case 'headline':return Math.max(headlineSpan(part.text,7),part.emphasis?34+22:0);
    case 'line':return 20; // Mask.
    case 'body':return (lineBound(part.text)-1)*6+20;
    case 'number':return Math.max(8+(part.rollFrames??58),part.label||part.unit?46+28:0,part.label?56+20:0,part.unit?62+22:0);
    case 'bars':return Math.max(...part.items.map((item,i)=>(item.offsetFrames??i*9)+8+40));
    case 'ring':return Math.max(12+62,part.label?56+22:0);
    case 'quote':return Math.max(4+headlineSpan(part.text,5),30+20,34+22);
    case 'list':return Math.max(...part.items.map((item,i)=>i*(part.staggerFrames??10)+Math.max((item.mark??'check')==='none'?22:24+12,i<part.items.length-1?8+26:0)));
    case 'card':{
      const variant=part.variant??'plain',at='frame' in part.at?part.at.frame:0;
      if(variant==='stamp')return Math.max(0,(part.pressFrame??at+6)-at+14);
      if(variant==='follow')return Math.max(30,(part.pressFrame??at+50)-at+4+10);
      return Math.max(30,part.value&&variant!=='ticket'?(part.pressFrame??at+20)-at+16:0,variant==='ticket'&&part.value?20+16:0);
    }
    case 'chat':return Math.max(...part.messages.map(message=>message.offsetFrames+Math.max(28,3+(lineBound(message.text)-1)*4+20)));
    case 'screen':return Math.max(2+30,10+(part.blocks.length-1)*8+22,part.title||part.url?8+26:0,part.focus!==undefined?24+30:0);
    case 'steps':return Math.max(...part.items.map((item,i)=>item.offsetFrames+Math.max(4+22,i<part.items.length-1?6+26:0)));
    case 'media':{
      const source=part.source,caption=part.caption?18+22:0;
      if(source.kind==='pair')return Math.max(8+30,caption);
      // Sequence labels are static in-plate tags; the last step switches hard.
      if(source.kind==='sequence')return Math.max(30,caption,...source.steps.map(step=>step.offsetFrames));
      return Math.max(30,caption,source.kind==='compare'?12+source.revealFrames:0);
    }
    case 'marks':return Math.max(26+12,part.label?20+22:0);
    case 'rule':return 26;
  }
}

export function validateComposeTiming(scene:TimingScene,fps=30,words:readonly ComposeWord[]|null=null):string[]{
  const issues:string[]=[],hold=composeHoldFrames(fps),end=scene.durationInFrames-hold;
  if(end<=0)return [`${scene.id}: a composed page needs more than ${hold} frames`];
  // Page furniture is independent of the part cues: labels end at 8 + 18;
  // takeover's bottom hairline ends at 14 + 24 (base.tsx Furniture).
  const furnitureEnd=scene.layout==='takeover'?14+24:8+18;
  if(end<furnitureEnd)issues.push(`${scene.id}: page furniture must finish ${hold} frames before the scene ends so the page can be read`);
  let last=-1;
  for(const part of scene.data.parts){
    if('word' in part.at && words===null)continue; // checked again once the edit's words are imported
    const at=resolveComposeAt(part.at,scene,words??[],fps);
    if(at===null){issues.push(`${scene.id}: part ${part.id} names word ${(part.at as {word:number}).word}, which is not inside this scene (cut away or outside its window)`);continue;}
    if(at<0)issues.push(`${scene.id}: part ${part.id} starts before the scene`);
    if(at<last)issues.push(`${scene.id}: part ${part.id} appears before the part above it; order parts by time`);
    // pressFrame counts scene frames, including when the part's cue names a word.
    const span=partSpan({...part,at:{frame:at}},fps);
    if(!Number.isFinite(span))issues.push(`${scene.id}: part ${part.id} never settles; its continuous motion cannot leave a reading hold`);
    else if(at+span>end)issues.push(`${scene.id}: part ${part.id} must finish ${hold} frames before the scene ends so the page can be read`);
    last=Math.max(last,at);
  }
  return issues;
}
