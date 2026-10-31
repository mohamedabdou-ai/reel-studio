import {defineStyle} from '../types.ts';

export default defineStyle({
  id: 'section-deck',
  label: {ar: 'خطوات منظمة', en: 'Section deck'},
  description: {ar: 'عناوين واضحة وأفكار متقسمة', en: 'Held sections with semantic cards and compact captions.'},
  useCases: ['explainer', 'tutorial', 'comparison'],
  grammar: {typography: 'product-sans', card: 'rounded-ui', annotation: 'terminal-period', composition: 'section-stack', caption: 'pill', motion: 'stagger'},
  legacy: true,
  brand: true,
  pip: {allowed: false, basis: 'observed', evidence: 'See the style guide and review this layout with the creator.'},
  defaults: {font: 'Cairo', captionsPresentation: 'pill', clauseCaptions: true, staticCaptions: true},
  fit: {purpose: {explainer: 16, 'case-study': 12, tutorial: 16, comparison: 12}, tone: {calm: 4}, semanticBeats: []},
  familiesOff: ['compose'],
  ownScenes: [],
  mix: {slug: 'section-deck-split-explainer', lraMax: 2, source: 'instructions/STYLES.md#section-deck', section: 'Review the style audio range and preserve the recorded ending.'},
  signatureTransition: 'blinds',
  since: '1.8.6',
});
