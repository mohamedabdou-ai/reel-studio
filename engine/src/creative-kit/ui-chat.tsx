import React from "react";
import { EASE, clamp01, envF, mix, px, useClock, useEnterF } from "../core/motion";
import { assertFontsReady } from "../core/fonts";
import { useProbe } from "../core/safe";
import { fitToBox, isArabic, type FittedLines } from "../core/type";
import { FitText, type SceneTheme } from "./primitives";
import {
  UI_TIMING,
  assertFrame,
  caretMark,
  caretOn,
  framesFor,
  keyDepth,
  lineSweep,
  planChat,
  revealCount,
  revealTotal,
  scrollOffsetAt,
  splitReveal,
  uiDirection,
  type RevealLine,
} from "./code-tokens.ts";



export type UiColors = {
  window: string;
  border: string;
  text: string;
  dim: string;

  accentFill: string;
  onAccentFill: string;

  accentInk: string;
  userBubble: string;
  userText: string;
  aiBubble: string;
  aiText: string;
  good: string;
};


export const uiColors = (theme: SceneTheme): UiColors => {


  const pillReads = theme.pill !== "transparent" && theme.pill !== theme.card;
  const onAccentFill = theme.onAccent ?? theme.pillText;
  return {
    window: theme.card,
    border: theme.border,
    text: theme.text,
    dim: theme.dim,
    accentFill: theme.accent,
    onAccentFill,
    accentInk: theme.accentInk ?? theme.accent,
    userBubble: pillReads ? theme.pill : theme.accent,
    userText: pillReads ? theme.pillText : onAccentFill,
    aiBubble: theme.background,
    aiText: theme.text,
    good: theme.good,
  };
};




export const TypingCaret: React.FC<{ lineBox: number; color: string; on: boolean }> = ({ lineBox, color, on }) => (
  <span style={{ display: "inline-block", position: "relative", width: 0, height: lineBox, verticalAlign: "top" }}>
    <span
      style={{
        position: "absolute",
        left: -2,
        top: px(lineBox * 0.14),
        width: 4,
        height: px(lineBox * 0.72),
        borderRadius: 2,
        background: color,
        opacity: on ? 1 : 0,
      }}
    />
  </span>
);








const RevealedLines: React.FC<{
  fit: FittedLines;
  rtl: boolean;
  parts: readonly RevealLine[];
  color: string;
  keepLayout: boolean;
  clip?: readonly number[];
  caret?: { color: string; on: boolean } | null;
}> = ({ fit, rtl, parts, color, keepLayout, clip, caret }) => (
  <div
    style={{
      ...fit.style,
      position: "relative",
      width: fit.width,
      color,
      direction: rtl ? "rtl" : "ltr",
      textAlign: rtl ? "right" : "left",
    }}
  >
    {parts.map((p, i) => {
      const q = clip ? clamp01(clip[i] ?? 0) : 1;
      const hiddenPx = px(fit.width * (1 - q));
      const clipPath = q >= 1 ? undefined : rtl ? `inset(0px 0px 0px ${hiddenPx}px)` : `inset(0px ${hiddenPx}px 0px 0px)`;
      return (
        <div key={i} style={{ height: fit.lineBox, whiteSpace: "pre", clipPath, visibility: q <= 0 ? "hidden" : undefined }}>
          {p.shown}
          {caret && p.caret ? (
            <>
              {caretMark(p.shown)}
              <TypingCaret lineBox={fit.lineBox} color={caret.color} on={caret.on} />
              {caretMark(p.shown)}
            </>
          ) : null}
          {keepLayout && p.hidden.length > 0 ? <span style={{ visibility: "hidden" }}>{p.hidden}</span> : null}
        </div>
      );
    })}
  </div>
);



export type ChatRole = "user" | "ai";
export type ChatReveal = "word" | "line" | "instant";

export type ChatMessage = {
  role: ChatRole;

  text: string;

  atFrame: number;

  typing?: boolean;

  reveal: ChatReveal;


  revealF?: number;
};

export type ChatWindowProps = {
  theme: SceneTheme;
  messages: readonly ChatMessage[];

  width: number;
  height: number;

  atFrame?: number;

  title?: string;

  dir?: "ltr" | "rtl";

  fontSize?: number;
  style?: React.CSSProperties;
};

const CHAT = {
  radius: 28,
  border: 2,
  header: 84,
  padX: 28,
  padTop: 22,
  padBottom: 22,
  gap: 16,

  bubbleMax: 0.8,
  bubblePadX: 24,
  bubblePadY: 16,
  bubbleBorder: 2,
  bubbleRadius: 24,
  tailRadius: 6,
  maxLines: 8,
  dotsW: 118,
  dotsH: 62,
} as const;

type MeasuredMessage = { fit: FittedLines; rtl: boolean; width: number; height: number };

const measureMessage = (
  message: ChatMessage,
  index: number,
  theme: SceneTheme,
  fontSize: number,
  maxText: number,
): MeasuredMessage => {
  if (!/\S/.test(message.text)) throw new Error(`ui-chat: message ${index + 1} is blank`);
  assertFrame(`message ${index + 1} atFrame`, message.atFrame);
  if (message.revealF !== undefined && (!Number.isInteger(message.revealF) || message.revealF < 1)) {
    throw new Error(`ui-chat: message ${index + 1} revealF must be a whole number of frames >= 1`);
  }
  const arabic = isArabic(message.text);
  const fit = fitToBox(
    message.text,
    { fontFamily: arabic ? theme.ar : theme.display, fontSize, fontWeight: message.role === "user" ? 700 : 400 },
    { maxBoxWidth: maxText, maxLines: CHAT.maxLines, lineHeight: arabic ? 1.55 : 1.35 },
  );
  if (!fit.fits) {
    throw new Error(
      `ui-chat: message ${index + 1} ${JSON.stringify(message.text.slice(0, 48))} does not fit ${CHAT.maxLines} lines of ${maxText}px at ${fontSize}px. Split it into two messages or widen the window.`,
    );
  }
  const chrome = 2 * (CHAT.bubblePadX + CHAT.bubbleBorder);
  return {
    fit,
    rtl: uiDirection(message.text) === "rtl",
    width: fit.width + chrome,
    height: fit.height + 2 * (CHAT.bubblePadY + CHAT.bubbleBorder),
  };
};


const TypingDots: React.FC<{ left: number; top: number; fromF: number; toF: number; onRight: boolean; colors: UiColors }> = ({
  left,
  top,
  fromF,
  toF,
  onRight,
  colors,
}) => {
  const { frame, fps } = useClock();
  const local = (frame - fromF) / fps;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: CHAT.dotsW,
        height: CHAT.dotsH,
        boxSizing: "border-box",
        borderRadius: onRight
          ? `${CHAT.bubbleRadius}px ${CHAT.tailRadius}px ${CHAT.bubbleRadius}px ${CHAT.bubbleRadius}px`
          : `${CHAT.tailRadius}px ${CHAT.bubbleRadius}px ${CHAT.bubbleRadius}px ${CHAT.bubbleRadius}px`,
        background: colors.aiBubble,
        border: `${CHAT.bubbleBorder}px solid ${colors.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        opacity: envF(frame, fromF, toF, 2, 2),
      }}
    >
      {[0, 1, 2].map((i) => {
        const phase = (local * 3.6 + i * 0.9) % 3;
        const y = phase < 1 ? -Math.sin(phase * Math.PI) * 7 : 0;
        return (
          <div
            key={i}
            style={{ width: 12, height: 12, borderRadius: "50%", background: colors.dim, transform: `translateY(${y.toFixed(2)}px)` }}
          />
        );
      })}
    </div>
  );
};

const ChatBubble: React.FC<{
  message: ChatMessage;
  measured: MeasuredMessage;
  top: number;
  left: number;
  onRight: boolean;
  dotsFrom: number | null;
  dotsLeft: number;
  dotsOnRight: boolean;
  colors: UiColors;
}> = ({ message, measured, top, left, onRight, dotsFrom, dotsLeft, dotsOnRight, colors }) => {
  const { frame, fps } = useClock();
  const probe = useProbe();
  const land = useEnterF(message.atFrame, "tight");
  if (probe === null && frame < message.atFrame) {
    return dotsFrom !== null && frame >= dotsFrom ? (
      <TypingDots left={dotsLeft} top={top} fromF={dotsFrom} toF={message.atFrame} onRight={dotsOnRight} colors={colors} />
    ) : null;
  }
  const e = probe !== null ? 1 : land;
  const lines = measured.fit.lines;
  const total = revealTotal(lines, "word");
  const wordF = message.revealF ?? Math.max(1, Math.round((total * fps) / UI_TIMING.wordRate));
  const count = probe === null && message.reveal === "word" ? revealCount(frame, message.atFrame, wordF, total) : total;
  const lineF = message.revealF !== undefined ? Math.max(1, Math.round(message.revealF / lines.length)) : framesFor(UI_TIMING.lineSweepSec, fps);
  const clip =
    probe === null && message.reveal === "line"
      ? lines.map((_, i) => EASE.land(lineSweep(frame, message.atFrame, i, lineF)))
      : undefined;
  const isUser = message.role === "user";
  const fill = isUser ? colors.userBubble : colors.aiBubble;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: measured.width,
        height: measured.height,
        boxSizing: "border-box",
        padding: `${CHAT.bubblePadY}px ${CHAT.bubblePadX}px`,
        borderRadius: onRight
          ? `${CHAT.bubbleRadius}px ${CHAT.tailRadius}px ${CHAT.bubbleRadius}px ${CHAT.bubbleRadius}px`
          : `${CHAT.tailRadius}px ${CHAT.bubbleRadius}px ${CHAT.bubbleRadius}px ${CHAT.bubbleRadius}px`,
        background: fill,
        border: `${CHAT.bubbleBorder}px solid ${isUser ? fill : colors.border}`,
        opacity: clamp01(e),
        transform: `translateY(${px((1 - e) * 12)}px) scale(${mix(0.92, 1, e)})`,
        transformOrigin: onRight ? "100% 0%" : "0% 0%",
      }}
    >
      <RevealedLines
        fit={measured.fit}
        rtl={measured.rtl}
        parts={splitReveal(lines, count, "word")}
        keepLayout
        clip={clip}
        color={isUser ? colors.userText : colors.aiText}
      />
    </div>
  );
};






export const ChatWindow: React.FC<ChatWindowProps> = ({
  theme,
  messages,
  width,
  height,
  atFrame = 0,
  title,
  dir = "ltr",
  fontSize = 32,
  style,
}) => {
  const { frame, fps } = useClock();
  const probe = useProbe();
  const enter = useEnterF(atFrame, "card");
  const colors = uiColors(theme);
  const innerW = width - 2 * CHAT.border;
  const headerH = title !== undefined ? CHAT.header : 0;
  const viewportH = height - 2 * CHAT.border - headerH;
  const contentW = innerW - 2 * CHAT.padX;
  const maxText = Math.floor(contentW * CHAT.bubbleMax) - 2 * (CHAT.bubblePadX + CHAT.bubbleBorder);
  const dotsF = framesFor(UI_TIMING.dotsSec, fps);
  const measured = React.useMemo(() => {
    assertFontsReady();
    return messages.map((message, i) => measureMessage(message, i, theme, fontSize, maxText));
  }, [messages, theme, fontSize, maxText]);
  const plan = React.useMemo(
    () =>
      planChat(
        messages.map((message, i) => ({ atFrame: message.atFrame, height: measured[i].height, typing: message.typing === true })),
        { gap: CHAT.gap, viewport: viewportH - CHAT.padTop - CHAT.padBottom, dotsF, dotsHeight: CHAT.dotsH },
      ),
    [messages, measured, viewportH, dotsF],
  );
  assertFrame("ChatWindow atFrame", atFrame);
  if (!Number.isInteger(width) || !Number.isInteger(height) || maxText < 160) {
    throw new Error(`ui-chat: ChatWindow ${width}x${height} is too small or not whole pixels`);
  }
  if (messages.length === 0) throw new Error("ui-chat: ChatWindow needs at least one message");
  const e = probe !== null ? 1 : enter;
  const scroll = probe !== null ? plan.finalOffset : scrollOffsetAt(plan.stops, frame, framesFor(UI_TIMING.scrollSec, fps));
  const aiOnRight = dir === "rtl";
  return (
    <div style={{ position: "relative", width, height, ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          borderRadius: CHAT.radius,
          background: colors.window,
          border: `${CHAT.border}px solid ${colors.border}`,
          overflow: "hidden",
          opacity: clamp01(e),
          transform: `translateY(${px((1 - e) * 24)}px) scale(${mix(0.97, 1, e)})`,
          transformOrigin: "50% 100%",
        }}
      >
        {title !== undefined ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: innerW,
              height: CHAT.header,
              boxSizing: "border-box",
              borderBottom: `2px solid ${colors.border}`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: CHAT.padX,
                top: px((CHAT.header - 14) / 2),
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: colors.good,
              }}
            />
            <div style={{ position: "absolute", left: CHAT.padX + 28, top: px((CHAT.header - 36) / 2) }}>
              <FitText text={title} theme={theme} role="title" width={contentW - 28} height={36} size={28} min={18} lines={1} />
            </div>
          </div>
        ) : null}
        <div style={{ position: "absolute", left: 0, top: headerH, width: innerW, height: viewportH, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: CHAT.padX, top: CHAT.padTop - scroll, width: contentW }}>
            {messages.map((message, i) => {
              const m = measured[i];
              const onRight = message.role === "user" ? !aiOnRight : aiOnRight;
              return (
                <ChatBubble
                  key={i}
                  message={message}
                  measured={m}
                  top={plan.tops[i]}
                  left={onRight ? contentW - m.width : 0}
                  onRight={onRight}
                  dotsFrom={plan.dotsFrom[i]}
                  dotsLeft={aiOnRight ? contentW - CHAT.dotsW : 0}
                  dotsOnRight={aiOnRight}
                  colors={colors}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};



export type PromptBoxProps = {
  theme: SceneTheme;

  text: string;

  atFrame: number;

  durF: number;

  sendAt?: number;

  width: number;

  placeholder?: string;

  enterAt?: number;

  fontSize?: number;

  maxLines?: number;
  style?: React.CSSProperties;
};

const PROMPT = { padX: 28, padY: 22, border: 2, radius: 34, button: 64, buttonGap: 20, sendHoldF: 4 } as const;







export const PromptBox: React.FC<PromptBoxProps> = ({
  theme,
  text,
  atFrame,
  durF,
  sendAt,
  width,
  placeholder,
  enterAt = 0,
  fontSize = 34,
  maxLines = 3,
  style,
}) => {
  const { frame, fps } = useClock();
  const probe = useProbe();
  const enter = useEnterF(enterAt, "card");
  const colors = uiColors(theme);
  const innerW = width - 2 * PROMPT.border;
  const textW = innerW - 2 * PROMPT.padX - PROMPT.button - PROMPT.buttonGap;
  const layout = React.useMemo(() => {
    assertFontsReady();
    const fitLines = (copy: string, lines: number, what: string): FittedLines => {
      if (!/\S/.test(copy)) throw new Error(`ui-chat: PromptBox ${what} is blank`);
      const arabic = isArabic(copy);
      const fit = fitToBox(
        copy,
        { fontFamily: arabic ? theme.ar : theme.display, fontSize, fontWeight: 400 },
        { maxBoxWidth: textW, maxLines: lines, lineHeight: arabic ? 1.5 : 1.35 },
      );
      if (!fit.fits) {
        throw new Error(
          `ui-chat: PromptBox ${what} ${JSON.stringify(copy.slice(0, 48))} does not fit ${lines} line(s) of ${textW}px at ${fontSize}px`,
        );
      }
      return fit;
    };
    const fit = fitLines(text, maxLines, "text");
    const hint = placeholder !== undefined ? fitLines(placeholder, 1, "placeholder") : null;
    const contentH = Math.max(PROMPT.button, fit.height, hint === null ? 0 : hint.height);
    return { fit, hint, contentH, height: contentH + 2 * (PROMPT.padY + PROMPT.border) };
  }, [text, placeholder, theme, fontSize, maxLines, textW]);
  assertFrame("PromptBox atFrame", atFrame);
  assertFrame("PromptBox enterAt", enterAt);
  if (!Number.isInteger(durF) || durF < 1) throw new Error(`ui-chat: PromptBox durF must be a whole number of frames >= 1`);
  if (sendAt !== undefined) {
    assertFrame("PromptBox sendAt", sendAt);
    if (sendAt < atFrame + durF - 1) {
      throw new Error(`ui-chat: PromptBox sendAt ${sendAt} fires before the prompt finishes typing (frame ${atFrame + durF - 1})`);
    }
  }
  if (!Number.isInteger(width) || textW < 160) throw new Error(`ui-chat: PromptBox width ${width} is too small or not whole pixels`);

  const { fit, hint, contentH, height } = layout;
  const rtl = uiDirection(text) === "rtl";
  const total = revealTotal(fit.lines, "type");
  const count = probe !== null ? total : revealCount(frame, atFrame, durF, total);
  const typing = probe === null && frame >= atFrame && frame < atFrame + durF;
  const caret = probe !== null ? null : { color: colors.accentInk, on: caretOn(frame, atFrame, atFrame + durF, framesFor(UI_TIMING.blinkSec, fps)) };
  const press =
    probe !== null || sendAt === undefined
      ? 0
      : keyDepth(frame, 0, 1, { atFrame: sendAt, stepF: 0, holdF: PROMPT.sendHoldF, pressF: UI_TIMING.pressF });
  const armed = count > 0;
  const e = probe !== null ? 1 : enter;
  const buttonLeft = rtl ? PROMPT.padX : innerW - PROMPT.padX - PROMPT.button;
  const textLeft = rtl ? PROMPT.padX + PROMPT.button + PROMPT.buttonGap : PROMPT.padX;
  const hintRtl = placeholder !== undefined && uiDirection(placeholder) === "rtl";
  return (
    <div style={{ position: "relative", width, height, ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          borderRadius: PROMPT.radius,
          background: colors.window,
          border: `${PROMPT.border}px solid ${typing ? colors.accentInk : colors.border}`,
          opacity: clamp01(e),
          transform: `translateY(${px((1 - e) * 18)}px) scale(${mix(0.97, 1, e)})`,
        }}
      >
        {hint !== null && probe === null && count === 0 ? (
          <div
            style={{
              position: "absolute",
              left: textLeft + (hintRtl ? textW - hint.width : 0),
              top: PROMPT.padY + px((contentH - hint.height) / 2),
            }}
          >
            <RevealedLines
              fit={hint}
              rtl={hintRtl}
              parts={splitReveal(hint.lines, Number.MAX_SAFE_INTEGER, "word")}
              keepLayout
              color={colors.dim}
            />
          </div>
        ) : null}
        <div style={{ position: "absolute", left: textLeft + (rtl ? textW - fit.width : 0), top: PROMPT.padY + px((contentH - fit.height) / 2) }}>
          <RevealedLines
            fit={fit}
            rtl={rtl}
            parts={splitReveal(fit.lines, count, "type")}
            keepLayout={false}
            color={colors.text}
            caret={caret}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: buttonLeft,
            top: PROMPT.padY + px((contentH - PROMPT.button) / 2),
            width: PROMPT.button,
            height: PROMPT.button,
            borderRadius: "50%",
            background: armed ? colors.accentFill : colors.border,
            transform: `scale(${mix(1, 0.86, press)})`,
          }}
        >
          <svg width={PROMPT.button} height={PROMPT.button} viewBox="0 0 64 64" style={{ display: "block" }}>
            <path
              d="M32 45 L32 20 M21 31 L32 20 L43 31"
              fill="none"
              stroke={armed ? colors.onAccentFill : colors.window}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
