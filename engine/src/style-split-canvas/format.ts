import { FAMILY } from "../core/fonts";
import { DEFAULT_PROFILE, contentBox } from "../core/safe";

export const FORMAT = { width: 1080, height: 1920, fps: 30 } as const;
















export const SAFE_ZONE = contentBox(DEFAULT_PROFILE);
















export const LAYOUT = {
  seamY: 768,
  split: { windowTop: 768, windowHeight: 1152, videoWidth: 1080, videoLeft: 0, videoTop: -300 },
  fullTh: { windowTop: 0, windowHeight: 1920, videoWidth: 1683, videoLeft: -251, videoTop: -433 },
  captionY: {
    seam: 768,



    lowThird: SAFE_ZONE.bottom - 90,
    lowThirdSafe: SAFE_ZONE.bottom - 90,
    lowThirdLegacy: 1600,
    chest: 1330,
  },
} as const;



export const PALETTE = {
  canvas: "#F3EEE6",
  canvasDeep: "#E8DECE",
  band: "#DED2BE",
  ink: "#1F1E1D",
  inkSoft: "#6B655B",
  accent: "#D97757",
  accentDeep: "#B04E30",
  sage: "#7C8B6E",
  success: "#2F7D4F",
  amber: "#DFA02E",
  alert: "#C0442E",
  pillBg: "rgba(28,27,26,0.84)",
  pillText: "#FFFFFF",
} as const;





















































export const FONT = {
  ar: `'${FAMILY.cairo}', 'Segoe UI', Tahoma, Arial, sans-serif`,
  mono: `'${FAMILY.plexMono}', 'Courier New', monospace`,
  display: `'${FAMILY.plexDisplay}', 'Segoe UI', Arial, sans-serif`,
} as const;


export const sec = (s: number) => Math.round(s * FORMAT.fps);
