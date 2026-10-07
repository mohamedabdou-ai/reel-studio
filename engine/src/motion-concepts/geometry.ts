import { px } from "../core/motion.ts";


export type Rect = { x: number; y: number; width: number; height: number };


export type Rail = { x: number; y: number } | null;


export type ConceptBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  rail: Rail;
};


export type ZoneLike = { top: number; bottom: number; left: number; right: number; rail: Rail };


export const boxFromZone = (z: ZoneLike): ConceptBox => ({
  left: z.left,
  top: z.top,
  right: z.right,
  bottom: z.bottom,
  width: z.right - z.left,
  height: z.bottom - z.top,
  rail: z.rail,
});


export const mainBottom = (box: ConceptBox): number => (box.rail ? Math.min(box.bottom, box.rail.y) : box.bottom);

export const rectRight = (r: Rect): number => r.x + r.width;
export const rectBottom = (r: Rect): number => r.y + r.height;


export const roundRect = (r: Rect): Rect => ({ x: px(r.x), y: px(r.y), width: px(r.width), height: px(r.height) });


export const intersectRect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(rectRight(a), rectRight(b));
  const bt = Math.min(rectBottom(a), rectBottom(b));
  return r > x && bt > y ? { x, y, width: r - x, height: bt - y } : null;
};


export const insetRect = (r: Rect, n: number): Rect => ({ x: r.x + n, y: r.y + n, width: r.width - 2 * n, height: r.height - 2 * n });


export const centerRect = (cx: number, cy: number, width: number, height: number): Rect => ({
  x: cx - width / 2,
  y: cy - height / 2,
  width,
  height,
});


export const mirrorX = (r: Rect, W: number): Rect => ({ ...r, x: W - r.x - r.width });







export const rectIssues = (r: Rect, box: ConceptBox, margin = 0): string[] => {
  const issues: string[] = [];
  if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) return ["rect has a non-finite number"];
  if (r.width < 0 || r.height < 0) issues.push(`negative size ${r.width}x${r.height}`);
  if (r.x < box.left + margin) issues.push(`left ${r.x} < ${box.left + margin}`);
  if (r.y < box.top + margin) issues.push(`top ${r.y} < ${box.top + margin}`);
  if (rectRight(r) > box.right - margin) issues.push(`right ${rectRight(r)} > ${box.right - margin}`);
  if (rectBottom(r) > box.bottom - margin) issues.push(`bottom ${rectBottom(r)} > ${box.bottom - margin}`);
  if (box.rail && rectRight(r) > box.rail.x - margin && rectBottom(r) > box.rail.y - margin) {
    issues.push(`enters the action rail (x >= ${box.rail.x - margin} and y >= ${box.rail.y - margin})`);
  }
  return issues;
};


export const SURFACE_REACH = 28;

export const SURFACE_INSET = SURFACE_REACH + 4;






export const captionCenterY = (box: ConceptBox): number => Math.round((mainBottom(box) + box.bottom) / 2);
