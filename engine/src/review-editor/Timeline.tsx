import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Magnet, Maximize, Minus, Plus } from "lucide-react";
import type { EditManifest } from "../prepared-edit/schema.ts";
import { remember } from "./api.ts";
import { useEditor, useEditorStore } from "./store.ts";
import { formatTimecode, totalFrames, tryCompile } from "./time.ts";
import { guardEdit } from "./shell/guard.ts";
import type { ToastKind } from "./shell/hooks.ts";
import { playerBus, usePlaying } from "./shell/player-bus.ts";
import { selectionKey } from "./shell/selection.ts";
import {
  LANE_ORDER, LANE_TITLES, buildTimelineModel, clampZoom, coalesceItems, dragMarker, dragScene, fitPxPerFrame, followScroll, frameAtX, hueOf, nearestSnap,
  queryLane, quantiseWindow, rulerTicks, sceneMaxStart, sceneMinDuration, snapTargets, soundBounds, cameraBounds, visibleFrames, withCameraFrame, withSceneRect,
  withSoundFrame, zoomAround, type Clamp, type DragMode, type Lane, type LaneId, type SceneRect, type TimelineModel, type TlItem,
} from "./shell/timeline-math.ts";
import type { Selection } from "./types.ts";

const LANE_H: Record<LaneId, number> = { cuts: 20, scenes: 36, captions: 26, sounds: 22, camera: 22, transitions: 28 };
const RULER_H = 24;

const MERGE_PX = 8;
const BUFFER_PX = 120;
const SNAP_PX = 8;
const CLICK_SLOP = 3;
const MARKER_HALF = 5;

type Ghost = { key: string; lane: LaneId; from: number; to: number; clamp: Clamp | null; snappedTo: number | null };
type Session = {
  pointerId: number;

  el: HTMLElement;
  item: TlItem;
  mode: DragMode | "marker" | "select";
  startClientX: number;
  moved: boolean;
  targets: number[];
  result: { rect?: SceneRect; frame?: number; clamp: Clamp | null } | null;
};
type PointerHandlers = {
  down: (e: React.PointerEvent<HTMLElement>) => void;
  move: (e: React.PointerEvent<HTMLElement>) => void;
  up: (e: React.PointerEvent<HTMLElement>) => void;
  over: (e: React.MouseEvent<HTMLElement>) => void;
};


const capture = (el: HTMLElement, id: number) => { try { el.setPointerCapture(id); } catch {                             } };
const release = (el: HTMLElement, id: number) => { try { el.releasePointerCapture(id); } catch {                        } };

const describeItem = (it: TlItem, fps: number): string => {
  const when = it.to > it.from ? `${formatTimecode(it.from, fps)} ← ${formatTimecode(it.to, fps)} (${it.to - it.from}f)` : `${formatTimecode(it.from, fps)} (فريم ${it.from})`;
  return `${it.label}${it.tag ? ` · ${it.tag}` : ""} · ${when}`;
};



type LaneProps = {
  lane: Lane; height: number; ppf: number; winFrom: number; winTo: number; fps: number;
  selectedKey: string | null; ghost: Ghost | null; pointer: PointerHandlers;
};

const LaneView = memo(function LaneView({ lane, height, ppf, winFrom, winTo, fps, selectedKey, ghost, pointer }: LaneProps) {
  const items = coalesceItems(queryLane(lane, winFrom, winTo), MERGE_PX / ppf);
  const point = lane.id === "sounds" || lane.id === "camera";
  const scenes = lane.id === "scenes";
  let tip: React.ReactNode = null;
  return (
    <div className={`rv-tl-lane rv-lane-${lane.id}`} style={{ height }} data-lane={lane.id}
      onPointerDown={pointer.down} onPointerMove={pointer.move} onPointerUp={pointer.up} onPointerCancel={pointer.up} onMouseOver={pointer.over}>
      {items.map((it) => {
        const g = ghost && ghost.key === it.key ? ghost : null;
        const from = g ? g.from : it.from;
        const to = g ? g.to : it.to;
        const isPoint = point && !it.count;
        const width = isPoint ? MARKER_HALF * 2 : Math.max(it.count ? 5 : 2, (to - from) * ppf);
        const left = isPoint ? from * ppf - MARKER_HALF : from * ppf;
        const selected = selectedKey === it.key;
        const row = it.row;
        const style: React.CSSProperties = { left, width };
        if (row !== undefined) { style.top = row === 1 ? height / 2 : 1; style.height = height / 2 - 2; }
        if (scenes) (style as Record<string, unknown>)["--h"] = hueOf(it.tag ?? "");
        if (g && (scenes || point)) {
          tip = (
            <div className={`rv-tl-tip${g.clamp ? " clamped" : ""}`} style={{ left: Math.max(0, left) }} dir="rtl">
              <b dir="ltr">{formatTimecode(from, fps)}{to > from ? ` · ${to - from}f` : ` · #${from}`}</b>
              {g.snappedTo !== null ? <span className="rv-tl-snap"> · مغناطيس</span> : null}
              {g.clamp ? <em> {g.clamp.reason}</em> : null}
            </div>
          );
        }
        return (
          <div
            key={it.key}
            role="button"
            className={`rv-tl-item rv-i-${lane.id}${selected ? " on" : ""}${it.count ? " merged" : ""}${g ? " ghosted" : ""}${isPoint ? " point" : ""}`}
            style={style}
            data-i={it.idx}
            {...(it.count ? { "data-count": it.count, "data-from": it.from, "data-to": it.to, title: `${it.count} عنصر: اضغط للتقريب` } : { "aria-pressed": selected })}
            {...(!it.count && (isPoint || width < 28) ? { "aria-label": `${it.label}${it.tag ? ` · ${it.tag}` : ""}` } : {})}
          >
            {scenes && width > 16 ? <i className="rv-edge s" data-edge="start" /> : null}
            {isPoint ? null : width >= 28 || it.count ? <span className="rv-tl-label">{it.label}</span> : null}
            {scenes && width > 70 && it.tag ? <span className="rv-tl-tag">{it.tag}</span> : null}
            {scenes && width > 16 ? <i className="rv-edge e" data-edge="end" /> : null}
          </div>
        );
      })}
      {tip}
    </div>
  );
});



type ScrubHandlers = { onPointerDown: (e: React.PointerEvent<HTMLElement>) => void; onPointerMove: (e: React.PointerEvent<HTMLElement>) => void; onPointerUp: (e: React.PointerEvent<HTMLElement>) => void; onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void };

const Ruler = memo(function Ruler({ fps, ppf, winFrom, winTo, scrub }: { fps: number; ppf: number; winFrom: number; winTo: number; scrub: ScrubHandlers }) {
  const ticks = rulerTicks({ fps, ppf, from: winFrom, to: winTo });
  return (
    <div className="rv-tl-ruler" style={{ height: RULER_H }} {...scrub}>
      {ticks.map((t) => (
        <div key={t.frame} className={`rv-tick${t.major ? " major" : ""}`} style={{ left: t.frame * ppf }}>{t.label ? <span>{t.label}</span> : null}</div>
      ))}
    </div>
  );
});



const PlayheadLine = memo(function PlayheadLine({ ppf, contentWidth, scrollRef, scrubbing }: { ppf: number; contentWidth: number; scrollRef: React.RefObject<HTMLDivElement | null>; scrubbing: React.RefObject<boolean> }) {
  const playhead = useEditor((s) => s.playhead);
  const nonce = useEditor((s) => s.seekNonce);
  const playing = usePlaying();
  const lastNonce = useRef(nonce);

  useEffect(() => {
    const seeked = nonce !== lastNonce.current;
    lastNonce.current = nonce;
    if (!playing && (!seeked || scrubbing.current)) return;
    const el = scrollRef.current;
    if (!el) return;
    const target = followScroll({ scrollLeft: el.scrollLeft, viewWidth: el.clientWidth, playheadFrame: playhead, ppf, contentWidth });
    if (target !== null) el.scrollLeft = target;
  }, [playhead, nonce, playing, ppf, contentWidth, scrollRef, scrubbing]);
  return <div className="rv-tl-playhead" style={{ transform: `translateX(${playhead * ppf}px)` }}><span className="rv-tl-cap" /></div>;
});






const iso = (text: string | number) => `⁨${text}⁩`;

function describeSelection(sel: Selection, m: EditManifest): string | null {
  if (!sel) return null;
  const fps = m.source.fps;
  switch (sel.kind) {
    case "scene": {
      const s = m.scenes.find((x) => x.id === sel.id);
      return s ? `مشهد «${iso(s.id)}» · ${iso(s.family)} · ${iso(`${formatTimecode(s.fromFrame, fps)} ← ${formatTimecode(s.fromFrame + s.durationInFrames, fps)} (${s.durationInFrames}f)`)}` : null;
    }
    case "segment": return `قطعة ${sel.index + 1}`;
    case "word": return `كلمة «${iso(m.captions.words[sel.index]?.text ?? "")}»`;
    case "sound": { const s = m.sounds[sel.index]; return s ? `صوت «${iso(s.recipe)}» · فريم ${s.atFrame} · gain ${s.gain}` : null; }
    case "camera": { const c = m.camera[sel.index]; return c ? `مفتاح كاميرا · فريم ${c.atFrame} · ×${c.scale}` : null; }
    case "transition": { const t = m.transitions?.[sel.index]; return t ? `transition «${iso(t.kind ?? "")}» · فريم ${t.atFrame} · ${iso(`${t.durationInFrames}f`)}` : null; }
    case "layoutTransition": { const t = m.layoutTransitions?.[sel.index]; return t ? `layout transition «${iso(t.kind)}» · فريم ${t.atFrame}` : null; }
  }
}



export const Timeline: React.FC<{ onNotify: (kind: ToastKind, text: string) => void }> = ({ onNotify }) => {
  const store = useEditorStore();
  const manifest = useEditor((s) => s.manifest);
  const selection = useEditor((s) => s.selection);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState({ scrollLeft: 0, width: 900 });
  const [snapOn, setSnapOn] = useState(remember.get("snap") !== "0");
  const [ghost, setGhost] = useState<Ghost | null>(null);

  const compiled = tryCompile(manifest);
  const model = useMemo<TimelineModel>(() => buildTimelineModel(manifest, compiled.ok ? compiled.compiled.captionGroups : null), [manifest, compiled]);
  const fit = fitPxPerFrame(view.width, model.duration);
  const z = clampZoom(zoom, fit);
  const ppf = fit * z;
  const contentWidth = Math.max(view.width, Math.ceil(model.duration * ppf));
  const win = quantiseWindow(visibleFrames(view.scrollLeft, view.width, ppf, BUFFER_PX), Math.max(8, view.width / ppf / 4));


  const live = useRef({ model, ppf, fit, zoom: z, width: view.width, snapOn, onNotify });
  live.current = { model, ppf, fit, zoom: z, width: view.width, snapOn, onNotify };
  const session = useRef<Session | null>(null);
  const scrub = useRef<{ resume: boolean } | null>(null);
  const scrubbing = useRef(false);
  const pendingScroll = useRef<number | null>(null);


  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setView((v) => (v.width === el.clientWidth && v.scrollLeft === el.scrollLeft ? v : { scrollLeft: el.scrollLeft, width: el.clientWidth }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);



  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (pendingScroll.current === null || !el) return;
    el.scrollLeft = pendingScroll.current;
    pendingScroll.current = null;
  }, [zoom]);

  const applyZoom = useCallback((nextZoom: number, scrollLeft: number) => {
    const el = scrollRef.current;
    if (!el) return;
    if (nextZoom === live.current.zoom) { el.scrollLeft = scrollLeft; return; }
    pendingScroll.current = scrollLeft;
    setZoom(nextZoom);
    setView((v) => ({ ...v, scrollLeft }));
  }, []);

  const zoomBy = useCallback((factor: number, anchorX?: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const s = live.current;
    const ax = anchorX ?? s.width / 2;
    const next = zoomAround({ zoom: s.zoom, factor, fitPpf: s.fit, anchorFrame: frameAtX(ax, el.scrollLeft, s.ppf), anchorX: ax, viewWidth: s.width, duration: s.model.duration });
    if (next.zoom === s.zoom) return;
    applyZoom(next.zoom, next.scrollLeft);
  }, [applyZoom]);

  const zoomToFit = useCallback(() => applyZoom(1, 0), [applyZoom]);


  const zoomToRange = useCallback((from: number, to: number) => {
    const s = live.current;
    const span = Math.max(8, to - from);
    const wanted = clampZoom((s.width * 0.6) / span / s.fit, s.fit);
    applyZoom(wanted, Math.max(0, from * s.fit * wanted - s.width * 0.2));
  }, [applyZoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - el.getBoundingClientRect().left); return; }
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (d !== 0) { e.preventDefault(); el.scrollLeft += d; }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);


  const seekAtClientX = useCallback((clientX: number) => {
    const el = scrollRef.current!;
    store.seek(Math.round(frameAtX(clientX - el.getBoundingClientRect().left, el.scrollLeft, live.current.ppf)));
  }, [store]);
  const scrubProps = useMemo<ScrubHandlers>(() => {
    const end = (e: React.PointerEvent<HTMLElement>) => {
      if (!scrub.current) return;
      const resume = scrub.current.resume;
      scrub.current = null;
      scrubbing.current = false;
      release(e.currentTarget, e.pointerId);
      if (resume) playerBus.play();
    };
    return {
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        capture(e.currentTarget, e.pointerId);
        scrub.current = { resume: playerBus.isPlaying() };
        scrubbing.current = true;
        playerBus.pause();
        seekAtClientX(e.clientX);
      },
      onPointerMove: (e) => { if (scrub.current) seekAtClientX(e.clientX); },
      onPointerUp: end,
      onPointerCancel: end,
    };
  }, [seekAtClientX]);


  const commit = useCallback((s: Session) => {
    const cur = store.getSnapshot().manifest;
    const t = s.item.target;
    let next = cur;
    let label = "";
    if (s.mode !== "select" && s.mode !== "marker" && t?.kind === "scene" && s.result?.rect) {
      next = withSceneRect(cur, t.id, s.result.rect);
      label = s.mode === "move" ? `تحريك مشهد «${t.id}»` : `تغيير مدة مشهد «${t.id}»`;
    } else if (s.mode === "marker" && t?.kind === "sound" && s.result?.frame !== undefined) {
      next = withSoundFrame(cur, t.index, s.result.frame);
      label = "تحريك صوت";
    } else if (s.mode === "marker" && t?.kind === "camera" && s.result?.frame !== undefined) {
      next = withCameraFrame(cur, t.index, s.result.frame);
      label = "تحريك مفتاح كاميرا";
    }
    if (next === cur) return;
    const verdict = guardEdit(cur, next);
    if (!verdict.ok) { live.current.onNotify("error", `مش هينفع: ${verdict.message}`); return; }
    store.apply(next, label, { coalesce: false });
    if (t) store.select(t);
    if (s.result?.clamp) live.current.onNotify("warn", s.result.clamp.reason);
  }, [store]);

  const pointer = useMemo<PointerHandlers>(() => {
    const blockOf = (target: EventTarget | null): { el: HTMLElement; item: TlItem | null; bucket: boolean } | null => {
      const el = (target as HTMLElement | null)?.closest?.<HTMLElement>(".rv-tl-item") ?? null;
      if (!el) return null;
      const lane = el.parentElement?.dataset.lane as LaneId | undefined;
      const item = lane ? live.current.model.lanes[lane].items[Number(el.dataset.i)] ?? null : null;
      return { el, item, bucket: el.dataset.count !== undefined };
    };
    return {
      down(e) {
        if (e.button !== 0) return;
        const hit = blockOf(e.target);
        if (!hit) { scrubProps.onPointerDown(e); return; }
        if (hit.bucket) { zoomToRange(Number(hit.el.dataset.from), Number(hit.el.dataset.to)); return; }
        if (!hit.item) return;
        const { item, el } = hit;
        const mode: Session["mode"] = item.lane === "scenes"
          ? ((e.target as HTMLElement).dataset.edge === "start" ? "start" : (e.target as HTMLElement).dataset.edge === "end" ? "end" : "move")
          : item.lane === "sounds" || item.lane === "camera" ? "marker" : "select";
        capture(el, e.pointerId);
        session.current = {
          pointerId: e.pointerId, el, item, mode, startClientX: e.clientX, moved: false, result: null,
          targets: mode === "select" ? [] : snapTargets(live.current.model, { playhead: store.getSnapshot().playhead, excludeKeys: new Set([item.key]) }),
        };
      },
      move(e) {
        const s = session.current;
        if (!s) { scrubProps.onPointerMove(e); return; }
        if (s.pointerId !== e.pointerId || s.mode === "select") return;
        const dx = e.clientX - s.startClientX;
        if (!s.moved && Math.abs(dx) < CLICK_SLOP) return;
        s.moved = true;
        const { ppf: p, snapOn: on } = live.current;
        const m = store.getSnapshot().manifest;
        const deltaFrames = Math.round(dx / p);
        const threshold = Math.max(1, Math.round(SNAP_PX / p));
        const snap = on && !e.altKey ? (f: number) => nearestSnap(s.targets, f, threshold) : undefined;
        const t = s.item.target;
        if (s.mode === "marker" && (t?.kind === "sound" || t?.kind === "camera")) {
          const bounds = t.kind === "sound" ? soundBounds(m) : cameraBounds(m, t.index);
          const r = dragMarker({ frame: s.item.from + deltaFrames, ...bounds, kind: t.kind, snap });
          s.result = { frame: r.frame, clamp: r.clamp };
          setGhost({ key: s.item.key, lane: s.item.lane, from: r.frame, to: r.frame, clamp: r.clamp, snappedTo: r.snappedTo });
        } else if (t?.kind === "scene" && (s.mode === "move" || s.mode === "start" || s.mode === "end")) {
          const index = m.scenes.findIndex((x) => x.id === t.id);
          if (index < 0) return;
          const r = dragScene({ scenes: m.scenes, index, mode: s.mode, deltaFrames, total: totalFrames(m), signoff: m.signoffFromFrame ?? null, minDuration: sceneMinDuration(m, index), maxStart: sceneMaxStart(m, index), snap });
          s.result = { rect: r.rect, clamp: r.clamp };
          setGhost({ key: s.item.key, lane: "scenes", from: r.rect.from, to: r.rect.from + r.rect.duration, clamp: r.clamp, snappedTo: r.snappedTo });
        }
      },
      up(e) {
        const s = session.current;
        if (!s) { scrubProps.onPointerUp(e); return; }
        if (s.pointerId !== e.pointerId) return;
        session.current = null;
        release(s.el, e.pointerId);
        setGhost(null);
        if (!s.moved) {
          if (s.item.target) {
            store.select(s.item.target);
            const ph = store.getSnapshot().playhead;
            if (ph < s.item.from || ph >= Math.max(s.item.to, s.item.from + 1)) store.seek(s.item.from);
          }
          return;
        }
        commit(s);
      },

      over(e) {
        const hit = blockOf(e.target);
        if (!hit || hit.bucket || !hit.item || hit.el.title) return;
        hit.el.title = describeItem(hit.item, live.current.model.fps);
      },
    };
  }, [store, commit, scrubProps, zoomToRange]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && session.current?.moved) { release(session.current.el, session.current.pointerId); session.current = null; setGhost(null); e.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const selKey = selectionKey(selection, model);
  const selectedFor = (lane: LaneId): string | null => (selKey && selKey.startsWith(lane === "cuts" ? "segment:" : lane === "scenes" ? "scene:" : lane === "captions" ? "caption:" : lane === "sounds" ? "sound:" : lane === "camera" ? "camera:" : "") ? selKey : null);
  const summary = describeSelection(selection, manifest);
  const fps = model.fps;

  return (
    <div className="rv-timeline" dir="ltr" aria-label="التايم لاين">
      <div className="rv-tl-bar">
        <div className="rv-tl-summary" dir="rtl">{summary ?? <span className="rv-dim">اسحب المشهد عشان تحرّكه، وحوافه عشان تغيّر مدته. Alt بيقفل المغناطيس. Ctrl + عجلة الماوس = زوم.</span>}</div>
        <div className="rv-tl-tools">
          <button type="button" className={`rv-icon${snapOn ? " on" : ""}`} aria-pressed={snapOn} title="المغناطيس: بيلزّق الحواف في الكلام والمشاهد والـ playhead" onClick={() => { const v = !snapOn; setSnapOn(v); remember.set("snap", v ? "1" : "0"); }}><Magnet size={15} /></button>
          <button type="button" className="rv-icon" title="تصغير" disabled={z <= 1} onClick={() => zoomBy(0.8)}><Minus size={15} /></button>
          <span className="rv-zoom" title="نسبة الزوم">×{z.toFixed(z < 10 ? 1 : 0)}</span>
          <button type="button" className="rv-icon" title="تكبير" onClick={() => zoomBy(1.25)}><Plus size={15} /></button>
          <button type="button" className="rv-icon" title="الفيديو كله في الشاشة" onClick={zoomToFit}><Maximize size={15} /></button>
        </div>
      </div>
      <div className="rv-tl-body">
        <div className="rv-tl-gutter">
          <div style={{ height: RULER_H }} />
          {LANE_ORDER.map((id) => (
            <div key={id} className="rv-tl-glabel" style={{ height: LANE_H[id] }}>{LANE_TITLES[id]}<small>{model.lanes[id].items.length || ""}</small></div>
          ))}
        </div>
        <div className="rv-tl-scroll" ref={scrollRef}>
          <div className="rv-tl-canvas" style={{ width: contentWidth }}>
            <Ruler fps={fps} ppf={ppf} winFrom={win.from} winTo={win.to} scrub={scrubProps} />
            {LANE_ORDER.map((id) => (
              <LaneView key={id} lane={model.lanes[id]} height={LANE_H[id]} ppf={ppf} winFrom={win.from} winTo={win.to} fps={fps}
                selectedKey={selectedFor(id)} ghost={ghost && ghost.lane === id ? ghost : null} pointer={pointer} />
            ))}
            {model.signoff !== null ? (
              <div className="rv-tl-signoff" style={{ left: model.signoff * ppf, top: RULER_H, width: Math.max(0, (model.duration - model.signoff) * ppf) }} title="بداية الـ signoff: «التوقيع». الجرافيكس بتخلص قبلها.">
                <span>signoff</span>
              </div>
            ) : null}
            <PlayheadLine ppf={ppf} contentWidth={contentWidth} scrollRef={scrollRef} scrubbing={scrubbing} />
          </div>
        </div>
      </div>
    </div>
  );
};
