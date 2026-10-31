// engine/src/styles/magazine-interview/system/zones.ts
import type {ZoneSet} from '../../../style-kit/system/types.ts';

/** Magazine pages: 65 px margins, content from y 350 under the folio, takeover ends at 1150, split above the presenter window. */
export const MAGAZINE_SEAM = 1080;
export const magazineZones = (seam: number = MAGAZINE_SEAM): ZoneSet => ({
  takeover: {x: 65, y: 350, width: 950, height: 800, railFromY: 1150, railMaxX: 853},
  split: {x: 65, y: 350, width: 950, height: Math.max(0, Math.min(1150, seam - 88) - 350), railFromY: 1150, railMaxX: 853},
});
