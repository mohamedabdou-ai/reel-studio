import React, { useRef } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Repeat, Scan, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEditor, useEditorStore } from "./store.ts";
import { formatTimecode } from "./time.ts";
import { GUIDES_LABEL, type GuidesMode } from "./shell/guides.ts";
import { playerBus, usePlaying } from "./shell/player-bus.ts";

export const RATES = [0.5, 1, 1.5, 2] as const;

type Props = {
  fps: number;
  rate: number;
  onRate: (rate: number) => void;
  loop: boolean;

  loopLabel: string;
  onLoop: () => void;
  muted: boolean;
  onMute: () => void;
  guides: GuidesMode;
  onGuides: () => void;

  disabled: boolean;
};

export const PlayerControls: React.FC<Props> = ({ fps, rate, onRate, loop, loopLabel, onLoop, muted, onMute, guides, onGuides, disabled }) => {
  const store = useEditorStore();
  const playhead = useEditor((s) => s.playhead);
  const duration = useEditor((s) => s.durationInFrames);
  const playing = usePlaying();
  const resume = useRef(false);
  const last = Math.max(0, duration - 1);

  const step = (frames: number) => { playerBus.pause(); store.seek(store.getSnapshot().playhead + frames); };
  const cycleRate = () => onRate(RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length]);

  return (
    <div className="rv-controls" dir="ltr">
      <input
        className="rv-seek"
        type="range"
        min={0}
        max={last}
        step={1}
        value={Math.min(playhead, last)}
        disabled={disabled}
        aria-label="شريط الفريمات"
        style={{ ["--pct" as string]: `${last ? (Math.min(playhead, last) / last) * 100 : 0}%` }}
        onChange={(e) => store.seek(Number(e.currentTarget.value))}
        onPointerDown={() => { resume.current = playerBus.isPlaying(); playerBus.pause(); }}
        onPointerUp={(e) => { e.currentTarget.blur(); if (resume.current) playerBus.play(); resume.current = false; }}
        onPointerCancel={() => { if (resume.current) playerBus.play(); resume.current = false; }}
      />
      <div className="rv-controls-row">
        <div className="rv-cluster">
          <button type="button" className="rv-icon" disabled={disabled} title="أول فريم (Home)" onClick={() => store.seek(0)}><SkipBack size={16} /></button>
          <button type="button" className="rv-icon" disabled={disabled} title="فريم لورا (←)  ·  ١٠ فريمات (Shift+←)" onClick={() => step(-1)}><ChevronLeft size={18} /></button>
          <button type="button" className="rv-icon rv-play" disabled={disabled} title="تشغيل / إيقاف (Space)" onClick={() => playerBus.toggle()}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
          <button type="button" className="rv-icon" disabled={disabled} title="فريم لقدام (→)  ·  ١٠ فريمات (Shift+→)" onClick={() => step(1)}><ChevronRight size={18} /></button>
          <button type="button" className="rv-icon" disabled={disabled} title="آخر فريم (End)" onClick={() => store.seek(last)}><SkipForward size={16} /></button>
        </div>
        <div className="rv-time" aria-live="off">
          <b>{formatTimecode(playhead, fps)}</b>
          <span className="rv-dim"> / {formatTimecode(duration, fps)}</span>
          <span className="rv-frame" title="رقم الفريم">#{playhead}</span>
        </div>
        <div className="rv-cluster">
          <button type="button" className="rv-icon rv-text" disabled={disabled} title="سرعة التشغيل" onClick={cycleRate}>{rate}×</button>
          <button type="button" className={`rv-icon${loop ? " on" : ""}`} disabled={disabled} aria-pressed={loop} title={`تكرار: ${loopLabel}`} onClick={onLoop}><Repeat size={16} /></button>
          <button type="button" className={`rv-icon${muted ? " on" : ""}`} disabled={disabled} aria-pressed={muted} title={muted ? "تشغيل الصوت" : "كتم الصوت"} onClick={onMute}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          <button type="button" className={`rv-icon rv-text${guides !== "off" ? " on" : ""}`} disabled={disabled} title={`مناطق الأمان (safe zones): ${GUIDES_LABEL[guides]} — اضغط للتغيير`} onClick={onGuides}>
            <Scan size={16} />{guides !== "off" ? <span>{GUIDES_LABEL[guides]}</span> : null}
          </button>
        </div>
      </div>
    </div>
  );
};
