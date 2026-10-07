export type WindowGeo={windowTop:number;windowHeight:number;videoWidth:number;videoLeft:number;videoTop:number};
const clamp01=(value:number)=>Math.min(1,Math.max(0,value));
const bezierMorph=(x:number)=>{
  const sample=(t:number,a:number,b:number)=>3*a*(1-t)*(1-t)*t+3*b*(1-t)*t*t+t*t*t;
  const slope=(t:number,a:number,b:number)=>3*a*(1-t)*(1-t)+6*(b-a)*(1-t)*t+3*(1-b)*t*t;
  let t=x;
  for(let i=0;i<8;i++){const d=slope(t,.65,.35);if(Math.abs(d)<1e-7)break;t=clamp01(t-(sample(t,.65,.35)-x)/d);}
  return sample(t,0,1);
};

export type CurtainOptions={
  fromFrame:number;
  toFrame:number;
  frameHeight:number;
  lowerFadeFrames?:number;
  upperRevealStart?:number;
};

const validateGeometry=(geometry:WindowGeo,frameHeight:number,label:string)=>{
  if(geometry.windowTop<0 || geometry.windowHeight<1 || geometry.windowTop+geometry.windowHeight!==frameHeight){
    throw new Error(`${label} curtain geometry must exactly cover the frame height.`);
  }
};


export function curtainGeometry(frame:number,full:WindowGeo,split:WindowGeo,options:CurtainOptions){
  if(!Number.isInteger(options.fromFrame) || !Number.isInteger(options.toFrame) || options.toFrame<=options.fromFrame){
    throw new Error('Curtain toFrame must be greater than fromFrame.');
  }
  if(!Number.isInteger(options.frameHeight) || options.frameHeight<1)throw new Error('Curtain frame height must be a positive integer.');
  validateGeometry(full,options.frameHeight,'Full');validateGeometry(split,options.frameHeight,'Split');
  const raw=clamp01((frame-options.fromFrame)/(options.toFrame-options.fromFrame));
  const progress=bezierMorph(raw);
  const lerp=(key:keyof WindowGeo)=>Math.round(full[key]+(split[key]-full[key])*progress);
  const seam=lerp('windowTop');
  const lowerFadeFrames=options.lowerFadeFrames??Math.max(1,Math.round((options.toFrame-options.fromFrame)*0.27));
  const upperRevealStart=options.upperRevealStart??0.88;
  if(lowerFadeFrames<1)throw new Error('Curtain lowerFadeFrames must be positive.');
  if(!(upperRevealStart>=0 && upperRevealStart<1))throw new Error('Curtain upperRevealStart must be in [0, 1).');
  return {
    progress,
    geometry:{windowTop:seam,windowHeight:options.frameHeight-seam,videoWidth:lerp('videoWidth'),videoLeft:lerp('videoLeft'),videoTop:lerp('videoTop')},
    lowerCaptionOpacity:1-clamp01((frame-options.fromFrame)/lowerFadeFrames),
    upperOpacity:clamp01((progress-upperRevealStart)/(1-upperRevealStart)),
  };
}
