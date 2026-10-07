import { EASE, envF, toFrame } from "../core/motion.ts";



export const CODE_LANGS = ["bash", "js", "ts", "python", "json"] as const;
export type CodeLang = (typeof CODE_LANGS)[number];
export const TOKEN_KINDS = ["keyword", "string", "number", "comment", "fn", "punct", "plain"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];
export type CodeToken = { text: string; kind: TokenKind };

const wordSet = (list: string): ReadonlySet<string> => new Set(list.split(" ").filter((w) => w.length > 0));

const JS_KEYWORDS = wordSet(
  "async await break case catch class const continue debugger default delete do else export extends false " +
    "finally for from function if import in instanceof let new null of return static super switch this throw " +
    "true try typeof undefined var void while with yield",
);
const TS_KEYWORDS: ReadonlySet<string> = new Set([
  ...JS_KEYWORDS,
  ...wordSet(
    "abstract any as asserts boolean declare enum implements infer interface is keyof namespace never number " +
      "private protected public readonly satisfies string type unknown",
  ),
]);
const PY_KEYWORDS = wordSet(
  "False None True and as assert async await break class continue def del elif else except finally for from " +
    "global if import in is lambda nonlocal not or pass raise return try while with yield",
);
const BASH_KEYWORDS = wordSet("case do done elif else esac export fi for function if in local return select then until while");

const BASH_COMMAND_AFTER = wordSet("do else elif if then until while");
const JSON_LITERALS = wordSet("false null true");
const PY_STRING_PREFIX = /^(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])$/;


const WS = /[ \t]+/y;
const JS_IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const PY_IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?n?)/y;
const BASH_WORD = /[^\s|&;()<>"'`$]+/y;
const BASH_VAR = /\$(?:\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9#?@*!$-])/y;
const ASCII_PUNCT = /^[!-/:-@[-`{-~]$/;



type Carry = { kind: "comment" | "string"; close: string; escapes: boolean } | null;

const stickyAt = (re: RegExp, line: string, i: number): string | null => {
  re.lastIndex = i;
  const m = re.exec(line);
  return m === null ? null : m[0];
};


const findClose = (line: string, from: number, close: string, escapes: boolean): number => {
  for (let i = from; i < line.length; i += 1) {
    if (escapes && line[i] === "\\") {
      i += 1;
      continue;
    }
    if (line.startsWith(close, i)) return i + close.length;
  }
  return -1;
};

const skipBlanks = (line: string, i: number): number => {
  let k = i;
  while (k < line.length && (line[k] === " " || line[k] === "\t")) k += 1;
  return k;
};

const tokenizeLine = (line: string, lang: CodeLang, carryIn: Carry): { tokens: CodeToken[]; carry: Carry } => {
  const tokens: CodeToken[] = [];


  const push = (text: string, kind: TokenKind): void => {
    if (text.length === 0) return;
    const last = tokens[tokens.length - 1];
    if (last !== undefined && last.kind === kind) last.text += text;
    else tokens.push({ text, kind });
  };
  let carry: Carry = carryIn;
  let i = 0;
  if (carry !== null) {
    const end = findClose(line, 0, carry.close, carry.escapes);
    if (end < 0) {
      push(line, carry.kind);
      return { tokens, carry };
    }
    push(line.slice(0, end), carry.kind);
    i = end;
    carry = null;
  }
  const js = lang === "js" || lang === "ts";
  const keywords =
    lang === "ts" ? TS_KEYWORDS : lang === "js" ? JS_KEYWORDS : lang === "python" ? PY_KEYWORDS : JSON_LITERALS;
  let command = true;



  const quoted = (from: number, q: number): number => {
    const triple = lang === "python" && (line.startsWith('"""', q) || line.startsWith("'''", q));
    const close = triple ? line.slice(q, q + 3) : line[q];
    const multiLine = triple || (js && close === "`");
    const escapes = !(lang === "bash" && close === "'");
    const end = findClose(line, q + close.length, close, escapes);
    if (end < 0) {
      push(line.slice(from), "string");
      if (multiLine) carry = { kind: "string", close, escapes };
      return line.length;
    }
    const isKey = lang === "json" && line[skipBlanks(line, end)] === ":";
    push(line.slice(from, end), isKey ? "fn" : "string");
    return end;
  };

  while (i < line.length) {
    const c = line[i];
    const ws = stickyAt(WS, line, i);
    if (ws !== null) {
      push(ws, "plain");
      i += ws.length;
      continue;
    }
    if (js && line.startsWith("//", i)) {
      push(line.slice(i), "comment");
      break;
    }
    if (js && line.startsWith("/*", i)) {
      const end = findClose(line, i + 2, "*/", false);
      if (end < 0) {
        push(line.slice(i), "comment");
        carry = { kind: "comment", close: "*/", escapes: false };
        break;
      }
      push(line.slice(i, end), "comment");
      i = end;
      continue;
    }
    if (lang === "python" && c === "#") {
      push(line.slice(i), "comment");
      break;
    }
    if (lang === "bash" && c === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      push(line.slice(i), "comment");
      break;
    }
    if (c === '"' || (c === "'" && lang !== "json") || (c === "`" && js)) {
      i = quoted(i, i);
      command = false;
      continue;
    }
    if (lang === "bash") {

      if (c === "$" && line[i + 1] === " " && line.slice(0, i).trim() === "") {
        push("$", "punct");
        i += 1;
        continue;
      }
      const v = stickyAt(BASH_VAR, line, i);
      if (v !== null) {
        push(v, "keyword");
        i += v.length;
        command = false;
        continue;
      }
      const w = stickyAt(BASH_WORD, line, i);
      if (w !== null) {
        if (BASH_KEYWORDS.has(w)) {
          push(w, "keyword");
          command = BASH_COMMAND_AFTER.has(w);
        } else if (command && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) push(w, "plain");
        else if (command) {
          push(w, "fn");
          command = false;
        } else if (w.startsWith("-")) push(w, "keyword");
        else if (/^\d+$/.test(w)) push(w, "number");
        else push(w, "plain");
        i += w.length;
        continue;
      }
      push(c, "punct");
      const redirect = line[i - 1] === ">" || line[i - 1] === "<" || line[i + 1] === ">";
      if (c === "|" || c === ";" || c === "(" || (c === "&" && !redirect)) command = true;
      i += 1;
      continue;
    }
    const num = c >= "0" && c <= "9" ? stickyAt(NUMBER, line, i) : null;
    if (num !== null) {
      push(num, "number");
      i += num.length;
      continue;
    }
    const id = stickyAt(lang === "python" || lang === "json" ? PY_IDENT : JS_IDENT, line, i);
    if (id !== null) {
      const next = i + id.length;
      if (lang === "python" && PY_STRING_PREFIX.test(id) && (line[next] === '"' || line[next] === "'")) {
        i = quoted(i, next);
        continue;
      }
      const kind: TokenKind = keywords.has(id)
        ? "keyword"
        : lang !== "json" && line[skipBlanks(line, next)] === "("
          ? "fn"
          : "plain";
      push(id, kind);
      i = next;
      continue;
    }
    if (ASCII_PUNCT.test(c)) {
      push(c, "punct");
      i += 1;
      continue;
    }

    const cp = String.fromCodePoint(line.codePointAt(i) as number);
    push(cp, "plain");
    i += cp.length;
  }
  return { tokens, carry };
};



export const splitCodeLines = (code: string): string[] => {
  const text = code.replace(/\r\n?/g, "\n").replace(/\t/g, "  ");
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
};







export const tokenizeCode = (code: string, lang: CodeLang): CodeToken[][] => {
  if (!(CODE_LANGS as readonly string[]).includes(lang)) {
    throw new Error(`code-tokens: unsupported language ${JSON.stringify(lang)} (use ${CODE_LANGS.join(" | ")})`);
  }
  let carry: Carry = null;
  return splitCodeLines(code).map((line) => {
    const out = tokenizeLine(line, lang, carry);
    carry = out.carry;
    return out.tokens;
  });
};




export const sliceTokens = (tokens: readonly CodeToken[], chars: number): CodeToken[] => {
  const out: CodeToken[] = [];
  let left = Math.max(0, Math.floor(chars));
  for (const t of tokens) {
    if (left <= 0) break;
    const text = t.text.slice(0, left);
    out.push({ text, kind: t.kind });
    left -= text.length;
  }
  return out;
};


export const CODE_LAYOUT = {
  header: 64,
  padX: 28,
  padY: 22,
  lineHeight: 1.5,
  gutterGap: 22,
  minFont: 20,
  maxLines: 16,
} as const;



export const codeBlockHeight = (lineCount: number, fontSize: number): number =>
  CODE_LAYOUT.header + 2 * CODE_LAYOUT.padY + lineCount * Math.round(fontSize * CODE_LAYOUT.lineHeight);






const charClass = (pairs: readonly (readonly [number, number])[]): string =>
  pairs.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("");



const ARABIC_LETTER = new RegExp(
  `[${charClass([[0x0600, 0x06ff], [0x0750, 0x077f], [0x08a0, 0x08ff], [0xfb50, 0xfdcf], [0xfdf0, 0xfdfd], [0xfe70, 0xfefe]])}]`,
);

const LTR_LETTER = new RegExp(`[A-Za-z${charClass([[0x00c0, 0x024f], [0x0370, 0x03ff], [0x0400, 0x04ff]])}]`);
const COMBINING_MARK = /^\p{M}$/u;


export const BIDI = {

  LRM: String.fromCharCode(0x200e),

  RLM: String.fromCharCode(0x200f),

  LRI: String.fromCharCode(0x2066),

  RLI: String.fromCharCode(0x2067),

  FSI: String.fromCharCode(0x2068),

  PDI: String.fromCharCode(0x2069),
} as const;

export const hasArabic = (text: string): boolean => ARABIC_LETTER.test(text);








export const uiDirection = (text: string): "rtl" | "ltr" => {
  let isolated = 0;
  for (const ch of text) {
    if (ch === BIDI.LRI || ch === BIDI.RLI || ch === BIDI.FSI) isolated += 1;
    else if (ch === BIDI.PDI) isolated = Math.max(0, isolated - 1);
    else if (isolated === 0 && ARABIC_LETTER.test(ch)) return "rtl";
    else if (isolated === 0 && LTR_LETTER.test(ch)) return "ltr";
  }
  return "ltr";
};








export const caretMark = (shown: string): string => {
  const last = shown.match(/\S+(?=\s*$)/);
  if (last === null) return "";
  return ARABIC_LETTER.test(last[0]) ? BIDI.RLM : BIDI.LRM;
};








export const ltr = (token: string): string => `${BIDI.LRI}${token}${BIDI.PDI}`;






export const typingUnits = (text: string): string[] => {
  const units: string[] = [];
  for (const part of text.match(/\s+|\S+/g) ?? []) {
    if (/^\s/.test(part) || ARABIC_LETTER.test(part)) {
      units.push(part);
      continue;
    }
    let started = false;
    for (const ch of Array.from(part)) {
      if (started && COMBINING_MARK.test(ch)) units[units.length - 1] += ch;
      else {
        units.push(ch);
        started = true;
      }
    }
  }
  return units;
};



export const wordUnits = (text: string): string[] => text.match(/^\s+|\S+\s*/g) ?? [];

export type RevealUnit = "type" | "word";

const unitsOf = (line: string, unit: RevealUnit): string[] => (unit === "type" ? typingUnits(line) : wordUnits(line));



export const revealTotal = (lines: readonly string[], unit: RevealUnit): number =>
  lines.reduce((n, line) => n + unitsOf(line, unit).length, 0) + (unit === "type" ? Math.max(0, lines.length - 1) : 0);

export type RevealLine = {

  shown: string;


  hidden: string;

  caret: boolean;
};


export const splitReveal = (lines: readonly string[], count: number, unit: RevealUnit): RevealLine[] => {
  let left = Math.max(0, Math.floor(count));
  const out = lines.map((line, i): RevealLine => {
    const units = unitsOf(line, unit);
    const take = Math.min(units.length, left);
    left -= take;
    if (unit === "type" && take === units.length && i < lines.length - 1 && left > 0) left -= 1;
    return { shown: units.slice(0, take).join(""), hidden: units.slice(take).join(""), caret: false };
  });
  let caretAt = 0;
  out.forEach((l, i) => {
    if (l.shown.length > 0) caretAt = i;
  });
  if (out.length > 0) out[caretAt].caret = true;
  return out;
};




export const UI_TIMING = {

  dotsSec: 0.55,

  wordRate: 9,

  lineSweepSec: 0.28,

  scrollSec: 0.3,

  blinkSec: 0.5,

  codeRate: 30,

  keyStepSec: 0.2,
  keyHoldSec: 0.45,

  pressF: 3,
} as const;


export const framesFor = (sec: number, fps: number): number => Math.max(1, toFrame(sec, fps));


export const assertFrame = (what: string, n: number): void => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`ui scenes: ${what} must be a whole frame >= 0, got ${String(n)}`);
};






export const revealCount = (frame: number, atFrame: number, durF: number, total: number): number => {
  if (total <= 0 || frame < atFrame) return 0;
  const d = Math.max(1, Math.round(durF));
  const k = frame - atFrame + 1;
  return Math.min(total, Math.floor((k * total + d - 1) / d));
};



export const lineSweep = (frame: number, atFrame: number, index: number, lineF: number): number => {
  const d = Math.max(1, Math.round(lineF));
  const start = atFrame + index * d;
  if (frame < start) return 0;
  return Math.min(1, (frame - start + 1) / d);
};




export const caretOn = (frame: number, busyFrom: number, busyTo: number, blinkF: number): boolean => {
  if (frame >= busyFrom && frame < busyTo) return true;
  const b = Math.max(1, Math.round(blinkF));
  const k = frame < busyFrom ? frame : frame - busyTo;
  return ((Math.floor(k / b) % 2) + 2) % 2 === 0;
};

export type ChatSlot = { atFrame: number; height: number; typing: boolean };
export type ChatPlanOptions = {

  gap: number;

  viewport: number;

  dotsF: number;

  dotsHeight: number;
};
export type ScrollStop = { atFrame: number; offset: number };
export type ChatPlan = {

  tops: number[];


  dotsFrom: (number | null)[];

  stops: ScrollStop[];
  contentHeight: number;

  finalOffset: number;
};






export const planChat = (slots: readonly ChatSlot[], o: ChatPlanOptions): ChatPlan => {
  if (!(o.viewport > 0) || !(o.gap >= 0) || !(o.dotsHeight > 0)) {
    throw new Error(`ui-chat: viewport ${o.viewport} / gap ${o.gap} / dotsHeight ${o.dotsHeight} must be positive`);
  }
  assertFrame("dotsF", o.dotsF);
  const tops: number[] = [];
  const dotsFrom: (number | null)[] = [];
  const stops: ScrollStop[] = [];
  const gap = Math.round(o.gap);
  const dotsHeight = Math.ceil(o.dotsHeight);
  let y = 0;
  let offset = 0;
  const stop = (atFrame: number, top: number, bottom: number): void => {
    offset = Math.max(offset, Math.max(0, Math.min(top, bottom - Math.floor(o.viewport))));
    stops.push({ atFrame, offset });
  };
  slots.forEach((s, i) => {
    assertFrame(`message ${i + 1} atFrame`, s.atFrame);
    if (i > 0 && s.atFrame < slots[i - 1].atFrame) {
      throw new Error(
        `ui-chat: message ${i + 1} lands at frame ${s.atFrame}, before message ${i} (${slots[i - 1].atFrame}); messages must be in time order`,
      );
    }
    if (!(Number.isFinite(s.height) && s.height > 0)) throw new Error(`ui-chat: message ${i + 1} has no height`);
    const h = Math.ceil(s.height);
    tops.push(y);
    let from: number | null = null;
    if (s.typing) {
      const f = Math.max(i > 0 ? slots[i - 1].atFrame + 1 : 0, s.atFrame - o.dotsF);
      from = f < s.atFrame ? f : null;
    }
    dotsFrom.push(from);
    if (from !== null) stop(from, y, y + dotsHeight);
    stop(s.atFrame, y, y + h);
    y += h + gap;
  });
  return { tops, dotsFrom, stops, contentHeight: slots.length > 0 ? y - gap : 0, finalOffset: offset };
};






export const scrollOffsetAt = (
  stops: readonly ScrollStop[],
  frame: number,
  durF: number,
  ease: (p: number) => number = EASE.inOut,
): number => {
  const d = Math.max(1, Math.round(durF));
  const animate = (from: number, s: ScrollStop, f: number): number =>
    f < s.atFrame ? from : Math.round(from + (s.offset - from) * ease(Math.min(1, (f - s.atFrame + 1) / d)));
  let from = 0;
  let active: ScrollStop | null = null;
  for (const s of stops) {
    if (s.atFrame > frame) break;
    if (active !== null) from = animate(from, active, s.atFrame - 1);
    active = s;
  }
  return active === null ? 0 : animate(from, active, frame);
};

export type KeyTiming = {

  atFrame: number;

  stepF: number;

  holdF: number;

  pressF: number;
};






export const keyDepth = (frame: number, index: number, count: number, t: KeyTiming): number => {
  const down = t.atFrame + index * t.stepF;
  const up = t.atFrame + (count - 1) * t.stepF + t.holdF;
  if (frame < down || frame >= up + t.pressF) return 0;
  return envF(frame, down, up + t.pressF, t.pressF, t.pressF);
};



const KEY_LABEL = /^[!-~](?:[ -~]{0,10}[!-~])?$/;

export const assertKeyLabel = (label: string): void => {
  if (!KEY_LABEL.test(label)) {
    throw new Error(
      `ui-keys: key label ${JSON.stringify(label)} must be 1-12 printable ASCII characters — write "Cmd", "Shift", "Enter", not a symbol`,
    );
  }
};
