import {EDITION_STYLE_IDS} from '../creative-kit/styles.ts';

export const FONT_CHOICES = ['Cairo', 'Tajawal', 'Noto Naskh Arabic', 'Plex Display'] as const;
export type PreferredFont = (typeof FONT_CHOICES)[number];
export const CAPTION_GROUPING = ['compact', 'clauses', 'single'] as const;
export const CAPTION_PRESENTATION = ['pill', 'minimal', 'ink-strip'] as const;
export const WRITING_STYLES = ['short', 'educational', 'storytelling'] as const;
export type WritingStyle = (typeof WRITING_STYLES)[number];
export const PREFERENCE_VALUES = {
  style: EDITION_STYLE_IDS,
  captionsGrouping: CAPTION_GROUPING,
  captionsPresentation: CAPTION_PRESENTATION,
  font: FONT_CHOICES,
  writingStyle: WRITING_STYLES,
  palette: ['brand'] as const,
} as const;
export type Preferences = {[K in keyof typeof PREFERENCE_VALUES]:
  {mode: 'auto'; value: null} | {mode: 'fixed'; value: (typeof PREFERENCE_VALUES)[K][number]}};

export function defaultPreferences({legacy = false} = {}): Preferences {
  return {
    style: {mode: 'auto', value: null}, captionsGrouping: {mode: 'auto', value: null},
    captionsPresentation: {mode: 'auto', value: null}, font: {mode: 'auto', value: null},
    writingStyle: {mode: 'auto', value: null}, palette: legacy ? {mode: 'fixed', value: 'brand'} : {mode: 'auto', value: null},
  };
}

export const STYLE_LABELS: Record<string, {label: string; description: string}> = {
  'split-canvas': {label: 'شرح بصري', description: 'كروت فوقك وظهورك واضح تحتها'},
  'section-deck': {label: 'خطوات منظمة', description: 'عناوين واضحة وأفكار متقسمة'},
  'kinetic-paper': {label: 'ورق متحرك', description: 'حركة خفيفة وكلمات بارزة'},
  'calligraphic-receipts': {label: 'أدلة وأرقام', description: 'خط عربي وتفاصيل توضح الدليل'},
  'paper-collage': {label: 'كولاج', description: 'ورق وصور تشرح كل فكرة'},
  'judgment-board': {label: 'مقارنة ورأي', description: 'اختيارات ومقارنات على لوحة'},
  'stepped-editorial': {label: 'تحريري', description: 'تكوينات مرتبة وحضور قوي للكلام'},
  'liquid-glass': {label: 'زجاج مضيء', description: 'كروت شفافة وعدسة توضح التفاصيل'},
  'campaign-tickets': {label: 'تذاكر وحملات', description: 'تذاكر دهبية وكروت للأسئلة والتعليقات'},
  'magazine-interview': {label: 'حوار مجلة', description: 'فصول واقتباسات واسم المتحدث بوضوح'},
  'scrapbook-route': {label: 'رحلة على ورق', description: 'خريطة ومحطات وصور متثبتة على الورق'},
};
export const WRITING_GUIDES: Record<WritingStyle, string> = {
  short: 'اكتب وصف منشور مختصر: جملة افتتاحية واضحة، فايدة واحدة، وطلب واحد مناسب. من غير حشو.',
  educational: 'اكتب وصف يشرح الفكرة ببساطة: افتتاحية، نقط عملية قصيرة، وطلب مناسب. ما تضيفش معلومة مش موجودة في الفيديو.',
  storytelling: 'اكتب وصف بحكاية قصيرة: موقف أو مشكلة، اللي اتغيّر، والخلاصة. حافظ على الحقائق اللي في الفيديو.',
};


export function resolvePreferences(preferences: Preferences, {purpose, tone, style}: {purpose: string; tone: string; style: string}) {
  const fixed = <K extends keyof Preferences>(key: K) => preferences[key].mode === 'fixed' ? preferences[key].value : null;
  const clauses = ['explainer', 'tutorial'].includes(purpose) && tone !== 'energetic';
  const font: PreferredFont = style === 'calligraphic-receipts' ? 'Noto Naskh Arabic'
    : ['paper-collage','scrapbook-route'].includes(style) ? 'Tajawal' : ['kinetic-paper', 'judgment-board', 'stepped-editorial'].includes(style) ? 'Plex Display' : 'Cairo';
  const writing: WritingStyle = purpose === 'story' ? 'storytelling' : ['explainer', 'tutorial'].includes(purpose) ? 'educational' : 'short';
  return {
    captionsGrouping: fixed('captionsGrouping') ?? (clauses ? 'clauses' : 'compact'),
    captionsPresentation: fixed('captionsPresentation') ?? (style === 'magazine-interview' ? 'minimal' : ['stepped-editorial','judgment-board','campaign-tickets'].includes(style) ? 'ink-strip' : 'pill'),
    fontFamily: fixed('font') ?? font, writingStyle: fixed('writingStyle') ?? writing,
  };
}
