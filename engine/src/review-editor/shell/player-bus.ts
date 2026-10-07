import { useSyncExternalStore } from "react";
import type { PlayerRef } from "@remotion/player";

let player: PlayerRef | null = null;
let playing = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of [...listeners]) l(); };

const setPlaying = (value: boolean) => {
  if (value === playing) return;
  playing = value;
  emit();
};

export const playerBus = {

  attach(next: PlayerRef | null): () => void {
    player = next;
    if (!next) { setPlaying(false); return () => {}; }
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    next.addEventListener("play", onPlay);
    next.addEventListener("pause", onPause);
    next.addEventListener("ended", onPause);
    setPlaying(next.isPlaying());
    return () => {
      next.removeEventListener("play", onPlay);
      next.removeEventListener("pause", onPause);
      next.removeEventListener("ended", onPause);
      if (player === next) { player = null; setPlaying(false); }
    };
  },
  get: (): PlayerRef | null => player,
  isPlaying: (): boolean => playing,
  play() { try { player?.play(); } catch {                                               } },
  pause() { try { player?.pause(); } catch {             } },
  toggle() { if (!player) return; if (playing) this.pause(); else this.play(); },
  mute(value: boolean) { try { if (value) player?.mute(); else player?.unmute(); } catch {             } },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};


export const usePlaying = (): boolean => useSyncExternalStore(playerBus.subscribe, playerBus.isPlaying, playerBus.isPlaying);
