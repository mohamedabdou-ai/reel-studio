import {defineStyle} from '../types.ts';

export default defineStyle({
  id: 'kinetic-paper',
  label: {ar: 'ورق متحرك', en: 'Kinetic paper'},
  description: {ar: 'حركة خفيفة وكلمات بارزة', en: 'Heavy poster type, ink frames and deliberate reveals.'},
  useCases: ['explainer', 'comparison', 'tutorial'],
  grammar: {typography: 'heavy-poster', card: 'ink-frame', annotation: 'signal-strip', composition: 'poster-lockup', caption: 'ink-strip', motion: 'stagger'},
  legacy: false,
  brand: false,
  pip: {allowed: true, basis: 'inference', evidence: 'See the style guide and review this layout with the creator.'},
  defaults: {font: 'Lalezar', captionsPresentation: 'pill', clauseCaptions: false, staticCaptions: false},
  fit: {purpose: {explainer: 12, tutorial: 12, opinion: 10, story: 13}, tone: {energetic: 6}, semanticBeats: ['kinetic-text', 'ticket-offer', 'comment-stack']},
  familiesOff: ['compose'],
  ownScenes: [],
  signatureTransition: 'ink-slab',
  since: '1.8.6',
});
