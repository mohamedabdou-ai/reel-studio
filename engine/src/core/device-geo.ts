import { clamp01, mix } from "./motion.ts";
import type { Zone } from "./safe";

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Sides = { top: number; right: number; bottom: number; left: number };
export type ZoneLike = Pick<Zone, "top" | "bottom" | "left" | "right" | "rail">;

export type DeviceKind = "browser" | "window" | "phone";
export const DEVICE_KINDS: readonly DeviceKind[] = ["browser", "window", "phone"];


export type Tilt = { rx: number; ry: number; perspective: number };

export type Pose = Tilt & { scale: number };


export const MAX_TILT_DEG = 8;

export const MIN_PERSPECTIVE = 1200;
export const DEFAULT_TILT: Tilt = { rx: 0, ry: 0, perspective: 2000 };


export const DEVICE_METRICS = {
  browser: { pad: 0.012, bar: 0.078, minBar: 44, radius: 0.028, aspect: 10 / 16 },
  window: { pad: 0.012, bar: 0.062, minBar: 36, radius: 0.024, aspect: 10 / 16 },
  phone: { bezel: 0.042, minBezel: 8, radius: 0.15, aspect: 19.5 / 9 },
} as const;



export const DEVICE_SHADOW = {
  css: "0 14px 36px rgba(0,0,0,0.34)",
  reach: { top: 24, right: 38, bottom: 53, left: 38 },
} as const;




export const ENTER = { scaleFrom: 0.9, tiltDelta: 4, opacityRate: 3 } as const;

export type DeviceLayout = {
  kind: DeviceKind;

  width: number;
  height: number;
  radius: number;

  bar: Rect | null;

  screen: Rect;
  screenRadius: number;
};

const RAD = Math.PI / 180;


export const noNegZero = (n: number): number => (n === 0 ? 0 : n);

const positive = (n: number, what: string): void => {
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`core/device-geo: ${what} must be a positive finite number, got ${n}`);
};






export const deviceLayout = (kind: DeviceKind, width: number, screenAspect?: number): DeviceLayout => {
  if (!DEVICE_KINDS.includes(kind)) throw new RangeError(`core/device-geo: unknown device kind "${String(kind)}"`);
  positive(width, "width");
  const W = Math.round(width);
  if (kind === "phone") {
    const m = DEVICE_METRICS.phone;
    const aspect = screenAspect ?? m.aspect;
    positive(aspect, "screenAspect");
    const bezel = Math.max(m.minBezel, Math.round(W * m.bezel));
    const radius = Math.round(W * m.radius);
    const sw = W - 2 * bezel;
    const sh = Math.round(sw * aspect);
    return {
      kind,
      width: W,
      height: sh + 2 * bezel,
      radius,
      bar: null,
      screen: { x: bezel, y: bezel, width: sw, height: sh },
      screenRadius: Math.max(0, radius - bezel),
    };
  }
  const m = DEVICE_METRICS[kind];
  const aspect = screenAspect ?? m.aspect;
  positive(aspect, "screenAspect");
  const pad = Math.max(6, Math.round(W * m.pad));
  const barH = Math.max(m.minBar, Math.round(W * m.bar));
  const radius = Math.round(W * m.radius);
  const sw = W - 2 * pad;
  const sh = Math.round(sw * aspect);
  return {
    kind,
    width: W,
    height: barH + sh + pad,
    radius,
    bar: { x: 0, y: 0, width: W, height: barH },
    screen: { x: pad, y: barH, width: sw, height: sh },
    screenRadius: Math.max(0, radius - pad),
  };
};


export const assertTilt = (t: Tilt): Tilt => {
  for (const [k, v] of [["rx", t.rx], ["ry", t.ry], ["perspective", t.perspective]] as const) {
    if (!Number.isFinite(v)) throw new RangeError(`core/device-geo: tilt.${k} must be finite, got ${v}`);
  }
  if (Math.abs(t.rx) > MAX_TILT_DEG || Math.abs(t.ry) > MAX_TILT_DEG) {
    throw new RangeError(`core/device-geo: tilt rx ${t.rx}° / ry ${t.ry}° exceeds the ${MAX_TILT_DEG}° cap`);
  }
  if (t.perspective < MIN_PERSPECTIVE) {
    throw new RangeError(`core/device-geo: perspective ${t.perspective}px is below the ${MIN_PERSPECTIVE}px floor`);
  }
  return t;
};

export const clampTilt = (deg: number): number => Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, deg));






export const projectPoint = (x: number, y: number, pose: Pose): { x: number; y: number } => {
  const a = pose.ry * RAD;
  const b = pose.rx * RAD;
  const sx = x * pose.scale;
  const sy = y * pose.scale;

  const x1 = sx * Math.cos(a);
  const z1 = -sx * Math.sin(a);

  const y2 = sy * Math.cos(b) - z1 * Math.sin(b);
  const z2 = sy * Math.sin(b) + z1 * Math.cos(b);

  const w = 1 - z2 / pose.perspective;
  if (w <= 0.1) throw new RangeError(`core/device-geo: point (${x}, ${y}) passes behind the camera at perspective ${pose.perspective}px`);
  return { x: x1 / w, y: y2 / w };
};






export const tiltedBox = (rect: Rect, pose: Pose): Rect => {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const pts = [
    projectPoint(-hw, -hh, pose),
    projectPoint(hw, -hh, pose),
    projectPoint(hw, hh, pose),
    projectPoint(-hw, hh, pose),
  ];
  const x0 = cx + Math.min(...pts.map((p) => p.x));
  const x1 = cx + Math.max(...pts.map((p) => p.x));
  const y0 = cy + Math.min(...pts.map((p) => p.y));
  const y1 = cy + Math.max(...pts.map((p) => p.y));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

export const grow = (r: Rect, s: Sides): Rect => ({
  x: r.x - s.left,
  y: r.y - s.top,
  width: r.width + s.left + s.right,
  height: r.height + s.top + s.bottom,
});


export const outward = (r: Rect): Rect => {
  const x0 = Math.floor(r.x);
  const y0 = Math.floor(r.y);
  return { x: x0, y: y0, width: Math.ceil(r.x + r.width) - x0, height: Math.ceil(r.y + r.height) - y0 };
};






export const deviceBounds = (
  layout: DeviceLayout,
  at: { x: number; y: number },
  pose: Pose,
  shadow: Sides = DEVICE_SHADOW.reach,
): Rect => outward(grow(tiltedBox({ x: at.x, y: at.y, width: layout.width, height: layout.height }, pose), shadow));


export const enterPose = (e: number, rest: Tilt): Pose & { opacity: number } => {
  if (!Number.isFinite(e)) throw new RangeError(`core/device-geo: entrance progress must be finite, got ${e}`);
  const p = clamp01(e);
  return {
    rx: mix(clampTilt(rest.rx + ENTER.tiltDelta), rest.rx, p),
    ry: rest.ry,
    perspective: rest.perspective,
    scale: mix(ENTER.scaleFrom, 1, p),
    opacity: clamp01(p * ENTER.opacityRate),
  };
};



export type ZoneEdge = "TOP" | "BOTTOM" | "LEFT" | "RIGHT" | "RAIL";





export const boxInZone = (b: Rect, z: ZoneLike): { ok: boolean; hits: ZoneEdge[] } => {
  const right = b.x + b.width;
  const bottom = b.y + b.height;
  const hits: ZoneEdge[] = [];
  if (b.y < z.top) hits.push("TOP");
  if (bottom > z.bottom) hits.push("BOTTOM");
  if (b.x < z.left) hits.push("LEFT");
  if (right > z.right) hits.push("RIGHT");
  if (z.rail !== null && right > z.rail.x && bottom > z.rail.y) hits.push("RAIL");
  return { ok: hits.length === 0, hits };
};

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;



export type Fit = "cover" | "contain";
export type Placed = { left: number; top: number; width: number; height: number; scale: number };






export const fitMedia = (media: Size, box: Size, fit: Fit = "cover", focus: { x: number; y: number } = { x: 0.5, y: 0.5 }): Placed => {
  positive(media.width, "media.width");
  positive(media.height, "media.height");
  positive(box.width, "box.width");
  positive(box.height, "box.height");
  if (fit === "contain") {
    const scale = Math.min(box.width / media.width, box.height / media.height);
    const width = Math.round(media.width * scale);
    const height = Math.round(media.height * scale);
    return { left: Math.round((box.width - width) / 2), top: Math.round((box.height - height) / 2), width, height, scale };
  }
  const scale = Math.max(box.width / media.width, box.height / media.height);
  const width = Math.ceil(media.width * scale - 1e-9);
  const height = Math.ceil(media.height * scale - 1e-9);
  const left = noNegZero(Math.min(0, Math.max(box.width - width, Math.round(box.width / 2 - clamp01(focus.x) * width))));
  const top = noNegZero(Math.min(0, Math.max(box.height - height, Math.round(box.height / 2 - clamp01(focus.y) * height))));
  return { left, top, width, height, scale };
};



export type WipeDir = "ltr" | "rtl" | "ttb" | "btt";
export type Wipe = {

  clipPath: string;
  inset: Sides;
  axis: "x" | "y";

  divider: number;

  cut: number;
  extent: number;
};






export const wipeGeometry = (progress: number, dir: WipeDir, size: Size): Wipe => {
  if (dir !== "ltr" && dir !== "rtl" && dir !== "ttb" && dir !== "btt") throw new RangeError(`core/device-geo: unknown wipe dir "${String(dir)}"`);
  positive(size.width, "size.width");
  positive(size.height, "size.height");
  const p = Number.isFinite(progress) ? clamp01(progress) : 0;
  const axis = dir === "ltr" || dir === "rtl" ? "x" : "y";
  const extent = axis === "x" ? size.width : size.height;
  const cut = Math.round(p * extent);
  const rest = extent - cut;
  const inset: Sides = { top: 0, right: 0, bottom: 0, left: 0 };
  let divider: number;
  if (dir === "ltr") {
    inset.right = rest;
    divider = cut;
  } else if (dir === "rtl") {
    inset.left = rest;
    divider = rest;
  } else if (dir === "ttb") {
    inset.bottom = rest;
    divider = cut;
  } else {
    inset.top = rest;
    divider = rest;
  }
  return {
    clipPath: `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px)`,
    inset,
    axis,
    divider,
    cut,
    extent,
  };
};


export const splitBox = (box: Rect, gap: number, stack: "row" | "column" = "row"): [Rect, Rect] => {
  if (!Number.isFinite(gap) || gap < 0) throw new RangeError(`core/device-geo: gap must be ≥ 0, got ${gap}`);
  if (stack === "row") {
    const w = Math.floor((box.width - gap) / 2);
    positive(w, "panel width");
    return [
      { x: box.x, y: box.y, width: w, height: box.height },
      { x: box.x + box.width - w, y: box.y, width: w, height: box.height },
    ];
  }
  const h = Math.floor((box.height - gap) / 2);
  positive(h, "panel height");
  return [
    { x: box.x, y: box.y, width: box.width, height: h },
    { x: box.x, y: box.y + box.height - h, width: box.width, height: h },
  ];
};
