import React from 'react';
import {DesignSurface} from '../../../core/safe';
import {measureSpring, useCurrentFrame, useVideoConfig} from 'remotion';
import {DesignText} from '../../../style-kit/digits';
import {NAVY, W, Furniture, Mask, useMagazine} from '../system/base';
import {EASE, SPRING} from '../../../core/motion';
import {HEAD_CLEARANCE, LIFT_TRAVEL, type HeadBoxPx} from '../../../creative-kit/head-clear';

/** A missing envelope never means an empty talking-head frame. Prepared boxes already include the chin allowance. */
export const presenterHead=(head?:HeadBoxPx|null):HeadBoxPx=>head??{x:0,y:380,width:1080,height:620};

export const presenterDuration = (motion: 'land' | 'stagger' | 'quiet', fps: number) => measureSpring({fps, config: SPRING[motion === 'quiet' ? 'tight' : motion === 'stagger' ? 'snap' : 'land']});
/** Retain the spring's measured duration and replace its overshoot with EASE.land. */
export const PresenterRise: React.FC<{at: number; motion: 'land' | 'stagger' | 'quiet'; children: React.ReactNode; height: number}> = ({at, motion, children, height}) => {
  const f = useCurrentFrame(), {fps} = useVideoConfig();
  const duration = presenterDuration(motion, fps);
  return <Mask h={height} pad={0} k={EASE.land((f - at) / duration)} rise={LIFT_TRAVEL[motion]}>{children}</Mask>;
};
export const PresenterBand: React.FC<{bottom:number;top?:number;headBox?:HeadBoxPx|null;visible?:boolean}> = ({bottom,top=250,headBox,visible=true}) => {
  if(!visible)return null;
  const head=presenterHead(headBox),clear=bottom<=head.y-HEAD_CLEARANCE||top>=head.y+head.height+HEAD_CLEARANCE;
  const furnitureClear=head.y>=320+HEAD_CLEARANCE||head.y+head.height+HEAD_CLEARANCE<=270;
  return <>{clear&&bottom>top?<DesignSurface style={{position:'absolute',left:0,top,width:W,height:bottom-top,background:'linear-gradient(180deg,rgba(8,19,33,0.94),rgba(8,19,33,0.55))'}}/>:null}{furnitureClear?<Furniture th={NAVY} section="" page="" bottom={false}/>:null}</>;
};
export const Tag: React.FC<{text: string; size: number; box: number; width: number}> = ({text, size, box, width}) => {
  const {font, copy} = useMagazine();
  return <div style={{boxSizing: 'border-box', width, padding: '4px 16px', background: NAVY.ground, fontFamily: font, fontSize: size, fontWeight: 700, lineHeight: `${box}px`, color: NAVY.gold, direction: copy.dir, whiteSpace: 'nowrap', overflow: 'hidden'}}><DesignText>{text}</DesignText></div>;
};
