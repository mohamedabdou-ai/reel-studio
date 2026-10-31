import React from 'react';
import {useDesignText} from '../../../style-kit/digits';
import {AR, MONO, NAVY, fit} from './base';

/** Call after digit mapping: the characters drawn choose the face, never copy language. */
export function smallNumeralStyle(shown:string, size=40):React.CSSProperties {
  const indic=/[\u0660-\u0669\u06f0-\u06f9]/u.test(shown);
  return {fontFamily:indic?AR:MONO,fontWeight:indic?600:500,fontVariantNumeric:'tabular-nums',fontSize:Math.max(28,size),color:NAVY.gold};
}

export const SmallNumeral:React.FC<{text:string;size?:number;width?:number;height?:number}> =
({text,size=40,width=150,height=44}) => {
  const shown=useDesignText()(text), style=smallNumeralStyle(shown,size);
  const p=fit(shown,{width,size:style.fontSize as number,min:28,lines:1,weight:style.fontWeight as number,family:style.fontFamily,lh:1.1},style.fontFamily);
  return React.createElement('div',{
    'data-small-numeral':shown,'data-numeral-face':style.fontFamily,'data-numeral-weight':style.fontWeight,'data-numeral-size':p.size,
    style:{...style,width,height,overflow:'hidden',fontSize:p.size,lineHeight:`${p.box}px`,direction:'ltr',whiteSpace:'nowrap'},
  },shown);
};
