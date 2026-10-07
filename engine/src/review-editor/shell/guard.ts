import type { EditManifest } from "../../prepared-edit/schema.ts";
import type { Issue, ValidationResult } from "../types.ts";
import { validateManifest } from "../validate.ts";

const cache = new WeakMap<object, ValidationResult>();






export function validateCached(m: EditManifest): ValidationResult {
  const hit = cache.get(m);
  if (hit) return hit;
  const result = validateManifest(m);
  cache.set(m, result);
  return result;
}

const sig = (i: Issue) => `${i.stage}|${i.code}|${i.path}|${i.message}`;

export type GuardResult = { ok: true } | { ok: false; message: string; issues: Issue[] };

export function guardEdit(before: EditManifest, after: EditManifest, validate: (m: EditManifest) => ValidationResult = validateCached): GuardResult {
  if (before === after) return { ok: true };
  const known = new Set(validate(before).issues.filter((i) => i.severity === "error" && i.stage !== "delivery").map(sig));
  const fresh = validate(after).issues.filter((i) => i.severity === "error" && i.stage !== "delivery" && !known.has(sig(i)));
  if (!fresh.length) return { ok: true };
  return { ok: false, message: `${fresh[0].where}: ${fresh[0].message}`, issues: fresh };
}
