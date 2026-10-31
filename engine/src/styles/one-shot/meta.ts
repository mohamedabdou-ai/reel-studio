import {defineStyle} from '../types.ts';

// The takeover family only this style may use. The scene schema exports the same list.
const ONE_SHOT_FAMILIES = ['one-shot'] as const;

export default defineStyle({
  id: 'one-shot',
  label: {ar: 'ونشوت', en: 'One shot'},
  description: {
    ar: 'شرح خطوات في لقطة واحدة بلا قص: كل مشهد يطلع من اللي قبله',
    en: 'A tutorial in one unbroken take: every step opens from the one before it.',
  },
  useCases: ['tutorial', 'explainer'],
  grammar: {typography: 'product-sans', card: 'rounded-ui', annotation: 'accent-rule', composition: 'flat-canvas', caption: 'boxless', motion: 'quiet'},
  legacy: false,
  brand: false,
  pip: {allowed: false, basis: 'inference', evidence: 'One-shot scenes are full-frame worlds; use presenter shots between scenes instead.'},
  defaults: {font: 'Noto Kufi Arabic', captionsPresentation: 'minimal', clauseCaptions: false, staticCaptions: false},
  fit: {
    purpose: {tutorial: 10, explainer: 8},
    tone: {energetic: 1},
    semanticBeats: ONE_SHOT_FAMILIES,
  },
  familiesOff: ['compose'],
  ownScenes: ONE_SHOT_FAMILIES,
  since: '3.0.0',
});
