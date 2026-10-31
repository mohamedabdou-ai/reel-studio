import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {FamilyDesignProps} from '../../family-designs';
import {Footage} from '../../../core/plate';
import {EASE} from '../../../core/motion';
import {NAVY, CW, X0, Mask, MagazineScope, ramp, useMagazine, useType, statementPlacement, fitWarning} from '../system/base';
import {sceneCopy} from '../../scene-copy';
import {PresenterBand, PresenterRise, Tag, presenterDuration, presenterHead} from './presenter';

const markRiseCache=new Map<string,number>();
/** Ink above the unmarked word, in CSS pixels. Measuring the installed face preserves its actual mark placement. */
const stampMarkRise=(text:string,font:string,size:number)=>{
  if(!/\p{M}/u.test(text))return 0;
  const key=JSON.stringify([text,font,size]),cached=markRiseCache.get(key);
  if(cached!==undefined)return cached;
  const ctx=typeof document!=='undefined'&&typeof document.createElement==='function'?document.createElement('canvas').getContext('2d'):null;
  // Server-only markup cannot measure ink. Preserve its layout; the render browser measures the loaded face.
  if(!ctx)return 0;
  ctx.font='700 '+size+'px '+JSON.stringify(font);
  const marked=ctx.measureText(text).actualBoundingBoxAscent,plain=ctx.measureText(text.replace(/\p{M}/gu,'')).actualBoundingBoxAscent;
  if(!Number.isFinite(marked)||!Number.isFinite(plain))return Math.ceil(size*0.34);
  const rise=Math.max(0,Math.ceil(marked-plain));
  if(markRiseCache.size>=256)markRiseCache.clear();
  markRiseCache.set(key,rise);return rise;
};

const Drawing: React.FC<FamilyDesignProps> = ({scene, headBox:providedHead, geometry, aspect}) => {
  if (scene.family !== 'kinetic-hook') return null;
  const d = scene.data, f = useCurrentFrame(), {fps} = useVideoConfig();
  const headBox=presenterHead(providedHead);
  const {copy, font} = useMagazine(), {fit, wid} = useType();
  if (wid(d.label, 32, 700) > CW - 32) fitWarning(d.label, CW - 32, 32, 1);
  // Keep the approved title/rule placement; only the stamp's painted extent grows in round 2.
  const referenceLimit = headBox ? 260 : CW - 32;
  const referenceStamp = fit(d.stamp, {width: referenceLimit - 36, size: 34, min: 34, lines: 1, weight: 700});
  const referenceW = Math.min(referenceLimit, wid(d.stamp, 34, 700) + 36), referenceH = referenceStamp.box + 12;
  const paddingScale = 44 / 34, stampLimit = Math.min(CW - 32, referenceLimit * paddingScale);
  const stamp = fit(d.stamp, {width: stampLimit - 36 * paddingScale, size: 44, min: 44, lines: 1, weight: 700});
  const stampW = Math.min(stampLimit, wid(d.stamp, stamp.size, 700) + 36 * paddingScale), stampH = stamp.box + 12 * paddingScale;
  const angle = 2.5 * Math.PI / 180;
  const stampPaint = Math.ceil((stampH * Math.cos(angle) + stampW * Math.sin(angle)) * 1.04 + 12);
  const referencePaint = Math.ceil((referenceH * Math.cos(angle) + referenceW * Math.sin(angle)) * 1.04 + 12);
  const titleTop = 374;
  const max = Math.min(150, Math.max(96, Math.floor(((headBox?.y ?? 900) - 40 - titleTop - 24 - referencePaint) / 1.3)));
  const first = fit(d.firstTitle, {width: CW, size: max, min: 96, lines: 1, weight: 800, lh: 1.3});
  const second = fit(d.secondTitle, {width: CW, size: max, min: 96, lines: 1, weight: 800, lh: 1.3});
  const titleH = Math.max(first.box, second.box), ruleTop = titleTop + titleH + 12, stampTop = ruleTop + 12;
  const bottom = stampTop + referencePaint, placement = headBox.y-40<=250?{transform:undefined,bottom:250,visible:false}:statementPlacement(bottom - 540, headBox);
  const upperShift = Number(placement.transform?.match(/^translateY\(([-.\d]+)px\)$/)?.[1] ?? 0);
  const upperClear = placement.visible && !placement.transform?.startsWith('scale(') && 326 + upperShift >= 320 && stampTop+upperShift+stampPaint<=headBox.y-8;
  const lowerShift=headBox.y+headBox.height+8-326;
  const below=!upperClear&&stampTop+lowerShift+stampPaint<=1150;
  const compactPlan=(()=>{
    if(upperClear||below)return null;
    const available=1150-(headBox.y+headBox.height+8);
    if(available<44+Math.round(72*1.3)+4)return null;
    for(let size=96;size>=72;size-=2){
      if(Math.round(size*1.3)>available-48)continue;
      const a=fit(d.firstTitle,{width:CW,size,min:72,lines:1,weight:800,lh:1.3});
      const b=fit(d.secondTitle,{width:CW,size,min:72,lines:1,weight:800,lh:1.3});
      const height=Math.max(a.box,b.box),free=available-44-height-4;
      if(free>=0){const titleGap=Math.min(8,free);return {first:a,second:b,height,titleGap,ruleGap:Math.min(12,free-titleGap)};}
    }
    return null;
  })();
  const compact=compactPlan!==null;
  const shownFirst=compactPlan?.first??first,shownSecond=compactPlan?.second??second;
  const shownTitleH=compactPlan?.height??titleH;
  const shownTitleTop=compactPlan?326+44+compactPlan.titleGap:titleTop;
  const shownRuleTop=compactPlan?shownTitleTop+shownTitleH+compactPlan.ruleGap:ruleTop;
  const shownStampTop=compact?326:stampTop,shownStampPaint=compact?44:stampPaint;
  const metaLimit=(CW-24)/2,compactLabelW=Math.min(metaLimit,wid(d.label,32,700)+32),compactStampW=Math.min(metaLimit,wid(d.stamp,32,700)+36);
  if(compact&&wid(d.label,32,700)>metaLimit-32)fitWarning(d.label,metaLimit-32,32,1);
  if(compact&&wid(d.stamp,32,700)>metaLimit-36)fitWarning(d.stamp,metaLimit-36,32,1);
  const shift=upperClear?upperShift:below||compact?lowerShift:0;
  const transform=shift?`translateY(${shift}px)`:undefined;
  const canShow=upperClear||below||compact;
  const hookBottom=compact?shownRuleTop+shift+4:bottom+shift;
  const stampBottom = shownStampTop + shift + shownStampPaint;
  const stampVisible = canShow;
  // Grow only the frame upward; added top padding keeps the word baseline fixed.
  const stampUp=stampMarkRise(d.stamp,font,compact?32:stamp.size);
  const old = 1 - ramp(f, d.swapFrame, 8), incoming = ramp(f, d.swapFrame + 4, 14), stampK = ramp(f, d.stampFrame, presenterDuration(scene.motion, fps), EASE.land);
  if (headBox && !canShow) fitWarning(d.firstTitle, CW, 72, 1);
  return <div data-p1-family="kinetic-hook" data-direction={copy.dir} style={{position: 'absolute', inset: 0}}>
    <PresenterBand top={below||compact?326+shift:250} bottom={Math.max(hookBottom,stampBottom)} headBox={headBox} visible={canShow}/>
    <div data-head-clear-bottom={hookBottom} data-hook-form={compact?'compact':undefined} data-p1-box="hook" data-top={326 + shift} data-bottom={hookBottom} style={{position: 'absolute', inset: 0, transform, transformOrigin: '65px 250px', visibility: canShow ? undefined : 'hidden'}}>
      <div data-p1-label={compact?'compact':undefined} style={{position: 'absolute', top: 326, [copy.side]: X0, maxWidth: compact?metaLimit:CW, overflow: 'hidden'}}><PresenterRise at={1} motion={scene.motion} height={44}><Tag text={d.label} size={32} box={36} width={compact?compactLabelW:Math.min(CW, wid(d.label, 32, 700) + 32)}/></PresenterRise></div>
      <div data-p1-size={Math.min(shownFirst.size, shownSecond.size)} data-swap-frame={d.swapFrame} style={{position: 'absolute', top: shownTitleTop, [copy.side]: X0, width: CW, height: shownTitleH, overflow: 'hidden'}}>
        <PresenterRise at={6} motion={scene.motion} height={shownTitleH}><Mask h={shownTitleH} pad={0} k={1}>
          {[{text: d.firstTitle, t: shownFirst, opacity: old, rise: (1 - old) * 30}, {text: d.secondTitle, t: shownSecond, opacity: incoming, rise: (1 - incoming) * 30}].map((row, i) => <div key={i} data-p1-swap={i ? 'new' : 'old'} style={{position: 'absolute', inset: 0, opacity: row.opacity, transform: `translateY(${row.rise}px)`, fontFamily: font, fontWeight: 800, fontSize: row.t.size, lineHeight: `${shownTitleH}px`, color: NAVY.ink, direction: copy.dir, textAlign: copy.align, whiteSpace: 'nowrap'}}>{row.text}</div>)}
        </Mask></PresenterRise>
      </div>
      <div style={{position: 'absolute', top: shownRuleTop, [copy.side]: X0, width: CW, height: 4}}><PresenterRise at={6} motion={scene.motion} height={4}><div style={{height: 4, background: NAVY.dim}}/><div data-rule-at={d.swapFrame} style={{position: 'absolute', top: 0, [copy.side]: 0, width: CW * ramp(f, d.swapFrame, 22), height: 4, background: NAVY.gold}}/></PresenterRise></div>
    </div>
    {d.foreground ? <div data-p1-matte="speaker" style={{position: 'absolute', top: geometry.windowTop, left: 0, width: 1080, height: geometry.windowHeight, overflow: 'hidden'}}><div style={{position: 'absolute', left: geometry.videoLeft, top: geometry.videoTop, width: geometry.videoWidth, height: Math.round(geometry.videoWidth * aspect)}}><Footage src={d.foreground.src} transparent muted startFromSec={d.foreground.trimBeforeFrame / fps}/></div></div> : null}
    <div data-stamp-frame={d.stampFrame} data-p1-box="stamp" data-top={shownStampTop + shift - stampUp} data-bottom={stampBottom} data-p1-stamp-size={compact?32:stamp.size} style={{position: 'absolute', inset: 0, transform, transformOrigin: '65px 250px', visibility: stampVisible ? undefined : 'hidden'}}><div style={{position: 'absolute', top: shownStampTop-stampUp, [compact?copy.opposite:copy.side]: X0, width: compact?compactStampW:CW, height: shownStampPaint+stampUp, overflow:'hidden'}}><Mask h={shownStampPaint+stampUp} pad={0} k={stampK}>{compact?<div data-p1-stamp="" style={{width:compactStampW,height:44+stampUp,border:`2px solid ${NAVY.gold}`,boxSizing:'border-box',padding:stampUp?`${2+stampUp}px 16px 2px`:'2px 16px',fontFamily:font,fontSize:32,fontWeight:700,lineHeight:'36px',color:NAVY.gold,textAlign:copy.align,direction:copy.dir,whiteSpace:'nowrap',overflow:'hidden'}}>{d.stamp}</div>:<div data-p1-stamp="" style={{position: 'absolute', [copy.side]: 12, top: (stampPaint - stampH) / 2, width: stampW, height: stampH+stampUp, border: `2px solid ${NAVY.gold}`, outline: `1px solid ${NAVY.gold}`, outlineOffset: 4, boxSizing: 'border-box', transform: `rotate(-2.5deg) scale(${1.04 - 0.04 * stampK})`, transformOrigin:stampUp?`50% ${stampH/2+stampUp}px`:undefined, color: NAVY.gold, fontFamily: font, fontSize: stamp.size, fontWeight: 700, lineHeight: `${stamp.box}px`, textAlign: copy.align, direction: copy.dir, padding: stampUp?`${4*paddingScale+stampUp}px ${16*paddingScale}px ${4*paddingScale}px`:`${4 * paddingScale}px ${16 * paddingScale}px`, whiteSpace: 'nowrap'}}>{d.stamp}</div>}</Mask></div></div>
  </div>;
};
export const KineticHook: React.FC<FamilyDesignProps> = props => <MagazineScope data={props.scene.family === 'kinetic-hook' ? {lang: sceneCopy({firstTitle:props.scene.data.firstTitle,secondTitle:props.scene.data.secondTitle,stamp:props.scene.data.stamp}).ar ? 'ar' : 'en'} : {lang:'en'}}><Drawing {...props}/></MagazineScope>;
