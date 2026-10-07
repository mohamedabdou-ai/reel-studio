type Size={width:number;height:number};
type Point={x:number;y:number};
type ImageFocusInput={source:Size;viewport:Size;focus:Point;startScale:number;endScale:number;progress:number;fit:'contain'|'cover'};
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

export function imageFocusGeometry(input:ImageFocusInput){
  const {source,viewport}=input;
  if(source.width<=0 || source.height<=0 || viewport.width<=0 || viewport.height<=0)throw new Error('Image and viewport dimensions must be positive.');
  if(input.startScale<=0 || input.endScale<=0)throw new Error('Image focus scales must be positive.');
  if(input.focus.x<0 || input.focus.x>1 || input.focus.y<0 || input.focus.y>1)throw new Error('Image focus point must be normalized from 0 to 1.');
  const progress=clamp(input.progress,0,1);
  const base=input.fit==='cover'?Math.max(viewport.width/source.width,viewport.height/source.height):Math.min(viewport.width/source.width,viewport.height/source.height);
  const scale=base*(input.startScale+(input.endScale-input.startScale)*progress);
  const width=source.width*scale,height=source.height*scale;
  const desiredLeft=viewport.width/2-input.focus.x*width,desiredTop=viewport.height/2-input.focus.y*height;
  const containLeft=(viewport.width-width)/2,containTop=(viewport.height-height)/2;
  const left=width<=viewport.width?containLeft:clamp(desiredLeft,viewport.width-width,0);
  const top=height<=viewport.height?containTop:clamp(desiredTop,viewport.height-height,0);
  return {progress,scale,image:{width,height,left,top},focus:{x:left+input.focus.x*width,y:top+input.focus.y*height}};
}
