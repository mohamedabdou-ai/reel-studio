type Range={fromFrame:number;toFrame:number};
type Scene={fromFrame:number;durationInFrames:number;layout:string};
type VisibilityEdit={scenes:Scene[];segments:Range[]};


export function defaultFootageGeometry({layout,canvasHeight,aspect,scale,focusX,focusY}:{layout:string;canvasHeight:number;aspect:number;scale:number;focusX:number;focusY:number}){
  const windowTop=layout==='presenter'?0:canvasHeight,windowHeight=1920-windowTop;
  const videoWidth=Math.round(Math.max(1080,windowHeight/aspect)*scale),videoHeight=Math.round(videoWidth*aspect);
  const clamp=(n:number,low:number,high:number)=>Math.round(Math.min(high,Math.max(low,n)));
  return {windowTop,windowHeight,videoWidth,videoLeft:clamp(540-focusX*videoWidth,1080-videoWidth,0),videoTop:clamp(windowHeight*.48-focusY*videoHeight,windowHeight-videoHeight,0)};
}


export function footageVisibility(edit:VisibilityEdit,frame:number,optimized=true):boolean{
  if(!optimized)return true;
  const active=edit.scenes.find(s=>frame>=s.fromFrame && frame<s.fromFrame+s.durationInFrames);
  return active?.layout!=='takeover';
}

export function foregroundSourceFrame(edit:Pick<VisibilityEdit,'segments'>,outputFrame:number):number{
  let cursor=0;
  for(const segment of edit.segments){const length=segment.toFrame-segment.fromFrame;if(outputFrame>=cursor && outputFrame<cursor+length)return segment.fromFrame+outputFrame-cursor;cursor+=length;}
  throw new Error('Foreground frame is outside the edit');
}
