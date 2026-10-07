import type { ZodType } from "zod";
import { getStyleProfile, STYLE_IDS, type StyleId } from "../creative-kit/styles.ts";
import {
  CONCEPT_DEFAULT_FRAMES,
  CONCEPT_FAMILIES,
  CONCEPT_FPS,
  CONCEPT_IDS,
  conceptDefIssues,
  type ConceptFamily,
  type ConceptId,
  type ConceptMode,
} from "./types.ts";
import { MIN_FRAMES as MIN_BUTTON_TO_WINDOW, settledFrame as settledButtonToWindow } from "./button-to-window/math.ts";
import { buttonToWindowDemo, buttonToWindowSchema } from "./button-to-window/schema.ts";
import { MIN_FRAMES as MIN_PROMPT_TO_RESULTS, settledFrame as settledPromptToResults } from "./prompt-to-results/math.ts";
import { promptToResultsDemo, promptToResultsSchema } from "./prompt-to-results/schema.ts";
import { MIN_FRAMES as MIN_BRIEF_TO_WORKSPACE, settledFrame as settledBriefToWorkspace } from "./brief-to-workspace/math.ts";
import { briefToWorkspaceDemo, briefToWorkspaceSchema } from "./brief-to-workspace/schema.ts";
import { MIN_FRAMES as MIN_DEPARTMENT_TABS, settledFrame as settledDepartmentTabs } from "./department-tabs/math.ts";
import { departmentTabsDemo, departmentTabsSchema } from "./department-tabs/schema.ts";
import { MIN_FRAMES as MIN_DATA_MORPH, settledFrame as settledDataMorph } from "./data-morph/math.ts";
import { dataMorphDemo, dataMorphSchema } from "./data-morph/schema.ts";
import { MIN_FRAMES as MIN_KPI_ZOOM, settledFrame as settledKpiZoom } from "./kpi-zoom/math.ts";
import { kpiZoomDemo, kpiZoomSchema } from "./kpi-zoom/schema.ts";
import { MIN_FRAMES as MIN_TOOL_STACK_SPREAD, settledFrame as settledToolStackSpread } from "./tool-stack-spread/math.ts";
import { toolStackSpreadDemo, toolStackSpreadSchema } from "./tool-stack-spread/schema.ts";
import { MIN_FRAMES as MIN_MAGNETIC_DOCK, settledFrame as settledMagneticDock } from "./magnetic-dock/math.ts";
import { magneticDockDemo, magneticDockSchema } from "./magnetic-dock/schema.ts";
import { MIN_FRAMES as MIN_KEYWORD_REVEAL, settledFrame as settledKeywordReveal } from "./keyword-reveal/math.ts";
import { keywordRevealDemo, keywordRevealSchema } from "./keyword-reveal/schema.ts";
import { MIN_FRAMES as MIN_HEADLINE_TO_SYSTEM, settledFrame as settledHeadlineToSystem } from "./headline-to-system/math.ts";
import { headlineToSystemDemo, headlineToSystemSchema } from "./headline-to-system/schema.ts";
import { MIN_FRAMES as MIN_PANEL_REVEAL, settledFrame as settledPanelReveal } from "./panel-reveal/math.ts";
import { panelRevealDemo, panelRevealSchema } from "./panel-reveal/schema.ts";
import { MIN_FRAMES as MIN_SYSTEM_LAYERS, settledFrame as settledSystemLayers } from "./system-layers/math.ts";
import { systemLayersDemo, systemLayersSchema } from "./system-layers/schema.ts";
import { MIN_FRAMES as MIN_GLASS_LENS, settledFrame as settledGlassLens } from "./glass-lens/math.ts";
import { glassLensDemo, glassLensSchema } from "./glass-lens/schema.ts";
import { MIN_FRAMES as MIN_AUTOMATION_FLOW, settledFrame as settledAutomationFlow } from "./automation-flow/math.ts";
import { automationFlowDemo, automationFlowSchema } from "./automation-flow/schema.ts";
import { MIN_FRAMES as MIN_CHAOS_TO_BRAND, settledFrame as settledChaosToBrand } from "./chaos-to-brand/math.ts";
import { chaosToBrandDemo, chaosToBrandSchema } from "./chaos-to-brand/schema.ts";




export const CONCEPT_CANVAS = { width: 1080, height: 1920 } as const;


export const conceptCompositionId = (id: ConceptId): string => `Concept-${id}`;


export type ConceptMeta = {
  readonly id: string;
  readonly durationInFrames: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
};

export const conceptMeta = (concept: { id: ConceptId; defaultFrames: number }): ConceptMeta => ({
  id: conceptCompositionId(concept.id),
  durationInFrames: concept.defaultFrames,
  fps: CONCEPT_FPS,
  width: CONCEPT_CANVAS.width,
  height: CONCEPT_CANVAS.height,
});


export const conceptMetaIssues = (meta: ConceptMeta, minFrames: number): string[] => {
  const issues: string[] = [];
  if (meta.fps !== 30) issues.push(`meta ${meta.id}: fps ${meta.fps}, concepts run at 30 fps`);
  if (meta.width !== CONCEPT_CANVAS.width || meta.height !== CONCEPT_CANVAS.height) {
    issues.push(`meta ${meta.id}: canvas ${meta.width}x${meta.height}, concepts are ${CONCEPT_CANVAS.width}x${CONCEPT_CANVAS.height}`);
  }
  if (!Number.isInteger(meta.durationInFrames) || meta.durationInFrames < minFrames) {
    issues.push(`meta ${meta.id}: durationInFrames ${meta.durationInFrames} is below the concept's minFrames ${minFrames}`);
  }
  return issues;
};



type Source = {
  readonly title: string;
  readonly message: string;
  readonly family: ConceptFamily;
  readonly tags: readonly string[];
  readonly loopable: boolean;

  readonly minFrames: number;
  readonly schema: ZodType;
  readonly demo: unknown;
};

const SOURCES: Readonly<Record<ConceptId, Source>> = {
  "button-to-window": {
    title: "Button to window",
    message: "One click becomes a live product demo.",
    family: "morph",
    tags: [
      "button", "cta", "morph", "product demo", "window", "call to action",
      "زرار", "زر", "ديمو", "نافذة", "دعوة لاتخاذ إجراء", "تحول",
    ],
    loopable: true,
    minFrames: MIN_BUTTON_TO_WINDOW,
    schema: buttonToWindowSchema,
    demo: buttonToWindowDemo,
  },
  "prompt-to-results": {
    title: "Prompt to result cards",
    message: "One instruction, multiple useful outputs.",
    family: "flow",
    tags: [
      "prompt", "ai", "result cards", "typing", "input field", "stagger",
      "برومبت", "أمر", "نتائج", "كروت", "كتابة", "ذكاء اصطناعي",
    ],
    loopable: true,
    minFrames: MIN_PROMPT_TO_RESULTS,
    schema: promptToResultsSchema,
    demo: promptToResultsDemo,
  },
  "brief-to-workspace": {
    title: "Brief to workspace",
    message: "A short brief unfolds into a complete plan.",
    family: "morph",
    tags: [
      "brief", "workspace", "plan", "panels", "expand", "project setup",
      "بريف", "مساحة عمل", "خطة", "لوحات", "توسيع", "مشروع",
    ],
    loopable: true,
    minFrames: MIN_BRIEF_TO_WORKSPACE,
    schema: briefToWorkspaceSchema,
    demo: briefToWorkspaceDemo,
  },
  "department-tabs": {
    title: "Department tabs",
    message: "The same automation idea applied across every department.",
    family: "stack",
    tags: [
      "tabs", "departments", "automation", "business", "operating system", "sliding indicator",
      "تبويبات", "أقسام", "أتمتة", "شركة", "نظام تشغيل", "قسم",
    ],
    loopable: true,
    minFrames: MIN_DEPARTMENT_TABS,
    schema: departmentTabsSchema,
    demo: departmentTabsDemo,
  },
  "data-morph": {
    title: "Bars morph to line",
    message: "The same data, told as a trend.",
    family: "data",
    tags: [
      "bar chart", "line chart", "data", "trend", "kpi", "growth",
      "morph", "رسم بياني", "أعمدة", "خط", "ترند", "نمو",
      "بيانات",
    ],
    loopable: true,
    minFrames: MIN_DATA_MORPH,
    schema: dataMorphSchema,
    demo: dataMorphDemo,
  },
  "kpi-zoom": {
    title: "Dashboard KPI zoom",
    message: "Out of the whole dashboard, this is the number that matters.",
    family: "data",
    tags: [
      "kpi", "dashboard", "metrics", "zoom", "focus", "count up",
      "analytics", "لوحة بيانات", "مؤشرات", "أرقام", "تكبير", "إحصائيات",
      "تركيز",
    ],
    loopable: true,
    minFrames: MIN_KPI_ZOOM,
    schema: kpiZoomSchema,
    demo: kpiZoomDemo,
  },
  "tool-stack-spread": {
    title: "Tool stack spread",
    message: "The whole stack, laid out in one glance.",
    family: "stack",
    tags: [
      "tool stack", "cards", "spread", "deck", "tools list", "overview",
      "ستاك الأدوات", "كروت", "الأدوات", "نظرة شاملة", "فرد الكروت", "قائمة أدوات",
    ],
    loopable: true,
    minFrames: MIN_TOOL_STACK_SPREAD,
    schema: toolStackSpreadSchema,
    demo: toolStackSpreadDemo,
  },
  "magnetic-dock": {
    title: "Magnetic dock",
    message: "Meet the tools, one by one.",
    family: "stack",
    tags: [
      "dock", "magnify", "tool stack", "toolbar", "cursor", "icons",
      "دوك", "أدوات", "تكبير", "شريط الأدوات", "أيقونات", "مؤشر",
    ],
    loopable: true,
    minFrames: MIN_MAGNETIC_DOCK,
    schema: magneticDockSchema,
    demo: magneticDockDemo,
  },
  "keyword-reveal": {
    title: "Keyword outline reveal",
    message: "The launch word, filling with meaning.",
    family: "type",
    tags: [
      "keyword", "outline", "text reveal", "typography", "headline", "launch",
      "generative", "كلمة مفتاحية", "حروف", "عنوان", "كشف", "إطلاق",
      "تعبئة",
    ],
    loopable: true,
    minFrames: MIN_KEYWORD_REVEAL,
    schema: keywordRevealSchema,
    demo: keywordRevealDemo,
  },
  "headline-to-system": {
    title: "Headline to content system",
    message: "One idea becomes many content assets.",
    family: "type",
    tags: [
      "headline", "content system", "hub", "one idea", "repurposing", "connectors",
      "عنوان", "فكرة", "نظام محتوى", "محور", "إعادة استخدام المحتوى", "توصيلات",
    ],
    loopable: true,
    minFrames: MIN_HEADLINE_TO_SYSTEM,
    schema: headlineToSystemSchema,
    demo: headlineToSystemDemo,
  },
  "panel-reveal": {
    title: "Panel reveal",
    message: "Panels part to reveal a course, event or product.",
    family: "reveal",
    tags: [
      "panel reveal", "curtain", "reveal", "event", "course launch", "product launch",
      "كشف", "ستارة", "لوحات", "إطلاق كورس", "فعالية", "إعلان منتج",
    ],
    loopable: true,
    minFrames: MIN_PANEL_REVEAL,
    schema: panelRevealSchema,
    demo: panelRevealDemo,
  },
  "system-layers": {
    title: "System layers",
    message: "Business architecture, layer by layer.",
    family: "stack",
    tags: [
      "layers", "system layers", "architecture", "stack", "perspective", "exploded view",
      "طبقات", "طبقات النظام", "معمارية", "هيكل", "منظور", "بنية العمل",
    ],
    loopable: true,
    minFrames: MIN_SYSTEM_LAYERS,
    schema: systemLayersSchema,
    demo: systemLayersDemo,
  },
  "glass-lens": {
    title: "Glass focus lens",
    message: "Focus on the metric that matters.",
    family: "reveal",
    tags: [
      "lens", "focus", "magnifier", "kpi", "metrics", "report",
      "spotlight", "عدسة", "تركيز", "مؤشر أداء", "تقرير", "تكبير",
      "مقاييس",
    ],
    loopable: true,
    minFrames: MIN_GLASS_LENS,
    schema: glassLensSchema,
    demo: glassLensDemo,
  },
  "automation-flow": {
    title: "Automation flow pulse",
    message: "Input flows through automated steps into a business output.",
    family: "flow",
    tags: [
      "automation", "workflow", "pipeline", "process", "flow", "connectors",
      "أتمتة", "سير العمل", "خطوات", "عملية", "مسار", "ربط الأدوات",
    ],
    loopable: true,
    minFrames: MIN_AUTOMATION_FLOW,
    schema: automationFlowSchema,
    demo: automationFlowDemo,
  },
  "chaos-to-brand": {
    title: "Chaos to brand",
    message: "Scattered chaos organises into a brand mark and then a clean lockup.",
    family: "morph",
    tags: [
      "chaos", "brand", "logo reveal", "lockup", "particles", "brand identity",
      "فوضى", "علامة تجارية", "شعار", "هوية بصرية", "جسيمات", "تنظيم",
    ],
    loopable: true,
    minFrames: MIN_CHAOS_TO_BRAND,
    schema: chaosToBrandSchema,
    demo: chaosToBrandDemo,
  },
};



export type ConceptDataField = {
  readonly name: string;
  readonly kind: "text" | "number" | "boolean" | "list" | "object" | "choice" | "other";
  readonly required: boolean;

  readonly maxLength?: number;

  readonly minItems?: number;
  readonly maxItems?: number;
};


type ZodLike = {
  isOptional?: () => boolean;
  maxLength?: number | null;
  shape?: Record<string, ZodLike>;
  def?: { type?: string; innerType?: ZodLike; checks?: { _zod?: { def?: { check?: string; minimum?: number; maximum?: number; length?: number } } }[] };
};

const unwrap = (field: ZodLike): ZodLike => {
  let cur = field;
  while (cur.def?.innerType && (cur.def.type === "optional" || cur.def.type === "default" || cur.def.type === "nullable")) cur = cur.def.innerType;
  return cur;
};

const KINDS: Readonly<Record<string, ConceptDataField["kind"]>> = {
  string: "text",
  number: "number",
  int: "number",
  boolean: "boolean",
  array: "list",
  object: "object",
  enum: "choice",
  literal: "choice",
};


export const dataFieldsOf = (schema: unknown): ConceptDataField[] => {
  const shape = (schema as ZodLike | null)?.shape;
  if (!shape) return [];
  return Object.entries(shape).map(([name, raw]) => {
    const inner = unwrap(raw);
    const kind = KINDS[inner.def?.type ?? ""] ?? "other";
    const field: { -readonly [K in keyof ConceptDataField]: ConceptDataField[K] } = { name, kind, required: !(raw.isOptional?.() ?? false) };
    if (kind === "text" && typeof inner.maxLength === "number") field.maxLength = inner.maxLength;
    if (kind === "list") {
      for (const check of inner.def?.checks ?? []) {
        const d = check._zod?.def;
        if (d?.check === "min_length") field.minItems = d.minimum;
        else if (d?.check === "max_length") field.maxItems = d.maximum;
        else if (d?.check === "length_equals") field.minItems = field.maxItems = d.length;
      }
    }
    return field;
  });
};



export type ConceptCatalogEntry = {
  readonly id: ConceptId;

  readonly compositionId: string;
  readonly title: string;
  readonly message: string;
  readonly family: ConceptFamily;
  readonly tags: readonly string[];
  readonly minFrames: number;
  readonly defaultFrames: number;
  readonly loopable: boolean;
  readonly dataFields: readonly ConceptDataField[];
};


export const CATALOG: readonly ConceptCatalogEntry[] = Object.freeze(
  CONCEPT_IDS.map((id) => {
    const s = SOURCES[id];
    return Object.freeze({
      id,
      compositionId: conceptCompositionId(id),
      title: s.title,
      message: s.message,
      family: s.family,
      tags: Object.freeze([...s.tags]),
      minFrames: s.minFrames,
      defaultFrames: CONCEPT_DEFAULT_FRAMES,
      loopable: s.loopable,
      dataFields: Object.freeze(dataFieldsOf(s.schema)),
    });
  }),
);

export const getCatalogEntry = (id: string): ConceptCatalogEntry => {
  const hit = CATALOG.find((e) => e.id === id);
  if (!hit) throw new Error(`Unknown motion concept ${JSON.stringify(id)}. Choose one of: ${CONCEPT_IDS.join(", ")}.`);
  return hit;
};


export const catalogSchema = (id: ConceptId): ZodType => SOURCES[id].schema;
export const catalogDemo = (id: ConceptId): unknown => SOURCES[id].demo;










const SETTLED: Readonly<Record<ConceptId, (mode: ConceptMode, duration: number, tabs: number) => number>> = {
  "button-to-window": (m, d) => settledButtonToWindow(m, d),
  "prompt-to-results": (m, d) => settledPromptToResults(m, d),
  "brief-to-workspace": (m, d) => settledBriefToWorkspace(m, d),
  "department-tabs": (m, d, n) => settledDepartmentTabs(m, d, n),
  "data-morph": (m, d) => settledDataMorph(m, d),
  "kpi-zoom": (m, d) => settledKpiZoom(m, d),
  "tool-stack-spread": (m, d) => settledToolStackSpread(m, d),
  "magnetic-dock": (m, d) => settledMagneticDock(m, d),
  "keyword-reveal": (m, d) => settledKeywordReveal(m, d),
  "headline-to-system": (m, d) => settledHeadlineToSystem(m, d),
  "panel-reveal": (m, d) => settledPanelReveal(m, d),
  "system-layers": (m, d) => settledSystemLayers(m, d),
  "glass-lens": (m, d) => settledGlassLens(m, d),
  "automation-flow": (m, d) => settledAutomationFlow(m, d),
  "chaos-to-brand": (m, d) => settledChaosToBrand(m, d),
};






export const conceptSettledFrame = (id: ConceptId, mode: ConceptMode, duration: number, tabs?: number): number => {
  const fn = SETTLED[id];
  if (!fn) throw new Error(`Unknown motion concept ${JSON.stringify(id)}. Choose one of: ${CONCEPT_IDS.join(", ")}.`);
  const n = tabs ?? (SOURCES[id].demo as { tabs?: readonly unknown[] } | undefined)?.tabs?.length ?? 0;
  const frame = fn(mode, duration, n);
  if (!Number.isInteger(frame) || frame < 0 || frame >= duration) throw new Error(`motion-concepts ${id}: settled frame ${String(frame)} is outside 0..${duration - 1}`);
  return frame;
};




export const searchKey = (text: string): string =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();

export type ListOptions = { query?: string; style?: string; family?: string };






export const listMotionConcepts = ({ query = "", style, family }: ListOptions = {}) => {
  const profile = style === undefined ? null : getStyleProfile(style);
  if (family !== undefined && !(CONCEPT_FAMILIES as readonly string[]).includes(family)) {
    throw new Error(`Unknown motion concept family: ${family}. Choose one of: ${CONCEPT_FAMILIES.join(", ")}.`);
  }
  if (typeof query !== "string" || query.length > 200) throw new Error("Motion concept query must be text of at most 200 characters.");
  const terms = searchKey(query).split(/\s+/u).filter(Boolean);
  const scored: { entry: ConceptCatalogEntry; score: number; order: number }[] = [];
  CATALOG.forEach((entry, order) => {
    if (family !== undefined && entry.family !== family) return;
    const tags = entry.tags.map(searchKey);
    const plain = searchKey(`${entry.id} ${entry.title} ${entry.message}`);
    let score = 0;
    for (const term of terms) {
      const exact = tags.some((t) => t === term);
      const inTag = tags.some((t) => t.includes(term));
      const inText = plain.includes(term);
      if (!exact && !inTag && !inText) return;
      score += exact ? 3 : inTag ? 2 : 1;
    }
    scored.push({ entry, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return {
    ok: true as const,
    version: 1,
    selection: "Authored motion scenes; demo data is SAMPLE and claims nothing. Every concept renders in all seven approved style directions.",
    style: profile,
    concepts: scored.map(({ entry }) => ({
      ...entry,
      compatibleStyles: [...STYLE_IDS] as StyleId[],
      styleFit: "supported" as const,
    })),
  };
};



type ConceptRecord = Parameters<typeof conceptDefIssues>[0];


export const conceptCatalogIssues = (def: ConceptRecord): string[] => {
  const id = def.id as ConceptId;
  const src = SOURCES[id];
  if (!src) return [`${String(def.id)}: not in the catalog`];
  const issues: string[] = [];
  if (def.title !== src.title) issues.push(`${id}: title differs from the catalog`);
  if (def.message !== src.message) issues.push(`${id}: message differs from the catalog`);
  if (def.family !== src.family) issues.push(`${id}: family differs from the catalog`);
  if (JSON.stringify(def.tags) !== JSON.stringify(src.tags)) issues.push(`${id}: tags differ from the catalog`);
  if (def.minFrames !== src.minFrames) issues.push(`${id}: minFrames ${String(def.minFrames)} differs from math.ts MIN_FRAMES ${src.minFrames}`);
  if (def.loopable !== src.loopable) issues.push(`${id}: loopable differs from the catalog`);
  if (def.schema !== src.schema) issues.push(`${id}: schema is not the one exported by schema.ts`);
  if (def.demo !== src.demo) issues.push(`${id}: demo is not the one exported by schema.ts`);
  return issues;
};





export const conceptRegistryIssues = (list: readonly ConceptRecord[], metaOf: (c: { id: ConceptId; defaultFrames: number }) => ConceptMeta = conceptMeta): string[] => {
  const issues: string[] = [];
  const seen = new Set<unknown>();
  for (const c of list) {
    if (seen.has(c.id)) issues.push(`duplicate concept id ${String(c.id)}`);
    seen.add(c.id);
  }
  for (const id of CONCEPT_IDS) if (!seen.has(id)) issues.push(`missing concept ${id}`);
  for (const c of list) {
    const tag = String(c.id);
    issues.push(...conceptDefIssues(c).map((m) => `${tag}: ${m}`));
    if (typeof c.defaultFrames === "number" && typeof c.minFrames === "number" && c.defaultFrames < c.minFrames) {
      issues.push(`${tag}: defaultFrames ${c.defaultFrames} < minFrames ${c.minFrames}`);
    }
    if ((CONCEPT_IDS as readonly unknown[]).includes(c.id)) {
      issues.push(...conceptMetaIssues(metaOf(c as { id: ConceptId; defaultFrames: number }), c.minFrames as number));
      issues.push(...conceptCatalogIssues(c));
    }
  }
  return issues;
};


export const assertConceptRegistry = (list: readonly ConceptRecord[], metaOf?: (c: { id: ConceptId; defaultFrames: number }) => ConceptMeta): void => {
  const issues = conceptRegistryIssues(list, metaOf);
  if (issues.length > 0) throw new Error(`motion-concepts registry: ${issues.join("; ")}`);
};
