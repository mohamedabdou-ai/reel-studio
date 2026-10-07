import React from "react";
import { Bell, LoaderCircle, Redo2, Save, Scan, Send, Undo2 } from "lucide-react";
import { HistoryMenu } from "./ToolbarHistory";
import { useEditor, useEditorStore } from "./store.ts";
import { GUIDES_LABEL, type GuidesMode } from "./shell/guides.ts";
import { timeOfDay } from "./shell/format.ts";
import { isActive, isFinished, type JobState } from "./shell/job-state.ts";
import { saveAvailability, exportAvailability } from "./shell/save-rules.ts";
import type { HistoryEntry, ProjectResponse, ValidationResult } from "./types.ts";

type Props = {
  project: ProjectResponse;
  validation: ValidationResult;

  pending: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  guides: GuidesMode;
  onGuides: () => void;
  onSave: () => void;
  onOpenIssues: () => void;
  onOpenExport: () => void;
  onRestore: (entry: HistoryEntry) => Promise<void>;
  job: JobState;
  needsPrepare: boolean;
};

export const Toolbar: React.FC<Props> = ({ project, validation, pending, saving, lastSavedAt, guides, onGuides, onSave, onOpenIssues, onOpenExport, onRestore, job, needsPrepare }) => {
  const store = useEditorStore();
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const undoLabel = useEditor((s) => s.undoLabel);
  const redoLabel = useEditor((s) => s.redoLabel);


  const edit = validation.issues.filter((i) => i.stage !== "delivery");
  const errors = edit.filter((i) => i.severity === "error").length;
  const warnings = edit.length - errors;
  const delivery = validation.issues.length - edit.length;
  const badge = errors ? { n: errors, cls: "bad" } : warnings ? { n: warnings, cls: "warn" } : delivery ? { n: delivery, cls: "dim" } : null;
  const badgeTitle = errors ? `${errors} خطأ بيمنع الحفظ والتصدير` : warnings ? `${warnings} تنبيه` : delivery ? `${delivery} حاجة ناقصة للتصدير النهائي بس` : "مفيش ملاحظات";

  const save = saveAvailability(validation);
  const canSave = dirty && save.enabled && !pending && !saving;
  const jobBusy = isActive(job);

  const jobVerb = job.kind === "prepare" ? "بيحضّر" : job.kind ? "بيصدّر" : "شغّال";
  const previewAvail = exportAvailability(validation, "preview", project.exportModes.find((m) => m.id === "preview"), needsPrepare);

  const exportEnabled = jobBusy || isFinished(job) || validation.ok;

  return (
    <header className="rv-toolbar">
      <div className="rv-toolbar-title">
        <strong>{project.slug}</strong>
        <span className="rv-dim rv-path" dir="ltr">{project.manifestPath}</span>
        {dirty ? <span className="chip warn">فيه تعديلات مش متسيّفة</span> : <span className="chip ok">{lastSavedAt ? `متسيّف ${timeOfDay(lastSavedAt)}` : "متسيّف"}</span>}
      </div>
      <div className="rv-toolbar-actions">
        <button type="button" className="rv-btn" disabled={!canUndo} onClick={() => store.undo()} title={undoLabel ? `تراجع: ${undoLabel} (Ctrl+Z)` : "تراجع (Ctrl+Z)"}><Undo2 size={16} /><span>تراجع</span></button>
        <button type="button" className="rv-btn" disabled={!canRedo} onClick={() => store.redo()} title={redoLabel ? `إعادة: ${redoLabel} (Ctrl+Shift+Z)` : "إعادة (Ctrl+Shift+Z)"}><Redo2 size={16} /><span>إعادة</span></button>
        <HistoryMenu onRestore={onRestore} />
        <button type="button" className={`rv-btn${guides !== "off" ? " on" : ""}`} onClick={onGuides} title={`مناطق الأمان (safe zones) على المعاينة: ${GUIDES_LABEL[guides]}`}><Scan size={16} /><span>{guides === "off" ? "Guides" : GUIDES_LABEL[guides]}</span></button>
        <button type="button" className="rv-btn rv-issues" onClick={onOpenIssues} title={badgeTitle}>
          <Bell size={16} /><span>ملاحظات</span>
          {badge ? <b className={`rv-badge ${badge.cls}`}>{badge.n}</b> : null}
        </button>
        <button type="button" className="rv-btn primary" disabled={!canSave} onClick={onSave}
          title={!dirty ? "مفيش تعديلات تتسجّل" : !save.enabled ? save.reason : pending ? "بنراجع التعديل الأخير…" : "حفظ (Ctrl+S)"}>
          {saving ? <LoaderCircle size={16} className="rv-spin" /> : <Save size={16} />}<span>{saving ? "بيتسجّل…" : "حفظ"}</span>
        </button>
        <button type="button" className={`rv-btn export${jobBusy ? " busy" : ""}`} disabled={!exportEnabled} onClick={onOpenExport}
          title={jobBusy ? "الشغل شغّال: اضغط تشوف التقدّم" : exportEnabled ? (previewAvail.enabled ? "تصدير: معاينة سريعة أو نهائي" : previewAvail.reason) : "صلّح الأخطاء الأول"}>
          {jobBusy ? <LoaderCircle size={16} className="rv-spin" /> : <Send size={16} />}
          <span>{jobBusy ? (job.pct !== null ? `${jobVerb} ${Math.round(job.pct)}%` : `${jobVerb}…`) : job.status === "done" && job.kind !== "prepare" ? "تصدير ✓" : "تصدير"}</span>
        </button>
      </div>
    </header>
  );
};
