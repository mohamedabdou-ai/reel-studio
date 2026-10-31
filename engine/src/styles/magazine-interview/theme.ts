import { FAMILY } from "../../core/fonts";
import type { StyleThemeModule } from "../theme-types";

// The pilot rule begins at 1300; its 46 px line is centred at 1345 (1148 below the split seam).
export const MAGAZINE_CAPTION = {takeoverTop:1300,takeoverCenter:1345,splitTop:1096,splitCenter:1148} as const;

export default {
  theme: {
    background: "#081321",
    card: "#102338",
    border: "#4F6D80",
    text: "#F5F3EC",
    dim: "#BBCED9",
    accent: "#F3C776",
    good: "#79CBBB",
    bad: "#F2A3A3",
    pill: "transparent",
    pillText: "#F5F3EC",
    ar: "Alexandria",
    display: FAMILY.latinSerif,
    mono: FAMILY.plexMono,
    onAccent: "#081321",
  },
  layout: { kind: "adapted", seam: 1080, caption: MAGAZINE_CAPTION.takeoverCenter, title: 148, body: 218, titleTop: 40 },
  caption: {takeoverCenter:1345, design:'magazine', hideDuringTransitions:true},
  galleryCut: "none",
} satisfies StyleThemeModule;
