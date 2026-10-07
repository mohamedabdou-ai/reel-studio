import { z } from "zod";
import { copy, listOf } from "../fields.ts";

export const INPUT_MAX = 36;
export const OUTPUT_MAX = 36;

export const STEP_MAX = 28;

export const STEP_WORD_MAX = 13;


const wordsUpTo = (max: number) => (s: string) => s.split(/\s+/).every((w) => w.length <= max);

const stepCopy = () => copy(STEP_MAX).refine(wordsUpTo(STEP_WORD_MAX), `Each word of a step is at most ${STEP_WORD_MAX} characters: a longer word cannot wrap inside the step box`);

export const automationFlowSchema = z.strictObject({

  input: copy(INPUT_MAX),

  steps: listOf(stepCopy(), 4, 4),

  output: copy(OUTPUT_MAX),
});

export type AutomationFlowData = z.infer<typeof automationFlowSchema>;


export const automationFlowDemo: AutomationFlowData = {
  input: "طلب عميل جديد (SAMPLE)",
  steps: ["تصنيف الطلب بالـ AI", "تسجيل العميل في CRM", "تجهيز عرض السعر PDF", "إشعار الفريق بالنتيجة"],
  output: "عرض سعر جاهز للإرسال",
};
