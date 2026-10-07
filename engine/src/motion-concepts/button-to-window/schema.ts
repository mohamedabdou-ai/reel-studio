import { z } from "zod";
import { assetPath, copy, listOf, optionalCopy } from "../fields.ts";

export const buttonToWindowSchema = z.strictObject({

  ctaLabel: copy(24),

  productName: copy(30),

  productIcon: assetPath.optional(),

  previewLines: listOf(copy(52), 3, 3),

  progressLabel: optionalCopy(34),




  badge: optionalCopy(10),
});

export type ButtonToWindowData = z.infer<typeof buttonToWindowSchema>;


export const buttonToWindowDemo: ButtonToWindowData = {
  ctaLabel: "شوف الديمو",
  productName: "SAMPLE Studio",
  previewLines: ["استيراد ملف CSV", "تشغيل تحليل AI تلقائي", "مراجعة النتيجة وحفظها"],
  progressLabel: "جاري التشغيل",
  badge: "ديمو",
};
