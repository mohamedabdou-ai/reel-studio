import { z } from "zod";
import { copy, listOf } from "../fields.ts";
import { EXAMPLES_MAX, EXAMPLES_MIN, TABS_MAX, TABS_MIN } from "./math.ts";


export const LABEL_MIN_PX = 22;

export const LABEL_BOX_W = 151;

export const LABEL_LINES = 2;

export const CAP_EM = 0.75;
export const GLYPH_EM = 0.6;

export const LABEL_LINE_EM = LABEL_BOX_W / LABEL_MIN_PX;

export const LABEL_MAX = 13;

export const LABEL_WORD_MAX = Math.floor(LABEL_LINE_EM / GLYPH_EM);

export const LABEL_CAPS_WORD_MAX = Math.floor(LABEL_LINE_EM / CAP_EM);
export const EXAMPLE_MAX = 56;
export const EXAMPLE_WORD_MAX = 24;


export const wordEm = (word: string): number => {
  let em = 0;
  for (const ch of word) em += /\p{Lu}/u.test(ch) ? CAP_EM : GLYPH_EM;
  return em;
};






export const labelLines = (label: string): number => {
  let lines = 1;
  let used = 0;
  for (const word of label.split(/\s+/).filter((w) => w.length > 0)) {
    const em = wordEm(word);
    if (em > LABEL_LINE_EM) return Infinity;
    if (used === 0) used = em;
    else if (used + GLYPH_EM + em <= LABEL_LINE_EM) used += GLYPH_EM + em;
    else {
      lines += 1;
      used = em;
    }
  }
  return lines;
};


const wordsUpTo = (max: number) => (s: string) => s.split(/\s+/).every((w) => Array.from(w).length <= max);

const tabSchema = z.strictObject({

  label: copy(LABEL_MAX).refine(
    (s) => labelLines(s) <= LABEL_LINES,
    `A tab label must fit ${LABEL_LINES} lines in a five-tab cell: a word of up to ${LABEL_WORD_MAX} characters, or up to ${LABEL_CAPS_WORD_MAX} if it is in capitals (ALL-CAPS «PROCUREMENT» does not fit: write «Procurement»)`,
  ),

  examples: listOf(copy(EXAMPLE_MAX).refine(wordsUpTo(EXAMPLE_WORD_MAX), `Each word of an example is at most ${EXAMPLE_WORD_MAX} characters`), EXAMPLES_MIN, EXAMPLES_MAX),
});

export const departmentTabsSchema = z.strictObject({
  tabs: listOf(tabSchema, TABS_MIN, TABS_MAX),
});

export type DepartmentTabsData = z.infer<typeof departmentTabsSchema>;





export const departmentTabsDemo: DepartmentTabsData = {
  tabs: [
    {
      label: "المبيعات",
      examples: ["SAMPLE · تسجيل أي عميل جديد في الـ CRM لوحده", "رد فوري على كل رسالة استفسار", "تذكير بالمتابعة قبل ما الصفقة تبرد"],
    },
    {
      label: "التسويق",
      examples: ["جدولة محتوى الأسبوع كله مرة واحدة", "تقرير أداء أسبوعي يوصلك كل صباح"],
    },
    {
      label: "خدمة العملاء",
      examples: ["تصنيف كل تذكرة حسب الأولوية بالـ AI", "ردود جاهزة على الأسئلة المتكررة", "تصعيد الحالات العاجلة للمسؤول"],
    },
    {
      label: "الحسابات",
      examples: ["فاتورة PDF تتبعت أول كل شهر لوحدها", "مطابقة المصاريف مع ملف CSV"],
    },
  ],
};
