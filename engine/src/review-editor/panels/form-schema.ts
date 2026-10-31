import {arabicTypeSceneVariants,ARABIC_TYPE_LABELS} from '../../arabic-type/schema.ts';
import {figuresSceneVariants,FIGURE_LABELS} from '../../creative-kit/figures/schema.ts';
import {chatThreadSceneVariants,CHAT_THREAD_LABELS} from '../../creative-kit/chat-thread/schema.ts';
import {BACKDROP_LABEL} from '../../looks/index.ts';
import { z } from "zod";
import { introSchema, proofSchema, processSchema, comparisonSchema, commentSchema, followSchema } from "../../creative-kit/schema.ts";
import { kineticSceneVariants } from "../../creative-kit/kinetic/schema.ts";
import { librarySceneVariants } from "../../motion-library/schema.ts";
import {semanticSceneVariants} from '../../creative-kit/semantic/schema.ts';
import {screenRecordingVariants} from '../../screen-recording/schema.ts';
import {styleSceneVariants} from '../../styles/scenes.ts';
import {proofScreenSceneVariants} from '../../creative-kit/proof-screen/schema.ts';
import {composeSceneVariants} from '../../creative-kit/compose/schema.ts';
import { getIn, type Path } from "../ops/paths.ts";
import { explainEnglish } from "../ops/explain.ts";
import {PROJECT_SCENES} from '../../project-scenes/registry.ts';
import {valuesSchema} from '../../project-scenes/schema.ts';



const FAMILY_DATA: Record<string, z.ZodType> = {
  intro: introSchema,
  proof: proofSchema,
  process: processSchema,
  comparison: comparisonSchema,
  comment: commentSchema,
  follow: followSchema,
};
for (const variant of [...kineticSceneVariants, ...librarySceneVariants,...semanticSceneVariants,...arabicTypeSceneVariants,...figuresSceneVariants,...chatThreadSceneVariants,...screenRecordingVariants,...styleSceneVariants,...proofScreenSceneVariants,...composeSceneVariants]) {
  const shape = (variant as any).shape;
  FAMILY_DATA[shape.family.value as string] = shape.data as z.ZodType;
}
const projectContracts=Object.values(PROJECT_SCENES).map(item=>z.object({component:z.literal(item.contract.id),values:valuesSchema(item.contract.fields)}).strict());
if(projectContracts.length)FAMILY_DATA['project-scene']=projectContracts.length===1?projectContracts[0]:z.union([projectContracts[0],projectContracts[1],...projectContracts.slice(2)]);

export const familyDataSchema = (family: string): z.ZodType | undefined => FAMILY_DATA[family];
export const formFamilies = (): string[] => Object.keys(FAMILY_DATA);




const LABELS: Record<string, string> = {
  author: "اسم صاحب الرسالة",
  body: "نص الكارت",
  before: "الصورة قبل", after: "الصورة بعد",
  paper:"لون الورق",section:"اسم القسم",arrangement:"ترتيب الصفحة",parts:"القطع",emphasis:"القطعة الأساسية",rollFrames:"مدة العدّ",staggerFrames:"فاصل الظهور",pressFrame:"لحظة الضغط",offsetFrames:"بعد كام فريم",revealFrames:"مدة الكشف",speaker:"المتحدث",
  question:'السؤال', rows:'البنود', outOf:'الدرجة الكاملة', verdict:'الحكم', verdictFrame:'فريم ظهور الحكم',
  claim:'كلمات الادعاء',keyIndex:'رقم الكلمة المميزة',diff:'الفرق',claimFrame:'بداية كتابة الادعاء',receiptFrame:'بداية طباعة الإيصال',totalFrame:'بداية عد المجموع',
  move: "حركة الكتابة", font: "خط الكتابة", backdrop: "الخلفية",
  bars: "الأعمدة", max: "أعلى قيمة للمقياس", messages: "الرسائل", app: "اسم التطبيق",
  page:"شكل الصفحة",url:"الرابط (للعرض فقط)",blocks:"بلوكات الصفحة",path:"مسار الكاميرا",
  kicker: "السطر الصغير (kicker)", title: "العنوان", subtitle: "العنوان الفرعي", caption: "الكابشن", label: "التسمية", value: "الرقم", suffix: "اللاحقة",
  source: "المصدر", sourceNote: "ملاحظة المصدر", steps: "الخطوات", detail: "التفاصيل", beforeTitle: "عنوان «قبل»", beforeDetail: "تفاصيل «قبل»",
  afterTitle: "عنوان «بعد»", afterDetail: "تفاصيل «بعد»", keyword: "الكلمة المفتاحية", promise: "الوعد", handle: "الـ handle", message: "الرسالة",
  valueFit: "عرض الرقم", stamp: "الـ stamp", swapFrame: "فريم الـ swap", firstTitle: "العنوان الأول", secondTitle: "العنوان التاني", stampFrame: "فريم الـ stamp",
  foreground: "الـ foreground (الشخص قدّام العنوان)", images: "الصور", items: "العناصر", variant: "الشكل", image: "الصورة", unit: "الوحدة", rollFrame: "فريم بداية العدّ",
  rollDuration: "مدة العدّ", unitFrame: "فريم ظهور الوحدة", badge: "الشارة", badgeFrame: "فريم ظهور الشارة", footer: "السطر الأخير", prompt: "الـ prompt",
  followFrame: "فريم الـ Follow", clickedFrame: "فريم الضغطة", src: "الملف", kind: "النوع", fit: "الاحتواء", trimBeforeFrame: "قص من البداية (فريم)",
  atFrame: "فريم الظهور", display: "طريقة العرض", animateFrames: "مدة الحركة", focus: "منطقة التركيز", zoom: "التكبير", sourceWidth: "عرض الأصل", sourceHeight: "ارتفاع الأصل",
  focusFrame: "فريم التركيز", settleFrames: "فريمات الاستقرار", moveFrames: "فريمات الحركة", keys: "مفاتيح الكاميرا", cursor: "مسار الماوس", callouts: "الإشارات",
  x: "x", y: "y", width: "العرض", height: "الارتفاع", text: "النص", untilFrame: "لحد فريم", click: "ضغطة", rect: "المستطيل", sourceSha256: "بصمة المصدر (sha256)",
  sourceFromFrame: "أول فريم في المصدر", frames: "عدد الفريمات",
  lon: 'خط الطول', lat: 'خط العرض', country: 'الدولة', bounds: 'نطاق الخريطة: غرب، جنوب، شرق، شمال', borders: 'حدود الدول',
  drawAt: 'فريم بداية المسار', drawDuration: 'مدة رسم المسار', focusAt: 'فريم بداية التركيز', focusDuration: 'مدة التركيز', credit: 'نسبة الصورة لصاحبها',
  initialTitle: "عنوان البداية", boardTitle: "عنوان اللوحة", focusTitle: "عنوان النتيجة", closingTitle: "عنوان النهاية",
  focusIndex: "العنصر المختار (0 هو الأول)", gatherFrame: "بداية التجميع", gatherDurationFrames: "مدة التجميع",
  focusDurationFrames: "مدة إبراز النتيجة", closingFrame: "بداية النهاية", concept: "فكرة الحركة", config: "تفاصيل الحركة",
  sourceIndices: "الكلمات المختارة من التفريغ", revealFrame: "بداية المقارنة", revealDurationFrames: "مدة المقارنة",
  ordinal: "الكلمة الكبيرة (الترتيب)", heroAt: "فريم ظهور الكلمة الكبيرة", pill: "كبسولة الأداة / زرار المتابعة", pillAt: "فريم ظهور الكبسولة", logo: "شعار الأداة",
  lines: "الأسطر", words: "الكلمات", role: "الدور", at: "فريم البداية", cadence: "إيقاع الكلمات (فريمات على 30 فريم/ث)",
  box: "الصندوق", media: "اللقطات", clips: "اللقطات بالترتيب", scroll: "تمرير اللقطة", from: "من", to: "إلى", distance: "مسافة الانزلاق (بكسل)",
  dir: "الاتجاه", enter: "طريقة الدخول", exit: "طريقة الخروج", grid: "شبكة الخلفية", watermark: "العلامة الخافتة أسفل الشاشة",
  bullets: "النقاط", sha256: "بصمة الملف (sha256)",
  brand: "اسم الأداة أو القناة (فوق)", intro: "الافتتاحية", top: "السطر الأول", bottom: "السطر التاني", sub: "السطر الصغير", start: "كلمة الزرار", item: "اسم الملف", target: "اسم المكان", placeholder: "النص الباهت في الخانة", options: "الاختيارات", on: "شغّال", decimals: "الأرقام بعد الفاصلة", jobs: "الشغل", file: "اسم الملف", result: "الريل الجاهز", closing: "الختام", platforms: "المنصات", accent: "لون التمييز",
  input: "العنصر الداخل", condition: "الشرط", branches: "مسارات النتيجة", equals: "القيمة المطلوبة", threshold: "الحد الأدنى", whenTrue: "لو الشرط اتحقق", whenFalse: "لو الشرط ماتحققش",
  acts: "الأقسام (الخلفيات)", theme: "الخلفية", sentence: "أول جملة في القسم", tag: "عنوان القسم الصغير", sentences: "جمل العنوان", accents: "كلمات التمييز",
  counter: "العداد", total: "الرقم الكامل", saidAt: "الكلمة اللي بتقول الرقم", stop: "لحظة التوقف", brackets: "زوايا الكاميرا في البداية",
  word: "رقم الكلمة", dt: "إزاحة بالثواني", term: "الكلمة الكبيرة", glyphs: "الأشكال", left: "اليسار", right: "اليمين", name: "الاسم", linkLabel: "كلمة الرابط",
  rightAt: "لحظة اليمين", leftAt: "لحظة اليسار", linkAt: "لحظة الرابط", icon: "الأيقونة", shape: "الشكل", hitAt: "لحظات الإبراز", filename: "اسم الملف",
  prefixLen: "عدد حروف التمييز", stampAt: "لحظة الختم", cableAt: "لحظة الكابل", picked: "العنصر المختار (0 هو الأول)", command: "الأمر المكتوب",
  pickAt: "لحظة الاختيار", runAt: "لحظة التنفيذ", tiles: "عدد البلوكات", lit: "البلوك المضيء", crossAt: "لحظة الشطب", layers: "الطبقات", tone: "لون الطبقة",
  shapes: "الأشكال", arrowLabel: "كلمة السهم", dropAt: "لحظة النزول", arrowAt: "لحظة السهم", nodes: "العقد", rings: "الدواير", ringsAt: "لحظة الدواير",
  beforeLabel: "الاسم قبل", afterLabel: "الاسم بعد", equalsBefore: "يساوي قبل", equalsAfter: "يساوي بعد", morphAt: "لحظة التحول", oneAt: "لحظة الشكل الواحد",
  clip: "لقطة الشاشة", crop: "قص اللقطة (x, y, w)", w: "العرض المقصوص", places: "أماكن الشخصية", scale: "حجم الشخصية", gestures: "حركات الشخصية",
  arm: "الدراع", anchor: "الهدف", card: "الكارت", point: "النقطة", brow: "الحاجب", tilt: "ميل الراس", look: "النظرة", tail: "ذيل السلام",
  place: "المكان حوالين الراس", mark: "علامة بخط اليد", character: "الشخصية", skin: "لون البشرة", hair: "الشعر", style: "الشكل", color: "اللون", headwear: "غطاء الرأس", beard: "الدقن", glasses: "النضارة",
  frame: "لون الإطار", eyes: "العينين", iris: "لون العين", outfit: "اللبس", base: "اللون التحتي",
  fromTheme: "خلفية القسم السابق", entrance: "مكان الدخول", comment: "كارت الكومنت", follow: "كارت المتابعة", tapAt: "لحظة الضغطة", shareAt: "لحظة المشاركة",
  sourceLabel: "عنوان البداية", retainedLabel: "عنوان القائمة النهائية", rejectedLabel: "عنوان المستبعد", cards: "الكروت بنفس الهوية", attributes: "خصائص الكارت", criteria: "شروط التصفية", field: "اسم الخاصية", op: "طريقة المقارنة",
  sticker: "ملصق", id: "المعرّف",
};


const VARIANT_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries({...FIGURE_LABELS,...CHAT_THREAD_LABELS}).map(([key,value])=>['|variant: '+key,value])),
  "enter|kind: cut": "قطع مباشر (cut)", "enter|kind: slide": "انزلاق من الجانب (slide)", "enter|kind: dip": "ضبابية وتعتيم (dip)",
  "exit|kind: cut": "قطع مباشر (cut)", "exit|kind: push": "دفع المشهد للخارج (push)", "exit|kind: dip": "ضبابية وتعتيم (dip)",
  "steps|kind: drop": "سحب ملف لمكان (drop)", "steps|kind: field": "كتابة طلب (field)", "steps|kind: toggle": "تشغيل اختيارات (toggle)",
  "steps|kind: stat": "رقم كبير (stat)", "steps|kind: work": "شغل بيخلص (work)",
  "condition|kind: boolean-equals": "اختيار صح أو غلط", "condition|kind: number-at-least": "رقم بحد أدنى", "|look: window": "نافذة لقطات الشاشة", "|look: broll": "لقطات فيديو (B-roll)",
};
const BACKDROP_OPTION_LABEL: Record<string,string> = {plain:'بدون خلفية', ...BACKDROP_LABEL};
export const enumOptionLabel = (key:string,value:unknown):string => key==='move' ? (ARABIC_TYPE_LABELS as Record<string,string>)[String(value)] ?? String(value) : key==='backdrop' ? BACKDROP_OPTION_LABEL[String(value)] ?? String(value) : String(value);
export const fieldLabel = (key: string): string => LABELS[key] ?? key;

// A short note under a field whose rule the label does not say, keyed by `family.path`. Neutral Arabic.
const HINTS: Record<string, string> = {
  'map-route.places': 'أماكن المسار بإحداثيات مراجَعة. الاسم وحده يحتاج بيانات مدن مثبتة. المسار توضيحي وليس طريقًا مقاسًا.',
  'map-route.borders': 'الحدود تحتاج ملف منظور جغرافي متحقق منه. اقفلها لاستخدام اليابسة والبحر بدون حدود دول.',
  'map-focus.borders': 'الحدود تحتاج ملف منظور جغرافي متحقق منه. اختيار اسم دولة يحتاج بيانات مثبتة.',
  'cutout-card.image': 'صورة مشروع سمّيتها أنت، ببصمتها وأبعادها؛ استبدل صورة المثال قبل التسليم.',
  "creator-cta.prompt": "اكتب {keyword} داخل الجملة ليظهر مكانه كلمة التعليق، أو اكتب الكلمة نفسها. التصدير النهائي يتطلب أحد الأمرين.",
};
export const fieldHint = (family: string, path: string): string | undefined => HINTS[`${family}.${path}`];

const FRAME_KEY = /(Frame|Frames|Duration|At)$|^(frames|at)$/;
const MULTILINE_FROM = 100;
const ASSET_KEYS = new Set(["src", "image"]);



type Base = { key: string; label: string; required: boolean; description?: string };
export type StringField = Base & { kind: "string"; minLength?: number; maxLength?: number; multiline: boolean; asset: boolean; default?: string };
export type NumberField = Base & { kind: "number"; integer: boolean; min?: number; max?: number; exclusiveMin?: number; step: number | "any"; isFrame: boolean; default?: number;
  /** A frame counted inside the clip's own file (the in-point of a clip), not inside the scene. */
  inClipFile?: boolean };
export type BooleanField = Base & { kind: "boolean"; default?: boolean };
export type EnumField = Base & { kind: "enum"; options: (string | number | boolean)[]; fixed: boolean; default?: string | number | boolean };
export type ObjectField = Base & { kind: "object"; fields: Field[]; default?:Record<string,unknown>; clip?: boolean };
export type ArrayField = Base & { kind: "array"; item: Field; minItems: number; maxItems: number; fixedLength: boolean; default?:unknown[] };
export type UnionVariant = { label: string; field: ObjectField;                                                                                         consts: Record<string, string | number | boolean>; required: string[]; properties: string[]; closed: boolean };
export type UnionField = Base & { kind: "union"; variants: UnionVariant[] };
export type ScalarUnionField = Base & { kind: "scalar-union"; variants: Field[] };
export type RecordField = Base & { kind: "record"; item: Field; keyPattern?: string };
export type JsonField = Base & { kind: "json"; schema: unknown };
export type Field = StringField | NumberField | BooleanField | EnumField | ObjectField | ArrayField | UnionField | ScalarUnionField | RecordField | JsonField;

type JS = Record<string, any>;

function fromJsonSchema(js: JS, key: string, required: boolean): Field {
  const base: Base = { key, label: typeof js.title==='string'?js.title:fieldLabel(key), required, ...(typeof js.description === "string" ? { description: js.description } : {}) };
  const options = (js.anyOf ?? js.oneOf ?? (Array.isArray(js.type) ? js.type.map((type: string) => ({...js, type})) : undefined)) as JS[] | undefined;
  if (Array.isArray(options)) {
    const objects = options.every((o) => o.type === "object" && o.properties);
    if (!objects) {
      if (options.every(o => ['string', 'number', 'integer', 'boolean'].includes(o.type))) {
        return {...base, kind: 'scalar-union', variants: options.map(o => fromJsonSchema(o, key, true))};
      }
      return { ...base, kind: "json", schema: js };
    }
    return {
      ...base,
      kind: "union",
      variants: options.map((o, i) => {
        const field = fromJsonSchema(o, key, true) as ObjectField;
        const consts: Record<string, string | number | boolean> = {};
        for (const [k, v] of Object.entries<JS>(o.properties)) if (v.const !== undefined) consts[k] = v.const;
        const shown = Object.entries(consts).map(([k, v]) => `${k}: ${v}`).join(" · ");
        return { label: VARIANT_LABELS[`${key}|${shown}`] ?? (shown || `الشكل ${i + 1}`), field, consts, required: (o.required as string[]) ?? [], properties: Object.keys(o.properties), closed: o.additionalProperties === false };
      }),
    };
  }
  if (Array.isArray(js.enum)) return { ...base, kind: "enum", options: js.enum, fixed: js.enum.length === 1, ...(js.default !== undefined ? { default: js.default } : {}) };
  if (js.const !== undefined) return { ...base, kind: "enum", options: [js.const], fixed: true };
  switch (js.type) {
    case "string":
      return {
        ...base, kind: "string", minLength: js.minLength, maxLength: js.maxLength,
        multiline: typeof js.maxLength === "number" && js.maxLength >= MULTILINE_FROM,
        asset: ASSET_KEYS.has(key)||js['x-reel-asset']===true,
        ...(typeof js.default === "string" ? { default: js.default } : {}),
      };
    case "integer":
    case "number": {
      const integer = js.type === "integer";
      return {
        ...base, kind: "number", integer, min: js.minimum, max: js.maximum, exclusiveMin: js.exclusiveMinimum,
        step: typeof js.multipleOf === "number" ? js.multipleOf : integer ? 1 : "any",
        isFrame: FRAME_KEY.test(key),
        ...(typeof js.default === "number" ? { default: js.default } : {}),
      };
    }
    case "boolean":
      return { ...base, kind: "boolean", ...(typeof js.default === "boolean" ? { default: js.default } : {}) };
    case "object": {
      if (!js.properties && js.additionalProperties && typeof js.additionalProperties === 'object') {
        return {...base, kind: 'record', item: fromJsonSchema(js.additionalProperties, '', true),
          ...(typeof js.propertyNames?.pattern === 'string' ? {keyPattern: js.propertyNames.pattern} : {})};
      }
      if (!js.properties) return { ...base, kind: "json", schema: js };
      const need = new Set<string>(js.required ?? []);
      const clip = js['x-reel-clip'] === true;
      // Inside a clip object `trimBeforeFrame` counts frames of the clip's own file; the step's `atFrame` still counts frames of the scene.
      const fields = Object.entries<JS>(js.properties).map(([k, v]) => fromJsonSchema(v, k, need.has(k))).map((field): Field => (clip && field.kind === "number" && field.key === "trimBeforeFrame" ? { ...field, inClipFile: true } : field));
      return { ...base, kind: "object", fields,...(js.default!==undefined?{default:js.default}:{}),...(clip?{clip:true}:{}) };
    }
    case "array": {
      if (!js.items || Array.isArray(js.items)) return { ...base, kind: "json", schema: js };
      const min = typeof js.minItems === "number" ? js.minItems : 0;
      const max = typeof js.maxItems === "number" ? js.maxItems : Infinity;
      return { ...base, kind: "array", item: fromJsonSchema(js.items, "", true), minItems: min, maxItems: max, fixedLength: min === max,...(js.default!==undefined?{default:js.default}:{}) };
    }
    default:
      return { ...base, kind: "json", schema: js };
  }
}


export function toJsonSchema(schema: z.ZodType): JS {
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JS;
}


export function buildFields(schema: z.ZodType): Field[] {
  const root = fromJsonSchema(toJsonSchema(schema), "", true);
  return root.kind === "object" ? root.fields : [root];
}


export function fieldsForFamily(family: string): Field[] {
  const schema = familyDataSchema(family);
  return schema ? buildFields(schema) : [];
}
export function formDataWithDefaults(schema:z.ZodType|undefined,data:unknown):unknown {
  const parsed=schema?.safeParse(data);return parsed?.success?parsed.data:data;
}


export function describeFields(fields: Field[], prefix = ""): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const at = prefix ? `${prefix}.${f.key}` : f.key;
    out.push(`${at}:${f.kind}${f.required ? "" : "?"}`);
    if (f.kind === "object") out.push(...describeFields(f.fields, at));
    else if (f.kind === "array") out.push(...describeFields([{ ...f.item, key: "[]" }], at));
    else if (f.kind === "union") f.variants.forEach((v, i) => out.push(...describeFields(v.field.fields, `${at}|${i}`)));
    else if (f.kind === 'scalar-union') out.push(...describeFields(f.variants, `${at}|value`));
    else if (f.kind === 'record') out.push(...describeFields([{...f.item, key: '*'}], at));
  }
  return out;
}




export function blankValue(field: Field): unknown {
  switch (field.kind) {
    case "string": return field.default ?? "";
    case "number": {
      const floor = field.min ?? (field.exclusiveMin !== undefined ? field.exclusiveMin + (field.integer ? 1 : 0.01) : 0);
      return field.default ?? Math.min(field.max ?? Infinity, floor);
    }
    case "boolean": return field.default ?? false;
    case "enum": return field.default ?? field.options[0];
    case "object": {
      const out: Record<string, unknown> = {};
      for (const f of field.fields) if (f.required) out[f.key] = blankValue(f);
      return out;
    }
    case "array": return Array.from({ length: field.minItems }, () => blankValue(field.item));
    case "union": return blankVariant(field.variants[0]);
    case 'scalar-union': return blankValue(field.variants[0]);
    case 'record': return {};
    case "json": return null;
  }
}

export function scalarVariantIndex(field: ScalarUnionField, value: unknown): number {
  const index = field.variants.findIndex(variant => variant.kind === 'enum' ? variant.options.includes(value as never)
    : variant.kind === 'number' ? typeof value === 'number' : variant.kind === 'boolean' ? typeof value === 'boolean' : variant.kind === 'string' && typeof value === 'string');
  return Math.max(0, index);
}

export function recordKeyIssue(field: RecordField, key: string, current: Record<string, unknown>): string | null {
  if (!key.trim() || ['__proto__', 'prototype', 'constructor'].includes(key)) return 'اسم الخاصية غير صالح.';
  if (Object.hasOwn(current, key)) return 'الخاصية دي موجودة بالفعل.';
  if (field.keyPattern && !new RegExp(field.keyPattern).test(key)) return 'اسم الخاصية مش مطابق للصيغة المطلوبة.';
  return null;
}


export function blankVariant(variant: UnionVariant): Record<string, unknown> {
  const value = blankValue(variant.field) as Record<string, unknown>;
  return { ...value, ...variant.consts };
}


export function defaultItem(field: ArrayField, current: readonly unknown[]): unknown {
  return current.length ? structuredClone(current[current.length - 1]) : blankValue(field.item);
}


export function variantIndex(field: UnionField, value: unknown): number {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  let best = 0;
  let bestScore = -Infinity;
  field.variants.forEach((v, i) => {
    let score = 0;
    for (const [k, c] of Object.entries(v.consts)) score += k in obj ? (obj[k] === c ? 10 : -100) : v.required.includes(k) ? -1 : 1;
    for (const k of v.required) if (!(k in obj)) score -= 2;
    if (v.closed) for (const k of Object.keys(obj)) if (!v.properties.includes(k)) score -= 3;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}



export type FieldIssue = { path: Path; message: string };

const TYPE_AR: Record<string, string> = { string: "نص", number: "رقم", boolean: "اختيار", array: "قايمة", object: "مجموعة حقول", int: "رقم صحيح" };
const CUSTOM_AR: [RegExp, string][] = [
  [/local public asset path/, "لازم مسار ملف محلي جوّه public (من غير / في الأول ومن غير : أو .. )."],
  [/local \.mp4 or \.webm/, "لازم ملف فيديو mp4 أو webm."],
  [/local \.mp4 file/, "يجب أن تكون اللقطة ملف mp4 محليًا داخل مجلد public؛ اختر لقطة من القائمة أو اطلب من المساعد تجهيزها."],
  [/Focus rectangle must stay inside/, "المستطيل لازم يفضل جوّه الصورة (x+width و y+height مايزيدوش عن 1)."],
  [/complete @handle/, "لازم @handle كامل: حروف وأرقام و _ و . بحد أقصى 30."],
  [/cannot be blank/, "النص مينفعش يبقى فاضي."],
];

function translate(issue: any): string {
  switch (issue.code) {
    case "invalid_type": {

      const received = /received (\w+)/.exec(String(issue.message))?.[1];
      return received === "undefined" ? "الحقل ده مطلوب." : `النوع غلط: المفروض ${TYPE_AR[issue.expected] ?? issue.expected}.`;
    }
    case "too_small":
      if (issue.origin === "string") return issue.minimum <= 1 ? "النص مينفعش يبقى فاضي." : `النص أقصر من الحد الأدنى (${issue.minimum} حرف).`;
      if (issue.origin === "array") return `لازم ${issue.minimum} عناصر على الأقل.`;
      return `القيمة أقل من الحد الأدنى (${issue.minimum}).`;
    case "too_big":
      if (issue.origin === "string") return `النص أطول من الحد الأقصى (${issue.maximum} حرف).`;
      if (issue.origin === "array") return `أكتر من ${issue.maximum} عناصر.`;
      return `القيمة أكبر من الحد الأقصى (${issue.maximum}).`;
    case "invalid_format": {
      if (String(issue.pattern ?? "").includes("\\S")) return "النص مينفعش يبقى فاضي.";
      const custom = CUSTOM_AR.find(([rx]) => rx.test(String(issue.message)));
      return custom ? custom[1] : "الصيغة مش مظبوطة.";
    }
    case "invalid_value":
      return `قيمة مش مسموحة. المسموح: ${(issue.values ?? []).join(" / ")}.`;
    case "not_multiple_of":
      return `لازم مضاعف لـ ${issue.divisor}.`;
    case "unrecognized_keys":
      return `حقل مش معروف: ${(issue.keys ?? []).join(", ")}.`;
    case "custom": {
      const custom = CUSTOM_AR.find(([rx]) => rx.test(String(issue.message)));
      // Scene rules the edit check already explains in Arabic read the same way in the form.
      return custom ? custom[1] : explainEnglish(String(issue.message)) ?? String(issue.message);
    }
    default:
      return String(issue.message ?? "قيمة غير صالحة.");
  }
}


export function flattenIssues(issues: readonly any[], prefix: Path = []): FieldIssue[] {
  const out: FieldIssue[] = [];
  for (const issue of issues) {
    const path = [...prefix, ...(issue.path ?? [])] as Path;
    if (issue.code === "invalid_union" && Array.isArray(issue.errors) && issue.errors.length) {
      const branches = (issue.errors as any[][]).map((b) => flattenIssues(b, path));
      out.push(...branches.reduce((a, b) => (b.length < a.length ? b : a)));
    } else out.push({ path, message: translate(issue) });
  }
  return out;
}


export function validateData(family: string, data: unknown): { ok: boolean; issues: FieldIssue[] } {
  const schema = familyDataSchema(family);
  if (!schema) return { ok: false, issues: [{ path: [], message: `مفيش schema للـ family «${family}».` }] };
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, issues: [] };

  const seen = new Set<string>();
  const issues = flattenIssues(r.error.issues).filter((i) => {
    const key = `${i.path.join(".")}|${i.message}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
  return { ok: false, issues };
}


export function issuesByPath(issues: readonly FieldIssue[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const i of issues) {
    const key = i.path.join(".");
    const list = map.get(key) ?? [];
    if (!list.includes(i.message)) map.set(key, [...list, i.message]);
  }
  return map;
}


export function valueAt(draft: unknown, path: Path): unknown {
  return getIn(draft, path);
}


export function parseNumberText(text: string): number | null {
  const western = text.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".");
  if (!/^-?\d+(\.\d+)?$/.test(western)) return null;
  const n = Number(western);
  return Number.isFinite(n) ? n : null;
}
