import React from "react";
import { mix } from "../../core/motion";
import { formatNumber, type DigitSet } from "../../core/numbers";
import { FRAME } from "../../core/safe";
import { fitTextLayout, type SceneTheme } from "../../creative-kit/primitives";
import { seg } from "../timeline.ts";
import {
  ConceptStage,
  ConceptText,
  Dressing,
  alpha,
  digitsFor,
  dirOf,
  numberFont,
  rectStyle,
  styleShape,
  surfaceShadow,
  tint,
  uiColors,
  useConcept,
  useConceptTimeline,
  type Rect,
  type StyleShape,
} from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { HALO_R, MIN_FRAMES, PORT_R, layoutFor, stateAt, type AutomationFlowParams, type ConnLayout, type ConnState, type NodeLayout, type NodeState } from "./math.ts";
import type { AutomationFlowData } from "./schema.ts";


const IN_ARROW = "M32 12 V37 M21 27 L32 38 L43 27";
const IN_TRAY = "M13 42 V51 H51 V42";

const OUT_BASE = "M12 54 H52";
const OUT_BARS: readonly (readonly [number, number, number])[] = [
  [18, 48, 12],
  [32, 48, 24],
  [46, 48, 36],
];


const TEXT = {
  input: { size: 44, min: 26, lines: 1 },
  step: { size: 38, min: 24, lines: 2 },
  output: { size: 50, min: 28, lines: 1 },
} as const;


type StepFit = { size: number; lines: number };










const planStepLabels = (steps: readonly string[], theme: SceneTheme, box: Rect): StepFit[] => {
  const t = TEXT.step;
  const own = steps.map((text): StepFit => {
    const args = { text, theme, width: box.width, height: box.height, size: t.size, min: t.min, role: "body" as const };
    const one = fitTextLayout({ ...args, lines: 1 });
    if (one.fits && one.height <= box.height) return { size: one.fontSize, lines: 1 };
    return { size: fitTextLayout({ ...args, lines: t.lines }).fontSize, lines: t.lines };
  });
  const size = Math.min(...own.map((f) => f.size));
  return own.map((f) => ({ size, lines: f.lines }));
};

type NodeProps = {
  index: number;
  layout: NodeLayout;
  state: NodeState;
  label: string;
  theme: SceneTheme;
  shape: StyleShape;
  digits: DigitSet;
  rtl: boolean;

  stepFit?: StepFit;
};

const FlowNode: React.FC<NodeProps> = ({ index, layout: n, state: s, label, theme, shape, digits, rtl, stepFit }) => {
  if (s.presence <= 0.001) return null;
  const colors = uiColors(theme);
  const output = n.kind === "output";

  const ring = tint(theme.border, colors.accentInk, Math.max(0.7 * s.lit, s.react));

  const fill = output ? tint(theme.card, colors.accentFill, s.lit) : theme.card;
  const textColor = output && s.lit >= 0.5 ? colors.onAccentFill : theme.text;
  const badgeFill = output ? tint(theme.card, colors.onAccentFill, s.lit) : tint(theme.card, colors.accentFill, s.lit);
  const badgeInk = output ? tint(theme.dim, colors.accentFill, s.lit) : tint(theme.dim, colors.onAccentFill, s.lit);
  const b = s.bump;
  const t = stepFit ? { size: stepFit.size, min: Math.min(TEXT.step.min, stepFit.size), lines: stepFit.lines } : TEXT[n.kind];
  const glyph = Math.round(n.badge.width * 0.72);
  const grow = seg(s.lit, 0.25, 1);

  return (
    <div style={{ ...rectStyle(n.rect), opacity: s.presence, transform: `scale(${s.scale})` }}>
      {                                                          }
      <div
        style={{
          position: "absolute",
          left: -b,
          top: -b,
          width: n.rect.width + 2 * b,
          height: n.rect.height + 2 * b,
          borderRadius: n.radius + b,
          background: fill,
          boxShadow: surfaceShadow(theme, ring),
        }}
      />
      <div
        style={{
          ...rectStyle(n.badge),
          boxSizing: "border-box",
          border: `2px solid ${theme.border}`,
          borderRadius: Math.round((n.badge.width * shape.pillK) / 2),
          background: badgeFill,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n.kind === "step" ? (
          <span
            style={{
              fontFamily: numberFont(theme, digits),
              fontWeight: 700,
              fontSize: Math.round(n.badge.width * 0.52),
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: badgeInk,
            }}
          >
            {formatNumber(index, { digits })}
          </span>
        ) : (
          <svg width={glyph} height={glyph} viewBox="0 0 64 64" fill="none" stroke={badgeInk} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
            {n.kind === "input" ? (
              <>
                <path d={IN_ARROW} />
                <path d={IN_TRAY} />
              </>
            ) : (
              <>
                <path d={OUT_BASE} />
                {grow > 0.02
                  ? OUT_BARS.map(([x, foot, h], k) => <path key={k} d={`M${x} ${foot} V${(foot - h * grow).toFixed(2)}`} />)
                  : null}
              </>
            )}
          </svg>
        )}
      </div>
      <div style={{ ...rectStyle(n.text), display: "flex", alignItems: "center" }}>
        <ConceptText
          text={label}
          theme={theme}
          role="body"
          width={n.text.width}
          height={n.text.height}
          size={t.size}
          min={t.min}
          lines={t.lines}
          color={textColor}
          align={rtl ? "right" : "left"}
        />
      </div>
    </div>
  );
};

const at = (c: ConnLayout, t: number): { x: number; y: number } => ({ x: mix(c.a.x, c.b.x, t), y: mix(c.a.y, c.b.y, t) });

const Scene: React.FC<{ data: AutomationFlowData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);
  const labels = [data.input, ...data.steps, data.output];
  const all = labels.join(" ");

  const rtl = dirOf(all) === "rtl";
  const digits = digitsFor(all);
  const params: AutomationFlowParams = { mode, box, rtl, pillK: shape.pillK, windowRadius: shape.windowRadius };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);

  const stepBox = L.nodes[1].text;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stepFits = React.useMemo(() => planStepLabels(data.steps, theme, stepBox), [data.steps, theme, stepBox.width, stepBox.height]);

  const idle = alpha(theme.dim, 0.5);
  const trail = alpha(colors.accentInk, 0.7);
  const line = (c: ConnLayout, from: number, to: number, stroke: string, width: number, key: string) => {
    const p = at(c, from);
    const q = at(c, to);

    return <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={width} />;
  };

  const chevron = (c: ConnLayout, i: number, s: ConnState) => {
    const tip = { x: c.b.x - c.ux * 3, y: c.b.y - c.uy * 3 };
    const base = { x: tip.x - c.ux * 12, y: tip.y - c.uy * 12 };
    const l = { x: base.x - c.uy * 8, y: base.y + c.ux * 8 };
    const r = { x: base.x + c.uy * 8, y: base.y - c.ux * 8 };
    return (
      <path
        key={`chevron${i}`}
        d={`M${l.x.toFixed(1)} ${l.y.toFixed(1)} L${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L${r.x.toFixed(1)} ${r.y.toFixed(1)}`}
        fill="none"
        stroke={tint(idle, colors.accentInk, S.nodes[i + 1].lit)}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={seg(s.draw, 0.85, 1)}
      />
    );
  };

  return (
    <>
      {L.nodes.map((n, i) => (
        <FlowNode
          key={i}
          index={i}
          layout={n}
          state={S.nodes[i]}
          label={labels[i]}
          theme={theme}
          shape={shape}
          digits={digits}
          rtl={rtl}
          stepFit={n.kind === "step" ? stepFits[i - 1] : undefined}
        />
      ))}
      <svg width={FRAME.width} height={FRAME.height} viewBox={`0 0 ${FRAME.width} ${FRAME.height}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {                                                            }
        {L.conns.map((c, i) => {
          const s = S.conns[i];
          return (
            <React.Fragment key={i}>
              {s.draw > 0 ? line(c, 0, s.draw, idle, 4, `idle${i}`) : null}
              {s.trailTo > s.trailFrom ? line(c, s.trailFrom, s.trailTo, trail, 5, `trail${i}`) : null}
            </React.Fragment>
          );
        })}
        {                             }
        {L.conns.map((c, i) => {
          const s = S.conns[i];
          const source = S.nodes[i];
          return (
            <React.Fragment key={i}>
              {source.presence > 0 ? (
                <circle cx={c.a.x} cy={c.a.y} r={PORT_R} fill={theme.card} stroke={tint(idle, colors.accentInk, source.lit)} strokeWidth={3} opacity={source.presence} />
              ) : null}
              {s.draw > 0.85 ? chevron(c, i, s) : null}
            </React.Fragment>
          );
        })}
        {                                                                             }
        {L.conns.map((c, i) => {
          const s = S.conns[i];
          if (s.power <= 0) return null;
          const head = at(c, s.cometTo);
          return (
            <React.Fragment key={i}>
              <Dressing>
                <circle cx={head.x} cy={head.y} r={HALO_R * (0.55 + 0.45 * s.power)} fill={alpha(colors.accentFill, 0.3 * s.power)} />
              </Dressing>
              {line(c, s.cometFrom, s.cometTo, colors.accentInk, 8, `comet${i}`)}
              <circle cx={head.x} cy={head.y} r={9 * s.power} fill={colors.accentFill} stroke={colors.accentInk} strokeWidth={3} />
            </React.Fragment>
          );
        })}
      </svg>
    </>
  );
};


export const AutomationFlow: React.FC<ConceptSceneProps<AutomationFlowData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
