import {promises as fs} from 'node:fs';
import path from 'node:path';
import {PREFERENCE_VALUES, defaultPreferences} from '../../engine/src/core/preference-options.ts';

export const PROFILE_SCHEMA_VERSION = 3;
export const PROFILE_FILE = 'PROFILE.json';
export const HANDLE_PATTERN = /^@[A-Za-z0-9_.]{1,30}$/;
export const PROFILE_PLATFORMS = Object.freeze(['instagram', 'tiktok']);
const HEX = /^#[0-9A-Fa-f]{6}$/;


export class ProfileError extends Error {
  constructor(ar, en) {
    super(`${ar}\n${en}`);
    this.name = 'ProfileError';
    this.ar = ar;
    this.en = en;
  }
}
const fail = (ar, en) => { throw new ProfileError(ar, en); };

const record = (value, ar, en) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${ar} لازم يكون object.`, `${en} must be an object.`);
  return value;
};
const exactKeys = (value, keys, ar, en) => {
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown) fail(`الحقل «${unknown}» مش معروف في ${ar}.`, `Unknown ${en} field: ${unknown}.`);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing) fail(`الحقل «${missing}» ناقص في ${ar}.`, `Missing ${en} field: ${missing}.`);
};
const text = (value, max, ar, en, {nullable = false} = {}) => {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    fail(`${ar} لازم يكون كلام مش فاضي، أقصى حاجة ${max} حرف.`, `${en} must be nonblank text of at most ${max} characters.`);
  }
  return value.trim();
};
const colour = (value, ar, en, {nullable = false} = {}) => {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !HEX.test(value)) fail(`${ar} لازم يكون لون بالشكل #RRGGBB.`, `${en} must be a #RRGGBB colour.`);
  return value.toUpperCase();
};

export function normalizeHandle(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !HANDLE_PATTERN.test(value)) {
    fail('اليوزر لازم يبدأ بـ@ وبعده لحد 30 حرف إنجليزي أو رقم أو _ أو نقطة.', 'The handle must start with @ followed by 1 to 30 letters, digits, underscores or dots.');
  }
  return value;
}


export function normalizeBrand(value) {
  const brand = record(value, 'ألوان البراند', 'brand');
  exactKeys(brand, ['primary', 'accent', 'background', 'text'], 'ألوان البراند', 'brand');
  return {
    primary: colour(brand.primary, 'اللون الأساسي', 'brand.primary'),
    accent: colour(brand.accent, 'لون التمييز', 'brand.accent'),
    background: colour(brand.background, 'لون الخلفية', 'brand.background', {nullable: true}),
    text: colour(brand.text, 'لون الكلام', 'brand.text', {nullable: true}),
  };
}

export function normalizeProfile(value) {
  const profile = record(value, 'البروفايل', 'PROFILE.json');
  if (![2, PROFILE_SCHEMA_VERSION].includes(profile.schemaVersion)) fail('نسخة البروفايل لازم تكون 2 أو 3.', 'PROFILE.json schemaVersion must be 2 or 3.');
  exactKeys(profile, ['schemaVersion', 'name', 'handle', 'language', 'ending', 'brand', 'platforms', ...(profile.schemaVersion === 3 ? ['preferences'] : [])], 'البروفايل', 'profile');
  const name = text(profile.name, 80, 'الاسم', 'name');
  const handle = normalizeHandle(profile.handle);
  if (profile.language !== 'ar-EG') fail('اللغة المدعومة دلوقتي ar-EG بس.', 'language must be "ar-EG".');
  const ending = record(profile.ending, 'اختيارات النهاية', 'ending');
  exactKeys(ending, ['followCard', 'ctaDefault', 'signOff'], 'اختيارات النهاية', 'ending');
  if (typeof ending.followCard !== 'boolean') fail('followCard لازم تكون true أو false.', 'ending.followCard must be true or false.');
  if (ending.followCard && handle === null) fail('كارت المتابعة محتاج اليوزر بتاعك.', 'ending.followCard needs a handle.');
  const ctaDefault = text(ending.ctaDefault, 20, 'كلمة الكومنت', 'ending.ctaDefault', {nullable: true});
  const signOff = text(ending.signOff, 60, 'جملة الختام', 'ending.signOff', {nullable: true});
  const platforms = profile.platforms;
  if (!Array.isArray(platforms) || !platforms.length || new Set(platforms).size !== platforms.length || platforms.some((p) => !PROFILE_PLATFORMS.includes(p))) {
    fail('المنصات لازم تكون instagram و/أو tiktok من غير تكرار.', 'platforms must be a non-empty list of "instagram" and/or "tiktok" without repeats.');
  }
  return {schemaVersion: PROFILE_SCHEMA_VERSION, name, handle, language: 'ar-EG',
    ending: {followCard: ending.followCard, ctaDefault, signOff}, brand: normalizeBrand(profile.brand), platforms: [...platforms],
    preferences: profile.schemaVersion === 2 ? defaultPreferences({legacy: true}) : normalizePreferences(profile.preferences)};
}

export function normalizePreferences(value) {
  const preferences = record(value, 'اختيارات المونتاج', 'preferences');
  exactKeys(preferences, Object.keys(PREFERENCE_VALUES), 'اختيارات المونتاج', 'preferences');
  return Object.fromEntries(Object.entries(PREFERENCE_VALUES).map(([key, values]) => {
    const preference = record(preferences[key], key, key);
    exactKeys(preference, ['mode', 'value'], key, key);
    if (!['auto', 'fixed'].includes(preference.mode) ||
      (preference.mode === 'auto' ? preference.value !== null : !values.includes(preference.value))) {
      fail(`اختيار ${key} لازم يكون تلقائي أو اختيار ثابت من القائمة.`, `Invalid ${key} preference; auto requires null, fixed requires a listed value.`);
    }
    return [key, {mode: preference.mode, value: preference.value}];
  }));
}


export function profileToBrief(value) {
  const profile = normalizeProfile(value);
  return {creator: profileToCreator(profile), preferences: profile.preferences,
    ...(profile.preferences.palette.mode === 'fixed' ? {brand: profile.brand} : {})};
}


export async function readProfile(root) {
  return readProfileFile(path.join(root, PROFILE_FILE));
}


export async function readProfileFile(file) {
  let raw;
  try { raw = await fs.readFile(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') fail('مفيش PROFILE.json لسه، كمّل أسئلة الإعداد الأول.', 'PROFILE.json is missing; finish the setup questions first.');
    throw error;
  }
  let value;
  try { value = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw); } catch { fail('ملف PROFILE.json مش JSON سليم.', 'PROFILE.json is not valid JSON.'); }
  return normalizeProfile(value);
}


export async function profileSignOff(root) {
  const file = path.join(root, PROFILE_FILE);
  if (!(await fs.stat(file).catch(() => null))) return null;
  return (await readProfileFile(file)).ending.signOff;
}


export function profileToCreator(profile) {
  return {displayName: profile.name, handle: profile.handle,
    ending: {cta: profile.ending.ctaDefault, followCard: profile.ending.followCard, signOff: profile.ending.signOff}};
}


export function normalizeCreatorProfile(value) {
  if (value === undefined || value === null) fail('بيانات صاحب الفيديو ناقصة في البريف.', 'Creator profile is required.');
  const creator = record(value, 'بيانات صاحب الفيديو', 'creator');
  exactKeys(creator, ['displayName', 'handle', 'ending'], 'بيانات صاحب الفيديو', 'creator');
  const handle = normalizeHandle(creator.handle);
  const ending = record(creator.ending, 'اختيارات النهاية', 'creator.ending');
  exactKeys(ending, ['cta', 'followCard', 'signOff'], 'اختيارات النهاية', 'creator.ending');
  if (typeof ending.followCard !== 'boolean') fail('followCard لازم تكون true أو false.', 'creator.ending.followCard must be true or false.');
  if (ending.followCard && handle === null) fail('كارت المتابعة محتاج اليوزر بتاعك.', 'creator.ending.followCard needs a handle.');
  return {displayName: text(creator.displayName, 80, 'الاسم', 'creator.displayName'), handle,
    ending: {cta: text(ending.cta, 20, 'كلمة الكومنت', 'creator.ending.cta', {nullable: true}), followCard: ending.followCard,
      signOff: text(ending.signOff, 60, 'جملة الختام', 'creator.ending.signOff', {nullable: true})}};
}

export function validateEditorSource({source, transcript}) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Name the source video before planning an edit.');
  if (typeof transcript !== 'string' || !transcript.trim()) throw new Error('Name the transcript file before planning an edit.');
  if (source.toLowerCase() === transcript.toLowerCase()) throw new Error('Source video and transcript must be different files.');
  return {source, transcript};
}
