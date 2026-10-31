import {DesignText} from '../../../style-kit/digits';
import {StatementBand} from '../../../style-kit/statement-band';
import React from 'react';
import {DesignSurface} from '../../../core/safe';
import {AbsoluteFill,useCurrentFrame} from 'remotion';
import type {FamilyDesignProps} from '../../family-designs';
import {NAVY,W,X0,X1,CW,ramp,Headline,Rule,Diamond,QuoteGlyph,MagazineScope,useMagazine,useType,statementPlacement} from './kit';
import {magazineCopy} from './copy';

const Drawing: React.FC<{d: {kicker: string; title: string};headBox?:FamilyDesignProps["headBox"]}> = ({d,headBox}) => {
  const f = useCurrentFrame();
  const {copy,font:AR}=useMagazine();
  const {planHeadline}=useType();
  const th = NAVY;
  const plan = planHeadline(d.title, {max: 104, min: 76, lines: 3});
  const q = ramp(f, 2, 26);
  const top = 418;   // the whole block ends by y 760 so the face (about y 550 to 1100) stays clear below it
  const placement=statementPlacement(plan.height,headBox);
  return <AbsoluteFill>
    <DesignSurface style={{position:'absolute',left:0,top:250,width:1080,height:placement.bottom-250,background:'linear-gradient(180deg,rgba(8,19,33,0.94),rgba(8,19,33,0.55))'}}/>
    <div style={{position: 'absolute', top: 270, [copy.side]: X0, width: CW * ramp(f, 0, 22), height: 2, background: th.gold}}/>
    <div style={{position: 'absolute', top: 286, [copy.side]: X0, fontFamily: AR, fontWeight: 400, fontSize: 30, lineHeight: '34px', color: th.dim, opacity: ramp(f, 8, 18), direction: copy.dir}}><DesignText>{magazineCopy('issue',copy)}</DesignText></div>
    <div style={{position: 'absolute', top: 286, [copy.opposite]: X0, fontFamily: AR, fontWeight: 400, fontSize: 30, lineHeight: '34px', color: th.dim, opacity: ramp(f, 8, 18), direction: copy.dir}}>{magazineCopy('quote',copy)}</div>
    <div data-head-clear-bottom={placement.bottom} style={{position:"absolute",inset:0,transform:placement.transform,transformOrigin:"65px 250px",visibility:placement.visible?undefined:"hidden"}}>
    <QuoteGlyph open size={240} color={th.gold} p={q} style={{top: 314, [copy.side]: X0 - 6}}/>
    <Headline plan={plan} th={th} top={top} at={10} marker markerAt={46}/>
    <Rule top={top + plan.height + 30} width={CW} at={56} color={th.gold}/>
    <div style={{position: 'absolute', top: top + plan.height + 46, [copy.side]: W - X1, display: 'flex', alignItems: 'center', gap: 16, direction: copy.dir, opacity: ramp(f, 66, 16)}}>
      <Diamond color={th.gold} size={11}/>
      <span style={{fontFamily: AR, fontWeight: 500, fontSize: 34, lineHeight: '46px', color: th.ink}}>{d.kicker}</span>
    </div>
    </div>
  </AbsoluteFill>;
};

const SafeDrawing:React.FC<{scene:FamilyDesignProps['scene'];headBox?:FamilyDesignProps['headBox']}>=({scene,headBox})=>{
 const {font}=useMagazine(),{planHeadline}=useType();const d=scene.data as {title:string;kicker:string};
 const height=planHeadline(d.title,{max:104,min:76,lines:3}).height;
 if(!headBox || 418+height+122>headBox.y-40)return <StatementBand scene={scene} headBox={headBox} font={font} style="magazine-interview" geometry={{} as any} seam={1080} aspect={1}/>;
 return <Drawing d={d} headBox={headBox}/>;
};
export const Statement:React.FC<FamilyDesignProps>=({scene,headBox})=>{
  if(scene.family!=='statement')return null;
  return <MagazineScope data={scene.data}><SafeDrawing scene={scene} headBox={headBox}/></MagazineScope>;
};
