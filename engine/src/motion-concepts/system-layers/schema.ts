import { z } from "zod";
import { copy, listOf, optionalCopy } from "../fields.ts";

export const LABEL_MAX = 28;
export const DETAIL_MAX = 38;

const layerSchema = z.strictObject({

  label: copy(LABEL_MAX),

  detail: optionalCopy(DETAIL_MAX),
});

export const systemLayersSchema = z.strictObject({

  layers: listOf(layerSchema, 5, 5),
});

export type SystemLayersData = z.infer<typeof systemLayersSchema>;
export type SystemLayersLayer = z.infer<typeof layerSchema>;


export const systemLayersDemo: SystemLayersData = {
  layers: [
    { label: "تجربة العميل", detail: "SAMPLE · Web · App · Chat" },
    { label: "المبيعات والتسويق", detail: "CRM · Funnels · Ads" },
    { label: "العمليات اليومية", detail: "Workflows · Team · SLA" },
    { label: "البيانات والتقارير", detail: "Dashboards · KPIs" },
    { label: "الأساس التقني", detail: "Cloud · Security · AI" },
  ],
};
