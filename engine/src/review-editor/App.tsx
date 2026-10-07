import React, { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Boundary } from "./Boundary";
import { ExportDialog } from "./ExportDialog";
import { IssuesDrawer } from "./IssuesDrawer";
import { PreviewPlayer } from "./PreviewPlayer";
import { Timeline } from "./Timeline";
import { Toolbar } from "./Toolbar";
import { remember } from "./api.ts";
import { describeError, getClient } from "./api-client.ts";
import { runPanelDelete, usePanels, type PanelProps } from "./panels.ts";
import { EditorStoreProvider, useEditor, useEditorStore, type EditorStore } from "./store.ts";
import { plateIsStale, totalFrames } from "./time.ts";
import { parseManifest } from "./validate.ts";
import { deleteSelection } from "./shell/delete-fallback.ts";
import { createDraftWriter, draftKey, fingerprint, loadDraft, saveDraft, DRAFT_VERSION, type Draft } from "./shell/draft.ts";
import { flushActiveField, runSaveCommand } from "./shell/flush.ts";
import { timeOfDay } from "./shell/format.ts";
import { guardEdit, validateCached } from "./shell/guard.ts";
import { GUIDES_ORDER, isGuidesMode, nextGuides, type GuidesMode } from "./shell/guides.ts";
import { useConnection, useHeartbeat, useThrottledPlayhead, useToasts } from "./shell/hooks.ts";
import { activeJobOf, attachToJob, launchJob, reattachFromError, type JobFlow } from "./shell/job-flow.ts";
import { initialJob, isActive, isFinished, jobReducer, type JobKind } from "./shell/job-state.ts";
import { isEditableElement, resolveKey, type Command } from "./shell/keymap.ts";
import { ConnectionBanner, DraftPrompt, LiveFollowBanner, PrepareBanner, Toasts } from "./shell/Notices";
import { playerBus } from "./shell/player-bus.ts";
import { saveAvailability } from "./shell/save-rules.ts";
import { createProjectFollower, type LiveProjectStatus } from "./shell/live-project.ts";
import type { issueTarget } from "./shell/selection.ts";
import { adjacentSceneIndex } from "./shell/timeline-math.ts";
import type { HistoryEntry, Issue, ProjectResponse } from "./types.ts";



const PanelHost: React.FC<{ project: ProjectResponse; issues: Issue[] }> = ({ project, issues }) => {
  const store = useEditorStore();
  const manifest = useEditor((s) => s.manifest);
  const selection = useEditor((s) => s.selection);
  const playhead = useThrottledPlayhead(store);
  const panels = usePanels();
  const [active, setActive] = useState(() => remember.get("panel") ?? "");
  const current = panels.find((p) => p.id === active) ?? panels[0];
  const props: PanelProps = useMemo(
    () => ({ manifest, apply: store.apply, playhead, seek: store.seek, selection, select: store.select, issues, project }),
    [manifest, store, playhead, selection, issues, project],
  );
  return (
    <>
      <nav className="rv-tabs" role="tablist">
        {panels.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === current?.id} className={p.id === current?.id ? "on" : ""}
            onClick={() => { setActive(p.id); remember.set("panel", p.id); }}>{p.title}</button>
        ))}
      </nav>
      <div className="rv-panel-body" role="tabpanel">
        {current ? <Boundary label={`البانل «${current.title}» وقع`} resetKey={manifest}><current.Component {...props} /></Boundary>
          : <div className="rv-dim rv-pad">مفيش بانلز متسجّلة لسه.</div>}
      </div>
    </>
  );
};



const storageOrNull = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

const Shell: React.FC<{ initialProject: ProjectResponse }> = ({ initialProject }) => {
  const store = useEditorStore();
  const client = useMemo(() => getClient(), []);
  const [project, setProject] = useState(initialProject);
  const manifest = useEditor((s) => s.manifest);
  const dirty = useEditor((s) => s.dirty);



  const deferred = useDeferredValue(manifest);
  const validation = useMemo(() => validateCached(deferred), [deferred]);
  const pending = deferred !== manifest;

  const { toasts, push, dismiss } = useToasts();
  const conn = useConnection(client);
  useHeartbeat(client, conn.online, conn.reason !== "unauthorized");
  const [retrying, setRetrying] = useState(false);
  const [guides, setGuides] = useState<GuidesMode>(() => { const g = remember.get("guides"); return isGuidesMode(g) ? g : GUIDES_ORDER[0]; });
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [intent, setIntent] = useState<"export" | "prepare">("export");
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [job, dispatch] = useReducer(jobReducer, initialJob);
  const jobRef = useRef(job);
  jobRef.current = job;

  const needsPrepare = project.needsPrepare || !project.plate || plateIsStale(manifest, project.plate);
  const prepareReason: "never-prepared" | "stale-plate" = project.plate ? "stale-plate" : project.needsPrepareReason ?? "never-prepared";


  const storage = useMemo(storageOrNull, []);
  const key = draftKey(initialProject.manifestPath);
  const baseFp = useRef<string>("");
  if (!baseFp.current) baseFp.current = fingerprint(initialProject.manifest);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(() => {
    const draft = loadDraft(storage, key, baseFp.current, {allowStale: true});
    return draft && parseManifest(draft.manifest) ? draft : null;
  });
  const pendingRef = useRef(pendingDraft);
  pendingRef.current = pendingDraft;
  const writer = useMemo(() => {
    const w = createDraftWriter({ storage, key, getBase: () => baseFp.current });
    w.pause(pendingRef.current !== null);
    return w;
  }, [storage, key]);
  const liveGuard = useRef({saving: false, busy: false});
  liveGuard.current = {saving, busy: isActive(job)};
  const saveEpoch = useRef(0);
  const [live, setLive] = useState<LiveProjectStatus>({enabled: true, pending: false, changes: [], updatedAt: null});
  const follower = useMemo(() => createProjectFollower({
    initial: initialProject, store,
    blocked: () => liveGuard.current.saving || liveGuard.current.busy || pendingRef.current !== null
      || isEditableElement(document.activeElement as HTMLElement | null),
    onStatus: setLive,
    onProject: next => {
      baseFp.current = fingerprint(next.manifest);
      globalThis.__REVIEW_STATIC_FILES__ = next.staticFiles.map(name => ({name, lastModified: 0, sizeInBytes: 0}));
      setProject(next);
    },
  }), [initialProject, store]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped || client.connection.get().reason === "unauthorized") return;
      const epoch = saveEpoch.current;
      try {
        const next = await client.project();

        if (!stopped && epoch === saveEpoch.current) follower.receive(next);
      } catch {                                                                                   }
      if (!stopped) timer = setTimeout(poll, client.connection.get().online ? 1000 : 3000);
    };
    timer = setTimeout(poll, 1000);
    return () => {stopped = true; clearTimeout(timer);};
  }, [client, follower]);

  const acceptLiveUpdate = () => {
    flushActiveField(document);
    const next = follower.getLatest();
    if (!next || saving || isActive(job)) return;
    const local = store.getSnapshot().dirty ? store.getSnapshot().manifest : pendingRef.current?.manifest;
    if (local) {
      if (!window.confirm("هنعرض تحديث المساعد، وهنحتفظ بتعديلاتك في مسودة تقدر ترجعها. نكمل؟")) return;
      const copy: Draft = {v: DRAFT_VERSION, base: fingerprint(next.manifest), savedAt: Date.now(), manifest: local};
      if (!saveDraft(storage, key, copy)) {push("warn", "مقدرتش أحفظ نسخة من تعديلاتك، فسيبتها قدامك زي ما هي."); return;}
      pendingRef.current = copy;
      writer.pause(true);
      setPendingDraft(copy);
    }
    follower.acceptLatest();
  };
  useEffect(() => {
    let last = store.getSnapshot().manifest;
    return store.subscribe(() => {
      const s = store.getSnapshot();
      if (s.manifest === last) return;
      last = s.manifest;
      if (pendingRef.current) return;
      if (s.dirty) writer.schedule(s.manifest); else writer.clear();
    });
  }, [store, writer]);
  useEffect(() => {
    const flush = () => writer.flush();


    const commitTyping = () => { flushActiveField(document); flush(); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    const onBefore = (e: BeforeUnloadEvent) => { flushActiveField(document); if (store.getSnapshot().dirty) { flush(); e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("pagehide", commitTyping);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBefore);
    return () => { window.removeEventListener("pagehide", commitTyping); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("beforeunload", onBefore); };
  }, [store, writer]);
  const answerDraft = (restore: boolean) => {
    const d = pendingRef.current;
    if (!d) return;
    pendingRef.current = null;
    setPendingDraft(null);
    writer.pause(false);
    if (restore) {
      store.apply(d.manifest, "استرجاع مسودة", { coalesce: false });
      store.select(null);
      push("ok", "المسودة اترجعت. اضغط حفظ لما تتأكد، أو Ctrl+Z ترجّع اللي كان.");
    } else {
      writer.clear();
      if (store.getSnapshot().dirty) writer.schedule(store.getSnapshot().manifest);
    }
  };

  useEffect(() => { document.title = `${dirty ? "● " : ""}${project.slug} · Review Editor`; }, [dirty, project.slug]);
  useEffect(() => { remember.set("guides", guides); }, [guides]);


  const watcher = useRef<{ close: () => void } | null>(null);
  useEffect(() => () => watcher.current?.close(), []);
  const follow = useCallback((jobId: string) => {
    watcher.current?.close();
    watcher.current = client.watchJob(jobId, {
      onEvent: (event) => dispatch({ type: "event", event }),
      onLost: () => dispatch({ type: "stream-lost" }),
      onOpen: () => dispatch({ type: "stream-restored" }),
    });
  }, [client]);
  const flow = useMemo<JobFlow>(() => ({ dispatch, follow }), [follow]);


  useEffect(() => {
    const target = activeJobOf(initialProject);
    if (!target) return;
    attachToJob(flow, target);
    push("info", "فيه شغل شغّال على السيرفر من قبل ما تفتح الصفحة. وصلتك بيه: اضغط «تصدير» تشوف التقدّم أو تلغيه.");
  }, [initialProject, flow, push]);
  const announceAttached = useCallback(() => {
    push("info", "فيه شغل تاني شغّال على السيرفر بالفعل (ممكن من صفحة اتقفلت). وصلتك بيه: تقدر تلغيه أو تستنى يخلص.");
    setExportOpen(true);
  }, [push]);


  const saveChain = useRef<Promise<boolean>>(Promise.resolve(true));
  const lastSaveError = useRef<unknown>(null);
  const save = useCallback((label?: string): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      lastSaveError.current = null;
      const snap = store.getSnapshot();
      if (!snap.dirty) return true;
      const verdict = validateCached(snap.manifest);
      if (!verdict.ok) {
        push("error", saveAvailability(verdict).reason ?? "فيه أخطاء لازم تتصلّح قبل الحفظ.");
        setIssuesOpen(true);
        return false;
      }
      setSaving(true);
      saveEpoch.current++;
      try {
        const res = await client.save(snap.manifest, label, follower.getProject().manifestRevision);
        saveEpoch.current++;
        store.markSaved(snap.manifest);
        follower.saved(snap.manifest, res.manifestRevision);
        const at = Date.parse(res.savedAt);
        const when = Number.isFinite(at) ? at : Date.now();
        setLastSavedAt(when);
        if (store.getSnapshot().dirty) writer.schedule(store.getSnapshot().manifest); else writer.clear();
        const left = verdict.issues.filter((i) => i.stage === "delivery").length;
        push("ok", `اتسجّل ${timeOfDay(when)}${left ? ` · لسه ناقص ${left} للتصدير النهائي` : ""}`);
        return true;
      } catch (error) {
        lastSaveError.current = error;


        if (!isActive(jobRef.current) && reattachFromError(flow, error)) {
          push("warn", "الحفظ مستني: فيه شغل شغّال على السيرفر والملف لازم يفضل زي ما هو. وصلتك بيه من زرار «تصدير»: استنى يخلص أو ألغيه وبعدين احفظ. تعديلاتك لسه عندك ومحفوظة كمسودة في المتصفح.");
          return false;
        }
        push("error", `الحفظ فشل: ${describeError(error)} تعديلاتك لسه عندك ومحفوظة كمسودة في المتصفح.`);
        return false;
      } finally {
        setSaving(false);
      }
    };
    const next = saveChain.current.then(run, run);
    saveChain.current = next;
    return next;
  }, [store, client, push, writer, flow, follower]);


  const startJob = useCallback(async (kind: JobKind) => {
    if (isActive(jobRef.current)) return;
    dispatch({ type: "start", kind, at: Date.now() });
    try {
      if (store.getSnapshot().dirty && !(await save(kind === "prepare" ? "قبل التحضير" : "قبل التصدير"))) {
        if (reattachFromError(flow, lastSaveError.current)) { announceAttached(); return; }
        dispatch({ type: "start-failed", message: "الحفظ فشل فالشغل ما بدأش. صلّح المشكلة وحاول تاني.", at: Date.now() });
        return;
      }
      if ((await launchJob(client, flow, kind)) === "attached") announceAttached();
    } catch (error) {
      dispatch({ type: "start-failed", message: describeError(error), at: Date.now() });
    }
  }, [store, client, save, flow, announceAttached]);
  const cancelJob = () => {
    const id = jobRef.current.jobId;
    if (!id) return;
    dispatch({ type: "cancel-requested" });
    client.cancel(id).catch((error) => push("error", `مقدرتش ألغي: ${describeError(error)}`));
  };

  const refreshProject = useCallback(async () => {
    const epoch = saveEpoch.current;
    try { const next = await client.project(); if (epoch === saveEpoch.current) follower.receive(next); }
    catch (error) { push("warn", `الشغل خلص بس معرفتش أحدّث بيانات المشروع: ${describeError(error)}`); }
  }, [client, push, follower]);
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (job.status === "done" && job.kind === "prepare" && job.jobId && refreshed.current !== job.jobId) {
      refreshed.current = job.jobId;
      void refreshProject();
    }
  }, [job.status, job.kind, job.jobId, refreshProject]);


  const openExport = () => {
    flushActiveField(document);
    if (job.kind === "prepare" && isFinished(job)) dispatch({ type: "reset" });
    setIntent(job.kind === "prepare" && isActive(job) ? "prepare" : "export");
    setExportOpen(true);
  };
  const openPrepare = () => { flushActiveField(document); setIntent("prepare"); setExportOpen(true); };

  const saveNow = () => runSaveCommand({ doc: document, settle: flushSync, isDirty: () => store.getSnapshot().dirty, save: () => { void save(); }, notify: push });


  const restoreHistory = useCallback(async (entry: HistoryEntry) => {
    try {
      const { manifest: restored } = await client.restore(entry.file);
      const parsed = parseManifest(restored);
      if (!parsed) { push("error", "النسخة دي مش متوافقة مع الـ schema الحالي فمقدرتش أرجّعها."); return; }
      const at = Date.parse(entry.savedAt);
      store.apply(parsed, `استرجاع نسخة ${Number.isFinite(at) ? timeOfDay(at) : entry.file}`, { coalesce: false });
      store.select(null);
      push("ok", "النسخة اتحمّلت. اضغط حفظ لو عايزها تتسجّل، أو Ctrl+Z ترجّع اللي كان.");
    } catch (error) {
      push("error", `مقدرتش أجيب النسخة: ${describeError(error)}`);
    }
  }, [client, store, push]);

  const navigate = useCallback((target: NonNullable<ReturnType<typeof issueTarget>>) => {
    if (target.selection) store.select(target.selection);
    if (target.frame !== null) store.seek(target.frame);
  }, [store]);


  const deleteSelected = () => {
    const snap = store.getSnapshot();
    const selection = snap.selection;
    if (!selection) { push("info", "اختار حاجة من التايم لاين الأول عشان تمسحها."); return; }
    if (runPanelDelete({ selection, manifest: snap.manifest, apply: store.apply })) return;
    const out = deleteSelection(snap.manifest, selection);
    if ("error" in out) { push("info", out.error); return; }
    const verdict = guardEdit(snap.manifest, out.manifest);
    if (!verdict.ok) { push("error", `مش هينفع أمسح: ${verdict.message}`); return; }
    store.apply(out.manifest, out.label, { coalesce: false });
    store.select(null);
  };
  const run = useRef<(cmd: Command) => void>(() => {});
  run.current = (cmd) => {
    const snap = store.getSnapshot();
    switch (cmd.type) {
      case "undo": store.undo(); break;
      case "redo": store.redo(); break;
      case "save": saveNow(); break;
      case "togglePlay": playerBus.toggle(); break;
      case "step": playerBus.pause(); store.seek(snap.playhead + cmd.frames); break;
      case "seekEdge": store.seek(cmd.to === "start" ? 0 : Math.max(0, totalFrames(snap.manifest) - 1)); break;
      case "scene": {
        const i = adjacentSceneIndex(snap.manifest.scenes, snap.playhead, cmd.dir);
        if (i >= 0) { const s = snap.manifest.scenes[i]; store.select({ kind: "scene", id: s.id }); store.seek(s.fromFrame); }
        else if (cmd.dir === -1) store.seek(0);
        break;
      }
      case "delete": deleteSelected(); break;
      case "escape":
        if (exportOpen) setExportOpen(false);
        else if (issuesOpen) setIssuesOpen(false);
        else if (snap.selection) store.select(null);
        break;
    }
  };
  const modalRef = useRef(false);
  modalRef.current = exportOpen;
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const cmd = resolveKey(e, { editable: isEditableElement(e.target as HTMLElement | null), modal: modalRef.current });
      if (!cmd) {
        if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") e.preventDefault();
        return;
      }
      e.preventDefault();
      run.current(cmd);
    };

    const onUp = (e: KeyboardEvent) => { if (e.code === "Space" && !modalRef.current && !isEditableElement(e.target as HTMLElement | null)) e.preventDefault(); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  const editSeconds = totalFrames(manifest) / manifest.source.fps;

  return (
    <div className="rv-app">
      <div className="rv-shell" inert={exportOpen}>
        <Toolbar
          project={project} validation={validation} pending={pending} saving={saving} lastSavedAt={lastSavedAt}
          guides={guides} onGuides={() => setGuides(nextGuides)} onSave={saveNow} onOpenIssues={() => setIssuesOpen((v) => !v)}
          onOpenExport={openExport} onRestore={restoreHistory} job={job} needsPrepare={needsPrepare}
        />
        <div className="rv-banners">
          <ConnectionBanner state={conn} retrying={retrying} dirty={dirty} onRetry={async () => { setRetrying(true); await client.ping(); setRetrying(false); }} />
          <LiveFollowBanner status={live} online={conn.online} busy={saving || isActive(job)}
            onToggle={() => follower.setEnabled(!live.enabled)} onAccept={acceptLiveUpdate} />
          {pendingDraft ? <DraftPrompt draft={pendingDraft} stale={pendingDraft.base !== baseFp.current} onRestore={() => answerDraft(true)} onDiscard={() => answerDraft(false)} /> : null}
          {needsPrepare ? <PrepareBanner reason={prepareReason} busy={isActive(job) && job.kind === "prepare"} onPrepare={openPrepare} /> : null}
          {project.warnings.map((w) => <div key={w} className="rv-banner warn">{w}</div>)}
        </div>
        <main className="rv-main">
          <section className="rv-preview-col"><PreviewPlayer project={project} guides={guides} onGuides={() => setGuides(nextGuides)} /></section>
          <section className="rv-panel-col"><PanelHost project={project} issues={validation.issues} /></section>
        </main>
        <Boundary label="التايم لاين وقع" resetKey={manifest}><Timeline onNotify={push} /></Boundary>
      </div>
      <IssuesDrawer open={issuesOpen} onClose={() => setIssuesOpen(false)} validation={validation} manifest={manifest} onNavigate={navigate} />
      <ExportDialog
        open={exportOpen} onClose={() => setExportOpen(false)} intent={intent} project={project} validation={validation} pending={pending} dirty={dirty}
        needsPrepare={needsPrepare} job={job} onStart={(kind) => void startJob(kind)} onCancel={cancelJob} onReset={() => dispatch({ type: "reset" })}
        onReconnect={() => { if (job.jobId) follow(job.jobId); }} onPrepareInstead={openPrepare} client={client} editSeconds={editSeconds} notify={push}
      />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export const App: React.FC<{ store: EditorStore; project: ProjectResponse }> = ({ store, project }) => (
  <EditorStoreProvider store={store}><Shell initialProject={project} /></EditorStoreProvider>
);
