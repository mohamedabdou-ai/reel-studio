import { z } from "zod";
import { copy, listOf } from "../fields.ts";

export const glassLensRowSchema = z.strictObject({

  label: copy(28),

  value: copy(14),
});

export const glassLensSchema = z.strictObject({

  rows: listOf(glassLensRowSchema, 5, 5),

  keyIndex: z.number().int().min(0).max(4),
});

export type GlassLensRow = z.infer<typeof glassLensRowSchema>;
export type GlassLensData = z.infer<typeof glassLensSchema>;


export const glassLensDemo: GlassLensData = {
  rows: [
    { label: "الزيارات · SAMPLE", value: "48.2K" },
    { label: "العملاء المحتملين Leads", value: "1,240" },
    { label: "معدل التحويل CVR", value: "3.8%" },
    { label: "متوسط قيمة الأوردر AOV", value: "EGP 412" },
    { label: "الاحتفاظ Retention", value: "91%" },
  ],
  keyIndex: 2,
};
