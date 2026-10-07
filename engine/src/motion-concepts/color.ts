import { clamp01, mix, mixHex } from "../core/motion.ts";

export type RGBA = readonly [r: number, g: number, b: number, a: number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FN = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;


export const parseColor = (input: string): RGBA => {
  const c = input.trim();
  if (c.toLowerCase() === "transparent") return [0, 0, 0, 0];
  const hex = HEX.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = h.split("").map((d) => d + d).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const fn = FN.exec(c);
  if (fn) {
    const a = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return [Number(fn[1]), Number(fn[2]), Number(fn[3]), clamp01(a)];
  }
  throw new RangeError(`motion-concepts/color: cannot parse ${JSON.stringify(input)}`);
};

const isOpaqueHex = (c: string): boolean => {
  const m = HEX.exec(c.trim());
  return m !== null && (m[1].length === 3 || m[1].length === 6);
};

const css = ([r, g, b, a]: RGBA): string => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;


export const mixColor = (a: string, b: string, p: number): string => {
  if (isOpaqueHex(a) && isOpaqueHex(b)) return mixHex(a, b, p);
  const A = parseColor(a);
  const B = parseColor(b);
  const q = clamp01(p);
  const alpha = mix(A[3], B[3], q);
  if (alpha <= 0) return "rgba(0, 0, 0, 0)";

  const ch = (i: 0 | 1 | 2) => (mix(A[i] * A[3], B[i] * B[3], q)) / alpha;
  return css([ch(0), ch(1), ch(2), alpha]);
};


export const withAlpha = (color: string, alpha: number): string => {
  const c = parseColor(color);
  return css([c[0], c[1], c[2], c[3] * clamp01(alpha)]);
};
