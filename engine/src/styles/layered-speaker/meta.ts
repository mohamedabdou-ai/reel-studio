import {defineStyle} from '../types.ts';

// The one presenter family only this style may use. The scene schema exports the same list.
const LAYERED_FAMILIES = ['layered-speaker'] as const;

export default defineStyle({
  id: 'layered-speaker',
  label: {ar: 'حوالين المتكلم', en: 'Layered speaker'},
  description: {
    ar: 'كلمات كبيرة ورا راسك وعلى جنبيك، وعلامة بخط اليد على الكلمة المهمة',
    en: 'Big words behind and around the speaker, with a hand-drawn mark on the key word.',
  },
  useCases: ['opinion', 'story', 'explainer'],
  grammar: {typography: 'heavy-poster', card: 'offset-plate', annotation: 'yellow-marker', composition: 'poster-lockup', caption: 'boxless', motion: 'land'},
  legacy: false,
  brand: false,
  pip: {allowed: false, basis: 'inference', evidence: 'The speaker stays full frame: the words sit behind and around the picture, so a smaller window would cut the layering.'},
  defaults: {font: 'Cairo', captionsPresentation: 'minimal', clauseCaptions: false, staticCaptions: false},
  fit: {
    purpose: {opinion: 7, story: 7, explainer: 4},
    tone: {energetic: 3},
    semanticBeats: LAYERED_FAMILIES,
  },
  familiesOff: ['compose'],
  ownScenes: LAYERED_FAMILIES,
  since: '4.0.0',
});
