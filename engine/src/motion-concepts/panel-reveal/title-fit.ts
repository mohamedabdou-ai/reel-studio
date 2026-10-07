import { fitTextLayout, type SceneTheme } from "../../creative-kit/primitives";

export type TitleFitOptions = {
  text: string;
  theme: SceneTheme;

  width: number;
  height: number;
  size: number;
  min: number;
  lines: number;
};


const SLACK = 8;






export const balancedTitleWidth = (opts: TitleFitOptions): number => {
  const args = { text: opts.text, theme: opts.theme, role: "title" as const, lines: opts.lines };
  const full = fitTextLayout({ ...args, width: opts.width, height: opts.height, size: opts.size, min: opts.min });
  if (!full.fits || full.height > opts.height || full.lines.length < 2) return opts.width;


  const holds = (w: number): boolean => {
    const t = fitTextLayout({ ...args, width: w, height: opts.height, size: full.fontSize, min: full.fontSize });
    return t.fits && t.height <= opts.height && t.lines.length <= opts.lines;
  };

  let lo = Math.ceil(full.width / 2);
  let hi = opts.width;
  if (holds(lo)) hi = lo;
  else {
    while (hi - lo > 2) {
      const mid = Math.floor((lo + hi) / 2);
      if (holds(mid)) hi = mid;
      else lo = mid;
    }
  }
  return Math.min(opts.width, hi + SLACK);
};
