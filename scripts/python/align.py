#!/usr/bin/env python
"""WhisperX alignment-only runner. It never invokes Whisper ASR or rewrites transcript text."""

import argparse
import importlib.metadata
import json
import os
import pathlib
import platform
import sys
import time


def project_file(value: str, *, must_exist: bool) -> pathlib.Path:
    root_value = os.environ.get("PROJECT_ROOT")
    if not root_value:
        raise RuntimeError("PROJECT_ROOT is required")
    root = pathlib.Path(root_value).resolve(strict=True)
    target = pathlib.Path(value).resolve(strict=must_exist)
    if root != target and root not in target.parents:
        raise RuntimeError(f"Path escapes project: {target}")
    if target.is_symlink():
        raise RuntimeError(f"Symbolic links are not allowed: {target}")
    return target


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--language",choices=["ar","en"],default="ar")
    args = parser.parse_args()

    request_file = project_file(args.input, must_exist=True)
    audio_file = project_file(args.audio, must_exist=True)
    model_dir = project_file(args.model, must_exist=True)
    output_file = project_file(args.output, must_exist=False)
    request = json.loads(request_file.read_text(encoding="utf-8"))
    segments = request.get("segments")
    if not isinstance(segments, list) or not segments:
        raise RuntimeError("Request contains no alignment segments")

    import torch
    import whisperx
    import nltk
    # Prevent upstream's fallback download during an offline run.
    nltk.data.find("tokenizers/punkt_tab/english/")

    if torch.cuda.is_available():
        raise RuntimeError("CPU-only alignment refused a CUDA-enabled execution path")
    threads = max(1, min(int(os.environ.get("OMP_NUM_THREADS", "6")), os.cpu_count() or 1))
    torch.set_num_threads(threads)
    started = time.perf_counter()
    load_started = time.perf_counter()
    model, metadata = whisperx.load_align_model(
        language_code=args.language,
        device="cpu",
        model_name=str(model_dir),
        model_dir=str(model_dir),
        model_cache_only=True,
    )
    model_load_ms = round((time.perf_counter() - load_started) * 1000)
    audio = whisperx.load_audio(str(audio_file))
    align_started = time.perf_counter()
    output_segments = []
    for segment in segments:
        aligned = whisperx.align(
            [segment],
            model,
            metadata,
            audio,
            "cpu",
            interpolate_method="ignore",
            return_char_alignments=False,
            print_progress=False,
        )
        output_segments.append({
            "text": segment["text"],
            "words": aligned.get("word_segments", []),
        })
    align_ms = round((time.perf_counter() - align_started) * 1000)
    result = {
        "schema": 1,
        "segments": output_segments,
        "backend": {
            "engine": "whisperx-align-only",
            "whisperx": importlib.metadata.version("whisperx"),
            "python": platform.python_version(),
            "torch": torch.__version__,
            "device": "cpu",
            "threads": threads,
            "interpolation": "ignore",
            "modelLoadMs": model_load_ms,
            "alignmentMs": align_ms,
            "elapsedMs": round((time.perf_counter() - started) * 1000),
        },
    }
    output_file.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_file.with_name(output_file.name + ".partial")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output_file)
    print(json.dumps(result["backend"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"alignment failed: {error}", file=sys.stderr)
        raise
