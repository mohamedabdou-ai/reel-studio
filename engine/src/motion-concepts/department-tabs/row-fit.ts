import { fitTextLayout, type SceneTheme } from "../../creative-kit/primitives";
import { narrowestWidth } from "./balance.ts";

export type RowFitOptions = {
  text: string;
  theme: SceneTheme;

  width: number;
  height: number;
  size: number;
  min: number;
  lines: number;
};






export const balancedRowWidth = (opts: RowFitOptions): number => {
  const args = { text: opts.text, theme: opts.theme, role: "body" as const, lines: opts.lines };
  const full = fitTextLayout({ ...args, width: opts.width, height: opts.height, size: opts.size, min: opts.min });
  if (!full.fits || full.height > opts.height || full.lines.length < 2) return opts.width;


  const holds = (w: number): boolean => {
    const t = fitTextLayout({ ...args, width: w, height: opts.height, size: full.fontSize, min: full.fontSize });
    return t.fits && t.height <= opts.height && t.lines.length <= opts.lines;
  };
  return narrowestWidth(holds, Math.ceil(full.width / 2), opts.width);
};
