export type HeadBoxPx={x:number;y:number;width:number;height:number};



export type TitleBlock={
  width:number;

  angleDeg:number;

  chrome:number;

  titleFull:number;

  titleMin:number;

  lineHeight:number;

  inkEm:number;

  shadow:number;

  travel:number;

  rise:number;
};

export type TitlePlacementInput={
  head:HeadBoxPx|null|undefined;
  block:TitleBlock;

  fixedTop:number;

  ceiling:number;

  floor:number;

  margin?:number;

  rail?:{x:number;y:number}|null;

  left?:number;
};

export type TitlePlacement={
  mode:'fixed'|'above'|'below'|'fallback';
  top:number;

  titleBox:number|null;
};



export const HEAD_CLEARANCE=8;

export const STACK_GAP=16;



export const INK_EM=0.12;

export const PAINT_ALPHA=0.1;

export const PRESENTER_CAPTION_CENTER=1370;
export const CAPTION_BAND_HALF=64;

export const LIFT_TRAVEL={land:36,stagger:36,quiet:12} as const;


export const LIFT_RISE={land:0,stagger:2,quiet:0} as const;

export const HEAD_GUIDE_FAMILIES:readonly string[]=Object.freeze(['statement','creator-cta']);

export type LiftMotion=keyof typeof LIFT_TRAVEL;


export function liftExcursion(motion:LiftMotion):{travel:number;rise:number}{
  return {travel:Math.round((1-PAINT_ALPHA)*LIFT_TRAVEL[motion]),rise:LIFT_RISE[motion]};
}

const inkFor=(block:TitleBlock,h:number):number=>block.inkEm>0?Math.ceil(block.inkEm*h/block.lineHeight):0;


export function blockExtent(block:TitleBlock,h:number):{above:number;below:number}{
  const height=block.chrome+h;
  const rad=Math.abs(block.angleDeg)*Math.PI/180;
  const half=(height*Math.cos(rad)+block.width*Math.sin(rad))/2;
  const ink=inkFor(block,h);
  return {above:half-height/2+ink,below:height/2+half+block.shadow+ink};
}




export function railExtent(block:TitleBlock,h:number,left:number,railX:number):number|null{
  const H=block.chrome+h,W=block.width,cx=left+W/2,cy=H/2;
  const a=block.angleDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const p=[[-W/2,-H/2],[W/2,-H/2],[W/2,H/2],[-W/2,H/2]].map(([x,y])=>[cx+x*c-y*s,cy+x*s+y*c]);
  let low=-Infinity;
  for(let i=0;i<4;i++){const [x1,y1]=p[i],[x2,y2]=p[(i+1)%4];
    if(x1>=railX)low=Math.max(low,y1);
    if((x1-railX)*(x2-railX)<0)low=Math.max(low,y1+(railX-x1)/(x2-x1)*(y2-y1));}
  return low===-Infinity?null:low+block.shadow+inkFor(block,h);
}

type Band={mode:'above'|'below';low:number;high:number;travel:number};













export function placeTitle({head,block,fixedTop,ceiling,floor,margin=HEAD_CLEARANCE,rail=null,left=0}:TitlePlacementInput):TitlePlacement{
  if(!head)return {mode:'fixed',top:fixedTop,titleBox:null};
  const bands:Band[]=[
    {mode:'above',low:ceiling,high:head.y-margin,travel:block.travel},
    {mode:'below',low:head.y+head.height+margin,high:floor,travel:0},
  ];

  const spill=blockExtent({...block,inkEm:0},block.titleMin).above;
  const topFor=(band:Band,h:number):number|null=>{
    const lo=Math.ceil(band.low+spill+inkFor(block,h)+block.rise);
    let hi=Math.floor(band.high-blockExtent(block,h).below-band.travel);
    if(rail){
      const r=railExtent(block,h,left,rail.x);
      if(r!==null)hi=Math.min(hi,Math.floor(rail.y-1-r-block.travel));
    }
    return lo<=hi?Math.min(hi,Math.max(lo,fixedTop)):null;
  };
  for(const band of bands){
    const top=topFor(band,block.titleFull);
    if(top!==null)return {mode:band.mode,top,titleBox:null};
  }
  let best:{band:Band;h:number;top:number}|null=null;
  for(const band of bands){
    for(let h=block.titleFull-1;h>=block.titleMin;h--){
      const top=topFor(band,h);
      if(top===null)continue;
      if(!best || h>best.h)best={band,h,top};
      break;
    }
  }
  if(best)return {mode:best.band.mode,top:best.top,titleBox:best.h};
  return {mode:'fallback',top:fixedTop,titleBox:null};
}
