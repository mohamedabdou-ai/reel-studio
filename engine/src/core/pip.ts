import { clamp01, mix } from "./motion.ts";
import { boxInZone, noNegZero, type Rect, type Size, type ZoneLike } from "./device-geo.ts";
import type { StyleId } from "../creative-kit/styles";

export type PipCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const PIP_CORNERS: readonly PipCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
export type PipShape = "circle" | "rounded";


export type NormRect = { x: number; y: number; width: number; height: number };


export const PIP_RING = 6;

export const PIP_SHADOW = { css: "0 10px 24px rgba(0,0,0,0.32)", reach: 34 } as const;

export const PIP_REACH = PIP_RING + PIP_SHADOW.reach;

export const PIP_ROUNDED_RADIUS = 0.18;
export const PIP_DEFAULTS = { shape: "circle" as PipShape, margin: 24, reach: PIP_REACH, headFill: 0.82 };

export type PipInput = {

  faceBox: NormRect | null;

  zone: ZoneLike;

  size: number;
  corner: PipCorner;

  source: Size;
  shape?: PipShape;

  margin?: number;

  reach?: number;


  headFill?: number;
};


export type HeadSample = { frame: number; box: NormRect | null; confidence: number };








export const headUnion = (samples: readonly HeadSample[], fromFrame: number, toFrame: number): NormRect | null => {
  const sorted = [...samples].sort((a, b) => a.frame - b.frame);
  const before = sorted.filter((s) => s.frame < fromFrame).pop();
  const after = sorted.find((s) => s.frame >= toFrame);
  const picked = [...(before ? [before] : []), ...sorted.filter((s) => s.frame >= fromFrame && s.frame < toFrame), ...(after ? [after] : [])];
  if (picked.length === 0) return null;
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const s of picked) {
    if (s.box === null) return null;
    x0 = Math.min(x0, s.box.x);
    y0 = Math.min(y0, s.box.y);
    x1 = Math.max(x1, s.box.x + s.box.width);
    y1 = Math.max(y1, s.box.y + s.box.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};


export type PlateBox = { left: number; top: number; width: number; height: number };


export type PlateWindow = { x: number; y: number; width: number; height: number; radius: number; plate: PlateBox };

export type PipGeometry = {
  x: number;
  y: number;
  size: number;
  radius: number;
  shape: PipShape;
  plate: PlateBox;

  scale: number;

  head: Rect | null;

  bounds: Rect;
  status: "ok" | "NEEDS-REVIEW";
  reasons: string[];
};

const finiteBox = (b: NormRect): boolean =>
  [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
  b.width > 0 &&
  b.height > 0 &&
  b.x >= 0 &&
  b.y >= 0 &&
  b.x + b.width <= 1 + 1e-9 &&
  b.y + b.height <= 1 + 1e-9;



const placePlate = (source: Size, scale: number, boxW: number, boxH: number, cx: number, cy: number): PlateBox => {
  const width = Math.ceil(source.width * scale - 1e-9);
  const height = Math.ceil(source.height * scale - 1e-9);
  const left = noNegZero(Math.min(0, Math.max(boxW - width, Math.round(boxW / 2 - cx * width))));
  const top = noNegZero(Math.min(0, Math.max(boxH - height, Math.round(boxH / 2 - cy * height))));
  return { left, top, width, height };
};


export const pointInRoundedRect = (px: number, py: number, win: Rect & { radius: number }, tol = 0.5): boolean => {
  if (px < win.x - tol || px > win.x + win.width + tol || py < win.y - tol || py > win.y + win.height + tol) return false;
  const r = Math.max(0, Math.min(win.radius, win.width / 2, win.height / 2));
  const qx = Math.max(win.x + r - px, 0, px - (win.x + win.width - r));
  const qy = Math.max(win.y + r - py, 0, py - (win.y + win.height - r));
  return Math.hypot(qx, qy) <= r + tol;
};


export const headInside = (win: Rect & { radius: number }, head: Rect, tol = 0.5): boolean =>
  [
    [head.x, head.y],
    [head.x + head.width, head.y],
    [head.x, head.y + head.height],
    [head.x + head.width, head.y + head.height],
  ].every(([x, y]) => pointInRoundedRect(x, y, win, tol));


export const headOnCanvas = (win: PlateWindow, face: NormRect): Rect => ({
  x: win.x + win.plate.left + face.x * win.plate.width,
  y: win.y + win.plate.top + face.y * win.plate.height,
  width: face.width * win.plate.width,
  height: face.height * win.plate.height,
});






export const pipGeometry = (input: PipInput): PipGeometry => {
  const { faceBox, zone, corner, source, size } = input;
  const shape = input.shape ?? PIP_DEFAULTS.shape;
  const margin = input.margin ?? PIP_DEFAULTS.margin;
  const reach = input.reach ?? PIP_DEFAULTS.reach;
  const headFill = input.headFill ?? PIP_DEFAULTS.headFill;
  if (!Number.isInteger(size) || size <= 0) throw new RangeError(`core/pip: size must be a positive integer, got ${size}`);
  if (!PIP_CORNERS.includes(corner)) throw new RangeError(`core/pip: unknown corner "${String(corner)}"`);
  if (shape !== "circle" && shape !== "rounded") throw new RangeError(`core/pip: unknown shape "${String(shape)}"`);
  if (!(margin >= 0) || !(reach >= 0)) throw new RangeError(`core/pip: margin and reach must be ≥ 0, got ${margin} / ${reach}`);
  if (!(headFill > 0 && headFill <= 0.95)) throw new RangeError(`core/pip: headFill must be in (0, 0.95], got ${headFill}`);
  if (!(source.width > 0 && source.height > 0)) throw new RangeError(`core/pip: source size must be positive, got ${source.width}x${source.height}`);

  const inner = {
    left: zone.left + margin + reach,
    right: zone.right - margin - reach,
    top: zone.top + margin + reach,
    bottom: zone.bottom - margin - reach,
  };
  if (size > inner.right - inner.left || size > inner.bottom - inner.top) {
    throw new RangeError(`core/pip: a ${size}px PiP does not fit the zone after ${margin}px margin and ${reach}px reach`);
  }
  let x = corner.endsWith("left") ? inner.left : inner.right - size;
  const y = corner.startsWith("top") ? inner.top : inner.bottom - size;


  if (zone.rail !== null && x + size + reach > zone.rail.x && y + size + reach > zone.rail.y) {
    x = zone.rail.x - margin - reach - size;
    if (x < inner.left) throw new RangeError(`core/pip: a ${size}px PiP cannot clear the action rail at x ${zone.rail.x}`);
  }
  x = Math.round(x);
  const yy = Math.round(y);
  const radius = shape === "circle" ? size / 2 : Math.round(size * PIP_ROUNDED_RADIUS);
  const bounds: Rect = { x: x - reach, y: yy - reach, width: size + 2 * reach, height: size + 2 * reach };
  const fit = boxInZone(bounds, zone);
  if (!fit.ok) throw new Error(`core/pip: internal — PiP bounds hit ${fit.hits.join(", ")}`);

  const cover = Math.max(size / source.width, size / source.height);
  const reasons: string[] = [];
  if (faceBox === null) {
    reasons.push("faceBox is null: head envelope NEEDS-REVIEW — plate centred on the source's upper third, head containment unverified");
    return {
      x,
      y: yy,
      size,
      radius,
      shape,
      plate: placePlate(source, cover, size, size, 0.5, 0.35),
      scale: cover,
      head: null,
      bounds,
      status: "NEEDS-REVIEW",
      reasons,
    };
  }
  if (!finiteBox(faceBox)) throw new RangeError(`core/pip: faceBox must be a non-empty box inside 0..1, got ${JSON.stringify(faceBox)}`);

  const hw = faceBox.width * source.width;
  const hh = faceBox.height * source.height;
  const usable = shape === "circle" ? size : size - 2 * radius * (1 - Math.SQRT1_2);
  const fitScale = shape === "circle" ? (headFill * usable) / Math.hypot(hw, hh) : (headFill * usable) / Math.max(hw, hh);
  let scale = fitScale;
  if (fitScale < cover) {
    scale = cover;
    reasons.push(`head envelope too large: covering the window needs scale ${cover.toFixed(4)}, the head only fits at ${fitScale.toFixed(4)}`);
  }
  if (scale > 1) reasons.push(`plate upscaled ${scale.toFixed(3)}x inside the PiP`);
  const plate = placePlate(source, scale, size, size, faceBox.x + faceBox.width / 2, faceBox.y + faceBox.height / 2);
  const win: PlateWindow = { x, y: yy, width: size, height: size, radius, plate };
  const head = headOnCanvas(win, faceBox);
  if (!headInside(win, head)) reasons.push("head envelope clipped by the PiP window after the edge clamp");
  return { x, y: yy, size, radius, shape, plate, scale, head, bounds, status: reasons.length ? "NEEDS-REVIEW" : "ok", reasons };
};


export const pipWindow = (g: PipGeometry): PlateWindow => ({ x: g.x, y: g.y, width: g.size, height: g.size, radius: g.radius, plate: g.plate });


export const fullFrameWindow = (
  source: Size,
  frame: Size = { width: 1080, height: 1920 },
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): PlateWindow => {
  if (!(source.width > 0 && source.height > 0)) throw new RangeError(`core/pip: source size must be positive, got ${source.width}x${source.height}`);
  const scale = Math.max(frame.width / source.width, frame.height / source.height);
  return { x: 0, y: 0, width: frame.width, height: frame.height, radius: 0, plate: placePlate(source, scale, frame.width, frame.height, focus.x, focus.y) };
};







export const pipMorph = (from: PlateWindow, to: PlateWindow, p: number): PlateWindow => {
  const q = Number.isFinite(p) ? clamp01(p) : 0;
  const edges = (w: PlateWindow) => ({
    x0: w.x,
    y0: w.y,
    x1: w.x + w.width,
    y1: w.y + w.height,
    px0: w.x + w.plate.left,
    py0: w.y + w.plate.top,
    px1: w.x + w.plate.left + w.plate.width,
    py1: w.y + w.plate.top + w.plate.height,
  });
  const a = edges(from);
  const b = edges(to);
  const r = (k: keyof typeof a): number => noNegZero(Math.round(mix(a[k], b[k], q)));
  const x0 = r("x0");
  const y0 = r("y0");
  const px0 = r("px0");
  const py0 = r("py0");
  return {
    x: x0,
    y: y0,
    width: r("x1") - x0,
    height: r("y1") - y0,
    radius: mix(from.radius, to.radius, q),
    plate: { left: px0 - x0, top: py0 - y0, width: r("px1") - px0, height: r("py1") - py0 },
  };
};



export type PipPolicy = { allowed: boolean; basis: "observed" | "inference"; evidence: string };


export const PIP_POLICY: Record<StyleId, PipPolicy> = {
  'liquid-glass':{allowed:false,basis:'inference',evidence:'Use the split presenter window; glass detail panels reserve the takeover canvas.'},
  'campaign-tickets':{allowed:false,basis:'inference',evidence:'Use the split presenter window to keep tickets and comments clear.'},
  'magazine-interview':{allowed:false,basis:'inference',evidence:'Use the split presenter window with speaker attribution above it.'},
  'scrapbook-route':{allowed:false,basis:'inference',evidence:'Use the split presenter window; map stops reserve the takeover canvas.'},
  "split-canvas": {
    allowed: true,
    basis: "observed",
    evidence: "See the style guide and review this layout with the creator.",
  },
  "section-deck": {
    allowed: false,
    basis: "observed",
    evidence: "See the style guide and review this layout with the creator.",
  },
  "kinetic-paper": {
    allowed: true,
    basis: "inference",
    evidence: "See the style guide and review this layout with the creator.",
  },
  "calligraphic-receipts": {
    allowed: true,
    basis: "inference",
    evidence: "See the style guide and review this layout with the creator.",
  },
  "paper-collage": {
    allowed: true,
    basis: "inference",
    evidence: "See the style guide and review this layout with the creator.",
  },
  "judgment-board": {
    allowed: true,
    basis: "inference",
    evidence: "See the style guide and review this layout with the creator.",
  },
  "stepped-editorial": {
    allowed: true,
    basis: "inference",
    evidence: "See the style guide and review this layout with the creator.",
  },
};


export const pipAllowed = (style: string): PipPolicy =>
  Object.prototype.hasOwnProperty.call(PIP_POLICY, style)
    ? PIP_POLICY[style as StyleId]
    : { allowed: false, basis: "inference", evidence: `unknown style id "${style}" — no DNA to consult` };

export const assertPipAllowed = (style: string): void => {
  const p = pipAllowed(style);
  if (!p.allowed) throw new Error(`core/pip: PiP is not allowed in style "${style}" — ${p.evidence}`);
};
