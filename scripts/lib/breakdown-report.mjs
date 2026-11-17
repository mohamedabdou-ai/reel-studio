// Arabic right-to-left report page for one reference breakdown.
// The look (colour, type, layout) of this page is owned by the art director lane.
import './project-tmp.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT, run, hms} from './media.mjs';

export const BASIS_LABELS = Object.freeze({
  measured: 'اتقاست',
  seen: 'اتشافت',
  heard: 'اتسمعت',
  inferred: 'استنتاج',
  'needs-confirmation': 'محتاجة تأكيد',
});

const NOT_MEASURED = 'مش متقاس';
const RIGHTS_NOTE = 'الفيديو المرجعي للتعلّم بس: لقطاته ومزيكته مش مسموح نستخدمهم في الفيديو الجديد.';

const CUT_KINDS = {cut: 'قطع عادي', jump: 'قطع في نفس اللقطة', 'punch-in': 'قرب مفاجئ', 'punch-out': 'بعد مفاجئ'};
const TRANSITION_KINDS = {
  fade: 'اختفاء تدريجي', flash: 'فلاش', dissolve: 'دمج', slide: 'سحب', whip: 'سحب سريع',
  zoom: 'زووم', blur: 'تغبيش', glitch: 'تشويش', other: 'نوع مش معروف',
};
const DIRECTIONS = {left: 'ناحية الشمال', right: 'ناحية اليمين', up: 'لفوق', down: 'لتحت'};
const CAMERA_LABELS = {
  static: 'ثابتة', 'zoom-in': 'زووم لقدام', 'zoom-out': 'زووم لورا', 'pan-left': 'لف شمال', 'pan-right': 'لف يمين',
  'tilt-up': 'طالعة لفوق', 'tilt-down': 'نازلة لتحت', pan: 'لف', tilt: 'ميل', handheld: 'في الإيد', moving: 'متحركة', unknown: 'مش واضحة',
};
const ZONES = {top: 'فوق', middle: 'في النص', bottom: 'تحت'};
const TEXT_KINDS = {caption: 'ترجمة كلام', title: 'عنوان', label: 'لافتة', 'scene-text': 'كلام مكتوب جوه اللقطة نفسها'};
const ENTRANCES = {
  cut: 'ظهور مباشر', fade: 'ظهور تدريجي', pop: 'بوب', typewriter: 'حرف حرف', 'word-by-word': 'كلمة كلمة', slide: 'سحب',
  other: 'حركة مش معروفة', unknown: 'مش واضح', 'present-at-start': 'موجود من أول الريل',
};
const EXITS = {
  cut: 'اختفاء مباشر', fade: 'اختفاء تدريجي', pop: 'بوب', typewriter: 'حرف حرف', 'word-by-word': 'كلمة كلمة', slide: 'سحب',
  other: 'حركة مش معروفة', unknown: 'مش واضح', 'present-at-end': 'فاضل لآخر الريل',
};
const READINGS = {'most-complete-observed': 'أكمل نسخة اتشافت'};
const TEXT_EVENT_KINDS = {'highlight-change': 'التمييز اتنقل'};
const SFX_TYPES = {pop: 'بوب', click: 'كليك', ding: 'دينج', impact: 'ضربة', whoosh: 'هوا', riser: 'صوت بيعلى', hit: 'خبطة'};
const LOOKS = {
  bw: 'أبيض وأسود', 'teal-orange': 'تركواز وبرتقالي', vivid: 'ألوان زاهية', muted: 'ألوان هادية',
  warm: 'دافية', cool: 'باردة', natural: 'طبيعية',
};
const OVERLAY_KINDS = {sticker: 'ملصق', logo: 'لوجو', pip: 'صورة جوه الصورة'};
const ANCHOR_KINDS = {'text-in': 'ظهور كلام', 'text-change': 'تغيير جوه الكلام', 'overlay-in': 'ظهور عنصر', cut: 'قطع', transition: 'انتقال'};
const REGION_TAG = 'جوه لوحة';
// A region change that does not start a new shot: part of the picture was swapped and the shot carried on.
const PARTIAL_SWAP = 'تبديل جزئي';
const PARTIAL_NOTE = 'جزء من الصورة اتبدّل واللقطة نفسها كمّلت، فما اتحسبتش لقطة جديدة.';
const POSSIBLE_CUT_NOTE = 'الجزء ده من الصورة اتغيّر في نفس لحظة ظهور كلام أو اختفائه، فممكن يكون الكلام بس اللي اتغيّر مش القطع.';
const POSSIBLE_SFX_LIMIT = 15;
const CAPTION_NO_TRANSCRIPT = 'Spoken-word caption role is unverified: no transcript.';
const CAPTION_NO_MATCH = 'Text does not match timed speech closely enough to establish spoken-word captions.';
const CAPTION_CHECK = 'اسمع الريل وقارن: لو المكتوب هو نفس اللي بيتقال يبقى ترجمة كلام، ولو لأ يبقى لافتة أو عنوان.';
// Why an item is pending, and what to do about it when that differs from the default for its type.
const REASONS = {
  'text animation not recognised': {why: 'حركة دخول أو خروج الكلام مش متعرّف عليها', how: 'اتفرج على الكلام وهو داخل وهو خارج وقول بيتحرك إزاي.'},
  'low reading confidence': {why: 'قراية الكلام مش مضمونة'},
  'overlay detection is best effort': {why: 'لقط العناصر اللي فوق الصورة تقريبي'},
  'transition type not recognised': {why: 'نوع الانتقال مش متعرّف عليه'},
  'too few face samples': {why: 'الفريمات اللي اتشافت قليلة'},
  'face detection is unsure on this footage': {why: 'لقط الوش مش مضمون في الريل ده'},
  [CAPTION_NO_TRANSCRIPT]: {why: 'شكله ترجمة كلام، بس كلام الريل المنطوق ما اتكتبش فمفيش حاجة نقارنه بيها', how: CAPTION_CHECK, audio: true},
  [CAPTION_NO_MATCH]: {why: 'شكله ترجمة كلام، بس مش مطابق كفاية للكلام اللي اتسمع في نفس الوقت', how: CAPTION_CHECK, audio: true},
  // The listener's fixed reason strings (HEARD_REASONS in breakdown-heard.mjs), worded in Arabic; `how` stays the audio wording.
  'The listener did not hear a sound effect here.': {why: 'Gemini ماسمعش مؤثر في اللحظة دي', audio: true},
  'Only the listener heard this; its time is approximate.': {why: 'Gemini بس اللي سمعه، ووقته تقريبي', audio: true},
  'The measured type and the heard type differ.': {why: 'نوع الصوت اللي اتقاس غير اللي اتسمع', audio: true},
  'The measured music bed and the listener disagree.': {why: 'وجود المزيكا اللي اتقاس غير اللي اتسمع', audio: true},
  'The measured tempo and the heard tempo differ.': {why: 'سرعة المزيكا اللي اتقاست غير اللي اتسمعت', audio: true},
  'The heard tempo is half or double the measured tempo.': {why: 'السرعة اللي اتسمعت نص أو ضعف اللي اتقاست', audio: true},
};
const LISTENER_FAILURES = {
  'no-key': 'مفيش مفتاح', auth: 'المفتاح مرفوض', quota: 'الحد المسموح خلص', billing: 'الحساب محتاج دفع', 'too-large': 'الملف كبير',
  blocked: 'Gemini رفض الطلب', truncated: 'الرد اتقطع', 'invalid-response': 'الرد مش مفهوم', network: 'مشكلة نت', timeout: 'استنى كتير ومفيش رد',
  upload: 'الرفع فشل', http: 'خطأ من الخدمة',
};
const FONT_FAMILIES = {
  naskh: 'نسخ', kufi: 'كوفي', ruqaa: 'رقعة', thuluth: 'ثلث', diwani: 'ديواني', sans: 'بسيط بدون زوائد', serif: 'بزوائد',
  display: 'عناوين', handwritten: 'خط يد', unknown: 'مش معروف',
};
const FONT_WEIGHTS = {light: 'خفيف', regular: 'عادي', bold: 'عريض', black: 'عريض جدًا'};
const LISTENER_FAILED = /^Listener failed \(([a-z-]{1,20})\): /u;
const LISTENER_IGNORED = /^The listener answered (\d{1,6}) unknown or repeated ids; they were ignored\.$/u;
const LISTENER_SILENT = /^The listener gave no answer for (\d{1,6}) measured sound effects\.$/u;
const LISTENER_KEPT = 'The uploaded copy could not be deleted from Gemini; Google deletes uploaded files after 48 hours.';
const KEPT_AR = 'النسخة اللي اترفعت لـ Gemini ما اتمسحتش، وجوجل بتمسح الملفات المرفوعة بعد 48 ساعة.';
// The creator's own ear answers carry these marks; an ear check is never described as "nobody listened".
const byEar = item => item?.reviewedWith === 'ear' || item?.heardBy === 'creator';
const EAR_TAG = '<span class="by">سمعها صاحب الريل</span>';
const earTag = item => (byEar(item) ? EAR_TAG : '');
// A caption whose role is still open is a candidate: it is never worded as a confirmed spoken-word caption.
const captionCandidate = t => t?.kind === 'caption' && isPending(t) && (t.reason === CAPTION_NO_TRANSCRIPT || t.reason === CAPTION_NO_MATCH);
const CAPTION_CANDIDATE = 'ممكن يكون ترجمة كلام';
const SFX_CONFLICT = /^the sound looks like ([a-z-]{1,20}) but the label model says ([a-z-]{1,20})$/u;
const EVIDENCE = {
  'rectangular motion within a stationary surround; frame-in-frame interpretation needs confirmation': 'اتلقطت عشان فيه حركة جوه مستطيل وباقي الصورة حواليه ثابت. كونها صورة جوه الصورة لسه محتاج تأكيد.',
};
const CONFIDENCE = {high: 'ثقة عالية', medium: 'ثقة متوسطة', low: 'ثقة ضعيفة'};
const LIMITATIONS = {
  'The reference has no audio.': 'المرجع من غير صوت، فمفيش أي قياس للمزيكا أو المؤثرات أو الكلام.',
  'Speech was not transcribed.': 'الكلام المنطوق ما اتكتبش، فأرقام الكلام مش متقاسة.',
  'Speech transcription failed.': 'كتابة الكلام المنطوق فشلت، فأرقام الكلام مش متقاسة.',
};
const SPEECH_FAILED = 'Speech transcription failed';
const SPEECH_EXTERNAL = /^Speech transcription failed: External references cannot be transcribed\b/u;
const PRESENTER_UNMEASURED = /^Presenter share was not measured: (.*)$/su;
const PRESENTER_NO_MODELS = /^the face models are not installed\b/u;
const AUDIO_LENGTH = /^Audio duration \((\d{1,6}(?:\.\d{1,3})?)s\) differs from video \((\d{1,6}(?:\.\d{1,3})?)s\)/u;

const esc = value => String(value ?? '').replace(/[&<>"']/gu, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// A Latin run (scene name, style id, flag) inside an Arabic sentence gets its own left-to-right isolate, so its
// hyphens and the Arabic punctuation or prefix letter beside it stay where they were written. Words split only
// by spaces are one run, or two isolates would swap places in the right-to-left line. Pure Arabic is untouched.
const LATIN_WORD = String.raw`(?:--)?\p{Script=Latin}[\p{Script=Latin}0-9]*(?:[-_./:+#][\p{Script=Latin}0-9]+)*`;
const LATIN_RUN = new RegExp(`${LATIN_WORD}(?: +${LATIN_WORD})*`, 'gu');
const NAME_MAX = 28;
function mixed(value) {
  const text = String(value ?? '');
  let out = '', at = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    // A short run is a name and stays on one line; a long one may wrap so it can never widen the page.
    out += `${esc(text.slice(at, m.index))}<bdi dir="ltr"${Array.from(m[0]).length <= NAME_MAX ? ' class="nm"' : ''}>${esc(m[0])}</bdi>`;
    at = m.index + m[0].length;
  }
  return out + esc(text.slice(at));
}
const list = value => (Array.isArray(value) ? value : []);
const fin = value => typeof value === 'number' && Number.isFinite(value);
const fmt = (value, digits = 1) => String(+value.toFixed(digits));
const num = (value, digits = 1) => (fin(value) ? `<bdi class="n">${fmt(value, digits)}</bdi>` : null);
const time = t => (fin(t) ? `<bdi class="n">${hms(t)}</bdi>` : `<span class="na">${NOT_MEASURED}</span>`);
const range = (a, b) => `<span class="rng">${time(a)}<span class="sep">←</span>${time(b)}</span>`;
// In a table the start time leads and the end sits under it, so the column stays narrow on a phone.
const rangeCell = (a, b) => `${time(a)}<small>لحد ${time(b)}</small>`;
const times = (value, digits = 2) => (fin(value) ? `<bdi class="n">×${fmt(value, digits)}</bdi>` : '');
const safeId = id => (typeof id === 'string' && /^[A-Za-z0-9._-]{1,40}$/u.test(id) ? id : null);
const anchorAttr = id => (safeId(id) ? ` id="i-${safeId(id)}"` : '');
const idTag = id => (id == null ? '' : `<bdi class="id">${esc(id)}</bdi>`);
const hex = value => (typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(value) ? value : null);
const own = (map, key) => (typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null);
// A known key reads in Arabic, an unknown key is shown as it is, and a missing value is "not measured".
const word = (map, key) => (key == null || key === '' ? `<span class="na">${NOT_MEASURED}</span>` : own(map, key) ?? `<bdi>${esc(key)}</bdi>`);
const plain = (map, key) => (key == null || key === '' ? NOT_MEASURED : own(map, key) ?? String(key));
// The same label inside an Arabic sentence: an unknown key is Latin, so it is isolated there.
const label = (map, key) => mixed(plain(map, key));
const isPending = item => item?.status === 'needs-confirmation';
// The page loads only files that sit beside it: a relative path of plain segments, so no scheme,
// no host, no drive, no absolute path, no "..", and nothing a browser could decode into one of those.
const localAsset = value => typeof value === 'string' && value.length <= 300
  && /^[A-Za-z0-9_-][A-Za-z0-9._ -]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._ -]*)*$/u.test(value);

function chip(item) {
  if (item == null) return `<span class="chip chip-none">${NOT_MEASURED}</span>`;
  const key = isPending(item) ? 'needs-confirmation' : own(BASIS_LABELS, item.basis) ? item.basis : 'measured';
  const confidence = own(CONFIDENCE, item.confidence);
  return `<span class="chip chip-${key}"${confidence ? ` title="${confidence}"` : ''}>${BASIS_LABELS[key]}</span>`;
}

function swatch(value, name) {
  const colour = hex(value);
  return colour ? `<span class="sw"><i style="background:${colour}"></i>${name}<bdi class="n">${colour.toLowerCase()}</bdi></span>` : '';
}

function countPhrase(n) {
  if (n === 1) return 'بند واحد محتاج تأكيد';
  if (n === 2) return 'بندين محتاجين تأكيد';
  if (n >= 3 && n <= 10) return `${n} بنود محتاجة تأكيد`;
  return `${n} بند محتاج تأكيد`;
}

function place(box) {
  if (!Array.isArray(box) || box.length < 4 || !box.every(fin)) return null;
  const cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2;
  const v = cy < 1 / 3 ? 'فوق' : cy > 2 / 3 ? 'تحت' : 'في النص';
  const h = cx < 1 / 3 ? ' شمال' : cx > 2 / 3 ? ' يمين' : '';
  return `${v}${h}`;
}

const validBox = box => Array.isArray(box) && box.length >= 4 && box.slice(0, 4).every(fin) && box[2] > 0 && box[3] > 0;
const isRegion = item => item?.scope === 'region';
const isPartialSwap = item => isRegion(item) && item.shotBoundary === false;
// A thumbnail of the frame with the measured box filled in, so "inside a panel" shows where the panel is.
function boxMap(box, ratio, w = 18) {
  if (!validBox(box)) return '';
  const h = ratio ? Math.min(40, Math.max(10, Math.round(w * ratio[2] / ratio[1]))) : Math.round(w * 16 / 9);
  const unit = v => Math.min(1, Math.max(0, v));
  const x0 = unit(box[0]), y0 = unit(box[1]), x1 = unit(box[0] + box[2]), y1 = unit(box[1] + box[3]);
  if (x1 <= x0 || y1 <= y0) return '';
  const f = v => v.toFixed(1);
  return `<svg class="map" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="2"/><rect class="in" x="${f(x0 * w)}" y="${f(y0 * h)}" width="${f(Math.max(1.5, (x1 - x0) * w))}" height="${f(Math.max(1.5, (y1 - y0) * h))}" rx="1"/></svg>`;
}
const sameBox = (a, b) => validBox(a) && validBox(b) && [0, 1, 2, 3].every(i => Math.abs(a[i] - b[i]) <= 0.02);
const oneLine = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
// Long supplied words are cut by code point, never through an emoji, and the full words stay on their own card.
function clip(value, max = 70) {
  const points = Array.from(oneLine(value));
  return points.length > max ? `${points.slice(0, max).join('').trimEnd()}…` : points.join('');
}
// A font guess from the listener: wording only. It is never applied to the page or to the creator's captions.
const fontLine = font => (font && typeof font === 'object'
  ? `<p class="cue-meta">خط تقريبي: ${own(FONT_FAMILIES, font.family) ?? FONT_FAMILIES.unknown} ${own(FONT_WEIGHTS, font.weight) ?? FONT_WEIGHTS.regular} ${chip({basis: 'heard', confidence: font.confidence})} <span class="by">تخمين بس، مش متطبّق</span></p>`
  : '');
const textLines = t => String(t?.text ?? '').split(/\r?\n/u);
function lineOf(t, event) {
  const lines = textLines(t), i = event?.lineIndex;
  return Number.isInteger(i) && i >= 0 && i < lines.length ? {n: i + 1, words: lines[i].trim()} : null;
}
// Changes inside one text element, each with the element it belongs to.
const textEvents = b => list(b.text).flatMap(t => list(t.events).map(e => ({t, e})));
function reasonOf(item) {
  const reason = typeof item?.reason === 'string' ? item.reason.trim() : '';
  if (!reason) return {};
  const known = own(REASONS, reason);
  if (known) return known;
  const clash = SFX_CONFLICT.exec(reason);
  if (clash) return {why: `شكل الصوت بيقول ${label(SFX_TYPES, clash[1])} وموديل التسمية بيقول ${label(SFX_TYPES, clash[2])}`};
  return {why: `<bdi dir="auto">${esc(clip(reason, 160))}</bdi>`};
}
function limitationText(l) {
  const fixed = own(LIMITATIONS, l);
  if (fixed) return fixed;
  const length = AUDIO_LENGTH.exec(l);
  if (length) return `طول الصوت (<bdi class="n">${esc(length[1])}</bdi> ث) غير طول الصورة (<bdi class="n">${esc(length[2])}</bdi> ث)، فتحليل الصوت اتظبط على طول الصورة.`;
  if (SPEECH_EXTERNAL.test(l)) return 'الكلام المنطوق ما اتكتبش: أداة كتابة الكلام العربي اللي في الاستوديو ما بتشتغلش على ريل مرجعي من برّه، فأرقام الكلام مش متقاسة. قياس الصورة والصوت كمّل عادي.';
  // The listener's own words (service messages included) are never printed; the code alone is worded.
  const failed = LISTENER_FAILED.exec(l);
  if (failed) return `Gemini ماقدرش يسمع: ${own(LISTENER_FAILURES, failed[1]) ?? 'مشكلة مش معروفة'}. باقي القياسات زي ما هي.`;
  const ignored = LISTENER_IGNORED.exec(l);
  if (ignored) return `Gemini رد على ${num(+ignored[1], 0)} رقم مش معروف أو متكرر، فاتجاهلت.`;
  const silent = LISTENER_SILENT.exec(l);
  if (silent) return `Gemini ما ردّش على ${num(+silent[1], 0)} مؤثر من المؤثرات اللي اتقاست.`;
  if (l === LISTENER_KEPT) return KEPT_AR;
  const presenter = PRESENTER_UNMEASURED.exec(l);
  if (presenter) {
    return PRESENTER_NO_MODELS.test(presenter[1])
      ? 'ظهور المتكلم على الشاشة ما اتقاسش: أداة لقط الوش مش متثبتة. تثبيتها بينزّل ملفات، فمحتاج موافقتك الأول.'
      : `ظهور المتكلم على الشاشة ما اتقاسش: <bdi dir="auto">${esc(clip(presenter[1], 200))}</bdi>`;
  }
  return `<bdi dir="auto">${esc(l)}</bdi>`;
}

// The type the listener heard when it differs from the measured one; a silence or a match has none.
const heardType = x => (x?.heard?.verdict === 'heard' && typeof x.heard.type === 'string' && x.heard.type !== x.type ? x.heard.type : null);

// Every item that still needs the creator's eye or ear, in review-queue order first.
function pendingItems(b, link = id => idTag(id)) {
  const sound = b.sound ?? null;
  const known = new Map();
  const add = (id, status, entry) => { if (id != null && !known.has(id)) known.set(id, {id, status, ...entry}); };
  const LOOK = 'شوف الفريمات حوالين اللحظة دي.';
  for (const s of list(b.shots)) add(s.id, s.camera?.status, {what: `حركة الكاميرا: ${label(CAMERA_LABELS, s.camera?.label)}`, when: range(s.start, s.end), how: 'اتفرج على اللقطة وقول الكاميرا بتعمل إيه.'});
  const inPanel = item => (isRegion(item) ? ` ${REGION_TAG}` : '');
  for (const c of list(b.cuts)) add(c.id, c.status, {what: isPartialSwap(c) ? `${PARTIAL_SWAP} في الصورة` : `قطع${inPanel(c)}: ${label(CUT_KINDS, c.kind)}`, when: time(c.t), how: LOOK, ...reasonOf(c)});
  for (const r of list(b.transitions)) add(r.id, r.status, {what: `انتقال${inPanel(r)}: ${label(TRANSITION_KINDS, r.kind)}`, when: range(r.start, r.end), how: 'شوف الفريمات وسمّي نوع الانتقال.', ...reasonOf(r)});
  for (const e of list(b.events)) add(e.id, e.status, {what: `حركة مفاجئة: ${label(CUT_KINDS, e.kind)}`, when: time(e.t), how: LOOK, ...reasonOf(e)});
  for (const t of list(b.text)) add(t.id, t.status, {what: `${captionCandidate(t) ? `${CAPTION_CANDIDATE}` : 'كلام على الشاشة'}: «<bdi>${esc(clip(t.text))}</bdi>»`, when: range(t.start, t.end), how: 'اقرا الكلام من الفريم وصحّحه لو غلط.', ...reasonOf(t)});
  for (const {t, e} of textEvents(b)) {
    const line = lineOf(t, e);
    add(e.id, e.status, {what: `تغيير جوه الكلام ${link(t.id)}: ${label(TEXT_EVENT_KINDS, e.kind)}${line ? ` · السطر ${num(line.n, 0)}` : ''}`, when: time(e.t), how: 'شوف الفريم قبل اللحظة دي وبعدها وقول إيه اللي اتغيّر في الكلام.', ...reasonOf(e)});
  }
  for (const o of list(b.overlays)) add(o.id, o.status, {what: `عنصر فوق الصورة: ${label(OVERLAY_KINDS, o.kind)}`, when: range(o.start, o.end), how: 'شوف الفريم: ملصق ولا لوجو ولا صورة جوه الصورة ولا مفيش حاجة.', ...reasonOf(o)});
  for (const x of list(sound?.sfx)) {
    const beside = x.anchor ? ` · مع ${label(ANCHOR_KINDS, x.anchor.kind)} ${link(x.anchor.id)}` : '';
    add(x.id, x.status, {what: `مؤثر صوتي: ${label(SFX_TYPES, x.type)}${heardType(x) ? ` · اتقاس ${label(SFX_TYPES, x.type)} واتسمع ${label(SFX_TYPES, heardType(x))}` : ''}${beside}`, when: time(x.t), how: 'اسمع اللحظة دي وقول فيه مؤثر ولا لأ ونوعه إيه.', audio: true, ...reasonOf(x)});
  }
  if (sound?.bed) add('sound.bed', sound.bed.status, {what: 'المزيكا اللي تحت الكلام', tag: 'الصوت', when: '', how: 'اسمع وقفة في الكلام وشوف فيه مزيكا تحتها ولا لأ.', audio: true, ...reasonOf(sound.bed)});
  if (sound?.tempo) add('sound.tempo', sound.tempo.status, {what: 'سرعة المزيكا', tag: 'الصوت', when: '', how: 'خبّط مع المزيكا عشر ثواني وعدّ الخبطات.', audio: true, ...reasonOf(sound.tempo)});
  if (b.presenter) add('presenter', b.presenter.status, {what: 'ظهور المتكلم على الشاشة', tag: 'المتكلم', when: '', how: 'شوف الفريمات اللي اتلقط فيها وش وقول ده شخص حقيقي ولا رسمة.', ...reasonOf(b.presenter)});
  if (b.look) add('look', b.look.status, {what: `شكل الألوان: ${label(LOOKS, b.look.label)}`, tag: 'الألوان', when: '', how: 'بص على اللقطات وقول الألوان ماشية على أنهي شكل.'});
  const out = [], seen = new Set();
  for (const id of list(b.reviewQueue)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(known.get(id) ?? {id, what: 'بند محتاج مراجعة', when: '', how: 'راجعه مع المساعد.'});
  }
  for (const item of known.values()) if (item.status === 'needs-confirmation' && !seen.has(item.id)) out.push(item);
  return out;
}

const MAX_TEXT_ROWS = 4;
// Overlapping cues each get their own sub-row, first fit by start time. More simultaneous cues than
// MAX_TEXT_ROWS would be unreadable as rows, so the lane then becomes a band whose depth is the count.
function packCues(text) {
  const cues = text.map((t, index) => {
    const start = fin(t.start) ? t.start : 0;
    return {t, index, start, end: fin(t.end) && t.end > start ? t.end : start};
  }).sort((a, z) => a.start - z.start || z.end - a.end || a.index - z.index);
  const ends = [];
  for (const cue of cues) {
    let row = ends.findIndex(end => end <= cue.start + 1e-6);
    if (row < 0) row = ends.length;
    ends[row] = cue.end;
    cue.row = row;
  }
  if (ends.length <= MAX_TEXT_ROWS) return {mode: 'rows', rows: Math.max(1, ends.length), cues};
  const edges = [...new Set(cues.flatMap(c => [c.start, c.end]))].sort((a, z) => a - z);
  // Bands are stretches with the same number of cues on screen; unsure stretches hold at least one pending cue.
  const bands = [], unsure = [];
  const grow = (runs, start, end, key) => {
    const last = runs.at(-1);
    if (last && last.end === start && last.key === key) last.end = end;
    else runs.push({start, end, key});
  };
  for (let i = 0; i + 1 < edges.length; i += 1) {
    const live = cues.filter(c => c.start < edges[i + 1] && c.end > edges[i]);
    if (!live.length) continue;
    grow(bands, edges[i], edges[i + 1], live.length);
    if (live.some(c => isPending(c.t))) grow(unsure, edges[i], edges[i + 1], 'pend');
  }
  return {mode: 'density', rows: 1, cues, bands, unsure, peak: Math.max(1, ...bands.map(band => band.key))};
}

function lanes(b) {
  const shots = list(b.shots), sound = b.sound ?? null, silent = sound?.hasAudio === false;
  const ends = shots.map(s => s.end).filter(fin);
  const d = fin(b.durationSec) && b.durationSec > 0 ? b.durationSec : Math.max(1, ...ends);
  const W = 1000, LEFT = 14, GUTTER = 132, PLOT = W - GUTTER - LEFT, GAP = 12;
  // Time runs right to left to match Arabic reading: zero sits at the right edge of the plot.
  const x = t => LEFT + ((d - Math.min(d, Math.max(0, fin(t) ? t : 0))) / d) * PLOT;
  const f = v => v.toFixed(1);
  const span = (a, e, min = 3) => { const right = x(a), left = Math.min(x(e), right - min); return `x="${f(left)}" width="${f(right - left)}"`; };
  const pend = item => (isPending(item) ? ' pend' : '');
  const pack = packCues(list(b.text));
  const dense = pack.mode === 'density', SUB = 9, SUB_GAP = 3;
  const DOTS = 8, textHeight = dense ? DOTS + 18 : pack.rows === 1 ? 14 : pack.rows * SUB + (pack.rows - 1) * SUB_GAP;
  let top = 34;
  const rows = [['اللقطات', 30], ['القطعات والانتقالات', 14], ['كلام الشاشة', textHeight], ['عناصر فوق الصورة', 14], ['الكلام المنطوق', 12], ['المؤثرات', 16], ['إيقاع المزيكا', 12]]
    .map(([name, h]) => { const row = {y: top, h, name}; top += h + GAP; return row; });
  const H = top - GAP + 18;
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(s => d / s <= 8) ?? 600;
  const ticks = [];
  for (let t = 0; t <= d + 1e-6; t += step) {
    const m = Math.floor(t / 60), s = t - m * 60;
    const label = `${m}:${(step < 1 ? s.toFixed(1) : String(Math.round(s))).padStart(step < 1 ? 4 : 2, '0')}`;
    ticks.push(`<line x1="${f(x(t))}" x2="${f(x(t))}" y1="24" y2="${H - 10}" class="grid"/><text x="${f(x(t))}" y="16" class="tick" text-anchor="middle" direction="ltr">${label}</text>`);
  }
  const guide = rows.map(r => `<text x="${W - 10}" y="${r.y + r.h / 2 + 4}" class="lane-name" text-anchor="start">${r.name}</text><line x1="${LEFT}" x2="${W - GUTTER}" y1="${r.y + r.h / 2}" y2="${r.y + r.h / 2}" class="rail"/>`).join('');
  const empty = (row, message) => `<text x="${W - GUTTER - 14}" y="${row.y + row.h / 2 + 4}" class="lane-empty" text-anchor="start">${message}</text>`;
  const shotMarks = shots.map((s, i) => {
    const right = x(s.start), left = x(s.end), w = Math.max(2, right - left - 1.5);
    const tag = w > 40 ? `<text x="${f(left + w / 2)}" y="${rows[0].y + 19.5}" class="shot-id" text-anchor="middle" direction="ltr">${esc(s.id)}</text>` : '';
    return `<rect x="${f(left)}" y="${rows[0].y}" width="${f(w)}" height="${rows[0].h}" rx="5" class="shot shot-${i % 2}${pend(s.camera)}"><title>${esc(s.id)} · ${esc(plain(CAMERA_LABELS, s.camera?.label))}</title></rect>${tag}`;
  }).join('');
  // A change inside a panel is a hollow box; a full-frame cut is a solid line across the lane.
  const cutMarks = list(b.cuts).map(c => (isRegion(c)
    ? `<rect x="${f(x(c.t) - 4.5)}" y="${rows[1].y + 2.5}" width="9" height="9" rx="2" class="cutbox${pend(c)}"><title>${isPartialSwap(c) ? PARTIAL_SWAP : `${esc(plain(CUT_KINDS, c.kind))} ${REGION_TAG}`} ${hms(c.t) ?? ''}</title></rect>`
    : `<line x1="${f(x(c.t))}" x2="${f(x(c.t))}" y1="${rows[1].y - 2}" y2="${rows[1].y + rows[1].h + 2}" class="cutmark${pend(c)}"><title>${esc(plain(CUT_KINDS, c.kind))} ${hms(c.t) ?? ''}</title></line>`)).join('');
  const transitionMarks = list(b.transitions).map(r => `<rect ${span(r.start, r.end, 6)} y="${rows[1].y + (isRegion(r) ? 2.5 : 0)}" height="${rows[1].h - (isRegion(r) ? 5 : 0)}" rx="3" class="${isRegion(r) ? 'transbox' : 'trans'}${pend(r)}"><title>${esc(plain(TRANSITION_KINDS, r.kind))}${isRegion(r) ? ` ${REGION_TAG}` : ''} ${hms(r.start) ?? ''}</title></rect>`).join('');
  const punchMarks = list(b.events).map(e => `<path d="M${f(x(e.t))} ${rows[1].y - 3}l5 ${rows[1].h / 2 + 3}l-5 ${rows[1].h / 2 + 3}l-5 -${rows[1].h / 2 + 3}z" class="punch${pend(e)}"><title>${esc(plain(CUT_KINDS, e.kind))} ${hms(e.t) ?? ''}</title></path>`).join('');
  const lane = rows[2];
  const barHeight = dense ? DOTS - 2 : pack.rows === 1 ? lane.h : SUB;
  const barY = cue => (dense ? lane.y : lane.y + cue.row * (SUB + SUB_GAP));
  const cueMarks = dense
    ? pack.bands.map(band => {
      const right = x(band.start), left = Math.min(x(band.end), right - 2), w = right - left, y = lane.y + DOTS, h = lane.h - DOTS;
      const count = w >= 15 ? `<text x="${f(left + w / 2)}" y="${y + h / 2 + 4}" class="cue-n" text-anchor="middle" direction="ltr">${band.key}</text>` : '';
      return `<rect x="${f(left)}" y="${y}" width="${f(w)}" height="${h}" class="cue-band" style="fill-opacity:${(0.18 + 0.5 * band.key / pack.peak).toFixed(2)}"><title>${band.key} ظاهرين مع بعض ${hms(band.start) ?? ''}</title></rect>${count}`;
    }).join('') + pack.unsure.map(run => `<line x1="${f(x(run.end))}" x2="${f(x(run.start))}" y1="${lane.y + lane.h + 3}" y2="${lane.y + lane.h + 3}" class="cue-unsure pend"/>`).join('')
    : pack.cues.map(cue => `<rect ${span(cue.t.start, cue.t.end)} y="${f(barY(cue))}" height="${barHeight}" rx="${f(barHeight / 2)}" class="cue${cue.t.kind === 'scene-text' ? ' cue-scene' : ''}${pend(cue.t)}"><title>${esc(clip(cue.t.text, 120))}</title></rect>`).join('');
  // A change inside a text element sits on that element's own bar.
  const changes = pack.cues.flatMap(cue => list(cue.t.events).filter(e => fin(e.t)).map(e => {
    const line = lineOf(cue.t, e);
    return `<circle cx="${f(x(e.t))}" cy="${f(barY(cue) + barHeight / 2)}" r="${!dense && barHeight > SUB ? 3.4 : 2.9}" class="cue-ev${pend(e)}"><title>${esc(plain(TEXT_EVENT_KINDS, e.kind))}${line ? ` · السطر ${line.n}` : ''} ${hms(e.t) ?? ''}</title></circle>`;
  }));
  const textMarks = cueMarks + changes.join('');
  const overlayMarks = list(b.overlays).map(o => `<rect ${span(o.start, o.end)} y="${rows[3].y}" height="${rows[3].h}" rx="3" class="over${pend(o)}"><title>${esc(plain(OVERLAY_KINDS, o.kind))}</title></rect>`).join('');
  const speechMarks = silent ? '' : sound?.speech
    ? list(sound.speech.spans).map(s => `<rect ${span(s.start, s.end, 2)} y="${rows[4].y}" height="${rows[4].h}" rx="6" class="speech"/>`).join('')
    : empty(rows[4], NOT_MEASURED);
  const sfxMarks = silent ? '' : list(sound?.sfx).map(s => `<circle cx="${f(x(s.t))}" cy="${rows[5].y + rows[5].h / 2}" r="6.5" class="hit${pend(s)}"><title>${esc(plain(SFX_TYPES, s.type))} ${hms(s.t) ?? ''}</title></circle>`).join('');
  const beatMarks = silent ? '' : list(sound?.beats).filter(fin).map(t => `<line x1="${f(x(t))}" x2="${f(x(t))}" y1="${rows[6].y}" y2="${rows[6].y + rows[6].h}" class="beat"/>`).join('');
  const silence = silent ? `<rect x="${LEFT}" y="${rows[4].y - 6}" width="${PLOT}" height="${rows[6].y + rows[6].h - rows[4].y + 12}" rx="8" class="mute"/>${empty(rows[5], 'المرجع من غير صوت')}` : '';
  const notes = [
    [...list(b.cuts), ...list(b.transitions)].some(isRegion) ? 'المربع الفاضي في صف القطعات تغيير جوه لوحة وباقي الصورة ثابت، والخط الكامل قطع على الصورة كلها.' : '',
    list(b.cuts).some(isPartialSwap) ? 'المربع الفاضي ممكن يكون تبديل جزئي: جزء من الصورة اتغيّر واللقطة كمّلت.' : '',
    !dense && pack.rows > 1 ? 'الكلام اللي ظاهر مع بعض في نفس الوقت، كل واحد منه على سطر لوحده.' : '',
    dense ? `الكلام هنا متزاحم، فالشريط بيغمق كل ما الكلام يكتر، والرقم هو عدد اللي ظاهرين مع بعض (أكتر حاجة ${num(pack.peak, 0)}). الخط المتقطّع تحت الشريط معناه إن فيه كلام محتاج تأكيد في الحتة دي.` : '',
    !dense && pack.cues.some(c => c.t.kind === 'scene-text') ? 'الشريط الفاتح كلام مكتوب جوه اللقطة نفسها.' : '',
    changes.length ? `النقط اللي ${dense ? 'فوق' : 'على'} شريط الكلام لحظات اتغيّر فيها حاجة جوه نفس الكلام.` : '',
  ].filter(Boolean).join(' ');
  return `<div class="lanes-wrap"><svg class="lanes" viewBox="0 0 ${W} ${H}" role="img" aria-label="خط زمني للقطات والقطعات والكلام والمؤثرات، من اليمين للشمال">${ticks.join('')}${guide}${silence}${shotMarks}${transitionMarks}${cutMarks}${punchMarks}${textMarks}${overlayMarks}${speechMarks}${sfxMarks}${beatMarks}</svg></div>
<p class="hint">الوقت ماشي من اليمين للشمال. أي علامة بخط متقطّع محتاجة تأكيد. <span class="swipe">اسحب الخط الزمني بصباعك تشوف الباقي.</span></p>${notes ? `\n<p class="hint">${notes}</p>` : ''}`;
}

function stat(value, label, {sub = '', mark = '', id = null, na = false} = {}) {
  return `<div class="stat"${anchorAttr(id)}><b${na ? ' class="na"' : ''}>${value}</b><span class="lbl">${label}</span>${sub ? `<small>${sub}</small>` : ''}${mark}</div>`;
}

const table = (head, rows, emptyText) => (rows.length
  ? `<div class="table"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<p class="empty">${emptyText}</p>`);

function tempoStat(sound) {
  if (!sound) return {value: NOT_MEASURED, na: true};
  if (!fin(sound.tempo?.bpm) && ['too-short','no-pulses','low-confidence','no-audio','no steady beat measured'].includes(sound.tempoReason)) return {value: 'مفيش إيقاع ثابت متقاس', na: true};
  if (sound.hasAudio === false) return {value: 'مفيش صوت', na: true};
  if (fin(sound.tempo?.bpm)) return {value: num(sound.tempo.bpm, 0), na: false};
  if (sound.bed?.present === false && !isPending(sound.bed)) return {value: 'مفيش مزيكا', na: true};
  return {value: NOT_MEASURED, na: true};
}

const GEMINI_LINE = 'Gemini';
// What the listener (or the creator's ear) said about the sound, above the measured numbers. Model text is
// untrusted: only the Arabic description is shown, cut and escaped, never the English one.
const heardWords = value => (typeof value === 'string' && value.trim() ? '<bdi dir="auto">' + esc(clip(value, 120)) + '</bdi>' : '');
function listenerBlock(b, sound) {
  const l = b.listener && typeof b.listener === 'object' ? b.listener : null;
  const ears = [...list(sound.sfx), sound.bed, sound.tempo, sound.voice].filter(byEar).length;
  const earLine = ears ? ' صاحب الريل سمع ' + num(ears, 0) + ' ' + (ears === 1 ? 'بند' : 'بنود') + ' بنفسه.' : '';
  const kept = l && l.remoteDeleted === false ? '<p class="hint">' + KEPT_AR + '</p>' : '';
  const model = typeof l?.model === 'string' && l.model.trim() ? 'الموديل <bdi dir="ltr" class="nm">' + esc(clip(l.model, 40)) + '</bdi>' : '';
  if (l?.status === 'failed') {
    return '<div class="listen listen-fail"><p class="listen-h"><b>' + GEMINI_LINE + ' ماقدرش يسمع: ' + (own(LISTENER_FAILURES, l.code) ?? 'مشكلة مش معروفة') + '</b></p><p class="hint">باقي القياسات زي ما هي.' + (ears ? earLine : ' ومحدش سمع الصوت لسه.') + '</p>' + kept + '</div>';
  }
  if (l?.status !== 'merged') {
    return '<div class="listen listen-none"><p class="listen-h"><b>' + (ears ? 'الصوت اتقاس، و' + GEMINI_LINE + ' ما سمعهوش.' : 'الصوت اتقاس بس، ومحدش سمعه لسه.') + '</b>' + earLine + '</p></div>';
  }
  const est = l.estimateUsd ?? {}, typical = fin(est.usdTypical) ? est.usdTypical : null, most = fin(est.usdMax) ? est.usdMax : null;
  const cost = typical ?? most;
  const costLine = cost == null ? '' : 'التكلفة التقريبية ' + num(cost, 4) + ' دولار' + (typical != null && most != null && most !== typical ? ' (الحد الأقصى ' + num(most, 4) + ')' : '');
  const date = /^\d{4}-\d{2}-\d{2}/u.test(String(l.at ?? '')) ? 'يوم <bdi class="n">' + String(l.at).slice(0, 10) + '</bdi>' : '';
  const facts = [];
  const bed = sound.bed?.heard, tempo = sound.tempo, voice = sound.voice?.basis === 'heard' ? sound.voice : null;
  if (bed?.present === true) facts.push('المزيكا اللي اتسمعت: ' + (heardWords(bed.characterAr) || 'فيه مزيكا'));
  else if (bed?.present === false) facts.push('مفيش مزيكا اتسمعت تحت الكلام');
  if (fin(tempo?.heard?.bpm)) facts.push('سرعة المزيكا اللي اتسمعت: ' + num(tempo.heard.bpm, 0) + ' خبطة في الدقيقة' + (fin(tempo.bpm) ? ' (اتقاست ' + num(tempo.bpm, 0) + ')' : ''));
  if (voice?.present === true) facts.push('الصوت اللي اتسمع: ' + (heardWords(voice.characterAr) || 'فيه كلام'));
  else if (voice?.present === false) facts.push('مفيش كلام اتسمع');
  if (ears) facts.push('صاحب الريل سمع ' + num(ears, 0) + ' ' + (ears === 1 ? 'بند' : 'بنود') + ' بنفسه');
  return '<div class="listen listen-ok"><p class="listen-h"><b>اتسمع بـ ' + GEMINI_LINE + '</b> ' + chip({basis: 'heard', status: 'confirmed', confidence: 'medium'}) + '</p><p class="listen-meta">' + [model, date, costLine].filter(Boolean).join(' · ') + '</p>' + kept +
    (facts.length ? '<ul class="listen-facts">' + facts.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '') + '</div>';
}

// What the listener said about one sound effect, next to the row the studio measured.
function heardNote(x) {
  const verdict = x?.heard?.verdict;
  if (verdict === 'heard') {
    const other = heardType(x);
    return other ? 'اتقاس ' + label(SFX_TYPES, x.type) + ' · اتسمع ' + label(SFX_TYPES, other) : GEMINI_LINE + ' سمعه';
  }
  if (verdict === 'not-heard') return GEMINI_LINE + ' ماسمعوش';
  if (verdict === 'heard-only') return byEar(x) ? 'صاحب الريل سمعه بنفسه · وقته تقريبي' : GEMINI_LINE + ' بس اللي سمعه · وقته تقريبي';
  return '';
}

function soundSection(b, limitations, link) {
  const sound = b.sound ?? null;
  if (!sound) return `<p class="empty">الصوت ${NOT_MEASURED}.</p>`;
  if (sound.hasAudio === false) return '<p class="note">المرجع من غير صوت: مفيش مزيكا ولا مؤثرات ولا كلام نقيسهم. ده مش معناه إن الريل الأصلي كان ساكت، معناه إن الملف اللي اتحلل مفيهوش صوت.</p>';
  const bed = sound.bed ?? null, tempo = sound.tempo ?? null, beat = sound.cutsOnBeat ?? null, speech = sound.speech ?? null;
  const bedValue = bed?.present === true ? 'فيه' : bed?.present === false ? 'مفيش' : NOT_MEASURED;
  const bedSubBase = fin(bed?.speechToBedDb) ? `الكلام أعلى من المزيكا بـ <bdi class="n">${fmt(bed.speechToBedDb)} dB</bdi>` : bed && bed.present == null ? 'مفيش وقت كفاية من غير كلام عشان تتقاس' : '';
  const bedSub = [bedSubBase, earTag(bed)].filter(Boolean).join(' · ');
  const t = tempoStat(sound);
  const alternatives = list(tempo?.alternatives).filter(fin).slice(0, 2).map(v => num(v, 0));
  const tempoSub = [fin(tempo?.bpm) ? `خبطة في الدقيقة${alternatives.length ? ` · ممكن تتحس ${alternatives.join(' أو ')}` : ''}` : '', earTag(tempo)].filter(Boolean).join(' · ');
  const synced = beat?.synced === true ? 'أيوه' : fin(beat?.share) ? 'لأ' : NOT_MEASURED;
  const beatSub = fin(beat?.share) ? `${num(beat.share * 100, 0)}٪ من القطعات جاية على الخبطة` : '';
  const speechFailed = limitations.some(l => l.startsWith(SPEECH_FAILED));
  const speechSub = speech
    ? [fin(speech.words) ? `${num(speech.words, 0)} كلمة` : '', list(speech.pauses).length ? `${num(list(speech.pauses).length, 0)} وقفة طويلة` : '', fin(speech.uncertainWords) && speech.uncertainWords > 0 ? `${num(speech.uncertainWords, 0)} جملة مش مسموعة كويس` : ''].filter(Boolean).join(' · ')
    : speechFailed ? 'كتابة الكلام فشلت' : 'الكلام ما اتكتبش';
  const loud = fin(sound.loudness?.integratedLUFS) ? `<bdi class="n">${fmt(sound.loudness.integratedLUFS)} <i>LUFS</i></bdi>` : null;
  const sfx = list(sound.sfx);
  // A reported effect is never also listed as a possible one: the list and the count come from the cleaned list.
  const reportedIds = new Set(sfx.map(x => x?.id).filter(id => id != null));
  const allWeak = list(sound.sfxCandidates), weakSfx = allWeak.filter(x => !reportedIds.has(x?.id));
  const weakCount = fin(sound.candidateSfxCount) ? Math.max(0, sound.candidateSfxCount - (allWeak.length - weakSfx.length)) : weakSfx.length;
  const reportedCount = fin(sound.reportedSfxCount) ? sound.reportedSfxCount : sfx.length;
  const cards = [
    stat(bedValue, 'مزيكا تحت الكلام', {sub: bedSub, mark: chip(bed), id: bed ? 'sound.bed' : null, na: bed?.present == null}),
    stat(t.value, 'سرعة المزيكا', {sub: tempoSub, mark: tempo ? chip(tempo) : '', id: tempo ? 'sound.tempo' : null, na: t.na}),
    stat(synced, 'القطعات على الإيقاع', {sub: beatSub, na: synced === NOT_MEASURED}),
    stat(fin(speech?.wordsPerMinute) ? num(speech.wordsPerMinute, 0) : NOT_MEASURED, 'كلمة منطوقة في الدقيقة', {sub: speechSub, na: !fin(speech?.wordsPerMinute)}),
    stat(loud ?? NOT_MEASURED, 'علوّ الصوت', {na: !loud}),
    stat(fin(sound.hitsPerMinute) ? num(sound.hitsPerMinute) : NOT_MEASURED, 'مؤثر في الدقيقة', {sub: [reportedCount ? `${num(reportedCount, 0)} مؤثر في الريل كله` : '', weakCount > 0 ? `و${num(weakCount, 0)} صوت ضعيف ممكن، اسمعه` : ''].filter(Boolean).join(' · '), na: !fin(sound.hitsPerMinute)}),
  ].join('');
  const ordered = sfx.map((x, i) => ({x, i})).sort((p, q) => (fin(p.x.t) ? p.x.t : Infinity) - (fin(q.x.t) ? q.x.t : Infinity) || p.i - q.i).map(e => e.x);
  const rows = ordered.map(x => {
    const anchor = x.anchor ? `مع ${label(ANCHOR_KINDS, x.anchor.kind)} ${link(x.anchor.id)}` : 'لوحده، مش مع حدث في الصورة';
    const extra = [anchor, x.onBeat === true ? 'على الخبطة' : '', earTag(x)].filter(Boolean).join(' · ');
    return `<tr${anchorAttr(x.id)}><td>${time(x.t)}${x.heard?.verdict === 'heard-only' ? '<small>وقته تقريبي</small>' : ''}</td><td><b>${word(SFX_TYPES, x.type)}</b><small>${extra}</small>${heardNote(x) ? `<small class="hn">${heardNote(x)}</small>` : ''}</td><td>${chip(x)}</td></tr>`;
  });
  // The strongest weak sounds only, back in time order; the rest are counted, not listed.
  const byTime = (p, q) => (fin(p.t) ? p.t : Infinity) - (fin(q.t) ? q.t : Infinity);
  const shownWeak = weakSfx.slice().sort((p, q) => (fin(q.strength) ? q.strength : 0) - (fin(p.strength) ? p.strength : 0)).slice(0, POSSIBLE_SFX_LIMIT).sort(byTime);
  const weakRows = shownWeak.map(x => `<tr><td>${time(x.t)}</td><td><b>${word(SFX_TYPES, x.type)}</b><small>تخمين ضعيف، مش متأكدين إنه مؤثر</small></td><td>${chip(x)}</td></tr>`);
  const weakBlock = weakCount > 0 ? `<h3>مؤثرات ممكنة، اسمعها <span class="count">${num(weakCount, 0)}</span></h3><p class="lead">دي أصوات ضعيفة ما اتحسبتش مؤثرات وما دخلتش في الأرقام اللي فوق. اسمع الريل في اللحظات دي وقرر.</p>${table(['الوقت', 'النوع', 'الحالة'], weakRows, '')}${weakCount > weakRows.length ? `<p class="hint">وفيه ${num(weakCount - weakRows.length, 0)} أضعف من كده ما اتعرضوش.</p>` : ''}` : '';
  const pendingAudio = sfx.some(isPending) || isPending(bed) || isPending(tempo);
  return `${listenerBlock(b, sound)}
<div class="stats stats-3">${cards}</div>
<h3>المؤثرات الصوتية</h3>
${table(['الوقت', 'النوع', 'الحالة'], rows, 'مفيش مؤثرات صوتية اتلقطت.')}
${weakBlock}
${pendingAudio ? '<p class="hint">بنود الصوت اللي محتاجة تأكيد بتتحسم بالسمع بس؛ الصور لوحدها ما تأكدش صوت.</p>' : ''}`;
}

// A studio code (style id, scene family, CLI flag) stays left to right inside an Arabic line.
const code = value => `<bdi dir="ltr"><code>${esc(value)}</code></bdi>`;
const SIZES = {close: 'قريب', medium: 'متوسط', wide: 'بعيد', none: 'مفيش وش'};
const FEATURE_AR = {
  presenter: {none: 'مفيش متكلم ظاهر', some: 'المتكلم بيظهر في جزء', most: 'المتكلم ظاهر أغلب الوقت'},
  ground: {light: 'أرضية فاتحة', mixed: 'أرضية بين الفاتح والغامق', dark: 'أرضية غامقة'},
  pace: {slow: 'إيقاع هادي', medium: 'إيقاع متوسط', fast: 'إيقاع سريع'},
  text: {low: 'كلام مكتوب قليل', medium: 'كلام مكتوب متوسط', high: 'كلام مكتوب كتير'},
  framed: {yes: 'محتوى بيتغيّر جوه إطار', no: 'من غير إطار جوه الصورة'},
  list: {yes: 'قايمة بتتعد', no: 'من غير قايمة'},
  captions: {yes: 'فيه ترجمة كلام', no: 'من غير ترجمة كلام'},
  look: {natural: 'ألوان طبيعية', warm: 'ألوان دافية', cool: 'ألوان باردة', muted: 'ألوان هادية', vivid: 'ألوان زاهية', bw: 'أبيض وأسود', 'teal-orange': 'تركواز وبرتقالي'},
};
const featurePhrase = (key, value) => own(own(FEATURE_AR, key) ?? {}, value);

// `null` means the measurement did not run; a measured zero is a real answer and reads as one.
function presenterBlock(p) {
  if (!p) return `<div class="stats stats-3">${stat(NOT_MEASURED, 'نسبة ظهوره', {na: true, sub: 'ما اتقاستش، والسبب مكتوب في «قبل ما تستخدم التقرير»', mark: chip(null)})}</div>`;
  const known = fin(p.share), spans = list(p.spans).length;
  const subs = [
    fin(p.samples) ? `من ${num(p.samples, 0)} فريم اتشافوا` : 'من الفريمات اللي اتشافت',
    fin(p.multiFaceShare) && p.multiFaceShare > 0 ? `أكتر من وش في ${num(p.multiFaceShare * 100, 0)}٪` : '',
    p.reviewVerdict && p.share === 0 ? 'المراجعة بالعين: مفيش شخص حقيقي' : '',
  ].filter(Boolean).join(' · ');
  const size = own(SIZES, p.size);
  return `<div class="stats stats-3">${stat(known ? `${num(Math.round(p.share * 100), 0)}٪` : NOT_MEASURED, 'نسبة ظهوره', {sub: subs, mark: chip(p), id: 'presenter', na: !known})}${stat(size ?? NOT_MEASURED, 'حجم الوش', {na: !size || p.size === 'none', sub: fin(p.faceHeight) ? `الوش حوالي ${num(p.faceHeight * 100, 0)}٪ من ارتفاع الصورة` : ''})}${stat(num(spans, 0), 'مرات الظهور', {sub: spans ? 'كل مرة وش فضل ظاهر ورا بعض' : ''})}</div>`;
}

// The recipe is a reading of the measured breakdown, so every card carries the "inferred" chip.
function recipeSection(r) {
  if (!r || typeof r !== 'object') return '';
  const inferred = chip({basis: 'inferred', status: 'confirmed'});
  const features = r.features ?? {};
  const card = (title, body, mark = inferred) => `<div class="recipe-card"><h3>${title} ${mark}</h3>${body}</div>`;
  const phrases = keys => list(keys).map(k => featurePhrase(k, features[k])).filter(Boolean).join('، ');
  const n = r.style?.nearest ?? null;
  const why = phrases(n?.matched), miss = phrases(n?.missed);
  const alts = list(r.style?.alternatives).filter(a => a?.id).map(a => `${a.labelAr ? `${mixed(a.labelAr)} ` : ''}${code(a.id)}`).join('، ');
  const style = n?.id
    ? `<p class="recipe-pick"><b>${mixed(n.labelAr ?? n.label ?? '')}</b> ${code(n.id)}</p>${fin(n.score) && n.score <= 0 ? '<p class="hint">مفيش ستايل جاهز قريب أوي من الريل ده، وده أقربهم بس.</p>' : ''}${why ? `<p>علشان: ${why}.</p>` : ''}${miss ? `<p class="hint">مختلف في: ${miss}.</p>` : ''}${features.presenter === 'unknown' ? '<p class="hint">ظهور المتكلم ما اتقاسش، فالترتيب ده محسوب من غيره.</p>' : ''}${alts ? `<p class="hint">بدايل: ${alts}.</p>` : ''}`
    : `<p class="na">أقرب ستايل ${NOT_MEASURED}.</p>`;
  const rules = list(r.families);
  // A missing part of the recipe is "not measured"; only an explicit empty answer may say "none".
  const families = !Array.isArray(r.families) ? `<p class="na">المشاهد المناسبة ${NOT_MEASURED}ة.</p>` : rules.length
    ? `<ul class="recipe-list">${rules.map(f => {
      const scenes = list(f.families).filter(x => x?.id).map(x => `${code(x.id)}${x.onlyIn ? ` <small>(في ${code(x.onlyIn)} بس)</small>` : ''}`).join('، ');
      return `<li>${scenes}<p>${mixed(f.noteAr ?? '')}</p></li>`;
    }).join('')}</ul>`
    : '<p class="na">مفيش شكل معيّن في الريل يحتاج مشهد بعينه.</p>';
  const c = r.captions ?? {};
  // 'unknown' means the on-screen words only look like captions; nobody compared them with the audio yet.
  const candidate = c.present === true && features.captions === 'unknown';
  const captionLook = [
    c.presentation ? `شكل ${code(c.presentation)}${c.skin ? ` بلمسة ${code(c.skin)}` : ''}` : '',
    c.grouping ? `تجميع ${code(c.grouping)}${fin(c.wordsPerCue) ? ` (حوالي ${num(c.wordsPerCue, 0)} كلمة في السطر)` : ''}` : '',
    own(ZONES, c.zone) ? `مكانها ${ZONES[c.zone]}` : '',
  ].filter(Boolean).join('، ');
  const captions = candidate
    ? `<p>فيه كلام على الشاشة شكله ترجمة كلام، بس لسه ما اتقارنش بصوت الريل، فده مرشّح مش مؤكد.</p>${captionLook ? `<p>لو طلع ترجمة كلام فعلًا، شكلها: ${captionLook}.</p>` : ''}<p class="hint">قارن الكلام المكتوب بصوت الريل الأول. لحد ما يتأكد، سيب إعدادات الترجمة بتاعتك زي ما هي.</p>`
    : c.present
    ? `<p>${captionLook}.</p>${fin(c.pending) && c.pending > 0 ? `<p class="hint">${countPhrase(c.pending)} في الترجمة، فالشكل ده لسه مش مضمون.</p>` : ''}`
    : c.present === false ? '<p>مفيش ترجمة كلام في الريل ده، فسيب إعدادات الترجمة بتاعتك زي ما هي.</p>'
      : `<p class="na">شكل الترجمة ${NOT_MEASURED}، فسيب إعدادات الترجمة بتاعتك زي ما هي.</p>`;
  const s = r.sound ?? {};
  const band = s.band ?? {};
  const bandRange = Array.isArray(band.range) && band.range.length >= 2 && band.range.slice(0, 2).every(fin) ? ` (من ${num(band.range[0], 0)} لـ ${num(band.range[1], 0)} في الدقيقة)` : '';
  const bandKeys = list(band.keys).map(code).join(' / ');
  const under = fin(s.under?.value)
    ? `<p>ابدأ الميكس بـ ${code(`--under ${fmt(s.under.value, 0)}`)}${s.bed?.present === true ? '، لأن فيه مزيكا تحت الكلام' : s.under.value >= 9 ? '، لأن المؤثرات كتير' : '، لأن المؤثرات قليلة'}.${fin(s.sweeps) && s.sweeps > 0 ? ` فيه ${num(s.sweeps, 0)} صوت هوا (${mixed('whoosh')}): الاستوديو مبيحطّهمش غير لو البريف طلبهم.` : ''}</p>`
    : '';
  const sound = !s.measured
    ? `<p${s.reason === 'no-audio' ? '' : ' class="na"'}>${s.reason === 'no-audio' ? 'الريل ملوش صوت، فمفيش اقتراح للصوت.' : `الصوت ${NOT_MEASURED}، فمفيش اقتراح ليه.`}</p>`
    : `<p>${fin(s.hitsPerMinute) ? `${num(s.hitsPerMinute, 1)} مؤثر في الدقيقة` : `عدد المؤثرات ${NOT_MEASURED}`}${bandKeys ? `، وأقرب مدى في الاستوديو ${bandKeys}${bandRange}${band.inside === false ? '، والريل برّه المدى ده' : ''}` : ''}.</p>${under}`;
  return `<section id="recipe"><h2>تعمله إزاي في ريل ستوديو</h2><p class="lead">${mixed(r.noticeAr ?? '')}</p>
<div class="recipe">${card('أقرب ستايل', style)}${card('مشاهد تناسبه', families)}${card('الترجمة', captions, candidate ? chip({status: 'needs-confirmation'}) : inferred)}${card('الصوت', sound)}</div></section>`;
}

export function renderReport(breakdown, {stills = {}, fonts = false, recipe = null} = {}) {
  const b = breakdown ?? {};
  const shots = list(b.shots), cutsList = list(b.cuts), transitions = list(b.transitions), events = list(b.events);
  const text = list(b.text), overlays = list(b.overlays), limitations = list(b.limitations).map(String);
  const sound = b.sound ?? null, pace = b.pace ?? {};
  // Ids that have a row or card on this page, so a mention of one can link to it.
  const targets = new Set([...shots, ...cutsList, ...transitions, ...events, ...text, ...overlays, ...list(sound?.sfx), ...textEvents(b).map(x => x.e)].map(item => safeId(item?.id)).filter(Boolean));
  const link = id => (targets.has(id) ? `<a href="#i-${id}" class="id ref">${esc(id)}</a>` : idTag(id));
  const pending = pendingItems(b, link);
  const regionCuts = [...cutsList, ...transitions].filter(isRegion);
  const stillFor = id => (stills && typeof stills === 'object' && typeof id === 'string' && Object.hasOwn(stills, id) && localAsset(stills[id]) ? stills[id] : null);
  const ratio = /^(\d{2,5})x(\d{2,5})$/u.exec(String(b.aspect ?? ''));

  const film = shots.map(s => {
    const src = stillFor(s.id);
    const picture = src ? `<img src="${esc(src)}" alt="لقطة ${esc(s.id)}" loading="lazy">` : '<div class="ph" role="img" aria-label="مفيش صورة للّقطة دي"></div>';
    return `<figure class="frame${isPending(s.camera) ? ' frame-pend' : ''}">${picture}<figcaption><b>${idTag(s.id)}</b><span>${time(s.start)}${fin(s.len) ? ` · ${num(s.len, 2)} ث` : ''}</span><span>${word(CAMERA_LABELS, s.camera?.label)}</span></figcaption></figure>`;
  }).join('');

  // A change inside a framed panel says so, with a small map of where the panel sits in the frame.
  const panel = item => {
    if (!isRegion(item)) return item?.scope && item.scope !== 'frame' ? `<small>النطاق: <bdi>${esc(item.scope)}</bdi></small>` : '';
    const where = place(item.box);
    return ` <span class="scope"${where ? ` title="اللوحة ${where}"` : ''}>${boxMap(item.box, ratio, 11)}${REGION_TAG}</span>`;
  };
  // A partial swap shows where in the frame it happened, says the shot went on, and keeps its review chip.
  const partialPanel = item => {
    const where = place(item.box);
    const proved = item.evidence && typeof item.evidence === 'object' && item.evidence.qualified === true ? ' الجزء ده كان ثابت قبل التبديل وبعده.' : '';
    return ` <span class="scope"${where ? ` title="${where}"` : ''}>${boxMap(item.box, ratio, 11)}${where ? esc(where) : ''}</span><small>${PARTIAL_NOTE}${proved}</small>`;
  };
  const possibleCuts = list(b.cutCandidates).slice().sort((p, q) => (fin(p.t) ? p.t : Infinity) - (fin(q.t) ? q.t : Infinity));
  const possibleCutRows = possibleCuts.map(c => {
    const textId = typeof c.captionEvidence?.textId === 'string' ? c.captionEvidence.textId : null;
    const where = place(c.box);
    return `<tr><td>${time(c.t)}</td><td><b>قطع ممكن</b>${validBox(c.box) ? ` <span class="scope"${where ? ` title="${where}"` : ''}>${boxMap(c.box, ratio, 11)}${where ? esc(where) : ''}</span>` : ''}<small>${POSSIBLE_CUT_NOTE}${textId ? ` الكلام: ${link(textId)}` : ''}</small></td><td>${chip(c)}</td></tr>`;
  });
  const cutRows = [
    ...cutsList.map(c => ({t: c.t, html: `<tr${anchorAttr(c.id)}><td>${time(c.t)}</td><td><b>${isPartialSwap(c) ? PARTIAL_SWAP : word(CUT_KINDS, c.kind)}</b>${isPartialSwap(c) ? partialPanel(c) : panel(c)}${fin(c.scale) ? `<small>تكبير ${times(c.scale)}</small>` : ''}</td><td>${chip(c)}</td></tr>`})),
    ...transitions.map(r => ({t: r.start, html: `<tr${anchorAttr(r.id)}><td>${rangeCell(r.start, r.end)}</td><td><b>${word(TRANSITION_KINDS, r.kind)}</b>${panel(r)}${r.direction ? `<small>${word(DIRECTIONS, r.direction)}</small>` : ''}</td><td>${chip(r)}</td></tr>`})),
  ].sort((a, z) => (fin(a.t) ? a.t : Infinity) - (fin(z.t) ? z.t : Infinity)).map(r => r.html);

  const cameraRows = shots.map(s => {
    const cam = s.camera ?? null;
    const extra = [cam?.kenBurns ? 'بطيء وناعم' : '', fin(cam?.zoomPerSec) && Math.abs(cam.zoomPerSec) >= 0.005 ? `زووم ${num(Math.abs(cam.zoomPerSec) * 100)}٪ في الثانية` : ''].filter(Boolean).join(' · ');
    return `<tr${anchorAttr(s.id)}><td>${idTag(s.id)}<small>${time(s.start)}</small></td><td><b>${word(CAMERA_LABELS, cam?.label)}</b>${extra ? `<small>${extra}</small>` : ''}</td><td>${chip(cam)}</td></tr>`;
  });
  const punchRows = events.map(e => {
    const extra = [fin(e.scale) ? `تكبير ${times(e.scale)}` : '', e.shotId ? `جوه ${idTag(e.shotId)}` : ''].filter(Boolean).join(' · ');
    return `<tr${anchorAttr(e.id)}><td>${time(e.t)}</td><td><b>${word(CUT_KINDS, e.kind)}</b>${extra ? `<small>${extra}</small>` : ''}</td><td>${chip(e)}</td></tr>`;
  });

  const cues = text.map(t => {
    const colours = [swatch(t.style?.fill, 'لون الكلام'), swatch(t.style?.stroke, 'الإطار'), swatch(t.style?.box, 'الخلفية'), swatch(t.style?.highlight, 'كلمة مميزة')].join('');
    const size = fin(t.sizePct) ? ` · حجمه ${num(t.sizePct * 100)}٪ من ارتفاع الصورة` : '';
    const changes = list(t.events).map(e => {
      const line = lineOf(t, e);
      const where = line ? ` · السطر ${num(line.n, 0)}${line.words ? `: «<bdi>${esc(clip(line.words, 60))}</bdi>»` : ''}` : '';
      return `<li${anchorAttr(e.id)}${isPending(e) ? ' class="is-pend"' : ''}><span class="ev-t">${time(e.t)}</span><b>${word(TEXT_EVENT_KINDS, e.kind)}</b>${chip(e)}<small>${idTag(e.id)}${where}</small></li>`;
    });
    const changeBlock = changes.length ? `<div class="evs"><p class="evs-h">تغييرات جوه نفس الكلام <span class="count">${num(changes.length, 0)}</span></p><ol class="ev-list">${changes.join('')}</ol></div>` : '';
    return `<article class="cue-card${isPending(t) ? ' is-pend' : ''}${changes.length ? ' cue-wide' : ''}"${anchorAttr(t.id)}>
<div class="cue-top"><span>${idTag(t.id)} ${range(t.start, t.end)}</span>${chip(t)}</div>
<div class="cue-body"><div class="cue-main"><p class="words" dir="auto">${esc(t.text).replace(/\r?\n/gu, '<br>')}</p>
<p class="cue-meta">${word(ZONES, t.zone)} · ${captionCandidate(t) ? CAPTION_CANDIDATE : word(TEXT_KINDS, t.kind)}${size}</p>
<p class="cue-meta">الدخول: ${word(ENTRANCES, t.entrance)} · الخروج: ${word(EXITS, t.exit)}</p>
${fontLine(t.font)}
${t.reading ? `<p class="cue-meta">القراية: ${word(READINGS, t.reading)}</p>` : ''}
${colours ? `<div class="sws">${colours}</div>` : `<p class="cue-meta na">ألوان الكلام ${NOT_MEASURED}ة</p>`}</div>${changeBlock}</div>
</article>`;
  }).join('');

  const overlayRows = overlays.map(o => {
    const inside = regionCuts.filter(c => sameBox(c.box, o.box)).length;
    const extra = [place(o.box) ?? '', o.shotId ? `جوه ${idTag(o.shotId)}` : ''].filter(Boolean).join(' · ');
    const map = boxMap(o.box, ratio);
    // The reason it was detected is a full sentence, so it gets the whole width of the table under its row.
    const note = [
      typeof o.evidence === 'string' && o.evidence.trim() ? own(EVIDENCE, o.evidence) ?? `<bdi dir="auto">${esc(clip(o.evidence, 200))}</bdi>` : '',
      inside ? `التغييرات اللي اتلقطت جوه نفس اللوحة: ${num(inside, 0)}.` : '',
    ].filter(Boolean).join(' ');
    return `<tr${anchorAttr(o.id)}${note ? ' class="has-note"' : ''}><td>${rangeCell(o.start, o.end)}</td><td><b>${word(OVERLAY_KINDS, o.kind)}</b>${extra || map ? `<small class="where">${map}<span>${extra}</span></small>` : ''}</td><td>${chip(o)}</td></tr>${note ? `<tr class="note-row"><td class="wide" colspan="3">${note}</td></tr>` : ''}`;
  });

  const tempo = tempoStat(sound);
  const silent = sound?.hasAudio === false;
  const headline = [
    stat(num(shots.length, 0), 'عدد اللقطات'),
    stat(fin(pace.cutsPerMinute) ? num(pace.cutsPerMinute) : NOT_MEASURED, 'قطعة في الدقيقة', {na: !fin(pace.cutsPerMinute), sub: regionCuts.length ? `${REGION_TAG} بس: ${num(regionCuts.length, 0)} من ${num(cutsList.length + transitions.length, 0)}` : ''}),
    stat(fin(pace.shotLen?.median) ? `${num(pace.shotLen.median, 2)} <i>ث</i>` : NOT_MEASURED, 'طول اللقطة الوسطاني', {na: !fin(pace.shotLen?.median), sub: fin(pace.shotLen?.min) && fin(pace.shotLen?.max) ? `من ${num(pace.shotLen.min, 2)} لـ ${num(pace.shotLen.max, 2)} ث` : ''}),
    stat(num(text.length, 0), 'كلام على الشاشة'),
    stat(tempo.value, 'سرعة المزيكا (BPM)', {na: tempo.na}),
    stat(silent ? 'مفيش صوت' : fin(sound?.hitsPerMinute) ? num(sound.hitsPerMinute) : NOT_MEASURED, 'مؤثر صوتي في الدقيقة', {na: silent || !fin(sound?.hitsPerMinute)}),
  ].join('');

  const meta = [
    fin(b.durationSec) ? `${num(b.durationSec)} ثانية` : '',
    ratio ? `<bdi class="n">${ratio[1]}×${ratio[2]}</bdi>` : '',
    /^\d{4}-\d{2}-\d{2}/u.test(String(b.analysedAt ?? '')) ? `اتحلل يوم <bdi class="n">${String(b.analysedAt).slice(0, 10)}</bdi>` : '',
  ].filter(Boolean).map(item => `<span class="mi">${item}</span>`).join('');
  // A file name is Latin, emoji and punctuation in any mix. It reads left to right on one line and is cut
  // with an ellipsis; the whole name stays in the tooltip and is written out in full at the foot of the page.
  const sourceName = typeof b.source?.name === 'string' && b.source.name.trim() ? b.source.name.trim() : '';
  const fileLine = sourceName ? `<p class="file" dir="ltr" title="${esc(sourceName)}">${esc(sourceName)}</p>` : '';

  const banner = pending.length
    ? `<a class="banner banner-pend" href="#confirm"><b>${countPhrase(pending.length)}</b><span>نتايج الاستوديو مش متأكد منها. القايمة كلها تحت، وكل بند مكتوب جنبه تتأكد منه إزاي.</span></a>`
    : '<div class="banner banner-ok"><b>مفيش بنود محتاجة تأكيد</b><span>كل اللي في التقرير اتقاس أو اتراجع.</span></div>';

  const confirmList = pending.map(p => {
    const target = safeId(p.id);
    const tag = target ? `<a href="#i-${target}" class="id">${p.tag ?? esc(p.id)}</a>` : idTag(p.id);
    return `<li><div class="c-head">${tag}<span class="c-what">${p.what}</span>${p.when ? `<span class="c-when">${p.when}</span>` : ''}</div><p>${p.audio ? '<span class="ear">بالسمع</span>' : '<span class="eye">بالعين</span>'}${p.why ? `<span class="c-why">${p.why}.</span> ` : ''}${p.how}</p></li>`;
  }).join('');

  // A failed transcription already says the speech was not written down, so the plain note would only repeat it.
  const failedSpeech = limitations.some(l => l.startsWith(SPEECH_FAILED));
  const limitationItems = [...new Set(limitations)].filter(l => !(failedSpeech && l === 'Speech was not transcribed.')).map(l => `<li>${limitationText(l)}</li>`).join('');
  const face = (subset, weight, unicodeRange) => `@font-face{font-family:"Reel Cairo";src:url(assets/Cairo-${subset}-${weight}.woff2) format("woff2");font-weight:${weight};font-display:swap;unicode-range:${unicodeRange}}`;
  const ARABIC_RANGE = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
  const LATIN_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-200B,U+2012-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const fontFace = fonts
    ? [400, 700].map(w => face('arabic', w, ARABIC_RANGE)).join('') + (fonts !== true && fonts.latin ? [400, 700].map(w => face('latin', w, LATIN_RANGE)).join('') : '')
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<title>تفكيك الريل المرجعي</title>
<style>${fontFace}
:root{color-scheme:light dark;--bg:#f5f1ea;--card:#fffdf8;--ink:#1c1a17;--muted:#6b655c;--line:#e3dccf;--soft:#efe9de;--accent:#c8431b;--measure:#23678f;--ok:#2c7a4b;--warn:#955600;--warn-bg:#fbefd6;--ok-bg:#e6f2e9;--shadow:0 1px 2px rgba(60,45,20,.06)}
@media (prefers-color-scheme: dark){:root{--bg:#121110;--card:#1b1917;--ink:#f0ebe2;--muted:#a8a095;--line:#322e29;--soft:#24211e;--accent:#ff7d52;--measure:#74b6e0;--ok:#6fc490;--warn:#f2b450;--warn-bg:#2b2211;--ok-bg:#15251b;--shadow:none}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 "Reel Cairo",Cairo,"Segoe UI",Tahoma,sans-serif;overflow-wrap:break-word}
main{max-width:1060px;margin:0 auto;padding:32px 16px 72px}
bdi.n,.n{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
.na{color:var(--muted);font-weight:400}
.sep{margin:0 5px;color:var(--muted)}
.id{display:inline-block;direction:ltr;font-size:12px;font-weight:700;line-height:1.5;padding:0 7px;border-radius:6px;background:var(--soft);color:var(--muted);text-decoration:none;vertical-align:1px}
a.id{color:var(--warn);background:var(--warn-bg)}a.id.ref{color:var(--measure);background:var(--soft);text-decoration:underline;text-underline-offset:2px}
.scope{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;line-height:1.6;padding:2px 8px;border-radius:8px;background:var(--soft);vertical-align:middle;white-space:nowrap;margin-inline-start:4px}
.where{display:flex!important;align-items:center;gap:8px}.where span{min-width:0}
.map{flex:none;display:block}.map rect{fill:var(--soft);stroke:var(--muted);stroke-width:1}.map rect.in{fill:var(--ink);stroke:none}
.eyebrow{display:inline-block;font-size:13px;font-weight:700;color:var(--accent);margin:0 0 6px}
header h1{font-size:clamp(30px,7vw,48px);line-height:1.25;margin:0 0 10px;font-weight:700;letter-spacing:0}
.meta{color:var(--muted);margin:0;font-size:14px;line-height:2;display:flex;flex-wrap:wrap;gap:0 18px}.mi{white-space:nowrap}.rng{white-space:nowrap}
.file{margin:0;font-size:14px;line-height:2;font-weight:700;color:var(--ink);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.banner{display:block;margin:22px 0 0;padding:14px 16px;border-radius:14px;border:1px solid;text-decoration:none;color:inherit}
.banner b{display:block;font-size:18px;line-height:1.5}.banner span{font-size:14px;color:var(--muted)}
.banner-pend{background:var(--warn-bg);border-color:color-mix(in srgb,var(--warn) 35%,transparent)}.banner-pend b{color:var(--warn)}
.banner-ok{background:var(--ok-bg);border-color:color-mix(in srgb,var(--ok) 35%,transparent)}.banner-ok b{color:var(--ok)}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 14px 12px;box-shadow:var(--shadow);min-width:0;scroll-margin-top:16px}
.stat b{display:block;font-size:30px;line-height:1.25;font-weight:700}.stat b.na{font-size:19px;line-height:2;font-weight:700}
.stat b i{font-style:normal;font-size:15px;color:var(--muted);font-weight:400}
.stat .lbl{display:block;color:var(--muted);font-size:13px;line-height:1.6}.stat small{display:block;color:var(--muted);font-size:12px;line-height:1.6;margin-top:4px}
.stat .chip{margin-top:8px}
.key{display:flex;flex-wrap:wrap;gap:8px 16px;margin:16px 0 0;padding:0;list-style:none;font-size:13px;color:var(--muted)}
.key li{display:flex;align-items:center;gap:6px}
section{margin-top:44px}
h2{font-size:22px;line-height:1.5;margin:0 0 4px;font-weight:700;display:flex;align-items:center;gap:10px}
h2::before{content:"";flex:none;width:6px;height:22px;border-radius:3px;background:var(--accent)}
h2 .count{font-size:13px;font-weight:400;color:var(--muted);background:var(--soft);border-radius:999px;padding:0 10px}
h3{font-size:16px;margin:22px 0 8px;font-weight:700}
.lead{color:var(--muted);font-size:14px;margin:0 0 14px}
.hint{color:var(--muted);font-size:13px;margin:8px 0 0}.swipe{display:none}
.empty,.note{background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:14px 16px;color:var(--muted);font-size:14px;margin:0}
.film{display:flex;gap:10px;overflow-x:auto;padding:2px 0 10px;scroll-snap-type:x proximity;scrollbar-width:thin}
.frame{margin:0;flex:0 0 128px;scroll-snap-align:start;min-width:0}
.frame img,.frame .ph{width:100%;height:auto;border-radius:10px;border:1px solid var(--line);background:var(--soft);display:block}
.frame .ph{aspect-ratio:${ratio ? `${ratio[1]}/${ratio[2]}` : '9/16'};background:repeating-linear-gradient(135deg,var(--soft) 0 8px,var(--card) 8px 16px)}
.frame-pend img,.frame-pend .ph{border:2px dashed var(--warn)}
.frame figcaption{font-size:12px;line-height:1.6;color:var(--muted);margin-top:6px}.frame figcaption span{display:block}
.lanes-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);scrollbar-width:thin}
.lanes{display:block;width:100%;min-width:860px;height:auto;font-family:inherit}
.lanes .grid{stroke:var(--line);stroke-width:1}.lanes .rail{stroke:var(--line);stroke-width:1;stroke-dasharray:2 5}
.lanes .tick{fill:var(--muted);font-size:11px}.lanes .lane-name{fill:var(--muted);font-size:12px}.lanes .lane-empty{fill:var(--muted);font-size:12px}
.lanes .shot-0{fill:var(--measure)}.lanes .shot-1{fill:var(--measure);fill-opacity:.62}.lanes .shot-id{fill:var(--card);font-size:11px;font-weight:700;pointer-events:none}
.lanes .cutmark{stroke:var(--ink);stroke-width:2.5;stroke-linecap:round}.lanes .trans{fill:var(--ink);fill-opacity:.38}.lanes .punch{fill:var(--accent)}
.lanes .cutbox,.lanes .transbox{fill:var(--card);stroke:var(--ink);stroke-width:2}
.lanes .cue{fill:var(--accent)}.lanes .cue-scene{fill-opacity:.45}.lanes .cue-band{fill:var(--accent)}.lanes .cue-n{fill:var(--ink);font-size:11px;font-weight:700;pointer-events:none}
.lanes .cue-ev{fill:var(--card);stroke:var(--ink);stroke-width:1}.lanes .over{fill:var(--ok)}.lanes .speech{fill:var(--muted);fill-opacity:.55}
.lanes .hit{fill:var(--warn)}.lanes .beat{stroke:var(--muted);stroke-width:1.5}.lanes .mute{fill:var(--soft)}
.lanes rect.pend,.lanes circle.pend,.lanes path.pend{fill-opacity:.22;stroke:var(--warn);stroke-width:1.8;stroke-dasharray:4 3}.lanes line.pend{stroke:var(--warn);stroke-dasharray:3 3}.lanes .cue-unsure{stroke-width:2}
.table{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font-size:12px;font-weight:400;color:var(--muted);background:var(--soft);white-space:nowrap}
td,th{padding:10px 12px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}tr:last-child td{border-bottom:0}
td small{display:block;color:var(--muted);font-size:12px;line-height:1.7;margin-top:2px}td b{font-size:15px}td:nth-child(2),th:nth-child(2){width:98%}
td:first-child,th:first-child{white-space:nowrap;width:1%;padding-inline-start:16px}td:last-child,th:last-child{text-align:end;white-space:nowrap;width:1%;padding-inline-end:16px}
tr.has-note td{border-bottom:0;padding-bottom:4px}td.wide{white-space:normal;width:auto;text-align:start;padding:0 16px 12px;color:var(--muted);font-size:13px}
tr[id],article[id],li[id]{scroll-margin-top:16px}tr:target td,article:target,.stat:target,.ev-list li:target{background:var(--warn-bg)}
.cues{display:grid;grid-template-columns:1fr;gap:10px}
.cue-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow);min-width:0}
.cue-card.is-pend{border-style:dashed;border-color:var(--warn)}
.cue-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.words{font-size:20px;line-height:1.6;font-weight:700;margin:8px 0 6px;overflow-wrap:anywhere}
.cue-meta{font-size:13px;color:var(--muted);margin:0}
.cue-main{min-width:0}.evs{min-width:0;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.evs-h{margin:0 0 6px;font-size:13px;font-weight:700}.evs-h .count{font-weight:400;color:var(--muted);background:var(--soft);border-radius:999px;padding:0 9px;margin-inline-start:4px}
.ev-list{list-style:none;margin:0;padding:0;max-height:660px;overflow-y:auto;scrollbar-width:thin}
.ev-list li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 10px;align-items:center;padding:7px 6px;border-bottom:1px solid var(--line);font-size:13px;border-radius:6px}.ev-list li:last-child{border-bottom:0}
.ev-list li.is-pend{outline:1px dashed var(--warn);outline-offset:-1px}
.ev-t{color:var(--muted);white-space:nowrap}.ev-list small{grid-column:2/-1;min-width:0;color:var(--muted);font-size:12px;line-height:1.7;overflow-wrap:anywhere}.ev-list small .id{margin-inline-end:2px}
.sws{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:12px;color:var(--muted)}
.sw{display:inline-flex;align-items:center;gap:6px}.sw i{width:18px;height:18px;border-radius:5px;border:1px solid var(--muted);flex:none}
.chip{display:inline-block;font-size:12px;line-height:1.7;padding:0 10px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 40%,transparent);background:color-mix(in srgb,currentColor 9%,transparent);white-space:nowrap}
.chip-measured{color:var(--measure)}.chip-seen,.chip-heard{color:var(--ok)}.chip-inferred,.chip-none{color:var(--muted)}.chip-none{border-style:dashed;background:none}
.chip-needs-confirmation{color:var(--warn);font-weight:700}
.look{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)}.look b{font-size:22px}
.confirm{list-style:none;margin:0;padding:0;background:var(--card);border:1px solid color-mix(in srgb,var(--warn) 40%,var(--line));border-radius:14px;box-shadow:var(--shadow)}
.confirm li{padding:12px 16px;border-bottom:1px solid var(--line)}.confirm li:last-child{border-bottom:0}
.c-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}.c-what{font-weight:700;overflow-wrap:anywhere;min-width:0}.c-when{font-size:13px;color:var(--muted)}
.confirm p{margin:4px 0 0;font-size:14px;color:var(--muted)}.c-why{color:var(--ink)}
.ear,.eye{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:0 7px;margin-inline-end:8px}
.ear{background:var(--warn-bg);color:var(--warn)}.eye{background:var(--soft);color:var(--muted)}
.limits{margin:10px 0 0;padding-inline-start:20px;font-size:14px;color:var(--muted)}
.recipe{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.recipe-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow);min-width:0}
.recipe-card h3{margin:0 0 8px;font-size:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.recipe-card h3 .chip{font-weight:400}
.recipe-card p{margin:4px 0;font-size:14px;overflow-wrap:anywhere}.recipe-card p.na{margin:0}.recipe-pick b{font-size:20px;margin-inline-end:6px}
.recipe-list{margin:0;padding:0;list-style:none}.recipe-list li{padding:8px 0;border-top:1px solid var(--line)}.recipe-list li:first-child{padding-top:0;border-top:0}.recipe-list li:last-child{padding-bottom:0}
.recipe-list p{margin:2px 0 0;color:var(--muted);font-size:13px}.recipe-list small{color:var(--muted);font-size:12px;white-space:nowrap}
.nm{font-weight:700;color:var(--ink);white-space:nowrap}
code{font:inherit;font-size:.92em;font-weight:700;background:var(--soft);border-radius:6px;padding:1px 6px;white-space:nowrap}
.listen{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px;box-shadow:var(--shadow);margin:0 0 4px;min-width:0}
.listen-meta{margin:2px 0 0;font-size:13px;color:var(--muted)}.listen .n{white-space:nowrap}.hn{color:var(--ink)!important}
.listen-h{margin:0;font-size:15px;line-height:1.9;overflow-wrap:anywhere}.listen-h b{margin-inline-end:6px}
.listen .hint{margin:4px 0 0}.listen-ok{border-inline-start:4px solid var(--ok)}.listen-fail{border-inline-start:4px solid var(--warn);background:var(--warn-bg)}.listen-none{border-style:dashed}
.listen-facts{margin:6px 0 0;padding:0;padding-inline-start:20px;font-size:14px;color:var(--muted)}.listen-facts li{overflow-wrap:anywhere}
.by{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:0 7px;background:var(--ok-bg);color:var(--ok);white-space:nowrap;margin-inline-end:4px}
.rights{border-style:solid;border-inline-start:4px solid var(--accent);color:var(--ink)}
footer{margin-top:28px;font-size:12px;color:var(--muted)}footer p{margin:0}.full{overflow-wrap:anywhere}
@media (max-width:719px){.swipe{display:inline}}
@media (min-width:560px){.stats-3{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:720px){.recipe{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}main{padding:48px 28px 96px}.stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cues{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:dense}
.cue-wide{grid-column:1/-1}.cue-wide .cue-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px;align-items:start}.cue-wide .evs{margin-top:8px;padding-top:0;border-top:0}
.film{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));overflow:visible;gap:14px 12px}.frame{flex:none}.lanes{min-width:0}}
@media (min-width:1000px){.stats-6{grid-template-columns:repeat(6,minmax(0,1fr))}.stats-6 .stat b{font-size:28px}.stats-6 .stat b.na{font-size:16px;line-height:2.2}}
</style></head><body><main>
<header><p class="eyebrow">تفكيك ريل مرجعي</p><h1>الريل ده معمول إزاي؟</h1>${fileLine}<p class="meta">${meta}</p></header>
${banner}
<div class="stats stats-6">${headline}</div>
<ul class="key" aria-label="معنى العلامات">
<li><span class="chip chip-measured">${BASIS_LABELS.measured}</span>الاستوديو قاسها من الملف</li>
<li><span class="chip chip-seen">${BASIS_LABELS.seen}</span><span class="chip chip-heard">${BASIS_LABELS.heard}</span>اتراجعت بالعين أو بالودن</li>
<li><span class="chip chip-needs-confirmation">${BASIS_LABELS['needs-confirmation']}</span>لسه مش مضمونة</li>
<li><span class="chip chip-none">${NOT_MEASURED}</span>ما اتقاستش أصلًا، وده غير «مفيش»</li>
</ul>
<section><h2>اللقطات <span class="count">${num(shots.length, 0)}</span></h2><p class="lead">صورة من نص كل لقطة، بالترتيب، وتحتها بدايتها وطولها وحركة الكاميرا.${cutsList.some(c => isRegion(c) && c.shotBoundary !== false) ? ' لما التغيير يبقى جوه لوحة بس، بتتحسب لقطة جديدة والإطار اللي حواليها زي ما هو.' : ''}${cutsList.some(isPartialSwap) ? ' التبديل الجزئي ما بيقسمش اللقطة.' : ''}</p>${film ? `<div class="film">${film}</div>` : '<p class="empty">مفيش لقطات اتلقطت.</p>'}</section>
<section><h2>الخط الزمني</h2><p class="lead">كل اللي بيحصل في الريل على خط واحد: إمتى بيقطع، إمتى الكلام بيظهر، وإمتى المؤثر بيضرب.</p>${lanes(b)}</section>
<section><h2>القطعات والانتقالات <span class="count">${num(cutRows.length, 0)}</span></h2>${regionCuts.length ? `<p class="lead">على الصورة كلها: ${num(cutRows.length - regionCuts.length, 0)} · ${REGION_TAG} وباقي الصورة ثابت: ${num(regionCuts.length, 0)}. المستطيل الصغير جنب كل بند بيبيّن مكان اللوحة في الصورة.</p>` : ''}${table(['الوقت', 'النوع', 'الحالة'], cutRows, 'مفيش قطعات ولا انتقالات: الريل لقطة واحدة متصلة.')}${possibleCutRows.length ? `<h3>قطعات ممكنة، راجعها <span class="count">${num(possibleCutRows.length, 0)}</span></h3><p class="lead">دي مش متحسوبة في عدد القطعات. اتفرج على اللحظة دي وقرر لوحدك.</p>${table(['الوقت', 'النوع', 'الحالة'], possibleCutRows, '')}` : ''}</section>
<section><h2>الكاميرا والزووم</h2>${table(['اللقطة', 'الحركة', 'الحالة'], cameraRows, 'مفيش لقطات نقيس حركة الكاميرا فيها.')}
${punchRows.length ? `<h3>حركات مفاجئة جوه اللقطة</h3>${table(['الوقت', 'الحركة', 'الحالة'], punchRows, '')}` : ''}
${Object.hasOwn(b, 'presenter') ? `<h3>المتكلم على الشاشة</h3>${presenterBlock(b.presenter ?? null)}` : ''}</section>
<section><h2>الكلام اللي على الشاشة <span class="count">${num(text.length, 0)}</span></h2>${text.some(t => t.reading === 'most-complete-observed') ? '<p class="lead">«أكمل نسخة اتشافت» معناها إن المكتوب هو أكمل قراية اتلقطت للكلام ده طول ما هو ظاهر. لو بنوده بتظهر واحد ورا التاني، مش لازم تكون كلها على الشاشة في نفس اللحظة.</p>' : ''}${cues ? `<div class="cues">${cues}</div>` : '<p class="empty">مفيش كلام اتلقط على الشاشة.</p>'}</section>
${overlayRows.length ? `<section><h2>عناصر فوق الصورة <span class="count">${num(overlayRows.length, 0)}</span></h2><p class="lead">ملصقات ولوجوهات وصور جوه الصورة. لقطها تقريبي، فكلها محتاجة نظرة.</p>${table(['الوقت', 'النوع', 'الحالة'], overlayRows, '')}</section>` : ''}
<section><h2>الصوت</h2>${soundSection(b, limitations, link)}</section>
<section><h2>الألوان</h2>${b.look ? `<div class="look"${anchorAttr('look')}><b>${word(LOOKS, b.look.label)}</b>${chip(b.look)}</div>` : `<p class="empty">شكل الألوان ${NOT_MEASURED}.</p>`}</section>
${recipeSection(recipe)}
${pending.length ? `<section id="confirm"><h2>محتاجة تأكيد <span class="count">${num(pending.length, 0)}</span></h2><p class="lead">دي النتايج اللي الاستوديو مش متأكد منها. لحد ما تتأكد، ما نبنيش عليها قرار.</p><ol class="confirm">${confirmList}</ol></section>` : ''}
<section><h2>قبل ما تستخدم التقرير</h2><p class="note rights">${RIGHTS_NOTE}</p>${limitationItems ? `<h3>حدود التحليل ده</h3><ul class="limits">${limitationItems}</ul>` : ''}</section>
${b.referenceId || sourceName ? `<footer>${b.referenceId ? `<p>رقم المرجع: <bdi class="n">${esc(b.referenceId)}</bdi></p>` : ''}${sourceName ? `<p>اسم الملف كامل: <bdi class="full" dir="ltr">${esc(sourceName)}</bdi></p>` : ''}</footer>` : ''}
</main></body></html>
`;
}

const FONT_DIR = path.join(ROOT, 'engine', 'public', 'fonts');
const fontFiles = subset => [400, 700].map(weight => `Cairo-${subset}-${weight}.woff2`);

function isJpeg(file) {
  let handle = null;
  try {
    handle = fs.openSync(file, 'r');
    const head = Buffer.alloc(3);
    return fs.readSync(handle, head, 0, 3, 0) === 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  } catch {
    return false;
  } finally {
    if (handle !== null) fs.closeSync(handle);
  }
}

export async function writeReport({breakdown, prepared, dir, recipe = null}) {
  const out = path.resolve(dir, 'report');
  const stillDir = path.join(out, 'stills');
  await fsp.mkdir(stillDir, {recursive: true});
  const shots = list(breakdown?.shots);
  const wanted = new Set(shots.map(s => safeId(s.id)).filter(Boolean).map(id => `${id}.jpg`));
  // Drop stills from an earlier run whose shots no longer exist, so the folder matches the page.
  for (const name of await fsp.readdir(stillDir)) {
    if (name.toLowerCase().endsWith('.jpg') && !wanted.has(name)) await fsp.rm(path.join(stillDir, name), {force: true});
  }
  const stills = {};
  const proxy = prepared?.proxy?.path;
  const canExtract = Boolean(proxy) && fs.existsSync(proxy);
  for (const s of shots) {
    const id = safeId(s.id);
    if (!id) continue;
    const file = path.join(stillDir, `${id}.jpg`);
    // Each run extracts into a fresh draft, so a still kept from an earlier run can never stand in
    // for a frame this run did not produce. The draft name ends in .jpg so ffmpeg picks the format
    // and the stale sweep above removes one left behind by a crash.
    const draft = path.join(stillDir, `${id}.${process.pid}.draft.jpg`);
    await fsp.rm(draft, {force: true});
    let fresh = false;
    if (canExtract && fin(s.start) && fin(s.end)) {
      const at = Math.max(0, (s.start + s.end) / 2);
      const result = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(3), '-i', proxy, '-frames:v', '1', '-vf', 'scale=270:-2', '-q:v', '4', draft], {allowFail: true});
      // ffmpeg can exit 0 without writing a frame (a seek past the last frame), so check the file itself.
      fresh = result.ok && isJpeg(draft);
    }
    if (fresh) {
      await fsp.rename(draft, file);
      stills[id] = `stills/${id}.jpg`;
    } else {
      // A shot without a still shows a placeholder; one bad frame must not lose the whole report.
      await fsp.rm(draft, {force: true});
      await fsp.rm(file, {force: true});
    }
  }
  let fonts = false;
  if (fontFiles('arabic').every(name => fs.existsSync(path.join(FONT_DIR, name)))) {
    const latin = fontFiles('latin').every(name => fs.existsSync(path.join(FONT_DIR, name)));
    await fsp.mkdir(path.join(out, 'assets'), {recursive: true});
    for (const name of [...fontFiles('arabic'), ...(latin ? fontFiles('latin') : [])]) await fsp.copyFile(path.join(FONT_DIR, name), path.join(out, 'assets', name));
    fonts = {latin};
  }
  const file = path.join(out, 'report.html');
  const draft = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(draft, renderReport(breakdown, {stills, fonts, recipe}), 'utf8');
  await fsp.rename(draft, file);
  return file;
}
