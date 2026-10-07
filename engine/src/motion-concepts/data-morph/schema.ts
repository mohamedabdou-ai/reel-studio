import { z } from "zod";
import { copy, listOf, optionalCopy } from "../fields.ts";


export const VALUE_MAX = 1e12;

export const VALUE_COUNT = 6;

const figure = z.number().min(0).max(VALUE_MAX);

export const dataMorphSchema = z.strictObject({

  metricLabel: copy(30),

  values: listOf(figure, VALUE_COUNT, VALUE_COUNT),

  finalKpi: copy(14),

  resultLabel: copy(28),

  unit: optionalCopy(12),
});

export type DataMorphData = z.infer<typeof dataMorphSchema>;





export const dataMorphDemo: DataMorphData = {
  metricLabel: "SAMPLE · زوّار الـ Website",
  values: [18, 24, 22, 31, 39, 52],
  finalKpi: "+١٨٩٪",
  resultLabel: "الـ Traffic في صعود",
  unit: "بالألف",
};
