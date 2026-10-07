export type GuidesMode = "off" | "organic" | "ads" | "both";
export const GUIDES_ORDER: readonly GuidesMode[] = ["off", "organic", "ads", "both"];
export const GUIDES_LABEL: Record<GuidesMode, string> = { off: "الجايدز مقفولة", organic: "Organic", ads: "Ads", both: "Organic + Ads" };

export const isGuidesMode = (value: unknown): value is GuidesMode => typeof value === "string" && (GUIDES_ORDER as readonly string[]).includes(value);
export const nextGuides = (mode: GuidesMode): GuidesMode => GUIDES_ORDER[(GUIDES_ORDER.indexOf(mode) + 1) % GUIDES_ORDER.length];


export function guidesProp(mode: GuidesMode): false | true | "ig-reels-organic" | "ig-reels-ads" {
  switch (mode) {
    case "organic": return "ig-reels-organic";
    case "ads": return "ig-reels-ads";
    case "both": return true;
    default: return false;
  }
}
