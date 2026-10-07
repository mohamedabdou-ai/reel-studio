import { z } from "zod";
import { copy, listOf, optionalCopy } from "../fields.ts";


const atMostTwoDecimals = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

export const kpiTileSchema = z.strictObject({

  name: copy(24),

  value: z.number().min(-9_999_999).max(9_999_999).refine(atMostTwoDecimals, "At most two decimals"),

  change: z.number().min(-999.9).max(999.9),
});

export const kpiZoomSchema = z.strictObject({

  tiles: listOf(kpiTileSchema, 5, 5),

  focusIndex: z.number().int().min(0).max(4),

  unit: optionalCopy(4),
});

export type KpiTileData = z.infer<typeof kpiTileSchema>;
export type KpiZoomData = z.infer<typeof kpiZoomSchema>;


export const kpiZoomDemo: KpiZoomData = {
  tiles: [
    { name: "SAMPLE · Revenue", value: 48200, change: 8.2 },
    { name: "الطلبات", value: 1240, change: -3.1 },
    { name: "معدل الـ Conversion", value: 4.8, change: 12.4 },
    { name: "Active users", value: 9350, change: 5.7 },
    { name: "معدل الإلغاء", value: 2.1, change: -0.6 },
  ],
  focusIndex: 2,
  unit: "%",
};
