import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { PreparedEdit, type PreparedEditProps } from "../prepared-edit/PreparedEdit";
import type { EditManifest } from "../prepared-edit/schema.ts";
import { Boundary } from "./Boundary";
import { PlayerControls } from "./PlayerControls";
import { remember } from "./api.ts";
import { useEditor, useEditorStore } from "./store.ts";
import { plateIsStale, totalFrames, tryCompile } from "./time.ts";
import { parseManifest } from "./validate.ts";
import { selectionRange } from "./shell/selection.ts";
import { guidesProp, type GuidesMode } from "./shell/guides.ts";
import { playerBus } from "./shell/player-bus.ts";
import type { ProjectResponse } from "./types.ts";

type Quality = "full" | "proxy";

export const PreviewPlayer: React.FC<{ project: ProjectResponse; guides: GuidesMode; onGuides: () => void }> = ({ project, guides, onGuides }) => {
  const store = useEditorStore();
  const manifest = useEditor((s) => s.manifest);
  const selection = useEditor((s) => s.selection);
  const seekNonce = useEditor((s) => s.seekNonce);
  const [instance, setInstance] = useState<PlayerRef | null>(null);
  const [quality, setQuality] = useState<Quality>(remember.get("quality") === "proxy" ? "proxy" : "full");
  const [rate, setRate] = useState<number>(() => Number(remember.get("rate")) || 1);
  const [muted, setMuted] = useState<boolean>(() => remember.get("muted") === "1");
  const [loop, setLoop] = useState(false);
  const plate = project.plate;
  const stale = plate ? plateIsStale(manifest, plate) : false;


  const candidate = useMemo<EditManifest>(() => (plate && stale ? { ...manifest, segments: plate.segments } : manifest), [manifest, plate, stale]);
  const parsed = useMemo(() => parseManifest(candidate), [candidate]);
  const lastValid = useRef<EditManifest | null>(null);
  if (parsed) lastValid.current = parsed;
  const shown = parsed ?? lastValid.current;

  const useProxy = quality === "proxy" && Boolean(plate?.proxySrc);
  const inputProps = useMemo<PreparedEditProps | null>(() => {
    if (!shown || !plate) return null;
    return {
      edit: shown,
      plate: { src: useProxy ? plate.proxySrc! : plate.src, width: plate.width, height: plate.height },
      guides: guidesProp(guides),
      plates: [],
      ...(project.headGuide ? { headGuide: project.headGuide } : {}),
    };
  }, [shown, plate, useProxy, guides, project.headGuide]);

  const compiled = shown ? tryCompile(shown) : null;
  const durationInFrames = Math.max(1, shown ? (compiled?.ok ? compiled.compiled.durationInFrames : totalFrames(shown)) : 1);


  const loopRange = useMemo(() => {
    const r = loop && shown ? selectionRange(shown, selection) : null;
    if (!r) return null;
    const from = Math.max(0, r.from);
    const to = Math.min(durationInFrames - 1, r.to - 1);
    return to > from ? { from, to } : null;
  }, [loop, shown, selection, durationInFrames]);







  const lastNonce = useRef(seekNonce);
  const pendingSeek = useRef<{ frame: number; at: number } | null>(null);


  useEffect(() => {
    if (!instance) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      if (store.getSnapshot().seekNonce !== lastNonce.current) return;
      const wait = pendingSeek.current;
      if (wait) {
        if (e.detail.frame === wait.frame || performance.now() - wait.at > 250) pendingSeek.current = null;
        else return;
      }
      store.setPlayhead(e.detail.frame);
    };
    instance.addEventListener("frameupdate", onFrame);
    const detach = playerBus.attach(instance);
    return () => { instance.removeEventListener("frameupdate", onFrame); detach(); };
  }, [instance, store]);


  useEffect(() => { if (instance) { if (muted) instance.mute(); else instance.unmute(); } }, [instance, muted]);


  useEffect(() => {
    if (seekNonce === lastNonce.current) return;
    lastNonce.current = seekNonce;
    const target = store.getSnapshot().playhead;
    pendingSeek.current = instance && instance.getCurrentFrame() !== target ? { frame: target, at: performance.now() } : null;
    instance?.seekTo(target);
  }, [seekNonce, store, instance]);

  return (
    <div className="rv-preview" dir="ltr">
      <div className="rv-preview-frame">
        {inputProps ? (
          <Boundary label="المعاينة وقفت" resetKey={inputProps}>
            <Player
              key={inputProps.plate?.src}
              ref={setInstance}
              component={PreparedEdit}
              inputProps={inputProps}
              durationInFrames={durationInFrames}
              fps={shown!.source.fps}
              compositionWidth={1080}
              compositionHeight={1920}
              controls={false}
              clickToPlay
              spaceKeyToPlayOrPause={false}
              loop={loop}
              inFrame={loopRange?.from ?? null}
              outFrame={loopRange?.to ?? null}
              playbackRate={rate}
              initialFrame={Math.min(store.getSnapshot().playhead, durationInFrames - 1)}
              initiallyMuted={muted}
              style={{ width: "100%", height: "100%" }}
              acknowledgeRemotionLicense
            />
          </Boundary>
        ) : (
          <div className="rv-preview-empty" dir="rtl">
            {plate === null ? "مفيش plate جاهز للفيديو ده. اضغط «حضّر» فوق." : "الـ manifest فيه أخطاء والمعاينة مش لاقية نسخة سليمة تعرضها."}
          </div>
        )}
      </div>
      <PlayerControls
        fps={shown?.source.fps ?? manifest.source.fps}
        rate={rate}
        onRate={(r) => { setRate(r); remember.set("rate", String(r)); }}
        loop={loop}
        loopLabel={loopRange ? "العنصر المختار" : "الفيديو كله"}
        onLoop={() => setLoop((v) => !v)}
        muted={muted}
        onMute={() => { const v = !muted; setMuted(v); remember.set("muted", v ? "1" : "0"); }}
        guides={guides}
        onGuides={onGuides}
        disabled={!inputProps}
      />
      <div className="rv-preview-chips" dir="rtl">
        {plate?.proxySrc ? (
          <button type="button" className="rv-chip-btn" onClick={() => { const q: Quality = quality === "proxy" ? "full" : "proxy"; setQuality(q); remember.set("quality", q); }}
            title="المعاينة الخفيفة (540p) أسرع على الجهاز. التصدير النهائي دايماً بالجودة الكاملة.">
            {useProxy ? "معاينة خفيفة 540p" : "الجودة الكاملة"}
          </button>
        ) : null}
        {stale && plate ? <span className="chip warn">القص اتغيّر: المعاينة لسه بالقص القديم لحد «حضّر»</span> : null}
        {!parsed && shown ? <span className="chip bad">فيه أخطاء: بنعرض آخر نسخة سليمة</span> : null}
      </div>
    </div>
  );
};
