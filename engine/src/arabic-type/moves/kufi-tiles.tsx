import React from 'react';
import {MoveCanvas,raster,tint,fit} from '../canvas';
import {E,hash,progress as P} from '../math';
import type {ArabicMoveProps,DrawMove} from '../types';
const cache=new WeakMap<ReturnType<typeof raster>,ReturnType<typeof tiles>>();
function tiles(r:ReturnType<typeof raster>){
  const {width:w,height:h}=r,d=r.ctx.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=0,y1=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>127){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const rows=16,ih=Math.max(1,y1-y0+1),iw=Math.max(1,x1-x0+1),cell=ih/rows,cols=Math.ceil(iw/cell),gx0=x0+iw/2-cols*cell/2,cells:{r:number;c:number;cr:number;j:number}[]=[];
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    let count=0,total=0;for(let y=Math.floor(y0+row*cell);y<Math.floor(y0+(row+1)*cell);y++)for(let x=Math.floor(gx0+col*cell);x<Math.floor(gx0+(col+1)*cell);x++){
      total++;if(x>=0&&x<w&&y>=0&&y<h&&d[(y*w+x)*4+3]>127)count++;}
    if(total&&count/total>=.5)cells.push({r:row,c:col,cr:cols-1-col,j:hash(row,col)});
  }return {rows,cols,cell,gx0,y0,cells,g:Math.min(220/(cols*cell),190/(rows*cell)),last:.3+.018*(cols-1)+.03+.22};
}
const draw:DrawMove=(ctx,t,p)=>{
  const r=raster(p.text,p.font,fit(ctx,p.text,p.font,110,225,p.fitFloor));let grid=cache.get(r);if(!grid){grid=tiles(r);cache.set(r,grid);}
  const {rows,cols,cell,g,gx0,y0,cells,last}=grid,gw=cols*cell*g,gh=rows*cell*g,cs=cell*g,X0=135-gw/2,Y0=190-gh/2;
  const exit=E.cubIn(P(t,p.durationInFrames/p.fps-.5,.4)),gl=E.cubOut(P(t,0,.3)),gf=1-P(t,.3+.018*cols,.4);ctx.globalAlpha=1-exit;
  if(gf>0){ctx.save();ctx.globalAlpha=(1-exit)*.3*gf;ctx.strokeStyle=p.ink;ctx.lineWidth=.6;ctx.beginPath();
    for(let c=0;c<=cols;c++){const x=X0+gw-c*cs;ctx.moveTo(x,Y0);ctx.lineTo(x,Y0+gh*gl);}
    for(let row=0;row<=rows;row++){const y=Y0+row*cs;ctx.moveTo(X0+gw,y);ctx.lineTo(X0+gw-gw*gl,y);}ctx.stroke();ctx.restore();}
  const resolve=E.cubIO(P(t,last+.6,.4));if(resolve<1){ctx.fillStyle=p.accent;for(const q of cells){const start=.3+.018*q.cr+.03*q.j;if(t<start)continue;
    const f=E.back(P(t,start,.22)),x=X0+q.c*cs,y=Y0+q.r*cs,ins=cs*.04,w=(cs-2*ins)*f,h=(cs-2*ins)*(1-.15*resolve);
    ctx.save();ctx.globalAlpha=(1-exit)*(1-resolve);ctx.fillRect(x+cs/2-w/2,y+cs/2-h/2,w,h);ctx.restore();}}
  if(resolve>0){ctx.save();ctx.globalAlpha=(1-exit)*resolve;ctx.drawImage(tint(r,p.accent),X0-gx0*g,Y0-y0*g,r.width*g,r.height*g);ctx.restore();}
};
export const KufiTiles:React.FC<ArabicMoveProps>=props=><MoveCanvas {...props} move="kufi-tiles" draw={draw}/>;
