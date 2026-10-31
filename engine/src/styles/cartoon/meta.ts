import {defineStyle} from '../types.ts';

// The two takeover families only this style may use. The scene schema exports the same list.
const CARTOON_FAMILIES = ['cartoon', 'cartoon-ending'] as const;

export default defineStyle({
  id: 'cartoon',
  label: {ar: 'كارتون', en: 'Cartoon'},
  description: {
    ar: 'شخصية مرسومة تشرح بدلًا منك وتشاور على الكروت، وعنوان يتكتب كلمة بكلمة مع صوتك',
    en: 'An illustrated narrator explains for you, points at the cards, and a headline builds word by word with your voice.',
  },
  useCases: ['explainer', 'tutorial', 'comparison'],
  grammar: {typography: 'product-sans', card: 'rounded-ui', annotation: 'accent-rule', composition: 'flat-canvas', caption: 'boxless', motion: 'quiet'},
  legacy: false,
  brand: false,
  pip: {allowed: false, basis: 'inference', evidence: 'The creator is never on screen in a cartoon video; the narrator stands in for them.'},
  defaults: {font: 'Plex Display', captionsPresentation: 'minimal', clauseCaptions: false, staticCaptions: false},
  fit: {
    purpose: {explainer: 7, tutorial: 6, comparison: 5},
    tone: {energetic: 2},
    semanticBeats: CARTOON_FAMILIES,
  },
  familiesOff: ['compose'],
  ownScenes: CARTOON_FAMILIES,
  since: '3.0.0',
});
