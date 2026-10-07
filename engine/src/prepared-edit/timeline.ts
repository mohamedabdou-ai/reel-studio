import type {CameraKey,EditManifest,SourceWord} from "./schema.ts";
import {EASE} from "../core/motion.ts";

export type MappedWord = SourceWord & {sourceIndex:number;segmentIndex:number;fromFrame:number;toFrame:number};
export type EditIssue = {code:string;wordIndex:number;message:string};

export function sourceMsToEditFrame(ms:number,m:EditManifest):number|null {
  const sourceFrame=Math.floor(ms*m.source.fps/1000+1e-7);
  let editFrom=0;
  for(const s of m.segments){
    if(sourceFrame>=s.fromFrame && sourceFrame<s.toFrame) return editFrom+sourceFrame-s.fromFrame;
    editFrom+=s.toFrame-s.fromFrame;
  }
  return null;
}

export function compileEdit(m:EditManifest){
  const fps=m.source.fps;
  let durationInFrames=0;
  const segments=m.segments.map((s,segmentIndex)=>{
    const result={...s,segmentIndex,editFrom:durationInFrames};
    durationInFrames+=s.toFrame-s.fromFrame; return result;
  });
  const words:MappedWord[]=[],issues:EditIssue[]=[],omittedWordIndices:number[]=[];
  m.captions.words.forEach((word,sourceIndex)=>{
    const start=word.startMs*fps/1000, end=word.endMs*fps/1000;
    const intersections=segments.filter(s=>end>s.fromFrame && start<s.toFrame);
    if(!intersections.length){omittedWordIndices.push(sourceIndex);return;}


    const s=intersections.reduce((best,cur)=>
      Math.min(end,cur.toFrame)-Math.max(start,cur.fromFrame)>
      Math.min(end,best.toFrame)-Math.max(start,best.fromFrame)?cur:best);
    const fromFrame=s.editFrom+Math.max(0,Math.floor(start-s.fromFrame+1e-7));
    const toFrame=s.editFrom+Math.min(s.toFrame-s.fromFrame,Math.ceil(end-s.fromFrame-1e-7));
    if(start<s.fromFrame || end>s.toFrame || intersections.length>1) issues.push({code:"word-cut-boundary",wordIndex:sourceIndex,message:"A cut intersects this spoken word. Review the cut; the original token is preserved."});
    words.push({...word,sourceIndex,segmentIndex:s.segmentIndex,fromFrame,toFrame});
  });
  words.sort((a,b)=>a.fromFrame-b.fromFrame || a.sourceIndex-b.sourceIndex);


  const clauseCaptions=m.captions.grouping === undefined ? m.style==="section-deck" : m.captions.grouping === 'clauses';
  const maxWords=m.captions.grouping === 'single' ? 1 : clauseCaptions ? 9 : 4;
  const phraseCaptions=m.captions.mode==="phrases";
  const captionGroups:{fromFrame:number;toFrame:number;words:MappedWord[]}[]=[];
  for(const word of words){
    const group=captionGroups.at(-1);
    const chars=group?.words.reduce((n,w)=>n+w.text.trim().length+1,0)??0;
    const clauseEnd=clauseCaptions && group && group.words.length>=4 && group.toFrame-group.fromFrame>=fps*1.6 && /[.!?؟؛]$/.test(group.words.at(-1)!.text.trim());
    if(!group || phraseCaptions || group.words.length>=maxWords || word.fromFrame-group.toFrame>fps*0.32 || clauseEnd ||
      group.words[0].segmentIndex!==word.segmentIndex || chars+word.text.trim().length>(clauseCaptions?76:42) ||
      (clauseCaptions && word.toFrame-group.fromFrame>fps*4.5)){
      captionGroups.push({fromFrame:word.fromFrame,toFrame:word.toFrame,words:[word]});
    }else{group.words.push(word);group.toFrame=Math.max(group.toFrame,word.toFrame);}
  }


  captionGroups.forEach((group,index)=>{
    const next=captionGroups[index+1];
    if(clauseCaptions && !phraseCaptions){
      const segment=segments[group.words[0].segmentIndex];
      group.toFrame=Math.min(segment.editFrom+segment.toFrame-segment.fromFrame,
        Math.max(group.toFrame,group.fromFrame+Math.ceil(fps*1.6)));
    }
    if(next) group.toFrame=Math.min(group.toFrame,next.fromFrame);
    if(group.toFrame<=group.fromFrame) throw new Error("Caption timing collapses below one video frame. Review the word timestamps.");
  });
  return {durationInFrames,segments,words,captionGroups,issues,omittedWordIndices};
}

export function cameraAtFrame(keys:CameraKey[],frame:number):CameraKey {
  if(!keys.length) return {atFrame:0,scale:1,focusX:0.5,focusY:0.4};
  if(frame<=keys[0].atFrame) return keys[0];
  for(let i=1;i<keys.length;i++) if(frame<keys[i].atFrame){
    const a=keys[i-1],b=keys[i],p=(frame-a.atFrame)/(b.atFrame-a.atFrame);

    const t=b.ease==='bezierCam'?EASE.bezierCam(p):p*p*(3-2*p);
    return {atFrame:frame,scale:a.scale+(b.scale-a.scale)*t,focusX:a.focusX+(b.focusX-a.focusX)*t,focusY:a.focusY+(b.focusY-a.focusY)*t};
  }
  return keys[keys.length-1];
}
