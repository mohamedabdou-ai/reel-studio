import React from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, WifiOff, X } from "lucide-react";
import type { ConnectionState } from "../api-client.ts";
import type { Draft } from "./draft.ts";
import { relativeAge, timeOfDay } from "./format.ts";
import type { Toast } from "./hooks.ts";
import type { LiveProjectStatus } from "./live-project.ts";

const ICON = { ok: CircleCheck, info: Info, warn: TriangleAlert, error: CircleAlert } as const;

export const Toasts: React.FC<{ toasts: Toast[]; onDismiss: (id: number) => void }> = ({ toasts, onDismiss }) => (
  <div className="rv-toasts" role="status" aria-live="polite" dir="rtl">
    {toasts.map((t) => {
      const Icon = ICON[t.kind];
      return (
        <button key={t.id} type="button" className={`rv-toast ${t.kind}`} onClick={() => onDismiss(t.id)} title="اقفل">
          <Icon size={16} /><span>{t.text}</span><X size={12} className="rv-toast-x" />
        </button>
      );
    })}
  </div>
);

export const ConnectionBanner: React.FC<{ state: ConnectionState; retrying: boolean; dirty: boolean; onRetry: () => void }> = ({ state, retrying, dirty, onRetry }) => {
  if (state.online) return null;
  if (state.reason === "unauthorized") {
    return (
      <div className="rv-banner bad" role="alert">
        <WifiOff size={16} />
        <span>الجلسة انتهت: السيرفر اتفتح من جديد بـ token جديد. افتح اللينك الجديد اللي طلع في الـ terminal.{dirty ? " تعديلاتك محفوظة في المتصفح كمسودة وهتتعرض عليك تسترجعها." : ""}</span>
      </div>
    );
  }
  return (
    <div className="rv-banner bad" role="alert">
      <WifiOff size={16} />
      <span>الاتصال بالسيرفر اتقطع. {dirty ? "تعديلاتك لسه موجودة ومحفوظة في المتصفح كمسودة." : "مفيش تعديلات هتضيع."} بنحاول تاني لوحدنا.</span>
      <button type="button" disabled={retrying} onClick={onRetry}>{retrying ? <LoaderCircle size={14} className="rv-spin" /> : null} حاول دلوقتي</button>
    </div>
  );
};

export const PrepareBanner: React.FC<{ reason: "never-prepared" | "stale-plate"; busy: boolean; onPrepare: () => void }> = ({ reason, busy, onPrepare }) => (
  <div className="rv-banner warn" role="status">
    <TriangleAlert size={16} />
    <span>
      {reason === "stale-plate"
        ? "القص اتغيّر: المعاينة لسه بالقص القديم (باقي التعديلات ظاهرة عادي). اضغط «حضّر» عشان الفيديو يتقص بالجديد."
        : "الفيديو ده لسه مش متحضّر (مفيش plate). اضغط «حضّر» عشان تظهر المعاينة."}
    </span>
    <button type="button" className="primary" disabled={busy} onClick={onPrepare}>{busy ? "شغّال…" : "حضّر (Prepare)"}</button>
  </div>
);

const LIVE_LABELS = {cuts: "القص", captions: "الكابشن", scenes: "المشاهد", motion: "الحركة", sound: "الصوت", style: "الستايل", preview: "المعاينة الجديدة"};
export const LiveFollowBanner: React.FC<{
  status: LiveProjectStatus; online: boolean; busy: boolean; onToggle: () => void; onAccept: () => void;
}> = ({status, online, busy, onToggle, onAccept}) => (
  <div className={`rv-banner rv-live ${status.pending ? "warn" : "info"}`} role="status" aria-live="polite">
    <span className={`rv-live-dot ${online && status.enabled ? "on" : ""}`} aria-hidden="true" />
    <span>
      <strong>{!online ? "مستني الاتصال يرجع" : status.enabled ? "متابعة المونتاج مباشرة" : "المتابعة متوقفة مؤقتًا"}</strong>
      <span className="rv-live-detail">{status.pending
        ? " فيه تحديث جديد. تعديلاتك لسه عندك ومش هنغيّرها تلقائيًا."
        : status.updatedAt !== null
          ? ` آخر تحديث ${timeOfDay(status.updatedAt)}: ${status.changes.map(kind => LIVE_LABELS[kind]).join("، ")}.`
          : " كل تعديل جديد بيظهر في المعاينة والتايم لاين."}</span>
    </span>
    {status.pending ? <button type="button" disabled={busy || !online} onClick={onAccept}>اعرض التحديث الجديد</button> : null}
    <button type="button" aria-pressed={status.enabled} onClick={onToggle}>{status.enabled ? "وقف المتابعة" : "كمّل المتابعة"}</button>
  </div>
);

export const DraftPrompt: React.FC<{ draft: Draft; stale?: boolean; onRestore: () => void; onDiscard: () => void }> = ({ draft, stale, onRestore, onDiscard }) => (
  <div className="rv-banner info" role="alertdialog" aria-label="مسودة">
    <Info size={16} />
    <span>{stale ? "المونتاج اتحدّث، وعندك مسودة من النسخة السابقة. راجع الجديد قبل ما ترجعها." : "فيه تعديلات مش متسجلة، تسترجعها؟"} <span className="rv-dim">(اتحفظت {timeOfDay(draft.savedAt)} · {relativeAge(draft.savedAt, Date.now())})</span></span>
    <button type="button" className="primary" onClick={onRestore}>استرجع</button>
    <button type="button" onClick={onDiscard}>تجاهل</button>
  </div>
);
