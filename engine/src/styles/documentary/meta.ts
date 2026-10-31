import {defineStyle} from '../types.ts';
const DOCUMENTARY_FAMILIES = ['map-route', 'map-focus', 'cutout-card'] as const;
export default defineStyle({
  id: 'documentary', label: {ar: 'وثائقي', en: 'Documentary'},
  description: {ar: 'خرايط ورق ومسار أحمر وصور مقصوصة تحكي المكان والخطوة', en: 'Paper maps, a red route and cut-out photo cards explain places and journeys.'},
  useCases: ['explainer', 'case-study', 'story'],
  grammar: {typography: 'mixed-paper', card: 'route-paper', annotation: 'route-marker', composition: 'route-map', caption: 'paper-label', motion: 'quiet'},
  legacy: false, brand: false,
  pip: {allowed: false, basis: 'inference', evidence: 'Map labels and photo cards reserve the safe content area; a presenter window has not been verified on footage.'},
  defaults: {font: 'Tajawal', captionsPresentation: 'pill', clauseCaptions: true, staticCaptions: true},
  fit: {purpose: {explainer: 6, 'case-study': 6, story: 6}, tone: {editorial: 2, calm: 1}, semanticBeats: [...DOCUMENTARY_FAMILIES, 'route-stops']},
  familiesOff: ['compose'],
  ownScenes: DOCUMENTARY_FAMILIES, since: '4.0.0',
});
