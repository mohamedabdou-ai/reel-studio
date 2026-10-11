// SPDX-License-Identifier: MIT
// Reusable primitive from the original Reel Studio editing engine.
import React from "react";
import { clamp01, mix, px, useClock, useEnterF } from "../core/motion";
import { assertFontsReady } from "../core/fonts";
import { useProbe } from "../core/safe";
import { isArabic, pillBox, type Pill } from "../core/type";
import type { SceneTheme } from "./primitives";
import { UI_TIMING, assertFrame, assertKeyLabel, framesFor, keyDepth, uiDirection, type KeyTiming } from "./code-tokens.ts";
import { uiColors, type UiColors } from "./ui-chat";

const KEY = { depth: 10, radius: 14, border: 2, padX: 26, padY: 16, gap: 14, enterStepF: 3, leadSec: 0.35 } as const;

export type KeyComboProps = {
  theme: SceneTheme;

  keys: readonly string[];

  at: number;

  step?: number;

  hold?: number;

  enterAt?: number;

  size?: number;

  maxWidth?: number;
  style?: React.CSSProperties;
};

const KeyCap: React.FC<{
  label: string;
  pill: Pill;
  width: number;
  height: number;
  left: number;
  index: number;
  count: number;
  timing: KeyTiming;
  enterAt: number;
  colors: UiColors;
}> = ({ label, pill, width, height, left, index, count, timing, enterAt, colors }) => {
  const { frame } = useClock();
  const probe = useProbe();
  const enter = useEnterF(enterAt, "snap");
  const e = probe !== null ? 1 : enter;
  const d = probe !== null ? 0 : keyDepth(frame, index, count, timing);

  const textLeft = px((width - pill.text.width) / 2) - KEY.border;
  const textTop = px((height - pill.text.height) / 2) - KEY.border;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 0,
        width,
        height: height + KEY.depth,
        opacity: clamp01(e),
        transform: `translateY(${px((1 - e) * 16)}px) scale(${mix(0.86, 1, e)})`,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: KEY.depth, width, height, borderRadius: KEY.radius, background: colors.border }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: px(KEY.depth * d),
          width,
          height,
          boxSizing: "border-box",
          borderRadius: KEY.radius,
          border: `${KEY.border}px solid ${colors.border}`,
          background: colors.window,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: colors.accentFill, opacity: d }} />
        <span style={{ ...pill.style, position: "absolute", left: textLeft, top: textTop, color: colors.text, opacity: 1 - d }}>{label}</span>
        <span style={{ ...pill.style, position: "absolute", left: textLeft, top: textTop, color: colors.onAccentFill, opacity: d }}>{label}</span>
      </div>
    </div>
  );
};

const PlusSign: React.FC<{ pill: Pill; left: number; top: number; enterAt: number; color: string }> = ({ pill, left, top, enterAt, color }) => {
  const probe = useProbe();
  const enter = useEnterF(enterAt, "snap");
  const e = probe !== null ? 1 : enter;
  return <span style={{ ...pill.style, position: "absolute", left, top, color, opacity: clamp01(e) }}>+</span>;
};

export const KeyCombo: React.FC<KeyComboProps> = ({ theme, keys, at, step, hold, enterAt, size = 44, maxWidth = 900, style }) => {
  const { fps } = useClock();
  const colors = uiColors(theme);
  const stepF = step ?? framesFor(UI_TIMING.keyStepSec, fps);
  const holdF = hold ?? framesFor(UI_TIMING.keyHoldSec, fps);
  const enterF = enterAt ?? Math.max(0, at - framesFor(KEY.leadSec, fps));
  const layout = React.useMemo(() => {
    assertFontsReady();
    if (keys.length < 1 || keys.length > 4) throw new Error(`ui-keys: a KeyCombo has 1-4 keys, got ${keys.length}`);
    keys.forEach(assertKeyLabel);
    const caps = keys.map((label) => {
      const pill = pillBox(label, { fontFamily: theme.mono, fontSize: size, fontWeight: 600 }, { x: KEY.padX, y: KEY.padY });
      return { label, pill, width: Math.max(pill.width, pill.height) };
    });
    const plus = pillBox("+", { fontFamily: theme.display, fontSize: px(size * 0.8), fontWeight: 700 });
    const capH = Math.max(...caps.map((c) => c.pill.height));
    const lefts: number[] = [];
    let x = 0;
    caps.forEach((c, i) => {
      if (i > 0) x += 2 * KEY.gap + plus.width;
      lefts.push(x);
      x += c.width;
    });
    if (x > maxWidth) throw new Error(`ui-keys: KeyCombo ${keys.join(" + ")} is ${x}px wide, over its ${maxWidth}px limit`);
    return { caps, plus, capH, lefts, width: x };
  }, [keys, theme.mono, theme.display, size, maxWidth]);
  assertFrame("KeyCombo at", at);
  assertFrame("KeyCombo step", stepF);
  assertFrame("KeyCombo hold", holdF);
  assertFrame("KeyCombo enterAt", enterF);
  if (holdF < UI_TIMING.pressF) throw new Error(`ui-keys: KeyCombo hold ${holdF} is shorter than one press (${UI_TIMING.pressF} frames)`);
  const timing: KeyTiming = { atFrame: at, stepF, holdF, pressF: UI_TIMING.pressF };
  const { caps, plus, capH, lefts, width } = layout;
  return (
    <div style={{ position: "relative", width, height: capH + KEY.depth, direction: "ltr", ...style }}>
      {caps.map((cap, i) => (
        <React.Fragment key={`${i}-${cap.label}`}>
          {i > 0 ? (
            <PlusSign
              pill={plus}
              left={lefts[i] - KEY.gap - plus.width}
              top={px((capH - plus.height) / 2)}
              enterAt={enterF + i * KEY.enterStepF}
              color={colors.dim}
            />
          ) : null}
          <KeyCap
            label={cap.label}
            pill={cap.pill}
            width={cap.width}
            height={capH}
            left={lefts[i]}
            index={i}
            count={caps.length}
            timing={timing}
            enterAt={enterF + i * KEY.enterStepF}
            colors={colors}
          />
        </React.Fragment>
      ))}
    </div>
  );
};

export type CommandChipProps = {
  theme: SceneTheme;

  text: string;

  at: number;

  icon?: "prompt" | "none";

  size?: number;

  maxWidth?: number;
  style?: React.CSSProperties;
};

const CHIP = { padX: 28, padY: 14, border: 2, iconGap: 14, flashF: 10 } as const;

export const CommandChip: React.FC<CommandChipProps> = ({ theme, text, at, icon = "prompt", size = 36, maxWidth = 900, style }) => {
  const { frame } = useClock();
  const probe = useProbe();
  const enter = useEnterF(at, "snap");
  const colors = uiColors(theme);
  const layout = React.useMemo(() => {
    assertFontsReady();
    if (!/\S/.test(text)) throw new Error("ui-keys: CommandChip text is blank");
    const arabic = isArabic(text);
    const pill = pillBox(
      text,
      { fontFamily: arabic ? theme.ar : theme.mono, fontSize: size, fontWeight: arabic ? 700 : 600 },
      { x: CHIP.padX, y: CHIP.padY },
    );
    const iconSize = px(size * 0.7);
    const iconW = icon === "none" ? 0 : iconSize + CHIP.iconGap;
    const width = pill.width + iconW + 2 * CHIP.border;
    const height = pill.height + 2 * CHIP.border;
    if (width > maxWidth) throw new Error(`ui-keys: CommandChip ${JSON.stringify(text)} is ${width}px wide, over its ${maxWidth}px limit`);
    return { pill, iconSize, iconW, width, height, rtl: uiDirection(text) === "rtl" };
  }, [text, theme.ar, theme.mono, size, icon, maxWidth]);
  assertFrame("CommandChip at", at);
  const { pill, iconSize, iconW, width, height, rtl } = layout;
  const e = probe !== null ? 1 : enter;
  const flash = probe !== null || frame < at ? 0 : 1 - clamp01((frame - at) / CHIP.flashF);
  const innerW = width - 2 * CHIP.border;
  const iconLeft = rtl ? innerW - CHIP.padX - iconSize : CHIP.padX;
  const textLeft = rtl ? CHIP.padX : CHIP.padX + iconW;
  const radius = px(height / 2);
  return (
    <div style={{ position: "relative", width, height, ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          borderRadius: radius,
          border: `${CHIP.border}px solid ${colors.border}`,
          background: colors.window,
          opacity: clamp01(e),
          transform: `translateY(${px((1 - e) * 14)}px) scale(${mix(0.9, 1, e)})`,
        }}
      >
        {icon === "prompt" ? (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            style={{ position: "absolute", left: iconLeft, top: px((height - 2 * CHIP.border - iconSize) / 2), display: "block" }}
          >
            <path
              d={rtl ? "M16 5 L8 12 L16 19" : "M8 5 L16 12 L8 19"}
              fill="none"
              stroke={colors.accentInk}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
        <span
          style={{ ...pill.style, position: "absolute", left: textLeft, top: pill.textTop, color: colors.text, direction: rtl ? "rtl" : "ltr" }}
        >
          {text}
        </span>
        <div
          style={{
            position: "absolute",
            inset: -CHIP.border,
            borderRadius: radius,
            border: `3px solid ${colors.accentFill}`,
            opacity: flash,
          }}
        />
      </div>
    </div>
  );
};
