import {composePaper, type ComposeData} from '../creative-kit/compose/schema.ts';
import React from 'react';
import type {EditScene} from '../prepared-edit/schema.ts';
import {InkCaption} from './calligraphic-receipts/designs/kit';
import {MagazineCaption,MagazineScope,CREAM,NAVY} from './magazine-interview/designs/kit';

type Props={text:string;scene?:EditScene;center:number};
export const CAPTION_DESIGNS:Record<'ink'|'magazine',React.FC<Props>>={
  ink:({text,scene})=><InkCaption text={text} y={scene?.layout==='split'?1000:1260} slip={scene?.layout!=='takeover'}/>,
  magazine:({text,scene})=>{
    const takeover=scene?.layout==='takeover';
    const cream=takeover && (['checklist','comparison','verdict'].includes(scene.family) || (scene.family === 'compose' && composePaper(scene.data as ComposeData) === 'cream'));
    return <MagazineScope data={{text}}><MagazineCaption text={text} y={scene?.layout==='split'?1096:1300} th={cream?CREAM:NAVY} shadow={!takeover} rule={scene?.layout!=='split'}/></MagazineScope>;
  },
};
