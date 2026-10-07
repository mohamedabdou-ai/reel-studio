import { z } from "zod";
import { assetPath, copy, listOf } from "../fields.ts";

export const magneticDockToolSchema = z.strictObject({

  name: copy(18),

  icon: assetPath.optional(),
});

export const magneticDockSchema = z.strictObject({

  tools: listOf(magneticDockToolSchema, 6, 6),
});

export type MagneticDockTool = z.infer<typeof magneticDockToolSchema>;
export type MagneticDockData = z.infer<typeof magneticDockSchema>;


export const magneticDockDemo: MagneticDockData = {
  tools: [
    { name: "SAMPLE Studio" },
    { name: "مساعد الكتابة" },
    { name: "Auto Cut" },
    { name: "تحليل الصوت" },
    { name: "Thumbnail Lab" },
    { name: "جدولة النشر" },
  ],
};
