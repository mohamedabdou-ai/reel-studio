import {defineStyle} from '../types.ts';

export default defineStyle({
  id: 'calligraphic-receipts',
  label: {ar: 'أدلة وأرقام', en: 'Calligraphic receipts'},
  description: {ar: 'خط عربي وتفاصيل توضح الدليل', en: 'Naskh claims paired with evidence receipts.'},
  useCases: ['case-study', 'story', 'opinion'],
  grammar: {typography: 'naskh-receipt', card: 'receipt-sheet', annotation: 'brush-rule', composition: 'claim-receipt', caption: 'boxless', motion: 'quiet'},
  legacy: false,
  brand: false,
  pip: {allowed: true, basis: 'inference', evidence: 'See the style guide and review this layout with the creator.'},
  defaults: {font: 'Aref Ruqaa', captionsPresentation: 'pill', clauseCaptions: false, staticCaptions: false},
  fit: {purpose: {'case-study': 18, tutorial: 8, opinion: 8, story: 10}, tone: {calm: 3, editorial: 4}, semanticBeats: ['meter-receipt', 'claim-proof']},
  familiesOff: ['compose'],
  ownScenes: ['claim-proof'],
  signatureTransition: 'paper-pull',
  since: '1.8.6',
});
