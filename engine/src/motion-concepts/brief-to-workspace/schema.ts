import { z } from "zod";
import { copy, listOf } from "../fields.ts";


export const panelSchema = z.strictObject({

  label: copy(18),

  detail: copy(40),
});

export const briefToWorkspaceSchema = z.strictObject({

  briefTitle: copy(48),

  panels: listOf(panelSchema, 5, 5),
});

export type BriefToWorkspaceData = z.infer<typeof briefToWorkspaceSchema>;






export const briefToWorkspaceDemo: BriefToWorkspaceData = {
  briefTitle: "SAMPLE: بريف حملة إطلاق المنتج الجديد",
  panels: [
    { label: "الهدف", detail: "زيادة الـ Leads من السوشيال ميديا" },
    { label: "الجمهور", detail: "أصحاب مشاريع صغيرة وعايزين Automation" },
    { label: "الرسالة", detail: "فايدة واحدة واضحة في أول ٣ ثواني" },
    { label: "المحتوى", detail: "٣ فيديوهات و Carousel وبوستات" },
    { label: "KPIs", detail: "Reach و Saves و CTR" },
  ],
};
