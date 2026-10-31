import {defineStyle} from '../types.ts';

// The five takeover families only this style may use (three for content, two for the ending). The scene schema exports the same list.
const GLIDE_FAMILIES = ['glide-chapter', 'glide-card', 'glide-lines', 'glide-comment', 'glide-follow'] as const;

export default defineStyle({
  id: 'grid-glide',
  label: {ar: 'كلمات وكروت', en: 'Grid glide'},
  description: {
    ar: 'كلمات تنزلق إلى مكانها وكروت ثابتة تعرض لقطات حقيقية',
    en: 'Words glide into a finished layout beside still cards of real screens.',
  },
  useCases: ['explainer', 'tutorial', 'comparison'],
  grammar: {typography: 'product-sans', card: 'bevel-slab', annotation: 'inverted-box', composition: 'flat-canvas', caption: 'boxless', motion: 'quiet'},
  legacy: false,
  brand: false,
  pip: {allowed: false, basis: 'inference', evidence: 'Grid Glide scenes are full-frame; use presenter shots between scenes instead.'},
  defaults: {font: 'Grid Sans', captionsPresentation: 'minimal', clauseCaptions: false, staticCaptions: false},
  fit: {
    purpose: {explainer: 11, tutorial: 11, comparison: 8},
    tone: {calm: 2},
    semanticBeats: GLIDE_FAMILIES,
  },
  familiesOff: ['compose'],
  ownScenes: GLIDE_FAMILIES,
  since: '2.5.0',
});
