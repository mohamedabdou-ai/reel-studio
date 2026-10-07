import type { JobResult } from "../types.ts";
import type { JobKind } from "./job-state.ts";

export type GateStatus = "PASS" | "FAIL" | "NEEDS-REVIEW" | "SKIPPED";
export type GateId = "encode" | "safe" | "motion" | "head" | "plates";
export type GateRow = { id: GateId; label: string; status: GateStatus; detail: string | null };
export type GateSummary = { overall: GateStatus; rows: GateRow[]; warnings: string[] };

const LABELS: Record<GateId, string> = {
  encode: "Encode (ig-check): مواصفات إنستجرام",
  safe: "Safe zone: مناطق الأمان",
  motion: "Presenter motion: حركة المقدّم",
  head: "Head keep-out: الراس والشعر والدقن",
  plates: "Plates: سلامة ملفات الفوتيج",
};

const firstString = (...values: unknown[]): string | null => {
  for (const v of values) if (typeof v === "string" && v.trim()) return v;
  return null;
};
const compact = (v: unknown): string => {
  try { return JSON.stringify(v, null, 2).slice(0, 4000); } catch { return String(v); }
};


export function interpretGate(v: unknown): { status: GateStatus; detail: string | null } {
  if (v === null || v === undefined) return { status: "SKIPPED", detail: null };
  if (typeof v === "boolean") return { status: v ? "PASS" : "FAIL", detail: null };
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    if (s === "PASS") return { status: "PASS", detail: null };
    return { status: s === "FAIL" ? "FAIL" : "NEEDS-REVIEW", detail: v };
  }
  if (typeof v !== "object") return { status: "NEEDS-REVIEW", detail: String(v) };
  const o = v as Record<string, unknown>;
  const reason = firstString(o.reason, o.message, o.error, o.summary, o.detail);
  if (typeof o.status === "string") {
    const said = o.status.trim().toUpperCase();
    if (said === "PASS") return { status: "PASS", detail: null };
    if (said === "SKIPPED") return { status: "SKIPPED", detail: reason };
    const standard = said === "NEEDS-REVIEW" || said === "FAIL";

    return { status: said === "NEEDS-REVIEW" ? "NEEDS-REVIEW" : "FAIL", detail: `${standard ? "" : `${o.status}: `}${reason ?? compact(o)}` };
  }
  if (typeof o.ok === "boolean") {
    if (!o.ok) return { status: "FAIL", detail: reason ?? compact(o) };
    if (o.exempt) return { status: "NEEDS-REVIEW", detail: reason ?? `exempt: ${String(o.exempt)} (presenter not checked)` };
    return { status: "PASS", detail: null };
  }
  return { status: "NEEDS-REVIEW", detail: reason ?? compact(o) };
}


function interpretPlates(v: unknown): { status: GateStatus; detail: string | null } {
  if (v === null || v === undefined) return { status: "SKIPPED", detail: null };
  const o = v as { level?: unknown; messages?: unknown };
  const level = typeof o.level === "string" ? o.level.trim().toUpperCase() : "";
  const messages = Array.isArray(o.messages) ? o.messages.filter((m): m is string => typeof m === "string") : [];
  const detail = messages.length ? messages.join("\n") : null;
  if (["PASS", "OK", "NONE", "CLEAN"].includes(level)) return { status: "PASS", detail: null };
  if (["FAIL", "ERROR", "BLOCK", "BLOCKED"].includes(level)) return { status: "FAIL", detail: detail ?? level };
  return { status: "NEEDS-REVIEW", detail: detail ?? (level || compact(v)) };
}

export function summarizeGates(result: JobResult, kind: JobKind): GateSummary {
  const g = (result.gates ?? {}) as Record<string, unknown>;
  const rows: GateRow[] = [];
  for (const id of ["encode", "safe", "motion"] as const) rows.push({ id, label: LABELS[id], ...interpretGate(g[id]) });
  if ("head" in g) rows.push({ id: "head", label: LABELS.head, ...interpretGate(g.head) });
  if ("plates" in g) rows.push({ id: "plates", label: LABELS.plates, ...interpretPlates(g.plates) });
  const warnings = Array.isArray(result.warnings) ? result.warnings.filter((w): w is string => typeof w === "string") : [];
  let overall: GateStatus;
  if (!result.ok || rows.some((r) => r.status === "FAIL")) overall = "FAIL";
  else if (result.needsReview === true || rows.some((r) => r.status === "NEEDS-REVIEW")) overall = "NEEDS-REVIEW";
  else if (kind === "deliver" && rows.some((r) => r.id !== "plates" && r.id !== "head" && r.status === "SKIPPED")) overall = "NEEDS-REVIEW";
  else if (kind !== "deliver" || rows.every((r) => r.status === "SKIPPED")) overall = "SKIPPED";
  else overall = "PASS";
  return { overall, rows, warnings };
}
