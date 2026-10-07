import React from 'react';
import {useCurrentFrame} from 'remotion';
import {curtainGeometry,type CurtainOptions,type WindowGeo} from './curtain';

type Props={options:CurtainOptions;full:WindowGeo;split:WindowGeo;upper:React.ReactNode;lower:React.ReactNode};

export const CurtainSplit:React.FC<Props>=({options,full,split,upper,lower})=>{
  const state=curtainGeometry(useCurrentFrame(),full,split,options);
  return <div style={{position:'absolute',inset:0,overflow:'hidden'}}>
    <div style={{position:'absolute',left:0,right:0,top:0,height:state.geometry.windowTop,overflow:'hidden',opacity:state.upperOpacity}}>{upper}</div>
    <div style={{position:'absolute',left:0,right:0,top:state.geometry.windowTop,height:state.geometry.windowHeight,overflow:'hidden'}}>{lower}</div>
  </div>;
};
