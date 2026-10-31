import {MagazineComposePage} from '../system/compose';
import type {ComposeData} from '../../../creative-kit/compose/schema';
import {designSet} from '../../../style-kit/design-safety';
import React from 'react';
import {useVideoConfig} from 'remotion';
import {classic,semantic,kinetic} from '../../../creative-kit/compose/adapters';
import type {AdaptedData} from '../../../creative-kit/compose/adapters';
import type {FamilyDesignProps} from '../../family-designs';
import {Intro} from './intro';
import {Proof} from './proof';
import {Process} from './process';
import {Checklist} from './checklist';
import {Comparison} from './comparison';
import {Statement} from './statement';
import {CountSplit} from './count';
import {Comment} from './comment';
import {Follow} from './follow';
import {ChapterQuote} from './chapter-quote';
import {Verdict} from './verdict';
import {Figures} from './figures';
import {ChatThread} from './chat-thread';
import {ProofScreen} from './proof-screen';
import {KineticText} from './kinetic-text';
import {KineticHook} from './kinetic-hook';
import {CreatorCta} from './creator-cta';
import {MessageBoard} from './message-board';
import {ScreenFocus} from './screen-focus';
import {ScreenRecording} from './screen-recording';
import {ArabicType} from './arabic-type';
import {MotionConcept} from './motion-concept';

type Adapter=(scene:any,fps?:number)=>ComposeData|AdaptedData;
const page=(adapter:Adapter):React.FC<FamilyDesignProps>=>props=>{
  const {fps}=useVideoConfig();
  return React.createElement(MagazineComposePage,{...props,data:adapter(props.scene,fps)});
};
const takeoverOrPage=(Design:React.FC<FamilyDesignProps>,adapter:Adapter):React.FC<FamilyDesignProps>=>props=>{
  const {fps}=useVideoConfig();
  return props.scene.layout==='takeover'?React.createElement(Design,props):React.createElement(MagazineComposePage,{...props,data:adapter(props.scene,fps)});
};

export const MAGAZINE_INTERVIEW_DESIGNS:Partial<Record<string,React.FC<FamilyDesignProps>>>=designSet({
  'intro':takeoverOrPage(Intro,classic.introToCompose),
  'proof':takeoverOrPage(Proof,classic.proofToCompose),
  'process':takeoverOrPage(Process,classic.processToCompose),
  'checklist':Checklist,
  'comparison':takeoverOrPage(Comparison,classic.comparisonToCompose),
  'statement':Statement,
  'count':CountSplit,
  'comment':takeoverOrPage(Comment,classic.commentToCompose),
  'follow':takeoverOrPage(Follow,classic.followToCompose),
  'chapter-quote':takeoverOrPage(ChapterQuote,classic.chapterQuoteToCompose),
  'verdict':Verdict,
  'figures':Figures,
  'chat-thread':ChatThread,
  'proof-screen':ProofScreen,
  'compose':props=>React.createElement(MagazineComposePage,{...props,data:props.scene.data as ComposeData}),
  'token-lens':page(semantic.tokenLensToCompose),
  'meter-receipt':page(semantic.meterReceiptToCompose),
  'ticket-offer':page(semantic.ticketOfferToCompose),
  'comment-stack':page(semantic.commentStackToCompose),
  'route-stops':page(semantic.routeStopsToCompose),
  'evidence-wipe':page(semantic.evidenceWipeToCompose),
  'outcome':page(kinetic.outcomeToCompose),
  'image-compare':page(kinetic.imageCompareToCompose),
  'screens':page(kinetic.screensToCompose),
  'data-story':page(kinetic.dataStoryToCompose),
  'kinetic-text':KineticText,
  'kinetic-hook':KineticHook,
  'creator-cta':CreatorCta,
  'message-board':MessageBoard,
  'screen-focus':ScreenFocus,
  'screen-recording':ScreenRecording,
  'arabic-type':ArabicType,
  'motion-concept':MotionConcept,
},{system:'magazine-interview'});
