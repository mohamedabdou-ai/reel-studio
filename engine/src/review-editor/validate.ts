import { editManifestSchema, type EditManifest } from "../prepared-edit/schema.ts";
import { tryCompile } from "./time.ts";
import spec from "../core/platform/instagram-reels.json" with { type: "json" };
import type { Issue, IssueSeverity, IssueStage, ValidationResult } from "./types.ts";



const LIST_LABELS: Record<string, string> = {
  segments: "القطعة", sounds: "الصوت", camera: "مفتاح الكاميرا", transitions: "الـ transition", layoutTransitions: "الـ layout transition",
};


export function describePath(manifest: unknown, path: (string | number)[]): string {
  if (!path.length) return "الـ manifest";
  const m = manifest as Partial<EditManifest> | null;
  const [head, idx, ...rest] = path;
  const tail = rest.length ? ` › ${rest.join(".")}` : "";
  if (head === "scenes" && typeof idx === "number") return `المشهد "${m?.scenes?.[idx]?.id ?? `#${idx + 1}`}"${tail}`;
  if (head === "captions" && idx === "words" && typeof rest[0] === "number") {
    const w = m?.captions?.words?.[rest[0]];
    return `الكلمة #${rest[0] + 1}${w ? ` «${w.text}»` : ""}${rest.length > 1 ? ` › ${rest.slice(1).join(".")}` : ""}`;
  }
  if (head === "captions" && idx === "emphasis" && typeof rest[0] === "number") return `الـ emphasis #${rest[0] + 1}${rest.length > 1 ? ` › ${rest.slice(1).join(".")}` : ""}`;
  if (typeof head === "string" && LIST_LABELS[head] && typeof idx === "number") return `${LIST_LABELS[head]} #${idx + 1}${tail}`;
  return path.join(" › ");
}




const KNOWN: [RegExp, string][] = [
  [/^Source ranges must be ordered/, "القطع لازم تكون مترتبة ومش متداخلة وجوّه الفيديو الأصلي."],
  [/^Prepared edits support up to 10 minutes/, "الـ edit أطول من ١٠ دقايق (الحد الأقصى)."],
  [/^Scene IDs must be unique/, "في مشهدين ليهم نفس الـ id. كل مشهد لازم يكون اسمه لوحده."],
  [/^Visual scenes must be ordered/, "المشاهد لازم تكون مترتبة ومش متداخلة وجوّه مدة الفيديو."],
  [/^Signoff must start inside/, "بداية الـ signoff لازم تكون جوّه مدة الفيديو."],
  [/^Sound events must begin before/, "الـ SFX لازم يبدأ قبل الـ signoff ونهاية الفيديو."],
  [/^Camera keys must be strictly ordered/, "مفاتيح الكاميرا لازم تكون مترتبة وجوّه مدة الفيديو."],
  [/^Words need ordered/, "توقيت الكلمات لازم يكون مترتب ومن غير تداخل وجوّه الفيديو."],
  [/^Reviewed captions need an explicit reviewer/, "الكابشن معلّم reviewed من غير اسم reviewer."],
  [/^Delivery requires reviewed captions and authored scenes/, "التصدير النهائي محتاج كابشن reviewed ومشاهد."],
  [/^Transitions must finish before/, "الـ transition لازم يخلص قبل الـ signoff ونهاية الفيديو."],
  [/^Footage geometry must cover/, "الفوتيج لازم يغطي الـ window كله من غير حواف باينة."],
  [/^Foreground must match the same continuous source frames/, "الـ foreground لازم يطابق نفس فريمات المصدر بتاعة الـ presenter."],
  [/^Picture-in-picture is not part of/, "الـ PiP مش مسموح في الـ style ده."],
  [/^PiP window must stay inside/, "شباك الـ PiP لازم يفضل جوّه الفريم."],
  [/^PiP window .*caption band/, "شباك الـ PiP بيلمس مكان الكابشن، ممكن الكابشن يغطي وشه. حطه في ركن فوق أو صغّره."],
  [/^Layout transition at (\d+)/, "الـ layout transition عند فريم $1 مش مظبوط."],
  [/^Chapter palette fails contrast/, "ألوان الـ chapter مش واضحة كفاية (contrast ضعيف)."],
];

const TYPE_AR: Record<string, string> = { string: "نص", number: "رقم", int: "رقم صحيح", boolean: "true أو false", array: "قايمة", object: "object", null: "null" };
const ZOD: Record<string, (i: any) => string> = {


  invalid_type: (i) => (/received undefined\b/.test(String(i.message ?? "")) ? "الحقل ده ناقص." : `النوع غلط: المفروض ${TYPE_AR[String(i.expected)] ?? i.expected}.`),
  too_small: (i) => `القيمة أصغر من الحد الأدنى (${i.minimum}).`,
  too_big: (i) => `القيمة أكبر من الحد الأقصى (${i.maximum}).`,
  invalid_value: (i) => `قيمة مش مسموحة. المسموح: ${(i.values ?? []).join(" / ")}.`,
  invalid_format: () => "الصيغة مش مظبوطة.",
  unrecognized_keys: (i) => `حقل مش معروف: ${(i.keys ?? []).join(", ")}.`,
  invalid_union: () => "البيانات مش مطابقة لأي شكل مسموح للمشهد ده.",
  not_multiple_of: () => "القيمة مش مضاعف مسموح.",
};

function translate(zodIssue: any): { message: string; detail?: string } {
  const english = String(zodIssue.message ?? "");
  if (zodIssue.code === "custom") {
    for (const [rx, arabic] of KNOWN) {
      const hit = rx.exec(english);
      if (hit) return { message: arabic.replace("$1", hit[1] ?? ""), detail: english };
    }
    return { message: `مشكلة في الـ manifest: ${english}`, detail: english };
  }
  const fn = ZOD[zodIssue.code];
  return fn ? { message: fn(zodIssue), detail: english } : { message: english };
}

const issue = (manifest: unknown, path: (string | number)[], message: string, stage: IssueStage, code: string, severity: IssueSeverity = "error", detail?: string): Issue =>
  ({ path: path.join("."), where: describePath(manifest, path), message, severity, stage, code, ...(detail ? { detail } : {}) });




function delivery(m: EditManifest, compiledIssues: number): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, message: string, path: (string | number)[] = [], detail?: string) => out.push(issue(m, path, message, "delivery", `delivery:${code}`, "error", detail));
  if (m.purpose !== "delivery") add("purpose", "الـ purpose لازم يكون delivery عشان التصدير النهائي.", ["purpose"], "Delivery requires manifest purpose: delivery.");
  if (m.captions.status !== "reviewed") add("captions-reviewed", "الكابشن لازم يتراجع وتتعلّم reviewed قبل التصدير النهائي.", ["captions", "status"], "Delivery requires reviewed captions.");
  else if (!m.captions.reviewer?.trim()) add("reviewer", "لازم اسم الـ reviewer للكابشن.", ["captions", "reviewer"], "captions reviewer must be nonblank text.");
  if (!m.captions.words.length) add("captions-empty", "مفيش كلمات في الكابشن.", ["captions", "words"], "Delivery requires nonempty reviewed caption words.");
  if (!m.scenes.length) add("scenes", "مفيش مشاهد.", ["scenes"], "Delivery requires authored scenes.");
  if (m.source.fps < spec.video.fps.organicMin) add("fps", `الـ fps (${m.source.fps}) أقل من ${spec.video.fps.organicMin}: إنستجرام بيرفضه.`, ["source", "fps"], `PreparedEdit delivery needs at least ${spec.video.fps.organicMin} fps.`);
  if (compiledIssues) add("cut-review", "قص بيقطع كلمة من الكابشن. راجع حدود القص قبل التصدير.", ["segments"], "Delivery caption cuts need review before rendering.");

  return out;
}










export function validateManifest(input: unknown): ValidationResult {
  const issues: Issue[] = [];
  const parsed = editManifestSchema.safeParse(input);
  if (!parsed.success) {
    for (const z of parsed.error.issues) {
      const path = z.path.filter((p): p is string | number => typeof p === "string" || typeof p === "number");
      const t = translate(z);
      issues.push(issue(input, path, t.message, "schema", `zod:${z.code}`, "error", t.detail));
    }
    return { ok: false, deliveryReady: false, issues };
  }
  const m = parsed.data;
  const compiled = tryCompile(m);
  let cutWords = 0;
  if (!compiled.ok) {
    issues.push(issue(m, ["captions", "words"], "توقيت الكابشن بعد القص بيخلّي كلمة أقصر من فريم. راجع حدود القص أو توقيت الكلمات.", "timeline", "timeline:caption-collapse", "error", compiled.error));
  } else {
    for (const w of compiled.compiled.issues) {
      cutWords++;
      issues.push(issue(m, ["captions", "words", w.wordIndex], "قص بيقطع الكلمة دي. هتفضل كاملة في الكابشن، بس راجع الحدود.", "timeline", w.code, "warning", w.message));
    }
    if (compiled.compiled.omittedWordIndices.length) {
      issues.push(issue(m, ["captions", "words"], `${compiled.compiled.omittedWordIndices.length} كلمة اتشالت بالكامل بالقص وهتختفي من الكابشن.`, "timeline", "timeline:omitted-words", "warning"));
    }
  }
  const ok = !issues.some((i) => i.severity === "error");
  const d = ok ? delivery(m, cutWords) : [];
  issues.push(...d);
  return { ok, deliveryReady: ok && d.length === 0, issues };
}


export const issuesAt = (issues: Issue[], prefix: string): Issue[] => issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`));


export const parseManifest = (input: unknown): EditManifest | null => {
  const r = editManifestSchema.safeParse(input);
  return r.success ? r.data : null;
};
