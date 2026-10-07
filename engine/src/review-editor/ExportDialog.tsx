import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, HardDrive, LoaderCircle, X } from "lucide-react";
import type { ApiClient } from "./api-client.ts";
import { describeError } from "./api-client.ts";
import { formatBytes, formatClock } from "./shell/format.ts";
import { summarizeGates, type GateStatus } from "./shell/gates.ts";
import { useNow } from "./shell/hooks.ts";
import { isActive, isFinished, type JobKind, type JobState } from "./shell/job-state.ts";
import { deliveryIssues, exportAvailability } from "./shell/save-rules.ts";
import type { DiskResponse, ProjectResponse, ValidationResult } from "./types.ts";

type Props = {
  open: boolean;
  onClose: () => void;

  intent: "export" | "prepare";
  project: ProjectResponse;
  validation: ValidationResult;
  pending: boolean;
  dirty: boolean;
  needsPrepare: boolean;
  job: JobState;
  onStart: (kind: JobKind) => void;
  onCancel: () => void;
  onReset: () => void;
  onReconnect: () => void;
  onPrepareInstead: () => void;
  client: ApiClient;

  editSeconds: number;
  notify: (kind: "ok" | "info" | "warn" | "error", text: string) => void;
};

type Disk = { status: "idle" | "loading" | "ready" | "error"; data: DiskResponse | null; error: string | null };

const TITLE: Record<JobKind, string> = { prepare: "تحضير الفيديو (Prepare)", preview: "معاينة سريعة", deliver: "تصدير نهائي" };

const TITLE_UNKNOWN = "شغل شغّال على السيرفر";
const STATUS_TEXT: Record<GateStatus, { label: string; note: string }> = {
  PASS: { label: "PASS", note: "كل البوابات عدّت." },
  "NEEDS-REVIEW": { label: "NEEDS-REVIEW", note: "الملف اتعمل بس لازم يتراجع بإيدك قبل ما تنشره." },
  FAIL: { label: "FAIL", note: "التصدير وقف عند بوابة. الملف مينفعش يتنشر." },
  SKIPPED: { label: "بدون بوابات", note: "المعاينة السريعة مبتعدّيش على بوابات التسليم." },
};

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {                                              }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

const Notice: React.FC<{ kind: "warn" | "bad" | "info"; children: React.ReactNode }> = ({ kind, children }) => <div className={`rv-notice ${kind}`}>{children}</div>;

const Log: React.FC<{ job: JobState }> = ({ job }) => {
  const ref = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  useEffect(() => { const el = ref.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [job.log]);
  return (
    <pre ref={ref} className="rv-log" dir="ltr" onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
      {job.logDropped ? `… (${job.logDropped} سطر أقدم اتشال)\n` : ""}{job.log.length ? job.log.join("\n") : "مستني أول سطر من السيرفر…"}
    </pre>
  );
};

export const ExportDialog: React.FC<Props> = ({ open, onClose, intent, project, validation, pending, dirty, needsPrepare, job, onStart, onCancel, onReset, onReconnect, onPrepareInstead, client, editSeconds, notify }) => {
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [mode, setMode] = useState<JobKind>("preview");
  const [disk, setDisk] = useState<Disk>({ status: "idle", data: null, error: null });
  const [showLog, setShowLog] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const active = isActive(job);
  const finished = isFinished(job);
  const now = useNow(open && active);


  useEffect(() => { if (open) dialogRef.current?.focus(); }, [open]);


  useEffect(() => {
    if (!open || active || finished) return;
    setStep(intent === "prepare" ? "confirm" : "choose");
    setMode(intent === "prepare" ? "prepare" : "preview");
    setShowLog(false);
  }, [open, intent, active, finished]);


  useEffect(() => {
    if (!open || step !== "confirm" || mode !== "deliver") return;
    let dead = false;
    setDisk({ status: "loading", data: null, error: null });
    client.disk("deliver").then(
      (data) => { if (!dead) setDisk({ status: "ready", data, error: null }); },
      (error) => { if (!dead) setDisk({ status: "error", data: null, error: describeError(error) }); },
    );
    return () => { dead = true; };
  }, [open, step, mode, client]);

  const previewAvail = useMemo(() => exportAvailability(validation, "preview", project.exportModes.find((m) => m.id === "preview"), needsPrepare), [validation, project.exportModes, needsPrepare]);
  const deliverAvail = useMemo(() => exportAvailability(validation, "deliver", project.exportModes.find((m) => m.id === "deliver"), needsPrepare), [validation, project.exportModes, needsPrepare]);
  const summary = useMemo(() => (job.result && job.kind ? summarizeGates(job.result, job.kind) : null), [job.result, job.kind]);

  if (!open) return null;
  const busy = pending;
  const closeable = !active;


  const diskBlocked = mode === "deliver" && disk.status === "ready" && disk.data !== null && !disk.data.ok;

  const choose = (kind: "preview" | "deliver") => {
    setMode(kind);
    if (kind === "deliver" || dirty) setStep("confirm");
    else onStart(kind);
  };

  const body = (() => {

    if (active || finished) {
      const kind = job.kind ?? "preview";
      const title = job.kind ? TITLE[job.kind] : TITLE_UNKNOWN;
      const elapsed = ((job.endedAt ?? now) - (job.startedAt ?? now)) / 1000;
      if (active) {
        return (
          <>
            <h2>{title}</h2>
            <div className="rv-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.pct === null ? undefined : Math.round(job.pct)}>
              <div className={`rv-progress-bar${job.pct === null ? " indeterminate" : ""}`} style={job.pct === null ? undefined : { width: `${job.pct}%` }} />
            </div>
            <div className="rv-progress-meta" dir="ltr">
              <b>{job.status === "starting" ? "saving…" : job.pct === null ? "…" : `${Math.round(job.pct)}%`}</b>
              <span>{job.stage || (job.status === "starting" ? "بنسيّف ونبدأ" : "")}</span>
              <span className="rv-dim">{formatClock(elapsed)}</span>
            </div>
            {job.lostConnection ? <Notice kind="warn">الاتصال بالـ log اتقطع. الشغل ممكن لسه شغّال على السيرفر. <button type="button" onClick={onReconnect}>اتصل تاني</button></Notice> : null}
            <Log job={job} />
            <footer>
              <button type="button" disabled={job.status !== "running"} onClick={onCancel}>{job.status === "cancelling" ? "بيلغي…" : "إلغاء"}</button>
              <button type="button" onClick={onClose} title="الشغل بيكمّل. هتشوف التقدّم على زرار التصدير.">تصغير</button>
            </footer>
          </>
        );
      }
      if (job.status === "cancelled") {
        return (
          <>
            <h2>{title}</h2>
            <Notice kind="warn">اتلغى. مفيش ملف اتسلّم.</Notice>
            <button type="button" className="rv-linkish" onClick={() => setShowLog((v) => !v)}>{showLog ? "إخفاء اللوج" : "عرض اللوج"}</button>
            {showLog ? <Log job={job} /> : null}
            <footer><button type="button" onClick={onReset}>رجوع</button><button type="button" onClick={onClose}>إغلاق</button></footer>
          </>
        );
      }
      if (job.status === "failed" && !job.result) {
        return (
          <>
            <h2>{title}</h2>
            <div className="rv-status FAIL"><b>FAIL</b><span>{job.error}</span></div>
            <Log job={job} />
            <footer><button type="button" onClick={onReset}>حاول تاني</button><button type="button" onClick={onClose}>إغلاق</button></footer>
          </>
        );
      }

      const result = job.result!;
      if (kind === "prepare") {
        return (
          <>
            <h2>{title}</h2>
            {result.ok ? <div className="rv-status PASS"><b>تم</b><span>الفيديو اتقص بالقص الجديد والمعاينة اتحدّثت{result.plateCached ? " (الـ plate كان جاهز ومتعملش تاني)" : ""}.</span></div>
              : <div className="rv-status FAIL"><b>FAIL</b><span>{job.error}</span></div>}
            {result.plate ? <div className="rv-out" dir="ltr">{result.plate}</div> : null}
            <footer><button type="button" className="primary" onClick={() => { onReset(); onClose(); }}>تمام</button></footer>
          </>
        );
      }
      const g = summary!;
      const output = result.output;
      const seconds = result.durationSec ?? editSeconds;
      return (
        <>
          <h2>{title}</h2>
          <div className={`rv-status ${g.overall}`}><b>{STATUS_TEXT[g.overall].label}</b><span>{STATUS_TEXT[g.overall].note}</span></div>
          {output ? (
            <div className="rv-out-row">
              <div className="rv-out" dir="ltr" title={output}>{output}</div>
              <button type="button" className="rv-btn" onClick={async () => { const ok = await copyText(output); setCopied(ok); notify(ok ? "ok" : "warn", ok ? "اتنسخ مسار الملف." : "معرفتش أنسخ. حدّد المسار وانسخه بإيدك."); if (ok) setTimeout(() => setCopied(false), 2000); }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? "اتنسخ" : "نسخ المسار"}</span>
              </button>
            </div>
          ) : null}
          <dl className="rv-facts">
            <dt>الحجم</dt><dd dir="ltr">{formatBytes(result.sizeBytes)}</dd>
            <dt>المدة</dt><dd dir="ltr">{formatClock(seconds)}{result.durationSec == null ? " (من الـ manifest)" : ""}</dd>
            <dt>استغرق</dt><dd dir="ltr">{formatClock(result.seconds ?? elapsed)}</dd>
            {result.qc ? <><dt>تقرير QC</dt><dd dir="ltr" className="rv-path-cell" title={result.qc}>{result.qc}</dd></> : null}
            {result.safeReport ? <><dt>تقرير safe zone</dt><dd dir="ltr" className="rv-path-cell" title={result.safeReport}>{result.safeReport}</dd></> : null}
          </dl>
          {g.rows.every((r) => r.status === "SKIPPED") ? null : <ul className="rv-gates">
            {g.rows.map((r) => (
              <li key={r.id} className={r.status}>
                <span className="rv-gate-status">{r.status === "SKIPPED" ? "—" : r.status}</span>
                <span className="rv-gate-label">{r.label}</span>
                {r.detail && r.status !== "PASS" ? <pre className="rv-verbatim" dir="ltr">{r.detail}</pre> : null}
              </li>
            ))}
          </ul>}
          {g.warnings.length ? <details className="rv-warnings"><summary>تحذيرات من الـ pipeline ({g.warnings.length})</summary><pre className="rv-verbatim" dir="ltr">{g.warnings.join("\n")}</pre></details> : null}
          {job.error && !result.ok ? <div className="rv-status FAIL"><b>FAIL</b><span>{job.error}</span></div> : null}
          <button type="button" className="rv-linkish" onClick={() => setShowLog((v) => !v)}>{showLog ? "إخفاء اللوج" : "عرض اللوج"}</button>
          {showLog ? <Log job={job} /> : null}
          <footer>
            <button type="button" onClick={onReset}>تصدير تاني</button>
            <button type="button" className="primary" onClick={() => { onReset(); onClose(); }}>تمام</button>
          </footer>
        </>
      );
    }


    if (step === "confirm") {
      const isDeliver = mode === "deliver";
      const isPrepare = mode === "prepare";
      return (
        <>
          <h2>{isPrepare ? "تحضير الفيديو" : isDeliver ? "تأكيد التصدير النهائي" : "معاينة سريعة"}</h2>
          {isDeliver ? <Notice kind="warn">التصدير النهائي ممكن ياخد من <b>١٠ لـ ٣٠ دقيقة</b> والجهاز هيبقى تقيل. متقفلش الصفحة ولا الـ terminal لحد ما يخلص.</Notice> : null}
          {isPrepare ? <p>هنقص الفيديو بالقص الجديد ونبني الـ plate. ده اللي بيخلّي المعاينة تتحدّث بعد ما تغيّر القص. بياخد من ثواني لدقايق حسب الطول.</p> : null}
          {dirty ? <Notice kind="info">فيه تعديلات مش متسيّفة. {isPrepare ? "التحضير" : "التصدير"} بيشتغل على النسخة المتسيّفة، فهنسيّفها الأول.</Notice> : null}
          {isDeliver ? (
            <div className={`rv-disk ${disk.status === "ready" && disk.data ? (disk.data.ok ? "ok" : "bad") : ""}`}>
              <HardDrive size={18} />
              {disk.status === "loading" ? <span><LoaderCircle size={14} className="rv-spin" /> بنشوف القرص والرام…</span> : null}
              {disk.status === "error" ? <span>معرفتش أقرا حالة القرص ({disk.error}). تقدر تكمّل، بس اتأكد بنفسك إن D: فيه مساحة.</span> : null}
              {disk.status === "ready" && disk.data ? (
                <div>
                  <p>{disk.data.message}</p>
                  <dl className="rv-facts" dir="ltr">
                    <dt>D: free</dt><dd>{formatBytes(disk.data.freeDiskBytes)}</dd>
                    <dt>RAM free</dt><dd>{formatBytes(disk.data.freeRamBytes)}</dd>
                    {disk.data.neededDiskBytes !== undefined ? <><dt>needed on D:</dt><dd>{formatBytes(disk.data.neededDiskBytes)}</dd></> : null}
                  </dl>
                  {!disk.data.ok ? <p className="rv-check">التصدير مش هيبدأ على مساحة ناقصة (ممكن يملّي D: ويوقّف شغل تاني). نضّف المساحة وافتح التصدير تاني.</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <footer>
            <button type="button" className="primary" disabled={busy || diskBlocked || (isDeliver && !deliverAvail.enabled) || (!isDeliver && !isPrepare && !previewAvail.enabled)}
              onClick={() => onStart(mode)}>
              {isPrepare ? (dirty ? "سيّف وحضّر" : "حضّر") : isDeliver ? (dirty ? "سيّف وابدأ التصدير النهائي" : "ابدأ التصدير النهائي") : dirty ? "سيّف وابدأ المعاينة" : "ابدأ المعاينة"}
            </button>
            {intent === "export" ? <button type="button" onClick={() => setStep("choose")}>رجوع</button> : <button type="button" onClick={onClose}>إلغاء</button>}
          </footer>
        </>
      );
    }


    const missing = deliveryIssues(validation);
    return (
      <>
        <h2>تصدير</h2>
        {dirty ? <Notice kind="info">فيه تعديلات مش متسيّفة. التصدير بيشتغل على النسخة المتسيّفة، فهنسيّفها الأول (هتتأكد قبل ما نبدأ).</Notice> : null}
        {needsPrepare ? <Notice kind="warn">القص اتغيّر أو الفيديو لسه مش متحضّر. لازم <button type="button" onClick={onPrepareInstead}>تحضّر الأول</button></Notice> : null}
        <div className="rv-choices">
          <button type="button" className="rv-big" disabled={busy || !previewAvail.enabled} onClick={() => choose("preview")}>
            <strong>معاينة سريعة</strong>
            <span>بتطلّع فيديو تشوفه بس، من غير بوابات التسليم. أسرع بكتير.</span>
            {!previewAvail.enabled ? <em>{previewAvail.reason}</em> : null}
          </button>
          <button type="button" className="rv-big final" disabled={busy || !deliverAvail.enabled} onClick={() => choose("deliver")}>
            <strong>تصدير نهائي</strong>
            <span>بجودة التسليم الكاملة وبيعدّي كل البوابات: safe zone، مواصفات إنستجرام، حركة المقدّم، والراس. ممكن ياخد ١٠–٣٠ دقيقة.</span>
            {!deliverAvail.enabled ? <em>{deliverAvail.reason}</em> : null}
          </button>
        </div>
        {!validation.deliveryReady && validation.ok && missing.length ? (
          <details className="rv-warnings">
            <summary>ناقص للتصدير النهائي ({missing.length})</summary>
            <ul>{missing.slice(0, 8).map((i) => <li key={`${i.code}-${i.path}`}>{i.where}: {i.message}</li>)}</ul>
          </details>
        ) : null}
        <footer><button type="button" onClick={onClose}>إغلاق</button></footer>
      </>
    );
  })();

  return (
    <div className="rv-modal" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget && closeable) onClose(); }}>
      <div className="rv-dialog" role="dialog" aria-modal="true" aria-label="تصدير" dir="rtl" ref={dialogRef} tabIndex={-1}>
        {closeable ? <button type="button" className="rv-dialog-x rv-icon" onClick={onClose} title="إغلاق (Esc)"><X size={16} /></button> : null}
        {body}
      </div>
    </div>
  );
};
