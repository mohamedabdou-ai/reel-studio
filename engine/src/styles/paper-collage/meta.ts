import {defineStyle} from '../types.ts';

export default defineStyle({
  id: 'paper-collage',
  label: {ar: 'كولاج', en: 'Paper collage'},
  description: {ar: 'ورق وصور تشرح كل فكرة', en: 'Layered cards, tabs and restrained depth.'},
  useCases: ['story', 'comparison', 'case-study'],
  grammar: {typography: 'mixed-paper', card: 'taped-paper', annotation: 'tape-tabs', composition: 'collage-stack', caption: 'paper-label', motion: 'land'},
  legacy: false,
  brand: false,
  pip: {allowed: true, basis: 'inference', evidence: 'See the style guide and review this layout with the creator.'},
  defaults: {font: 'Reem Kufi', captionsPresentation: 'pill', clauseCaptions: false, staticCaptions: false},
  fit: {purpose: {'case-study': 9, comparison: 10, story: 18}, tone: {energetic: 4, calm: 2, editorial: 2}, semanticBeats: ['evidence-wipe', 'message-board']},
  familiesOff: ['compose'],
  ownScenes: [],
  signatureTransition: 'paper-swap',
  since: '1.8.6',
});
