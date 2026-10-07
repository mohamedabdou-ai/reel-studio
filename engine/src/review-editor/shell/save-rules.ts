import type { ExportModeId, ExportModeInfo, Issue, ValidationResult } from "../types.ts";

export type Availability = { enabled: boolean; reason?: string };


export const blockingIssues = (v: ValidationResult): Issue[] => v.issues.filter((i) => i.severity === "error" && i.stage !== "delivery");

export const deliveryIssues = (v: ValidationResult): Issue[] => v.issues.filter((i) => i.stage === "delivery");

export function saveAvailability(v: ValidationResult): Availability {
  if (v.ok) return { enabled: true };
  const first = blockingIssues(v)[0];
  return { enabled: false, reason: first ? `فيه خطأ لازم يتصلّح قبل الحفظ: ${first.where}: ${first.message}` : "فيه أخطاء لازم تتصلّح قبل الحفظ." };
}

export function exportAvailability(v: ValidationResult, mode: ExportModeId, info: ExportModeInfo | undefined, needsPrepare: boolean): Availability {
  if (!v.ok) {
    const first = blockingIssues(v)[0];
    return { enabled: false, reason: first ? `فيه خطأ لازم يتصلّح الأول: ${first.where}: ${first.message}` : "فيه أخطاء لازم تتصلّح الأول." };
  }
  if (needsPrepare) return { enabled: false, reason: "لازم تضغط «حضّر» الأول: القص اتغيّر أو الفيديو لسه مش متحضّر." };
  if (info && !info.available) return { enabled: false, reason: info.reason ?? "الوضع ده مش متاح للمشروع ده." };
  if (mode === "deliver" && !v.deliveryReady) {
    const d = deliveryIssues(v);
    return { enabled: false, reason: `ناقص للتصدير النهائي (${d.length}): ${d[0]?.message ?? ""}`.trim() };
  }
  return { enabled: true };
}
