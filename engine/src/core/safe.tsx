import React, { createContext, useContext } from "react";
import { AbsoluteFill } from "remotion";
import spec from "./platform/instagram-reels.json";

export type Rail = { x: number; y: number } | null;
export type Zone = {
  label: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  rail: Rail;
  basis: string;
  source: string;
  quote: string;
};
export type ProfileId = keyof typeof spec.profiles;

export const IG = spec;
export const FRAME = spec.frame;
export const PROFILES = spec.profiles as unknown as Record<ProfileId, Zone>;
export const PROFILE_IDS = Object.keys(spec.profiles) as ProfileId[];
export const DEFAULT_PROFILE = spec.defaultProfile as ProfileId;
export const ADS_PROFILE: ProfileId = "ig-reels-ads";

export const zone = (id: ProfileId = DEFAULT_PROFILE): Zone => PROFILES[id];


export const inDeadZone = (x: number, y: number, z: Zone): boolean =>
  y < z.top || y >= z.bottom || x < z.left || x >= z.right || (z.rail !== null && x >= z.rail.x && y >= z.rail.y);


export const contentBox = (id: ProfileId = DEFAULT_PROFILE) => {
  const z = zone(id);
  return { left: z.left, top: z.top, right: z.right, bottom: z.bottom, width: z.right - z.left, height: z.bottom - z.top };
};






export const band = (id: ProfileId = DEFAULT_PROFILE, opts: { inset?: number; shadow?: number } = {}) => {
  const z = zone(id);
  const inset = opts.inset ?? 18;
  const shadow = opts.shadow ?? 50;
  const rightLimit = (z.rail ? Math.min(z.right, z.rail.x) : z.right) - shadow;
  const left = z.left + inset;
  return { left, width: rightLimit - left, right: rightLimit };
};


export const legacyShape = (id: ProfileId = DEFAULT_PROFILE) => {
  const z = zone(id);
  return {
    SAFE: { left: z.left, right: z.right, top: z.top, bottom: z.bottom } as const,
    RAIL: { left: z.rail?.x ?? FRAME.width, top: z.rail?.y ?? FRAME.height } as const,
  };
};


export const COVER = spec.cover;



const ProbeCtx = createContext<string | null>(null);


export const useProbe = (): string | null => useContext(ProbeCtx);

export type SafeProps = {

  guides?: boolean | ProfileId | ProfileId[];

  probe?: string;


  plates?: string[];



  noPlates?: boolean;
};


export const SafeRoot: React.FC<SafeProps & { style?: React.CSSProperties; children?: React.ReactNode }> = ({
  guides,
  probe,
  style,
  children,
}) => (
  <ProbeCtx.Provider value={probe ?? null}>
    <AbsoluteFill style={{ ...style, ...(probe ? { background: probe } : null) }}>
      {children}
      <SafeGuides on={guides} />
    </AbsoluteFill>
  </ProbeCtx.Provider>
);


export const SafeExempt: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const probe = useProbe();
  if (probe) return null;
  return <>{children}</>;
};


export const CanvasFill: React.FC<{ background: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({
  background,
  style,
  children,
}) => {
  const probe = useProbe();
  return <div style={{ position: "absolute", inset: 0, ...style, background: probe ?? background }}>{children}</div>;
};



const GUIDE_COLOR: Record<ProfileId, string> = {
  "ig-reels-organic": "#39FF6A",
  "ig-reels-ads": "#FFB020",
  "ig-reels-ads-disclaimer": "#FF7A00",
  "legacy-02": "#8A8AFF",
};

const resolveGuides = (on: SafeProps["guides"]): ProfileId[] => {
  if (!on) return [];
  if (on === true) return [DEFAULT_PROFILE, ADS_PROFILE];
  return Array.isArray(on) ? on : [on];
};






export const SafeGuides: React.FC<{ on?: SafeProps["guides"]; bands?: { label: string; top: number; bottom: number }[] }> = ({
  on,
  bands = [],
}) => {
  const ids = resolveGuides(on);
  if (!ids.length) return null;
  const label = (text: string, color: string, extra: React.CSSProperties) => (
    <span
      style={{
        position: "absolute",
        font: "700 22px Consolas, monospace",
        color,
        background: "rgba(0,0,0,0.6)",
        padding: "2px 8px",
        whiteSpace: "nowrap",
        ...extra,
      }}
    >
      {text}
    </span>
  );
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {ids.map((id, i) => {
        const z = zone(id);
        const c = GUIDE_COLOR[id];
        return (
          <React.Fragment key={id}>
            <div
              style={{
                position: "absolute",
                left: z.left,
                top: z.top,
                width: z.right - z.left,
                height: z.bottom - z.top,
                border: `3px dashed ${c}`,
              }}
            >
              {label(`${id}  y ${z.top}–${z.bottom}  x ${z.left}–${z.right}`, c, { left: 6, top: 4 + i * 30 })}
            </div>
            {z.rail ? (
              <div
                style={{
                  position: "absolute",
                  left: z.rail.x,
                  top: z.rail.y,
                  right: 0,
                  bottom: 0,
                  border: "3px dashed #FF3B30",
                  background: "rgba(255,59,48,0.08)",
                }}
              >
                {label(`RAIL x≥${z.rail.x} y≥${z.rail.y}`, "#FF3B30", { left: 6, top: 4 })}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: COVER.square.top,
          height: COVER.square.bottom - COVER.square.top,
          border: "2px dotted #4FA3FF",
        }}
      >
        {label("COVER 1:1", "#4FA3FF", { right: 6, top: 4 })}
      </div>
      {bands.map((b) => (
        <div
          key={b.label}
          style={{ position: "absolute", left: 0, right: 0, top: b.top, height: b.bottom - b.top, border: "3px dashed #FFB020" }}
        >
          {label(b.label, "#FFB020", { left: 6, top: 4 })}
        </div>
      ))}
    </AbsoluteFill>
  );
};










export const SafeCalibration: React.FC<SafeProps & { profile?: ProfileId }> = ({ profile = DEFAULT_PROFILE, guides, probe }) => {
  const z = zone(profile);
  const S = 80;
  const sq = (left: number, top: number, color: string, key: string) => (
    <div key={key} style={{ position: "absolute", left, top, width: S, height: S, background: color }} />
  );
  const midX = Math.round((z.left + z.right) / 2 - S / 2);
  const midY = Math.round((z.top + z.bottom) / 2 - S / 2);
  const inside = [
    sq(midX, z.top + 1, "#1B6", "in-top"),
    sq(midX, z.bottom - 1 - S, "#1B6", "in-bottom"),
    sq(z.left + 1, midY, "#1B6", "in-left"),
    sq((z.rail ? Math.min(z.right, z.rail.x) : z.right) - 1 - S, midY, "#1B6", "in-right"),
  ];
  const outside = [
    sq(midX, z.top - 1 - S, "#C33", "out-top"),
    sq(midX, z.bottom + 1, "#C33", "out-bottom"),
    sq(z.left - 1 - S, midY, "#C33", "out-left"),
    sq(z.right + 1, midY, "#C33", "out-right"),
    ...(z.rail ? [sq(z.rail.x + 1, z.rail.y + 1, "#C33", "out-rail")] : []),
  ];
  return (
    <SafeRoot guides={guides} probe={probe} style={{ background: "#202020" }}>
      {inside}
      {outside}
    </SafeRoot>
  );
};
