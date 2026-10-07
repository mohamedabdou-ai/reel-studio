import { FAMILY } from "../core/fonts";
import { zone } from "../core/safe";

export const FORMAT = { width: 1080, height: 1920, fps: 30 } as const;


export type DeckWindow = { windowTop: number; windowHeight: number; videoWidth: number; videoLeft: number; videoTop: number };






export type DeckLayout = {
  seamY: number;
  split: DeckWindow;
  hidden: DeckWindow;
  captionY: { seam: number; centerFull: number };
};







export const SAFE_TOP = Math.max(zone("ig-reels-organic").top, zone("ig-reels-ads").top) + 12;







export const LAYOUT = {
  seamY: 1056,
  split: { windowTop: 1056, windowHeight: 864, videoWidth: 1080, videoLeft: 0, videoTop: -340 },

  hidden: { windowTop: 1920, windowHeight: 0, videoWidth: 1080, videoLeft: 0, videoTop: -340 },
  captionY: {
    seam: 1056,
    centerFull: 900,
  },
} as const;




export const SECTION_BG = {
  purple: "linear-gradient(160deg, #2A1B4A 0%, #45298A 52%, #221540 100%)",
  blue: "linear-gradient(160deg, #0E2A4A 0%, #1B4E8F 58%, #0A1E38 100%)",
  black: "#0D0D11",
  navy: "#0F1B33",
  orange: "#E8722A",
} as const;

export const PALETTE = {
  text: "#FFFFFF",
  dim: "rgba(255,255,255,0.55)",
  accent: "#FF6B35",
  gold: "#E7B453",

  chipRed: "#FF5C5C",
  chipYellow: "#F5B944",
  chipBlue: "#5CA8FF",
  chipGreen: "#4FBF67",
  cardBg: "rgba(16,16,22,0.72)",
  cardBorder: "rgba(255,255,255,0.16)",
  pillBg: "#FFFFFF",
  pillText: "#141414",
} as const;









































































export const FONT = {
  arNaskh: `'${FAMILY.cairo}', 'Segoe UI', Tahoma, sans-serif`,
  latinSerif: `'${FAMILY.plexMono}', Georgia, 'Times New Roman', serif`,
  sans: `'${FAMILY.tajawal}', 'Segoe UI', Arial, sans-serif`,
  mono: `'${FAMILY.plexMono}', 'Courier New', monospace`,
} as const;

export const sec = (s: number) => Math.round(s * FORMAT.fps);
