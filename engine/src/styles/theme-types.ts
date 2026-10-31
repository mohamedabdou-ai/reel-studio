import type { StyleGrammar } from "./types";

/** The look of one style: colours, type families and the grammar flags scene families read. */
export type SceneTheme = {
  background: string;
  card: string;
  border: string;
  text: string;
  dim: string;
  accent: string;
  good: string;
  bad: string;
  pill: string;
  pillText: string;
  ar: string;
  display: string;
  mono: string;

  sectionDeck?: {grounds: [string, string][]; faint: string};
  grammar?: StyleGrammar;
  accentInk?: string;
  onAccent?: string;
  badInk?: string;
};

/**
 * Where a style places things on the 1080x1920 canvas.
 * adapted: seam is the split-layout boundary, caption the takeover caption centre,
 *   title and body the header and first-card offsets, titleTop the header's top margin.
 * legacy: the two original styles keep their seam and takeover caption centre and derive
 *   title and body heights from the free height.
 */
export type StyleLayout =
  | { kind: "adapted"; seam: number; caption: number; title: number; body: number; titleTop: number }
  | { kind: "legacy"; seam: number; caption: number };

/** The gallery-only flash drawn on the first frame of every family after the first. */
export type GalleryCut = "none" | "flash-bloom" | "leak-or-whiteout";

export type StyleThemeModule = {
  /** The grammar is not stored here: it comes from the style's meta. */
  theme: Omit<SceneTheme, "grammar">;
  layout: StyleLayout;
  galleryCut: GalleryCut;
  caption?: {
    takeoverCenter:number;
    design?:'ink'|'magazine';
    /** Hide during moving-window/page handovers, then restore over six landing frames. */
    hideDuringTransitions?:boolean;
  };
};
