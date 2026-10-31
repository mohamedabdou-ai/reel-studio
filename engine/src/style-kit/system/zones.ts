// engine/src/style-kit/system/zones.ts
// Node-safe: validation and scripts read zones without React.
import type {ZoneSet} from './types.ts';
import {magazineZones} from '../../styles/magazine-interview/system/zones.ts';

export const SYSTEM_ZONES: Readonly<Partial<Record<string, (seam?: number) => ZoneSet>>> = Object.freeze({'magazine-interview': magazineZones});
export const hasStyleSystem = (style: string): boolean => Object.hasOwn(SYSTEM_ZONES, style);
export const systemZones = (style: string, seam?: number): ZoneSet | null => SYSTEM_ZONES[style]?.(seam) ?? null;
