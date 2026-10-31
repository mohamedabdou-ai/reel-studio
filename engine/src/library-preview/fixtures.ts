import {magazineTemplateData} from '../styles/magazine-interview/scenes/templates.ts';
import {receiptsTemplateData} from '../styles/calligraphic-receipts/scenes/templates.ts';
import {ARABIC_TYPE_MOVES,ARABIC_TYPE_LABELS,arabicTypeSceneSchema} from '../arabic-type/schema.ts';
import {validateArabicTypeTiming} from '../arabic-type/timing.ts';
import {figuresSceneSchema} from '../creative-kit/figures/schema.ts';
import {validateFiguresTiming} from '../creative-kit/figures/timing.ts';
import {chatThreadSceneSchema} from '../creative-kit/chat-thread/schema.ts';
import {validateChatThreadTiming} from '../creative-kit/chat-thread/timing.ts';
import {CATALOG, catalogDemo, catalogSchema} from '../motion-concepts/catalog.ts';
import {STYLE_METAS, familySupported, ownSceneStyle, type StyleId} from '../styles/registry.ts';
import {introSchema, proofSchema, processSchema, comparisonSchema, commentSchema, followSchema} from '../creative-kit/schema.ts';
import {kineticSceneSchema, validateKineticTiming} from '../creative-kit/kinetic/schema.ts';
import {semanticSceneSchema, validateSemanticTiming} from '../creative-kit/semantic/schema.ts';
import {proofScreenSceneSchema} from '../creative-kit/proof-screen/schema.ts';
import {validateProofScreenTiming} from '../creative-kit/proof-screen/timing.ts';
import {composeSceneSchema} from '../creative-kit/compose/schema.ts';
import {validateComposeTiming} from '../creative-kit/compose/timing.ts';
import {librarySceneSchema, validateLibraryTiming} from '../motion-library/schema.ts';
import {styleSceneSchema, validateStyleSceneTiming, validateStyleSceneWords} from '../styles/scenes.ts';
import {oneShotMinFrames} from '../styles/one-shot/scenes/math.ts';
import {DEFAULT_CHARACTER} from '../styles/cartoon/scenes/character.ts';
import {documentaryTemplateData} from '../styles/documentary/scenes/templates.ts';
import {screenRecordingSceneSchema, screenRecordingIssues} from '../screen-recording/schema.ts';
import type {MappedWord} from '../prepared-edit/timeline.ts';
import type {PreviewDefinition} from './types.ts';
import {CAPTION_SKINS,CAPTION_PRESENTATION} from '../core/preference-options.ts';
import {BACKDROP_LABEL} from '../looks/index.ts';

const SAMPLE = 'ILLUSTRATION · SAMPLE DATA. No real result, testimonial, identity or recorded speech is claimed.';
const TIMING = 'Renderer-only authored timing demonstration. These tokens are explanatory copy, not a fabricated recorded transcript or a production-manifest verification.';
const PATH = 'library-preview/';
const A = `${PATH}diagram-a.svg`, B = `${PATH}diagram-b.svg`, SCREEN = `${PATH}screen.svg`;
export const PREVIEW_SCREEN_VIDEO = `${PATH}synthetic-screen.mp4`;
export const PREVIEW_SCREEN_SIZE = {width: 1920, height: 1080} as const;
const DURATION = 180;

/** Explanatory copy timed for the renderer only, never compiled as recorded words. */
export function previewAuthoredWords(latin = false): MappedWord[] {
  return ['فكرة', latin ? 'SAMPLE' : 'واحدة', 'واضحة'].map((text, index) => ({text, sourceIndex: index, segmentIndex: 0,
    fromFrame: 24 + index * 24, toFrame: 155, startMs: (24 + index * 24) / 30 * 1000,
    endMs: 155 / 30 * 1000, confidence: null}));
}

const svg = (variant: 'a' | 'b' | 'screen') => `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#111827"/><rect x="64" y="64" width="1792" height="952" rx="30" fill="#F7F3E8"/><rect x="64" y="64" width="1792" height="100" rx="30" fill="#223D4A"/><text x="120" y="130" font-family="sans-serif" font-size="30" fill="#FFFFFF">ILLUSTRATION / ${variant === 'screen' ? 'SYNTHETIC WORKSPACE' : 'SAMPLE DIAGRAM'}</text><rect x="120" y="220" width="300" height="680" rx="20" fill="#DDD7C7"/><rect x="160" y="270" width="210" height="22" rx="11" fill="#223D4A"/><rect x="160" y="330" width="160" height="18" rx="9" fill="#879593"/><rect x="160" y="385" width="190" height="18" rx="9" fill="#879593"/><rect x="490" y="220" width="1290" height="180" rx="20" fill="#BCE8D5"/><text x="540" y="300" font-family="sans-serif" font-size="44" fill="#173D30">${variant === 'b' ? 'ONE ORGANIZED VIEW' : 'A SIMPLE VISUAL EXAMPLE'}</text><text x="540" y="355" font-family="sans-serif" font-size="28" fill="#173D30">Authored illustration. No customer data or performance claim.</text>${[0,1,2].map((i) => `<rect x="${490 + i * 440}" y="460" width="410" height="400" rx="20" fill="${variant === 'a' && i % 2 ? '#E6C4AE' : '#E5DED0'}"/><circle cx="${695 + i * 440}" cy="580" r="48" fill="#223D4A"/><rect x="${535 + i * 440}" y="690" width="320" height="20" rx="10" fill="#879593"/><rect x="${535 + i * 440}" y="745" width="220" height="16" rx="8" fill="#879593"/>`).join('')}<text x="490" y="955" font-family="sans-serif" font-size="27" fill="#536160">SAMPLE A / B / C — visual fixtures only</text></svg>`;

/** Original assets. Write these exact bytes to an isolated public folder. */
export function previewAssetFiles() {
  return [
    {path: A, text: svg('a'), width: 1920, height: 1080, sha256: '4db2569989a5c4529615ffaa7138d4c45b9b4392a794b657d0a825cf099bd512'},
    {path: B, text: svg('b'), width: 1920, height: 1080, sha256: 'c3b7e67a29ab25b4bfaca38d23de7303ab965925628d078205256e35c71fc05a'},
    {path: SCREEN, text: svg('screen'), width: 1920, height: 1080, sha256: 'e3a229370487109be3aab3a43b7b631e86f9391f4208f320064e42874329b996'},
  ];
}
export const previewSvgAssets: Record<string, string> = Object.fromEntries(previewAssetFiles().map(asset => [asset.path, asset.text]));

const heading = {kicker: 'مثال توضيحي', title: 'فكرة واحدة وخطوات واضحة'};
const creativeData: Record<string, unknown> = {
  intro: {...heading, subtitle: 'من فكرة بسيطة لصورة مفهومة', caption: 'بيانات توضيحية لتجربة العرض'},
  proof: {label: 'قيمة للتوضيح فقط', value: 42, suffix: '', source: 'ILLUSTRATIVE VALUE · NO PERFORMANCE CLAIM', caption: 'الرقم ده مثال توضيحي'},
  process: {title: 'الفكرة بتظهر خطوة بخطوة', steps: [{title: 'اختار الفكرة', detail: 'حدد الرسالة الأساسية'},{title: 'رتب الخطوات', detail: 'كل خطوة توصل للي بعدها'},{title: 'راجع الصورة', detail: 'خلي النتيجة واضحة'}], caption: 'ده شرح توضيحي لطريقة العرض'},
  comparison: {title: 'نفس الفكرة بترتيب مختلف', beforeTitle: 'قبل الترتيب', beforeDetail: 'أجزاء منفصلة', afterTitle: 'بعد الترتيب', afterDetail: 'صورة واحدة واضحة', caption: 'المقارنة دي توضيحية'},
  comment: {keyword: 'مثال', promise: 'طلب توضيحي داخل المعاينة', caption: 'ده مثال لشكل طلب التعليق'},
  follow: {handle: '@sample', message: 'حساب توضيحي للمعاينة', caption: 'الاسم ده توضيحي'},
};
const labels: Record<string, string> = {
  verdict:'حكم بأرقام المبدع','claim-proof':'ادعاء وإيصال',
  'arabic-type': 'حركات الكتابة العربي', figures: 'أرقام ورسوم', 'chat-thread': 'شات وإشعارات',
  'compose':'صفحة مركّبة من قطع الستايل',
  'proof-screen':'صفحة بتفصيلة واضحة',
  intro: 'افتتاحية', proof: 'عرض رقم موثق', process: 'خطوات', comparison: 'مقارنة', comment: 'طلب تعليق', follow: 'كارت متابعة',
  'kinetic-hook': 'عنوان بيتبدل', 'image-compare': 'مقارنة صور', checklist: 'قائمة مراجعة', count: 'عداد', screens: 'عرض شاشات', statement: 'جملة أساسية', outcome: 'نتيجة مختصرة', 'creator-cta': 'دعوة للتفاعل',
  'message-board': 'تجميع الأفكار', 'kinetic-text': 'كلمات متحركة', 'evidence-wipe': 'كشف المقارنة', 'motion-concept': 'حاوية مفهوم متحرك', 'token-lens': 'تركيز على عنصر', 'meter-receipt': 'مقارنة بمقياس', 'ticket-offer': 'تذكرة عرض', 'comment-stack': 'كروت تعليقات', 'chapter-quote': 'اقتباس فصل', 'route-stops': 'محطات رحلة',
  'screen-focus': 'تركيز على شاشة', 'data-story': 'حكاية بيانات', 'screen-recording': 'حركة على تسجيل شاشة', 'project-scene': 'مشهد خاص بالمشروع',
  'glide-chapter': 'عنوان فصل منزلق', 'glide-card': 'كارت ميديا منزلق', 'glide-lines': 'سطور منزلقة', 'glide-comment': 'تعليق منزلق', 'glide-follow': 'متابعة منزلقة',
  'one-shot': 'شرح بلقطة واحدة', 'layered-speaker': 'كلمات حوالين المتكلم',
  cartoon: 'شخصية كارتون تشرح', 'cartoon-ending': 'نهاية كارتون',
  'map-route': 'مسار على الخريطة', 'map-focus': 'تركيز على مكان', 'cutout-card': 'صورة على ورق مقصوص',
  'source-focus': 'تركيز على المصدر', 'metric-count': 'كشف قيمة', 'data-bars': 'مقارنة أعمدة',
  'button-to-window': 'من زرار لنافذة', 'prompt-to-results': 'من أمر لنتائج', 'brief-to-workspace': 'من بريف لمساحة عمل', 'department-tabs': 'تبويبات الأقسام', 'data-morph': 'من أعمدة لخط', 'kpi-zoom': 'تكبير مؤشر', 'tool-stack-spread': 'فرد كروت الأدوات', 'magnetic-dock': 'شريط أدوات متفاعل', 'keyword-reveal': 'كشف كلمة', 'headline-to-system': 'من فكرة لنظام محتوى', 'panel-reveal': 'كشف بلوحات', 'system-layers': 'طبقات نظام', 'glass-lens': 'عدسة تركيز', 'automation-flow': 'مسار أتمتة', 'chaos-to-brand': 'من فوضى لشعار',
  'conditional-branching': 'الشرط بيحدد المسار', 'identity-filtering': 'تصفية بنفس هوية الكروت',
};
const english = (id: string) => id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
const baseScene = (family: string, data: unknown, layout = 'takeover', durationInFrames = DURATION) => ({id: `sample-${family}`, family, fromFrame: 0, durationInFrames, layout, motion: 'stagger', data});
const line = (words: string[], role = 'lead', at = 6) => ({words, role, at, cadence: 7});
const gridMotion = {enter: {kind: 'slide', from: 'right', distance: 400}, exit: {kind: 'push', dir: 'left'}, watermark: 'ILLUSTRATION'};
const asset = () => ({src: SCREEN, sha256: previewAssetFiles()[2].sha256, width: 1920, height: 1080});
function dataBars() { return {kicker: 'قيم توضيحية', title: 'نفس الوحدة على مقياس واحد', sourceNote: 'ILLUSTRATION · VALUES ARE NOT A REAL RESULT', display: 'bars', suffix: '', unit: 'وحدة', animateFrames: 35, items: [{label: 'أ', value: 25, atFrame: 10},{label: 'ب', value: 60, atFrame: 40},{label: 'ج', value: 42, atFrame: 70}]}; }

// One take through three steps. Illustrative copy only: no figure, result or name is claimed.
const oneShotSample = {
  brand: 'أداة توضيحية',
  intro: {top: 'نتيجة جاهزة', bottom: 'في ٣ خطوات', sub: 'مثال توضيحي لشكل الشرح', start: 'يلا نبدأ'},
  steps: [
    {kind: 'drop', title: {top: 'حطّ الملف', bottom: 'في المكان ده'}, item: 'sample.mp4', target: 'Inbox'},
    {kind: 'field', title: {top: 'اكتب الطلب', bottom: 'بكلام بسيط'}, text: 'حوّل الملف لنتيجة', placeholder: 'اكتب رسالتك…'},
    {kind: 'work', title: {top: 'استنى النتيجة', bottom: 'جاهزة للنشر'}, jobs: ['الخطوة الأولى', 'الخطوة التانية', 'الخطوة التالتة']},
  ],
  result: {words: ['فكرة', 'واحدة', 'بتتحول', 'لنتيجة', 'واضحة']},
  closing: {top: '٣ خطوات بس', sub: 'مثال توضيحي للشكل', platforms: ['Instagram', 'TikTok', 'Shorts']},
};
const ONE_SHOT_FRAMES = oneShotMinFrames(oneShotSample as never, 30);

// Cartoon scenes time everything on recorded words, so their fixtures carry neutral synthetic words (one every half second).
const CARTOON_TEXT = ['فكرة', 'واحدة', 'بسيطة', 'وواضحة', 'كل', 'جملة', 'لها', 'صورة', 'والشخصية', 'تشير', 'إلى', 'الكارت', 'وهنا', 'أدوات', 'توضيحية', 'كثيرة', 'في', 'النهاية'];
const cartoonWords = (count: number, shift = 0) => Array.from({length: count}, (_, i) => ({text: CARTOON_TEXT[i % CARTOON_TEXT.length], sourceIndex: i, fromFrame: shift + i * 15, toFrame: shift + i * 15 + 9}));
const CARTOON_FRAMES = 270, CARTOON_ENDING_FRAMES = 150;
/** Neutral sample words around an abstract speaker; the preview draws a stand-in for the matte, so no person or footage is claimed. */
const LAYERED_FRAMES = 120;
const layeredSample = {words: [
  {place: 'behind', text: 'كبير', atFrame: 8},
  {place: 'right', text: 'فكرة واحدة', atFrame: 36, mark: {kind: 'circle', atFrame: 48}},
  {place: 'left', text: 'واضحة', atFrame: 56},
]};
const cartoonSample = {
  character: DEFAULT_CHARACTER,
  acts: [{theme: 'light', sentence: 0, tag: '// 01 — مثال'}, {theme: 'dark', sentence: 2, tag: '// 02 — توضيح'}],
  sentences: [{from: 0, to: 3}, {from: 4, to: 7}, {from: 8, to: 11}, {from: 12, to: 15}, {from: 16, to: 17}], accents: [1], counter: {kind: 'sections'}, brackets: true,
  cards: [
    {id: 'term', kind: 'term', from: {word: 0}, to: 'flip', data: {tag: '// مثال', term: 'فكرة', glyphs: ['circle', 'triangle']}},
    {id: 'tools', kind: 'fan', from: {word: 8}, to: {word: 17}, data: {items: [{name: 'بريد', icon: 'mail'}, {name: 'ملفات', icon: 'folder'}, {name: 'تقويم', icon: 'calendar'}], caption: 'أدوات توضيحية'}},
  ],
};
const cartoonEndingSample = {
  character: DEFAULT_CHARACTER, fromTheme: 'dark', theme: 'light', tag: '// 03 — متابعة', entrance: {x: 540, scale: 0.86},
  sentences: [{from: 0, to: 3}, {from: 4, to: 7}, {from: 8, to: 9}], accents: [],
  follow: {handle: '@sample', message: 'حساب توضيحي للمعاينة', at: {word: 0}, tapAt: {word: 5, dt: 0.04}},
};

function sceneFixtures(): Array<{family: string; kind: string; data: unknown; layout?: string; duration?: number; words?: unknown[]}> {
  return [
    {family:'arabic-type',kind:'arabic-type',duration:240,data:{text:'الحقيقة',move:'decrypt'}},
    {family:'compose',kind:'compose',data:{arrangement:'hero',parts:[{id:'kicker',kind:'kicker',at:{frame:0},text:'بالأرقام'},{id:'value',kind:'number',at:{frame:12},value:40,suffix:'%',label:'قيمة توضيحية',emphasis:true},{id:'source',kind:'line',at:{frame:40},text:'رقم توضيحي للعرض فقط'}]}},
    {family:'proof-screen',kind:'proof-screen',data:{page:'web',title:'صفحة توضيحية',url:'موقعك.com',blocks:[{kind:'heading',text:'فكرة واحدة في صفحة'},{kind:'text',text:'شرح مكتوب للتوضيح فقط'},{kind:'row',text:'تفصيلة تختارها من البريف'},{kind:'button',text:'راجع التفاصيل'}],focus:2,path:'focus'}},
    ...Object.entries(creativeData).map(([family, data]) => ({family, kind: 'creative', data})),
    {family: 'kinetic-hook', kind: 'kinetic', layout: 'presenter', data: {label: 'مثال عنوان', firstTitle: 'فكرة', secondTitle: 'صورة', swapFrame: 45, stamp: 'توضيح بصري', stampFrame: 80}},
    {family: 'image-compare', kind: 'kinetic', data: {...heading, images: [{src: A, label: 'توضيح أ'}, {src: B, label: 'توضيح ب'}], stamp: 'نفس الفكرة'}},
    {family: 'checklist', kind: 'kinetic', data: {...heading, variant: 'blueprint', items: [{label: 'حدد الفكرة', detail: 'خطوة أولى', atFrame: 15},{label: 'رتب العناصر', detail: 'خطوة تانية', atFrame: 45},{label: 'راجع النتيجة', detail: 'خطوة أخيرة', atFrame: 75}]}},
    {family: 'figures', kind: 'figures', data: {variant:'counter',value:42,label:'قيمة توضيحية',unit:'وحدة'}},
    {family: 'chat-thread', kind: 'chat-thread', data: {variant:'bubbles',title:'محادثة توضيحية',messages:[{from:'them',text:'نبدأ بفكرة واحدة؟',at:20},{from:'me',text:'نرتبها في خطوتين',at:65},{from:'them',text:'ونراجع الصورة',at:110}]}},
    {family: 'count', kind: 'kinetic', layout: 'split', data: {...heading, value: 42, suffix: '×', unit: 'قيمة توضيحية', rollFrame: 24, rollDuration: 40, unitFrame: 70, badge: 'مثال', badgeFrame: 90}},
    {family: 'screens', kind: 'kinetic', data: {kicker: 'شاشات توضيحية', steps: [{atFrame: 0, title: 'الصورة العامة', src: SCREEN, kind: 'image', fit: 'contain', trimBeforeFrame: 0},{atFrame: 75, title: 'نفس الفكرة بشكل مختلف', src: B, kind: 'image', fit: 'contain', trimBeforeFrame: 0}]}},
    {family: 'statement', kind: 'kinetic', layout: 'presenter', data: {...heading}},
    {family: 'outcome', kind: 'kinetic', layout: 'split', data: {...heading, items: ['فكرة', 'خطوات', 'صورة'], footer: 'نتيجة توضيحية للعرض'}},
    {family: 'creator-cta', kind: 'kinetic', layout: 'presenter', data: {title: 'مثال لدعوة تفاعل', keyword: 'مثال', prompt: 'نص توضيحي: {keyword}', handle: '@sample', followFrame: 65, clickedFrame: 100}},
    {family: 'message-board', kind: 'semantic', data: {initialTitle: 'أفكار منفصلة', boardTitle: 'ترتيب في مكان واحد', focusTitle: 'ركز على فكرة', closingTitle: 'الصورة بقت واضحة', items: [{id: 'one', label: 'الفكرة الأولى', detail: 'جزء من التوضيح'},{id: 'two', label: 'الفكرة التانية', detail: 'جزء من التوضيح'},{id: 'three', label: 'الفكرة التالتة', detail: 'جزء من التوضيح'}], focusIndex: 1, gatherFrame: 30, gatherDurationFrames: 24, focusFrame: 90, focusDurationFrames: 24, closingFrame: 144}},
    {family: 'kinetic-text', kind: 'semantic', data: {...heading, sourceIndices: [0, 1, 2], lang: 'ar', enter: 'rise', emphasis: [{sourceIndex: 1, kind: 'accent'}]}},
    {family: 'evidence-wipe', kind: 'semantic', data: {...heading, before: {src: A, width: 1920, height: 1080, label: 'توضيح أ'}, after: {src: B, width: 1920, height: 1080, label: 'توضيح ب'}, revealFrame: 45, revealDurationFrames: 36, dir: 'rtl', footer: 'رسومات توضيحية وليست إثبات نتيجة'}},
    {family: 'motion-concept', kind: 'semantic', duration: 240, data: {concept: 'panel-reveal', config: catalogDemo('panel-reveal')}},
    {family: 'token-lens', kind: 'semantic', data: {...heading, groups: [{label: 'الفكرة', tokens: ['حدد', 'الرسالة'], atFrame: 10},{label: 'الصورة', tokens: ['رتب', 'العناصر'], atFrame: 40}], lens: {groupIndex: 1, tokenIndex: 0, atFrame: 75}, footer: 'تكبير جزء من التوضيح'}},
    {family: 'meter-receipt', kind: 'semantic', data: {...heading, rows: [{label: 'توضيح أ', value: 25, atFrame: 12},{label: 'توضيح ب', value: 60, atFrame: 50}], maximum: 100, unit: 'وحدة توضيحية', source: 'ILLUSTRATIVE VALUES · NO REAL MEASUREMENT'}},
    {family: 'ticket-offer', kind: 'semantic', data: {...heading, ticket: {label: 'مثال', value: 'جلسة توضيحية', detail: 'ده نموذج عرض فقط', atFrame: 30}, footer: 'مش عرض حقيقي أو دعوة للحجز'}},
    {family: 'comment-stack', kind: 'semantic', data: {...heading, comments: [{author: 'شخصية توضيحية أ', text: 'مثال لسؤال داخل كارت', atFrame: 15},{author: 'شخصية توضيحية ب', text: 'مثال تاني لطريقة العرض', atFrame: 55}], keyword: 'مثال', prompt: 'طلب تفاعل توضيحي'}},
    {family: 'chapter-quote', kind: 'semantic', data: {chapter: '01', title: 'مساحة لفكرة أساسية', quote: 'عبارة مكتوبة لتوضيح شكل الاقتباس فقط.', speaker: 'مثال تحريري', role: 'مش اقتباس من شخص حقيقي', quoteFrame: 30}},
    {family: 'route-stops', kind: 'semantic', data: {...heading, stops: [{label: 'ابدأ', detail: 'حدد الفكرة', atFrame: 10},{label: 'رتب', detail: 'وصل الأجزاء', atFrame: 45},{label: 'راجع', detail: 'شوف النتيجة', atFrame: 80}], footer: 'محطات توضيحية'}},
    {family: 'screen-focus', kind: 'library', data: {kicker: 'شاشة مرسومة للتوضيح', steps: [{atFrame: 0, focusFrame: 45, settleFrames: 30, title: 'من الصورة العامة لتفصيلة', label: 'رسم توضيحي', src: SCREEN, sourceWidth: 1920, sourceHeight: 1080, focus: {x: .25, y: .18, width: .68, height: .64}, zoom: 1.3}]}},
    {family: 'data-story', kind: 'library', data: dataBars()},
    {family: 'screen-recording', kind: 'screen-recording', data: {keys: [{atFrame: 0, focus: {x: 0, y: 0, width: 1, height: 1}, zoom: 1, moveFrames: 0},{atFrame: 45, focus: {x: .25, y: .18, width: .68, height: .64}, zoom: 1.3, moveFrames: 30}], clicks: [{atFrame: 100, x: .6, y: .5}], callouts: []}},
    {family: 'glide-chapter', kind: 'style-scene', data: {...gridMotion, ordinal: 'الفصل الأول', heroAt: 12, pill: {label: 'مثال توضيحي'}, pillAt: 55}},
    {family: 'glide-card', kind: 'style-scene', data: {...gridMotion, lines: [line(['فكرة', 'واحدة'], 'hero')], media: {clips: [{...asset(), at: 0, kind: 'image'}]}, bullets: [{text: 'خطوة توضيحية', at: 70}]}},
    {family: 'glide-lines', kind: 'style-scene', data: {...gridMotion, lines: [line(['فكرة', 'واحدة']), line(['صورة', 'واضحة'], 'hero', 40)], box: {text: 'نص توضيحي', at: 80}, grid: true}},
    {family: 'glide-comment', kind: 'style-scene', data: {...gridMotion, lines: [line(['كلمة', 'للتوضيح'])], keyword: 'مثال', heroAt: 50, box: {text: 'طلب تعليق توضيحي', at: 90}}},
    {family: 'glide-follow', kind: 'style-scene', data: {...gridMotion, lines: [line(['حساب', 'توضيحي'])], handle: '@sample', heroAt: 50, pill: {label: 'FOLLOW'}, pillAt: 90}},
    {family: 'one-shot', kind: 'style-scene', duration: ONE_SHOT_FRAMES, data: oneShotSample},
    {family: 'cartoon', kind: 'style-scene', duration: CARTOON_FRAMES, data: cartoonSample, words: cartoonWords(18)},
    {family: 'cartoon-ending', kind: 'style-scene', duration: CARTOON_ENDING_FRAMES, data: cartoonEndingSample, words: cartoonWords(10, 9)},
    {family:'verdict',kind:'style-scene',duration:150,data:magazineTemplateData.verdict},
    {family:'claim-proof',kind:'style-scene',duration:150,data:receiptsTemplateData['claim-proof']},
    ...Object.entries(documentaryTemplateData).map(([family,data]) => ({family, kind: 'style-scene', data})),
    {family: 'layered-speaker', kind: 'style-scene', layout: 'presenter', duration: LAYERED_FRAMES, data: layeredSample},
  ];
}

const EFFECTS: Record<string, string[]> = {
  backdrop: ['girih', 'paper', 'sunburst'],
  camera: ['dolly', 'handheld', 'orbit', 'punch-step', 'slow-push', 'snap-in', 'snap-zoom'], 'caption-emphasis': ['accent', 'pop', 'underline', 'stretch'],
  'caption-skin': [...CAPTION_SKINS], 'caption-presentation': [...CAPTION_PRESENTATION],
  'graphics-transition': ['clip-wipe', 'hue-crossfade', 'light-scan', 'whip-pan', 'iris', 'keyhole', 'blinds', 'dot-zoom', 'zoom-through','ink-slab','lens-zoom','paper-pull'],
  'kinetic-emphasis': ['accent', 'latin', 'pop', 'underline', 'weight', 'stretch'],
  'layout-transition': ['curtain', 'window-morph'], look: ['blueprint', 'film', 'paper', 'riso'], overlay: ['bloom', 'burn', 'leak', 'whiteout', 'paper-tear', 'page-turn', 'pen-dot-curtain', 'pixel-curtain','magazine-flip','paper-swap'],
  'scene-entrance': ['land', 'quiet', 'stagger'], 'word-entrance': ['fade', 'pop', 'rise'],
};
const effectLayerLabels: Record<string, string> = {
  backdrop: 'خلفية', look: 'تأثير المظهر',
  camera: 'كاميرا', 'caption-emphasis': 'تأكيد الكابشن', 'graphics-transition': 'انتقال الجرافيك',
  'caption-skin': 'سكين الكابشن', 'caption-presentation': 'شكل الكابشن',
  'kinetic-emphasis': 'تأكيد الكلمة', 'layout-transition': 'تغيير التخطيط', overlay: 'طبقة انتقال',
  'scene-entrance': 'دخول المشهد', 'word-entrance': 'دخول الكلمة',
};
const effectLabels: Record<string, string> = {
  'ink-slab':'لوح حبر','magazine-flip':'قلب صفحة مجلة','lens-zoom':'عدسة','paper-pull':'سحب الورقة','paper-swap':'تبديل الورقة',
  'punch-step': 'تكبير بقطعة', 'slow-push': 'اقتراب بطيء', 'snap-in': 'تكبير سريع',
  'snap-zoom': 'ضربة زووم', orbit: 'دوران حوالين المشهد', dolly: 'اقتراب سينمائي', handheld: 'كاميرا في الإيد',
  accent: 'لون مميز', pop: 'نبضة تكبير', underline: 'خط تحت النص', latin: 'خط لاتيني', weight: 'وزن أثقل', stretch: 'كشيدة متحركة',
  'spoken-box': 'صندوق الكلمة المنطوقة', karaoke: 'كاريوكي', 'bold-outline': 'حدود عريضة', 'soft-shadow': 'ظل ناعم', 'paper-tag': 'قصاصة ورق',
  pill: 'كبسولة', minimal: 'نص بلا خلفية', 'ink-strip': 'شريط داكن',
  'clip-wipe': 'كشف بمسح', 'hue-crossfade': 'تدرج لون الفصل', 'light-scan': 'مسح ضوئي', 'whip-pan': 'دفعة جانبية',
  iris:'دايرة',keyhole:'ثقب مفتاح',blinds:'شرايح','dot-zoom':'زووم في النقطة','zoom-through':'زووم من خلال',
  'paper-tear':'تقطيع ورق','page-turn':'قلب صفحة','pen-dot-curtain':'ستارة نقطة الحبر','pixel-curtain':'ستارة بكسلات',
  curtain: 'نزول ستارة', 'window-morph': 'تحويل النافذة', bloom: 'ومضة مضيئة', burn: 'حرق فيلم', leak: 'تسريب ضوء', whiteout: 'بياض كامل',
  land: 'دخول ثابت', quiet: 'دخول هادي', stagger: 'دخول متتابع', fade: 'ظهور تدريجي', rise: 'طلوع تدريجي',
  blueprint: 'مخطط هندسي', riso: 'طباعة ريزو', film: 'حبيبات فيلم', ...BACKDROP_LABEL,
  // The look and the backdrop share the id `paper`: the more specific `layer:id` entry wins.
  'look:paper': 'ورق',
};

const define = (key: string, fixture: Record<string, any>, options: Partial<PreviewDefinition> = {}): PreviewDefinition => {
  const [layer, id] = key.split(':');
  return {key, slug: key.replaceAll(':', '--'), labelAr: labels[id] ?? `مثال ${id}`, labelEn: english(id), layer,
    style: 'section-deck', fps: 30, durationInFrames: DURATION,
    scope: 'Existing renderer with original authored illustration data; renderer demonstration only.', notes: [SAMPLE],
    props: {previewKey: key}, status: 'supported', fixture, ...options};
};

/** The scene a style that owns scene families shows as its own card, with the law that makes it that style. */
function ownStyleScene(id: string) {
  if (id === 'documentary') return {scope: 'Illustrative route with authored city coordinates; no installed geography or real journey is claimed.', scene: baseScene('map-route', documentaryTemplateData['map-route'], 'takeover')};
  if (id === 'grid-glide') return {scope: 'Owned Grid Glide scene with its canonical motion law.', scene: baseScene('glide-lines', {...gridMotion, lines: [line(['فكرة', 'واحدة']), line(['صورة', 'واضحة'], 'hero', 40)], box: {text: 'مثال على الستايل', at: 80}, grid: true})};
  if (id === 'one-shot') return {scope: 'Owned One Shot chain: one unbroken take in which every step grows out of the one before it.', scene: baseScene('one-shot', oneShotSample, 'takeover', ONE_SHOT_FRAMES)};
  if (id === 'layered-speaker') return {scope: 'Owned layered-speaker scene: a big stretched word behind an abstract speaker, words beside the head and a hand-drawn circle. The speaker is a drawn stand-in for the matte.', scene: baseScene('layered-speaker', layeredSample, 'presenter', LAYERED_FRAMES)};
  if (id === 'cartoon') return {scope: 'Owned cartoon body: an illustrated narrator over flipping grounds with a headline built on the recorded words (neutral synthetic words here).', scene: baseScene('cartoon', cartoonSample, 'takeover', CARTOON_FRAMES), words: cartoonWords(18)};
  return null;
}

/** Pure serializable data. No JSX, creator media, project discovery, network or filesystem access. */
export function previewDefinitions(): PreviewDefinition[] {
  const concepts = CATALOG.map(concept => define(`concept:${concept.id}`, {kind: 'concept', concept: concept.id, data: catalogDemo(concept.id)}, {
    labelEn: concept.title, durationInFrames: Math.max(concept.defaultFrames, concept.minFrames), scope: 'Existing concept component and its catalog sample configuration.'}));
  const scenes = sceneFixtures().map(item => define(`scene:${item.family}`, {kind: item.kind, scene: baseScene(item.family, item.data, item.layout, item.duration), ...(item.words ? {words: item.words} : {}), ...(item.family === 'kinetic-text' ? {authoredTiming: true} : {})}, {
    style: item.family==='compose' ? 'magazine-interview' : ownSceneStyle(item.family) ?? (item.kind === 'semantic' && item.family !== 'motion-concept' ? 'paper-collage' : 'section-deck'), durationInFrames: item.duration ?? DURATION,
    ...(item.layout === 'presenter' || item.layout === 'split' ? {notes: [SAMPLE, 'Neutral abstract placeholder; presenter, natural appearance and face protection are not verified.']} : {}),
    ...(item.family === 'kinetic-text' ? {scope: 'Renderer-only authored timing demonstration of the existing kinetic-text component.', notes: [SAMPLE, TIMING]} : {}),
    ...(item.family === 'screen-recording' ? {notes: [SAMPLE, 'Canonical screen-recording renderer on a silent video carrier made from an original synthetic illustration. No real software capture is claimed.']} : {}),
  }));
  for(const move of ARABIC_TYPE_MOVES.filter(move=>move!=='decrypt')){
    const text=move==='kufi-tiles'?'كوفي':move==='kashida-stretch'?'جميل':move==='letters-snap'?'مستقبل':move==='video-in-letters'?'شوف':move==='word-melt'?'خوف':move==='echo-stack'?'اسمع':move==='pen-write'?'اكتب بالقلم':move==='unblur'?'كل كلمة بتوضح':move==='redacted-stamp'?'فكرة واضحة':'بتنزل النقط';
    scenes.push(define('preview:arabic-type-'+move,{kind:'arabic-type',scene:baseScene('arabic-type',{text,move,...(move==='word-melt'?{to:'ثقة'}:{}),...(move==='redacted-stamp'?{stamp:'مثال'}:{}),...(move==='video-in-letters'?{media:PREVIEW_SCREEN_VIDEO}:{})},'takeover',240)},
      {canonicalKey:'scene:arabic-type',labelAr:ARABIC_TYPE_LABELS[move],durationInFrames:240,scope:'Authored Arabic type illustration. The video fill uses only the named synthetic test clip.'}));
  }
  scenes.push(define('scene:project-scene', {kind: 'unsupported'}, {status: 'requires-project-pack', reason: 'This is an extension point. A named project scene pack is required; no shipped animation exists to preview.', scope: 'Extension contract only; no invented project scene.', durationInFrames: 120}));
  const effects = Object.entries(EFFECTS).flatMap(([layer, ids]) => ids.map(id => define(`${layer}:${id}`, {kind: 'effect', layer, preset: id}, {
    labelAr: `${effectLayerLabels[layer]} · ${effectLabels[`${layer}:${id}`] ?? effectLabels[id]}`,
    ...(layer === 'caption-emphasis' && id === 'stretch' ? {style: 'paper-collage' as const} : {}),
    scope: `${layer === 'caption-emphasis' || layer === 'kinetic-emphasis' || layer === 'word-entrance' ? 'Renderer-only authored timing demonstration' : 'Existing mechanism'} on neutral graphics.`,
    notes: [SAMPLE, ...(layer.includes('emphasis') || layer === 'word-entrance' ? [TIMING] : [])],
  })));
  const styles = STYLE_METAS.map(style => {
    const own = ownStyleScene(style.id);
    return define(`style:${style.id}`, own ? {kind: 'style-scene', scene: own.scene, ...('words' in own ? {words: own.words} : {})} : {kind: 'creative', scene: baseScene('process', creativeData.process)}, {
      style: style.id as StyleId, labelAr: style.label.ar, labelEn: style.label.en,
      scope: own?.scope ?? 'One common three-step illustration rendered with this style’s existing visual grammar.',
      ...(own ? {durationInFrames: own.scene.durationInFrames} : {}),
    });
  });
  const source = scenes.find(scene => scene.key === 'scene:screen-focus')!;
  const recipes = [define('recipe-variant:source-focus', source.fixture),
    define('recipe-variant:metric-count', {kind: 'library', scene: baseScene('data-story', {...dataBars(), display: 'metric', items: [{label: 'قيمة توضيحية', value: 42, atFrame: 20}]})}),
    define('recipe-variant:data-bars', {kind: 'library', scene: baseScene('data-story', dataBars())})];
  const branchFalse = structuredClone(catalogDemo('conditional-branching'));
  branchFalse.input.value = 62;
  const filteringAll = structuredClone(catalogDemo('identity-filtering'));
  filteringAll.criteria = [
    {id: 'minimum', label: 'التقييم صفر أو أكثر', field: 'score', op: 'gte', value: 0},
    {id: 'maximum', label: 'التقييم ١٠٠ أو أقل', field: 'score', op: 'lte', value: 100},
  ];
  const variants = [
    define('preview:conditional-branching-false', {kind: 'concept', concept: 'conditional-branching', data: branchFalse}, {
      canonicalKey: 'concept:conditional-branching', layer: 'concept', style: 'paper-collage', labelAr: 'الشرط ماتحققش · المسار التاني', labelEn: 'Conditional branching · false outcome', durationInFrames: 270,
      scope: 'Alternate authored input in Paper Collage; the same native condition calculates the false route from the supplied value.',
    }),
    define('preview:identity-filtering-all', {kind: 'concept', concept: 'identity-filtering', data: filteringAll}, {
      canonicalKey: 'concept:identity-filtering', layer: 'concept', style: 'paper-collage', labelAr: 'كل الكروت عدت الشرطين', labelEn: 'Identity filtering · all cards retained', durationInFrames: 330,
      scope: 'All-survivor edge example in Paper Collage using two supplied numeric predicates; every original card keeps its identity.',
    }),
  ];
  return [...concepts, ...scenes, ...effects, ...styles, ...recipes, ...variants].map(definition => {
    const family = definition.fixture.scene?.family ?? (definition.fixture.kind === 'concept' ? 'motion-concept' : undefined);
    return family && !familySupported(definition.style, family) ? {...definition, status: 'unsupported' as const,
      reason: `Style ${definition.style} does not support family ${family}.`, fixture: {kind: 'unsupported'}} : definition;
  });
}

let definitionByKey: ReadonlyMap<string, PreviewDefinition> | undefined;
export function getPreviewDefinition(key: string): PreviewDefinition {
  // Frames are evaluated independently. The static fixture table must be built once per browser,
  // not once for every frame of every clip.
  definitionByKey ??= new Map(previewDefinitions().map(definition => [definition.key, definition]));
  const result = definitionByKey.get(key);
  if (!result) throw new Error(`Unknown library preview ${JSON.stringify(key)}.`);
  return result;
}

/** Contract validation is technical evidence only and does not establish visual approval. */
export function previewFixtureIssues(definition: PreviewDefinition): string[] {
  const {fixture} = definition;
  if (definition.status !== 'supported') return fixture.kind === 'unsupported' && definition.reason ? [] : ['Unsupported previews require an explicit reason.'];
  try {
    if (fixture.kind === 'concept') {catalogSchema(fixture.concept).parse(fixture.data); return [];}
    const input = fixture.scene;
    if (fixture.kind === 'creative') {({intro: introSchema, proof: proofSchema, process: processSchema, comparison: comparisonSchema, comment: commentSchema, follow: followSchema} as Record<string, any>)[input.family].parse(input.data); return [];}
    if (fixture.kind === 'figures') return validateFiguresTiming(figuresSceneSchema.parse(input),definition.fps);
    if (fixture.kind === 'chat-thread') return validateChatThreadTiming(chatThreadSceneSchema.parse(input),definition.fps);
    if (fixture.kind === 'kinetic') return validateKineticTiming(kineticSceneSchema.parse(input));
    if (fixture.kind === 'arabic-type') return validateArabicTypeTiming(arabicTypeSceneSchema.parse(input),definition.fps);
    if (fixture.kind === 'semantic') return validateSemanticTiming(semanticSceneSchema.parse(input), definition.fps);
    if (fixture.kind === 'library') return validateLibraryTiming(librarySceneSchema.parse(input));
    if (fixture.kind === 'compose') return validateComposeTiming(composeSceneSchema.parse(input), definition.fps, []);
  if (fixture.kind === 'proof-screen') return validateProofScreenTiming(proofScreenSceneSchema.parse(input),definition.fps);
    if (fixture.kind === 'style-scene') {
      const parsed = styleSceneSchema.parse(input);
      return [...validateStyleSceneTiming(parsed, definition.fps), ...(fixture.words ? validateStyleSceneWords(parsed, fixture.words, definition.fps) : [])];
    }
    if (fixture.kind === 'screen-recording') return screenRecordingIssues(screenRecordingSceneSchema.parse(input), PREVIEW_SCREEN_SIZE);
    if (fixture.kind === 'effect' && EFFECTS[fixture.layer]?.includes(fixture.preset)) return [];
    return ['Unknown fixture renderer.'];
  } catch (error) {return [error instanceof Error ? error.message : String(error)];}
}
