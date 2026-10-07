import React from "react";
import { X } from "lucide-react";
import { issueTarget } from "./shell/selection.ts";
import type { EditManifest } from "../prepared-edit/schema.ts";
import type { Issue, ValidationResult } from "./types.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  validation: ValidationResult;
  manifest: EditManifest;

  onNavigate: (target: NonNullable<ReturnType<typeof issueTarget>>) => void;
};

const Row: React.FC<{ issue: Issue; manifest: EditManifest; onNavigate: Props["onNavigate"] }> = ({ issue, manifest, onNavigate }) => {
  const target = issueTarget(issue.path, manifest);
  const body = (
    <>
      <span className="rv-issue-where">{issue.where}</span>
      <span className="rv-issue-msg">{issue.message}</span>
      {issue.detail ? <span className="rv-issue-detail" dir="ltr">{issue.detail}</span> : null}
    </>
  );
  return (
    <li className={`rv-issue ${issue.severity}`}>
      {target ? <button type="button" title="روح للعنصر ده" onClick={() => onNavigate(target)}>{body}</button> : <div className="rv-issue-static">{body}</div>}
    </li>
  );
};

const Group: React.FC<{ title: string; hint?: string; issues: Issue[]; manifest: EditManifest; onNavigate: Props["onNavigate"] }> = ({ title, hint, issues, manifest, onNavigate }) => (
  <section>
    <h3>{title} <span className="rv-dim">({issues.length})</span></h3>
    {hint ? <p className="rv-dim rv-hint">{hint}</p> : null}
    <ul>{issues.slice(0, 200).map((i, n) => <Row key={`${i.code}-${i.path}-${n}`} issue={i} manifest={manifest} onNavigate={onNavigate} />)}</ul>
    {issues.length > 200 ? <p className="rv-dim">وفيه {issues.length - 200} كمان مخفية.</p> : null}
  </section>
);

export const IssuesDrawer: React.FC<Props> = ({ open, onClose, validation, manifest, onNavigate }) => {
  if (!open) return null;
  const errors = validation.issues.filter((i) => i.severity === "error" && i.stage !== "delivery");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const delivery = validation.issues.filter((i) => i.stage === "delivery");
  return (
    <aside className="rv-drawer" role="complementary" aria-label="ملاحظات الـ manifest" dir="rtl">
      <header>
        <strong>ملاحظات</strong>
        <button type="button" className="rv-icon" onClick={onClose} title="إغلاق (Esc)"><X size={16} /></button>
      </header>
      <div className="rv-drawer-body">
        {validation.issues.length === 0 ? <p className="rv-empty">مفيش ملاحظات. الـ manifest سليم وجاهز للتصدير النهائي.</p> : null}
        {errors.length ? <Group title="أخطاء" hint="بتمنع الحفظ والتصدير. المعاينة بتفضل تعرض آخر نسخة سليمة." issues={errors} manifest={manifest} onNavigate={onNavigate} /> : null}
        {warnings.length ? <Group title="تنبيهات" hint="مش بتمنع حاجة، بس راجعها." issues={warnings} manifest={manifest} onNavigate={onNavigate} /> : null}
        {delivery.length ? <Group title="ناقص للتصدير النهائي" hint="الحفظ والمعاينة السريعة مش متأثرين. دي شروط التصدير النهائي لإنستجرام بس." issues={delivery} manifest={manifest} onNavigate={onNavigate} /> : null}
      </div>
    </aside>
  );
};
