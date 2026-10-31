import {defineStyle} from '../types.ts';

export default defineStyle({
  id: 'liquid-glass',
  label: {ar: 'زجاج مضيء', en: 'Liquid glass'},
  description: {ar: 'كروت شفافة وعدسة توضح التفاصيل', en: 'Dark aurora, translucent panels and a magnifying lens for grouped ideas.'},
  useCases: ['explainer', 'tutorial', 'comparison'],
  grammar: {typography: 'product-sans', card: 'glass-panel', annotation: 'lens-rim', composition: 'aurora-lens', caption: 'pill', motion: 'land'},
  legacy: false,
  brand: false,
  pip: {allowed: false, basis: 'inference', evidence: 'Use the split presenter window; glass detail panels reserve the takeover canvas.'},
  defaults: {font: 'Grid Sans', captionsPresentation: 'pill', clauseCaptions: false, staticCaptions: false},
  fit: {purpose: {}, tone: {}, semanticBeats: ['token-lens', 'meter-receipt']},
  familiesOff: ['compose'],
  ownScenes: [],
  signatureTransition: 'lens-zoom',
  since: '2.0.0',
});
