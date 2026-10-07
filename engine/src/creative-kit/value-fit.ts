import {widthTemplate} from '../core/numbers.ts';

export const VALUE_FITS=['rolling','final'] as const;
export type ValueFit=(typeof VALUE_FITS)[number];



export const finalValueTemplate=(value:number,suffix:string):string=>widthTemplate(value,{grouping:true,decimals:0,suffix});
