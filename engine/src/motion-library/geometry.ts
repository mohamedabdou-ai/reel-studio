import type {FocusRect} from './schema.ts';

export type Size={width:number;height:number};

export const FOCUS_VIEWPORT={width:840,height:560} as const;
const clamp=(n:number,low:number,high:number)=>Math.min(high,Math.max(low,n));

export function focusGeometry(source:Size,focus:FocusRect,viewport:Size,zoom:number,progress:number){
  const p=clamp(progress,0,1);
  const fit=Math.min(viewport.width/source.width,viewport.height/source.height);
  const target=Math.max(1,Math.min(zoom,viewport.width*.86/(source.width*fit*focus.width),viewport.height*.86/(source.height*fit*focus.height)));
  const scale=fit*(1+(target-1)*p);
  const width=source.width*scale,height=source.height*scale;
  const centerX=focus.x+focus.width/2,centerY=focus.y+focus.height/2;
  const constrained=(extent:number,port:number,center:number)=>extent<=port?(port-extent)/2:clamp(port/2-center*extent,port-extent,0);
  const endLeft=constrained(source.width*fit*target,viewport.width,centerX),endTop=constrained(source.height*fit*target,viewport.height,centerY);

  const left=(viewport.width-source.width*fit)/2*(1-p)+endLeft*p;
  const top=(viewport.height-source.height*fit)/2*(1-p)+endTop*p;
  const box={x:left+focus.x*width,y:top+focus.y*height,width:focus.width*width,height:focus.height*height};
  return {image:{width,height,left,top},box,cursor:{x:clamp((box.x+box.width*.72)/viewport.width,0,1),y:clamp((box.y+box.height*.6)/viewport.height,0,1)}};
}
