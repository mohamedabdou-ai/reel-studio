# scripts/python/breakdown/__main__.py
import argparse
import importlib
import json
import sys
import traceback
import platform

from . import VERSION

COMMANDS = ("version", "shots", "camera", "overlays", "look", "text", "sound", "speech", "serve")


def _load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def _save(path, data):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2, allow_nan=False)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="breakdown")
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--directory")
    parser.add_argument("--threads",type=int,default=1)
    args = parser.parse_args(argv)
    if args.command=='serve':
        from .server import serve
        return serve(args.directory,args.threads)
    if args.command == "version":
        import cv2
        import numpy
        import onnxruntime
        import scipy
        import importlib.metadata as metadata
        print(json.dumps({"breakdown": VERSION, "python": platform.python_version(),
                          "packages": {d.metadata["Name"].lower().replace("_", "-").replace(".", "-"): d.version for d in metadata.distributions()}, "cv2": cv2.__version__, "numpy": numpy.__version__,
                          "scipy": scipy.__version__, "onnxruntime": onnxruntime.__version__}))
        return 0
    if not args.input or not args.output:
        parser.error("analysis requires --input and --output")
    module = importlib.import_module(f"breakdown.{'speech_activity' if args.command == 'speech' else args.command}")
    result = module.analyse(_load(args.input))
    result["analyser"] = {"name": args.command, "version": VERSION}
    _save(args.output, result)
    print(json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # report every failure as JSON on stderr
        traceback.print_exc()
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        sys.exit(1)
