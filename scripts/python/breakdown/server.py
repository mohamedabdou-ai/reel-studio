"""Serialized JSON-lines analyser worker; no model acquisition or persistent media."""
import importlib
import json
import os
import sys
import traceback
from contextlib import redirect_stderr
from . import VERSION


def serve(directory,threads):
    import cv2
    cv2.setNumThreads(threads)
    for line in sys.stdin:
        try:
            command=json.loads(line);name=command['name']
            if name=='configure':
                threads=int(command['threads'])
                if threads<1:raise ValueError('positive worker thread count required')
                cv2.setNumThreads(threads)
                os.environ['REEL_ANALYSIS_THREADS']=str(threads)
                response={'ok':True}
            else:
                if name not in ('shots','camera','overlays','look','text','sound','speech'):raise ValueError('unknown analyser')
                with open(command['log'],'w',encoding='utf-8') as log, redirect_stderr(log):
                    cv2.setRNGSeed(0)
                    module=importlib.import_module('.'+('speech_activity' if name=='speech' else name),__package__)
                    with open(command['input'],encoding='utf-8') as f:request=json.load(f)
                    result=module.analyse(request);result['analyser']={'name':name,'version':VERSION}
                    with open(command['output'],'w',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2,allow_nan=False)
                    response={'ok':True}
        except BaseException as error:
            traceback.print_exc(file=sys.stderr)
            if 'command' in locals() and command.get('log'):
                with open(command['log'],'a',encoding='utf-8') as log:traceback.print_exc(file=log)
            response={'ok':False,'error':str(error)}
        print(json.dumps(response),flush=True)
