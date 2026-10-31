import React from 'react';
import {AbsoluteFill,Easing,useCurrentFrame} from 'remotion';
import {useProbe} from '../safe';
import type {TransitionProps} from '../../prepared-edit/transition-registry';
import {edgePictureMasks} from './picture-mask';

const clamp01 = (value:number) => Math.max(0,Math.min(1,value));
/** Pilot TR geometry: the outgoing leaf hinges at x=0; incoming scene lives beneath it. */
export const magazineFlipGeometry = (progress:number,width=1080) => {
  const t = clamp01(progress),angle = Easing.inOut(Easing.sin)(t)*92,perspective = 2200;
  const radians = angle*Math.PI/180,shade = Math.sin(Math.min(radians,Math.PI/2));
  // Pilot ramp(t, .78, .22, linear) floors its duration to 1, even for normalized t.
  return {angle,perspective,edge:angle>=90?0:width*Math.cos(radians)*perspective/(perspective+width*Math.sin(radians)),
    shade,castFade:1-clamp01(t-.78)};
};
export const magazinePictureMasks = (local:number,duration:number,width=1080) =>
  edgePictureMasks(magazineFlipGeometry(local/Math.max(1,duration)+.5,width).edge,undefined,width);

/** Centred outgoing-content overlay. Integration must supply the outgoing scene as children,
 * keep it mounted through the end of the turn, and mount the incoming page underneath.
 * A content-free overlay or a reversed incoming entrance cannot reproduce this motion. */
export const MagazineFlip:React.FC<TransitionProps> = props => {
  const frame = useCurrentFrame(),probe = useProbe();
  const t = clamp01((frame-props.atFrame)/Math.max(1,props.durationInFrames)+.5);
  // Probe decoration is skipped, but the outgoing child still has a finite lifetime.
  if(probe !== null)return t<1?<>{props.children}</>:null;
  const box = props.box ?? {x:0,y:0,width:1080,height:1920};
  const g = magazineFlipGeometry(t,box.width);
  return <div data-transition="magazine-flip" style={{position:'absolute',left:box.x,top:box.y,width:box.width,height:box.height,pointerEvents:'none'}}>
    {t>0 && t<1?<AbsoluteFill style={{height:props.outgoingHeight,clipPath:magazinePictureMasks(frame-props.atFrame,props.durationInFrames,box.width).incoming,background:`linear-gradient(90deg, rgba(20,12,4,${.34*g.shade*g.castFade}) 0px, rgba(20,12,4,${.34*g.shade*g.castFade}) ${g.edge}px, rgba(20,12,4,0) ${g.edge+90}px)`,mixBlendMode:'multiply'}}/>:null}
    {t<1?<div style={{position:'absolute',inset:0,perspective:g.perspective,perspectiveOrigin:'0% 50%'}}>
      <div style={{position:'absolute',inset:0,height:props.outgoingHeight,transformOrigin:'0% 50%',transform:`rotateY(${g.angle}deg)`,backfaceVisibility:'hidden',boxShadow:`0 0 ${24*g.shade}px rgba(0,0,0,${.35*g.shade})`}}>
        {props.children}
        <AbsoluteFill style={{background:`linear-gradient(90deg, rgba(0,0,0,${.62*g.shade}) 0%, rgba(0,0,0,${.30*g.shade}) 100%)`}}/>
        <div style={{position:'absolute',top:0,bottom:0,right:0,width:3,background:`rgba(255,236,200,${.55*(1-.4*g.shade)})`}}/>
      </div>
    </div>:null}
  </div>;
};
