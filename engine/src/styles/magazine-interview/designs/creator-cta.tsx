import React from 'react';
import {DesignSurface} from '../../../core/safe';
import {Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import type {FamilyDesignProps} from '../../family-designs';
import {placeTitle, blockExtent, liftExcursion, INK_EM, STACK_GAP} from '../../../creative-kit/head-clear';
import {NAVY, CW, X0, Mask, MagazineScope, Headline, useMagazine, useType, fitWarning, Diamond} from '../system/base';
import {balancedLines} from '../system/page-parts';
import {CardPart, cardLayout} from '../system/parts/card';
import {PresenterBand, PresenterRise, presenterHead} from './presenter';
import {KINETIC_COPY} from './copy-kinetic';
import {panelMotion} from './creator-cta-panel';

const Drawing: React.FC<FamilyDesignProps> = ({scene, headBox:providedHead}) => {
  if (scene.family !== 'creator-cta') return null;
  const d = scene.data, f = useCurrentFrame(), {copy, font} = useMagazine(), {planHeadline, fit} = useType();
  const headBox=presenterHead(providedHead);
  const {fps} = useVideoConfig();
  const aboveTop = 350, aboveBottom = headBox ? headBox.y - 40 : 620;
  const availableHeight = Math.max(0, aboveBottom - aboveTop);
  const plan = planHeadline(d.title, {max: 96, min: 56, lines: 3, width: CW, maxHeight: availableHeight > 0 ? availableHeight : undefined});
  const backPlan = planHeadline(d.title, {max: 104, min: 56, lines: 3, width: 810, maxHeight: 270});
  const block = {width: 864, angleDeg: 0, chrome: 30, titleFull: backPlan.height, titleMin: backPlan.height, lineHeight: 1.2, inkEm: INK_EM, shadow: 0, ...liftExcursion(scene.motion)};
  const below = placeTitle({head: headBox, fixedTop: 280, ceiling: 250, floor: 1000 - STACK_GAP, left: 95, rail: {x: 853, y: 1150}, block});
  const fitsAbove = plan.height <= availableHeight;
  const backed = !fitsAbove && below.mode === 'below';
  const small = fit(d.title, {width: CW, size: 54, min: 34, lines: 2, weight: 700, lh: 1.3});
  const smallLines = balancedLines(d.title, small.size, 700, CW, font);
  const smallHeight = Math.min(2, smallLines.length) * small.box;
  const smallPlacement = placeTitle({head: headBox, fixedTop: 350, ceiling: 350, floor: 984, margin: 40, left: X0, block: {...block, width: CW, chrome: 0, inkEm: 0, titleFull: smallHeight, titleMin: smallHeight}});
  const smallAbove = !fitsAbove && !backed && smallPlacement.mode === 'above';
  const visible = backed || smallAbove || fitsAbove;
  const titleTop = smallAbove ? smallPlacement.top : aboveTop;
  const titleHeight = smallAbove ? smallHeight : plan.height;
  const effectiveSize = smallAbove ? small.size : plan.size;
  if (!visible) fitWarning(d.title, CW, 56, 3);
  const c = (key: keyof typeof KINETIC_COPY) => KINETIC_COPY[key][copy.ar ? 'ar' : 'en'];
  const clicked = f >= d.clickedFrame;
  const card = {kind: 'card', variant: 'follow', title: d.handle, value: clicked ? c('creatorFollowed') : c('creatorFollow'), pressFrame: clicked ? 0 : 1e9};
  const panelTop = Math.max(1000, headBox ? headBox.y + headBox.height + 8 : 0);
  const panelBottom = 1470, pad = 24, innerWidth = CW - pad * 2;
  // The backing spans the page; the lower copy still clears the platform rail at x=853.
  const cardWidth = 853 - (X0 + pad), cardHeight = 254;
  const cardTop = panelBottom - pad - cardHeight, labelTop = cardTop - 8 - 36;
  const promptTop = panelTop + pad, promptHeight = Math.max(0, Math.min(112, labelTop - 12 - promptTop));
  const panel = panelMotion({frame: f, fps, motion: scene.motion, panelTop, panelBottom, promptTop, promptHeight, labelTop, cardTop, cardHeight, followFrame: d.followFrame, clickedFrame: d.clickedFrame, pad});
  const measuredCard = cardLayout(card, cardWidth, cardHeight, 1, false, font);
  const prompt = d.prompt.includes('{keyword}') ? d.prompt.split('{keyword}') : d.prompt.includes(d.keyword) ? d.prompt.split(d.keyword) : [d.prompt];
  const promptSize = fit(d.prompt.replaceAll('{keyword}', d.keyword), {width: innerWidth - 72, size: 40, min: 34, lines: 2, weight: 400}).size;
  if (promptHeight < 64) fitWarning(d.prompt, innerWidth, 34, 2);
  if (measuredCard.h > cardHeight) fitWarning(d.handle, cardWidth - 92, 40, 2);
  return <div data-p1-family="creator-cta" data-direction={copy.dir} data-caption="false" style={{position: 'absolute', inset: 0}}>
    <style>{'[data-p1-follow-card] rect{stroke-width:2px}[data-p1-follow-card] div[style*="border:1.5px solid"]{border-width:2px!important}[data-p1-follow-card] path{stroke-linecap:butt;stroke-linejoin:miter}'}</style>
    <PresenterBand top={backed?below.top:250} bottom={backed ? below.top + blockExtent(block, backPlan.height).below : titleTop + titleHeight} headBox={headBox} visible={visible}/>
    {backed ? <DesignSurface data-p1-box="backed-title" data-title-effective-size={backPlan.size} data-top={below.top} data-bottom={below.top + blockExtent(block, backPlan.height).below} style={{position: 'absolute', left: 0, top: below.top, width: 1080, height: backPlan.height + 30, background: 'rgba(8,19,33,0.94)', borderTop: `2px solid ${NAVY.gold}`, overflow: 'hidden'}}><PresenterRise at={0} motion={scene.motion} height={backPlan.height + 30}><Headline plan={backPlan} th={NAVY} top={15} at={-100000} stagger={0} width={810} right={95}/></PresenterRise></DesignSurface>
      : <div data-head-clear-bottom={titleTop + titleHeight} data-p1-size={smallAbove ? small.size : plan.size} data-title-effective-size={effectiveSize} data-title-small={smallAbove} data-title-side={copy.side} data-title-available-height={availableHeight} style={{position: 'absolute', inset: 0, visibility: visible ? undefined : 'hidden'}}><div data-p1-title="" style={{position: 'absolute', top: titleTop, [copy.side]: X0, width: CW, height: titleHeight, overflow: 'hidden', direction: copy.dir, textAlign: copy.align}}><PresenterRise at={0} motion={scene.motion} height={titleHeight}>{smallAbove ? smallLines.map((line, i) => <Mask key={i} h={small.box} pad={0} k={1}><div style={{fontFamily: font, fontWeight: 700, fontSize: small.size, lineHeight: `${small.box}px`, color: NAVY.ink, direction: copy.dir, textAlign: copy.align, whiteSpace: 'nowrap'}}>{line}</div></Mask>) : <Headline plan={plan} th={NAVY} top={0} at={-100000} stagger={0} right={0}/>}</PresenterRise></div></div>}
    {panelTop<panelBottom?<div data-p1-box="cta-panel" data-top={panelTop} data-bottom={panel.bottom} data-padding={pad} style={{position: 'absolute', left: X0, top: panelTop, width: CW, height: Math.max(0, panel.bottom - panelTop), padding: pad, boxSizing: 'border-box', overflow: 'hidden', borderTop: '2px solid transparent'}}>
      <DesignSurface data-p1-panel-ground="" style={{position: 'absolute', left: 0, top: -2, width: CW, height: Math.max(0, panel.bottom - panelTop), opacity: panel.opacity, background: 'rgba(8,19,33,0.94)'}}>
        <div data-p1-panel-rule="" style={{position: 'absolute', top: 0, [copy.side]: 0, width: CW * panel.rule, height: 2, background: NAVY.gold}}/>
      </DesignSurface>
      <div data-p1-box="prompt" data-top={promptTop} data-bottom={promptTop + promptHeight} data-p1-size={promptSize} style={{position: 'absolute', left: pad, top: pad, width: innerWidth, height: promptHeight, overflow: 'hidden'}}><PresenterRise at={12} motion={scene.motion} height={promptHeight}><div style={{display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', direction: copy.dir, fontFamily: font, fontSize: promptSize, lineHeight: '52px', color: NAVY.ink}}><Diamond color={NAVY.gold} size={13}/>{prompt.map((part, i) => <React.Fragment key={i}>{i > 0 ? <span style={{display: 'inline-block', padding: '4px 16px', border: `2px solid ${NAVY.gold}`, color: NAVY.gold, fontWeight: 700, whiteSpace: 'nowrap'}}><bdi dir="auto">{d.keyword}</bdi></span> : null}<span style={{fontWeight: 400}}>{part}</span></React.Fragment>)}</div></PresenterRise></div>
      <div data-p1-box="follow-label" data-top={labelTop} data-bottom={labelTop + 36} style={{position: 'absolute', left: pad, top: labelTop - panelTop, width: cardWidth, fontFamily: font, fontSize: 28, fontWeight: 600, lineHeight: '36px', color: NAVY.dim, direction: copy.dir, textAlign: copy.align}}><PresenterRise at={d.followFrame} motion={scene.motion} height={36}>{c('creatorFollowLabel')}</PresenterRise></div>
      <div data-p1-follow-card="" data-p1-box="follow-card" data-top={cardTop} data-bottom={cardTop + cardHeight} data-follow-frame={d.followFrame} data-clicked-frame={d.clickedFrame} data-followed={clicked} data-p1-fit={measuredCard.h <= cardHeight} style={{position: 'absolute', left: pad, top: cardTop - panelTop, width: cardWidth, height: cardHeight, overflow: 'hidden', transform: `scale(${f >= d.clickedFrame && f < d.clickedFrame + 5 ? 0.97 : 1})`}}><PresenterRise at={d.followFrame} motion={scene.motion} height={cardHeight}><Sequence from={-100000} layout="none"><CardPart part={card} box={{x: 0, y: 0, width: cardWidth, height: cardHeight}} at={0} th={NAVY} dir={copy.dir} fps={30} scale={1} emphasis={false}/></Sequence></PresenterRise></div>
    </div>:null}
  </div>;
};
export const CreatorCta: React.FC<FamilyDesignProps> = props => <MagazineScope data={{lang: props.scene.family === 'creator-cta' && /\p{Script=Arabic}/u.test(props.scene.data.title) ? 'ar' : 'en'}}><Drawing {...props}/></MagazineScope>;
