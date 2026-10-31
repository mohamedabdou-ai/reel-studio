import React from 'react';
import {DesignSurface} from '../core/safe';
import {useCurrentFrame} from 'remotion';
import {fitOnLines,fitToBox} from '../core/type';
import {displayWeight,displayLineHeight,ownSceneCopy,designWarning} from './design-safety';
import type {FamilyDesignProps} from '../styles/family-designs';
const palette:Record<string,{fill:string;ink:string;accent:string;native:string;weight:number}>={
 'kinetic-paper':{fill:'#FBF8F0',ink:'#15231F',accent:'#DDF25E',native:'Lalezar',weight:400},
 'magazine-interview':{fill:'#081321',ink:'#F5F3EC',accent:'#F3C776',native:'Alexandria',weight:800},
 'liquid-glass':{fill:'rgba(5,9,22,0.78)',ink:'#FFFFFF',accent:'#64E4FF',native:'Grid Sans',weight:700},
 'calligraphic-receipts':{fill:'#F4EDE1',ink:'#2E2019',accent:'#A54522',native:'Aref Ruqaa',weight:700},
 'paper-collage':{fill:'#1E6470',ink:'#FFFEF7',accent:'#E2B13C',native:'Reem Kufi',weight:700},
};
/** The same printed strip/card moves over the body when an upper band cannot clear the face. */
export const StatementBand:React.FC<FamilyDesignProps & {font:string}> = p=>{
 const d=p.scene.data as {title:string;kicker:string},c=palette[p.style],copy=ownSceneCopy(d),f=useCurrentFrame();
 const weight=displayWeight(p.font,c.native,c.weight),lh=displayLineHeight(p.font,c.native,1.3);
 let t=fitOnLines(d.title,{fontFamily:p.font,fontWeight:weight,fontSize:62},{maxBoxWidth:716,maxLines:2,min:38,max:62,lineHeight:lh});
 if(!t.fits){designWarning(p.style,{statement:d.title,width:716});t=fitToBox(d.title,{fontFamily:p.font,fontWeight:weight,fontSize:38},{maxBoxWidth:716,maxLines:2,lineHeight:lh});}
 const h=Math.min(222,54+t.lines.length*t.lineBox),bottom=1150;
 const available=p.headBox?bottom-p.headBox.y-p.headBox.height-24:p.style==='magazine-interview'?Math.min(h,bottom-1008):h;
 if(p.style==='magazine-interview'&&available<=0)return null;
 const scale=Math.min(1,Math.max(1,available)/h),top=bottom-h*scale;
 if(scale<1)designWarning(p.style,{statement:'Lower band needs smaller type to clear the supplied head',available,head:p.headBox});
 const k=Math.max(0,Math.min(1,(f-8)/16));
 return <DesignSurface data-statement-placement="lower" data-statement-top={top} data-statement-bottom={bottom} data-caption-clearance={24} style={{position:'absolute',left:65,top,width:788,height:h,direction:copy.dir,textAlign:copy.align,background:c.fill,color:c.ink,boxSizing:'border-box',border:p.style==='magazine-interview'?'1px solid '+c.accent:undefined,borderRadius:p.style==='liquid-glass'?28:0,boxShadow:p.style==='kinetic-paper'?'8px 8px 0 #15231F':undefined,backdropFilter:p.style==='liquid-glass'?'blur(28px)':undefined,transform:scale<1?'scale('+scale+')':undefined,transformOrigin:'left top',opacity:k}}>
  <div style={{position:'absolute',top:10,left:36,right:36,fontFamily:p.font,fontWeight:600,fontSize:24,lineHeight:'32px',color:c.accent}}><span data-statement-kicker={p.style} style={p.style==='kinetic-paper'?{display:'inline-block',color:c.ink,background:c.accent,padding:'0 8px'}:undefined}>{d.kicker}</span></div>
  <div style={{position:'absolute',top:44,left:36,right:36,fontFamily:p.font,fontWeight:weight,fontSize:t.fontSize,lineHeight:t.lineBox+'px'}}>{t.lines.map((line,i)=><div key={i} style={{whiteSpace:'nowrap',height:t.lineBox}}>{line}</div>)}</div>
 </DesignSurface>;
};
