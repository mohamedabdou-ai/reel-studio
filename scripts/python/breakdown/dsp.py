# scripts/python/breakdown/dsp.py
import numpy as np
from scipy.io import wavfile
from scipy.ndimage import median_filter
from scipy.signal import stft
from .audio_config import AUDIO_TUNING

SR = 16000
NFFT = 1024
HOP = 256


def load_wav(path):
    rate, data = wavfile.read(path)
    if data.dtype != np.int16:
        raise ValueError("expected 16-bit PCM audio")
    data = data.astype(np.float32) / 32768.0
    if data.ndim > 1:
        data = data.mean(axis=1)
    if rate != SR:
        raise ValueError(f"expected {SR} Hz audio, got {rate}")
    return data


def spectrogram(signal):
    signal = np.asarray(signal, dtype=np.float32)
    if signal.ndim != 1 or not np.isfinite(signal).all():
        raise ValueError("expected finite mono audio")
    if len(signal) < NFFT:
        signal = np.pad(signal, (0, NFFT - len(signal)))
    _, _, z = stft(signal, fs=SR, nperseg=NFFT, noverlap=NFFT - HOP, boundary=None, padded=True)
    return np.abs(z).astype(np.float32)


def frame_times(count):
    """Each frame's leading edge minus half a hop: where an onset first shows in the log flux."""
    return (np.arange(count) * HOP + NFFT - HOP / 2) / SR


def hpss(S, size=17):
    H = median_filter(S, size=(1, size))
    P = median_filter(S, size=(size, 1))
    mask = H ** 2 / (H ** 2 + P ** 2 + 1e-12)
    return S * mask, S * (1 - mask)


def onset_envelope(S):
    flux = np.maximum(0, np.diff(np.log1p(100 * S), axis=1)).sum(axis=0)
    flux = np.concatenate([[0.0], flux])
    return (flux / (flux.max() + 1e-9)).astype(np.float32)


def db(x):
    return 20 * np.log10(np.maximum(x, 1e-9))


def tempo(envelope, weights, frame_rate, lo=AUDIO_TUNING['rhythm']['min_bpm'], hi=AUDIO_TUNING['rhythm']['max_bpm'], spectrum=None, diagnostics=None):
    from .rhythm import estimate_tempo
    return estimate_tempo(envelope, weights, frame_rate, lo, hi, spectrum, diagnostics)


def beat_grid(envelope, weights, frame_rate, period_frames):
    env = envelope * weights
    step = int(round(period_frames))
    phase = int(np.argmax([env[p::step].sum() for p in range(step)]))
    beats, pos = [], float(phase)
    while pos < len(env):
        k = int(round(pos))
        lo, hi = max(0, k - 3), min(len(env), k + 4)
        local = lo + int(np.argmax(env[lo:hi]))
        beats.append(round(float(frame_times(local + 1)[-1]), 3))
        pos = local + period_frames
    return beats
