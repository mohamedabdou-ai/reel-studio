import type { EditManifest } from "../../prepared-edit/schema.ts";
import { validateManifest } from "../validate.ts";
import type { Issue } from "../types.ts";
import { issuesReason } from "./explain.ts";


export type ItemKind = "scene" | "sound" | "camera" | "transition" | "layoutTransition" | "pip" | "foreground" | "signoff";
export type ReportItem = { kind: ItemKind; label: string; why: string };
export type RippleReport = {

  delta: { kind: "remove" | "insert"; at: number; count: number } | null;
  durationBefore: number;
  durationAfter: number;

  shifted: number;

  adjusted: ReportItem[];

  dropped: ReportItem[];

  words: { newlyCut: number; newlyOmitted: number };
};

type Empty = Record<never, never>;
export type OpOk<T extends object = Empty> = { ok: true; manifest: EditManifest; changed: boolean; notes: string[] } & T;
export type OpFail = { ok: false; reason: string; needsConfirm?: boolean; report?: RippleReport };
export type OpResult<T extends object = Empty> = OpOk<T> | OpFail;

export const refuse = (reason: string): OpFail => ({ ok: false, reason });


export const unchanged = <T extends object = Empty>(manifest: EditManifest, extra?: T, notes: string[] = []): OpOk<T> =>
  ({ ok: true, manifest, changed: false, notes, ...(extra ?? ({} as T)) });

const signature = (i: Issue) => `${i.code}|${i.path}|${i.detail ?? i.message}`;






export function finalize<T extends object = Empty>(before: EditManifest, after: EditManifest, extra?: T, notes: string[] = []): OpResult<T> {
  if (after === before) return unchanged(before, extra, notes);
  const now = validateManifest(after);
  if (!now.ok) {
    const errors = now.issues.filter((i) => i.severity === "error");
    const prior = new Set(validateManifest(before).issues.filter((i) => i.severity === "error").map(signature));
    const fresh = errors.filter((i) => !prior.has(signature(i)));
    if (fresh.length) return { ok: false, reason: issuesReason(fresh), ...(extra && "report" in extra ? { report: (extra as any).report } : {}) };
  }
  return { ok: true, manifest: after, changed: true, notes, ...(extra ?? ({} as T)) };
}
