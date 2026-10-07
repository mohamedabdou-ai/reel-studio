import React from "react";
import { px } from "../../core/motion";
import { fitTextLayout } from "../../creative-kit/primitives";
import {
  ConceptStage,
  ConceptText,
  alpha,
  dirOf,
  rectStyle,
  styleShape,
  surfaceStyle,
  tint,
  uiColors,
  useConcept,
  useConceptTimeline,
} from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { layoutFor, minFramesFor, stateAt, type DepartmentTabsParams } from "./math.ts";
import { balancedRowWidth } from "./row-fit.ts";
import { LABEL_LINES, LABEL_MIN_PX, type DepartmentTabsData } from "./schema.ts";


const TICK = "M19 33 L28 42 L45 23";

const LABEL_SIZE: Record<number, number> = { 3: 38, 4: 34, 5: 30 };

const EXAMPLE = { size: 46, min: 26, lines: 2 } as const;

const Scene: React.FC<{ data: DepartmentTabsData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const n = data.tabs.length;
  const { frame, duration } = useConceptTimeline(minFramesFor(n));
  const shape = styleShape(theme);
  const colors = uiColors(theme);


  const rtl = dirOf(data.tabs.map((t) => [t.label, ...t.examples].join(" ")).join(" ")) === "rtl";
  const counts = data.tabs.map((t) => t.examples.length);
  const params: DepartmentTabsParams = { mode, box, rtl, counts };
  const L = layoutFor(box, { rtl, tabCount: n });
  const S = stateAt(frame, duration, params);
  const W = L.window.width;
  const H = L.window.height;
  const cx = L.window.x + W / 2;
  const cy = L.window.y + H / 2;

  const radius = (h: number) => Math.round((h * shape.pillK) / 2);

  const pillShadow = shape.soft ? "none" : `0 0 0 ${shape.ring}px ${theme.border}`;
  const rowAlign = rtl ? "right" : "left";
  const rows = L.rows[counts[S.content.tab]];
  const examples = data.tabs[S.content.tab].examples;



  const labelSize = React.useMemo(
    () =>
      Math.min(
        ...data.tabs.map(
          (tab, i) =>
            fitTextLayout({ text: tab.label, theme, width: L.labels[i].width, height: L.labels[i].height, size: LABEL_SIZE[n], min: LABEL_MIN_PX, lines: LABEL_LINES, role: "body" }).fontSize,
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.tabs, theme, n, L.labels.map((r) => `${r.width}x${r.height}`).join(",")],
  );



  const rowBox = L.rows[counts[0]][0].text;
  const rowWidths = React.useMemo(
    () => data.tabs.map((tab) => tab.examples.map((text) => balancedRowWidth({ text, theme, width: rowBox.width, height: rowBox.height, ...EXAMPLE }))),
    [data.tabs, theme, rowBox.width, rowBox.height],
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        opacity: S.built,
        transform: `scale(${S.scale})`,
        transformOrigin: `${cx}px ${cy}px`,
      }}
    >
      <div style={{ ...rectStyle(L.window), ...surfaceStyle(theme) }}>
        {               }
        <div
          style={{
            ...rectStyle(L.strip),
            boxSizing: "border-box",
            background: tint(theme.card, theme.background, 0.6),
            border: `${shape.ring}px solid ${shape.soft ? alpha(theme.border, 0.55) : theme.border}`,
            borderRadius: radius(L.strip.height),
          }}
        />

        {                                                                          }
        <div
          style={{
            ...rectStyle(S.pill),
            background: colors.accentFill,
            borderRadius: radius(S.pill.height),
            boxShadow: pillShadow,
            opacity: S.pillOpacity,
          }}
        />

        {                                                                          }
        {data.tabs.map((tab, i) => {
          const ts = S.tabs[i];
          if (ts.presence <= 0.001) return null;
          const r = L.labels[i];
          return (
            <div
              key={i}
              style={{
                ...rectStyle(r),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: ts.presence,
                transform: `translateY(${px(ts.dy)}px)`,
              }}
            >
              <ConceptText
                text={tab.label}
                theme={theme}
                role="body"
                width={r.width}
                height={r.height}
                size={labelSize}
                min={LABEL_MIN_PX}
                lines={LABEL_LINES}
                align="center"


                color={tint(theme.dim, colors.onAccentFill, ts.cover * S.pillOpacity)}
              />
            </div>
          );
        })}

        {                                                 }
        {S.tabs.map((ts, i) =>
          ts.dot > 0.01 ? (
            <svg
              key={i}
              viewBox="0 0 64 64"
              style={{ ...rectStyle(L.dots[i]), opacity: ts.dot, transform: `scale(${0.6 + 0.4 * ts.dot})` }}
            >
              <circle cx={32} cy={32} r={28} fill={alpha(theme.good, 0.18)} stroke={theme.good} strokeWidth={4} />
              <path d={TICK} fill="none" stroke={theme.good} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null,
        )}

        {                                                                                          }
        {rows.map((r, j) => {
          const row = S.content.rows[j];
          if (row.presence <= 0.001) return null;
          return (
            <div
              key={j}
              style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: row.presence, transform: `translateY(${px(row.dy)}px)` }}
            >
              {r.divider ? <div style={{ ...rectStyle(r.divider), background: alpha(theme.border, 0.45) }} /> : null}
              <svg style={rectStyle(r.icon)} viewBox="0 0 64 64" width={r.icon.width} height={r.icon.height}>
                <circle cx={32} cy={32} r={28} fill={alpha(theme.good, 0.18 * row.check)} stroke={tint(theme.dim, theme.good, row.check)} strokeWidth={4} />
                <path
                  d={TICK}
                  fill="none"
                  stroke={theme.good}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - row.check}
                />
              </svg>
              {                                                                                                                }
              <div style={{ ...rectStyle(r.text), display: "flex", alignItems: "center", justifyContent: rtl ? "flex-end" : "flex-start" }}>
                <ConceptText
                  text={examples[j]}
                  theme={theme}
                  role="body"
                  width={rowWidths[S.content.tab][j]}
                  height={r.text.height}
                  size={EXAMPLE.size}
                  min={EXAMPLE.min}
                  lines={EXAMPLE.lines}
                  align={rowAlign}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


export const DepartmentTabs: React.FC<ConceptSceneProps<DepartmentTabsData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
