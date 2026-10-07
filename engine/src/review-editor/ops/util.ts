import type { EditManifest } from "../../prepared-edit/schema.ts";
import { totalFrames } from "../time.ts";

export type Scene = EditManifest["scenes"][number];
export type Word = EditManifest["captions"]["words"][number];

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export const toFrames = (n: number): number => Math.round(n);



export const round3 = (n: number): number => Math.round(n * 1000) / 1000;
export const ceil3 = (n: number): number => Math.ceil(n * 1000 - 1e-9) / 1000;
export const floor3 = (n: number): number => Math.floor(n * 1000 + 1e-9) / 1000;

export const sceneEnd = (s: Pick<Scene, "fromFrame" | "durationInFrames">): number => s.fromFrame + s.durationInFrames;

export const limitFrame = (m: EditManifest): number => m.signoffFromFrame ?? totalFrames(m);
export const sourceTotalMs = (m: EditManifest): number => (m.source.totalFrames / m.source.fps) * 1000;
export const frameMs = (m: EditManifest): number => 1000 / m.source.fps;

export const sceneIndex = (m: EditManifest, id: string): number => m.scenes.findIndex((s) => s.id === id);

export const fmtFrames = (n: number): string => `${n} فريم`;


export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-") || "scene";
  const head = /^[a-z0-9]/.test(clean) ? clean : `s-${clean}`;
  for (let n = 1; n < 10000; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const id = `${head.slice(0, 64 - suffix.length)}${suffix}`.replace(/-+$/g, "");
    if (!taken.has(id)) return id;
  }
  return `${head.slice(0, 50)}-${taken.size + 1}`;
}


export function insertSorted<T>(list: readonly T[], item: T, key: (x: T) => number): [T[], number] {
  const k = key(item);
  let at = list.findIndex((x) => key(x) > k);
  if (at < 0) at = list.length;
  const copy = list.slice();
  copy.splice(at, 0, item);
  return [copy, at];
}

export const replaceAt = <T>(list: readonly T[], index: number, item: T): T[] => list.map((x, i) => (i === index ? item : x));
export const removeAt = <T>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);
