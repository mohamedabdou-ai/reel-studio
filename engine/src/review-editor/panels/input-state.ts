export type FieldState = {

  text: string;

  shown: string;

  pending: string | null;

  skipBlur: boolean;
};

export type FieldEvent =
  | { type: "focus" }
  | { type: "type"; text: string }

  | { type: "enter"; blur: boolean }
  | { type: "escape" }
  | { type: "blur" }

  | { type: "shown"; shown: string }

  | { type: "reset" }

  | { type: "keep" };

export type FieldStep = { state: FieldState;                                                       commit: string | null };

export const initialField = (shown: string): FieldState => ({ text: shown, shown, pending: null, skipBlur: false });


export const formatNumber = (n: number, decimals?: number): string => (decimals === undefined ? String(n) : String(Number(n.toFixed(decimals))));


const wants = (s: FieldState): boolean => s.text !== s.shown && s.text !== s.pending;

export function fieldStep(s: FieldState, e: FieldEvent): FieldStep {
  switch (e.type) {
    case "focus":
      return { state: s.skipBlur ? { ...s, skipBlur: false } : s, commit: null };
    case "type":
      return { state: { ...s, text: e.text, pending: null, skipBlur: false }, commit: null };
    case "enter": {
      const commit = wants(s) ? s.text : null;
      return { state: { ...s, pending: commit ?? s.pending, skipBlur: e.blur }, commit };
    }
    case "escape":
      return { state: { ...s, text: s.shown, pending: null, skipBlur: true }, commit: null };
    case "blur": {
      if (s.skipBlur) return { state: { ...s, skipBlur: false }, commit: null };
      const commit = wants(s) ? s.text : null;
      return { state: commit === null ? s : { ...s, pending: commit }, commit };
    }
    case "shown": {


      const follow = s.text === s.shown || s.pending !== null;
      const text = follow ? e.shown : s.text;
      if (e.shown === s.shown && text === s.text && s.pending === null) return { state: s, commit: null };
      return { state: { ...s, shown: e.shown, text, pending: null }, commit: null };
    }
    case "reset":
      return { state: { ...s, text: s.shown, pending: null }, commit: null };
    case "keep":
      return { state: s.pending === null ? s : { ...s, pending: null }, commit: null };
  }
}


export function runField(start: FieldState, events: FieldEvent[]): { state: FieldState; commits: string[] } {
  let state = start;
  const commits: string[] = [];
  for (const event of events) {
    const r = fieldStep(state, event);
    state = r.state;
    if (r.commit !== null) commits.push(r.commit);
  }
  return { state, commits };
}
