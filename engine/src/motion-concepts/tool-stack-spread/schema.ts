import { z } from "zod";
import { assetPath, copy, listOf } from "../fields.ts";

export const toolCardSchema = z.strictObject({

  name: copy(30),

  function: copy(44),

  icon: assetPath.optional(),
});

export const toolStackSpreadSchema = z.strictObject({
  tools: listOf(toolCardSchema, 5, 5),
});

export type ToolCardData = z.infer<typeof toolCardSchema>;
export type ToolStackSpreadData = z.infer<typeof toolStackSpreadSchema>;


export const toolStackSpreadDemo: ToolStackSpreadData = {
  tools: [
    { name: "SAMPLE Editor", function: "بيقص الفيديو ويرتب الـ timeline" },
    { name: "SAMPLE Sheets", function: "بيحول الأرقام لـ dashboard واضح" },
    { name: "SAMPLE Writer", function: "بيكتب أول مسودة للـ script" },
    { name: "SAMPLE Report", function: "بيطلع تقرير الأسبوع لوحده" },
    { name: "SAMPLE Board", function: "بيتابع الـ tasks خطوة بخطوة" },
  ],
};
