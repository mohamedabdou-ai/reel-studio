"""Build the four-package lock and named, binary-backed licence audit."""
import hashlib
import json
import pathlib
import re
import subprocess
import zipfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / 'state/tmp/breakdown-artifacts'
LICENSES = {'numpy':'BSD-3-Clause','scipy':'BSD-3-Clause','opencv-python-headless':'Apache-2.0','onnxruntime':'MIT',
            'coloredlogs':'MIT','flatbuffers':'Apache-2.0','packaging':'BSD-2-Clause','protobuf':'BSD-3-Clause',
            'sympy':'BSD-3-Clause','mpmath':'BSD-3-Clause','humanfriendly':'MIT','pyreadline3':'BSD-3-Clause'}


# Public metadata retains approved scope and immutable public symbol evidence.
STATEMENTS = {
    'FFmpeg':'Approved FFmpeg LGPL-2.1-or-later in unmodified official OpenCV PyPI wheels for local installation only.',
    'GCC runtime library':'Approved the GCC runtime with GCC-exception-3.1 in unmodified official NumPy and SciPy wheels only.',
    'Intel IPP ICV':'Approved Intel IPP ICV under the Intel Simplified Software License in unmodified official OpenCV wheels only.',
    'Intel MKL':'Approved Intel code under the Intel Simplified Software License in official ONNX Runtime wheels only when binary evidence proves inclusion.',
    'Intel oneDNN':'Approved Intel code under the Intel Simplified Software License in official ONNX Runtime wheels only when binary evidence proves inclusion.',
    'libdivide':'Approved libdivide under Zlib in unmodified official NumPy wheels only.',
    'LAPACK':'Approved LAPACK BSD-3-Clause-Attribution in unmodified official NumPy and SciPy wheels only.',
    'OpenBLAS':'Approved OpenBLAS BSD-3-Clause-Attribution in unmodified official NumPy and SciPy wheels only.',
    'Eigen':'Approved Eigen MPL-2.0 in the audited unmodified official ONNX Runtime 1.23.2 Windows wheel only.',
}
SYMBOLS = ('EigenNonBlockingThreadPool.h','ThreadPoolInterface@Eigen','ippicv','Intel(R) IPP','mkl_','dnnl_',
           'oneDNN execution provider is not enabled in this build.')


def public_metadata(value):
    if isinstance(value,list):
        return [public_metadata(item) for item in value]
    if not isinstance(value,dict):
        return value
    result = {key:public_metadata(item) for key,item in value.items() if key not in ('sourceFile','authority','gateReceipt','selectedInventory','directory')}
    if value.get('name') in STATEMENTS and 'approval' in value:
        result['approval'] = {'date':'2026-11-15','statement':STATEMENTS[value['name']]}
    if value.get('name') == 'Eigen' and 'authority' in value:
        result['statement'] = STATEMENTS['Eigen']
    if isinstance(value.get('markers'),list):
        offsets = {}
        for marker in value['markers']:
            for symbol in SYMBOLS:
                position = marker.find(symbol)
                origin = value.get('markerOffsets',{}).get(marker)
                if position >= 0 and isinstance(origin,int):
                    absolute = origin+position
                    offsets[symbol] = min(absolute,offsets.get(symbol,absolute))
        result['markers'] = sorted(offsets)
        result['markerOffsets'] = offsets
    return result


def write_public(pins):
    pins = public_metadata(pins)
    subprocess.run(['node','--input-type=module','-e',"import fs from 'node:fs'; import {validatePins} from './scripts/lib/breakdown-runtime.mjs'; validatePins(JSON.parse(fs.readFileSync(0,'utf8')));"],
                   input=json.dumps(pins,ensure_ascii=False),text=True,encoding='utf8',cwd=ROOT,check=True)
    (ROOT/'scripts/data/breakdown-pins.json').write_text(json.dumps(pins,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    audit = {'schema':1,**pins['audit'],'pins':'scripts/data/breakdown-pins.json','wheelsVerified':len(pins['wheels']),
             'modelsVerified':sum(bool(m) for m in pins['models'].values()),'installed':False,'ownerNamedExceptionsApplied':pins['licenseException']['components']}
    (ROOT/'scripts/python/breakdown/license-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'audit':pins['audit']['status'],'wheels':len(pins['wheels']),'blockers':pins['audit']['blockers']}))

def component(wheel, archive, name, license_id, evidence, binary_files):
    return {'name':name,'license':license_id,'licenseUrl':wheel['metadataUrl'],'source':'official-pypi-wheel',
            'licenseFile':evidence,'licenseSha256':hashlib.sha256(archive.read(evidence)).hexdigest(),'binaryFiles':binary_files}


def main():
    if not (BASE/'native/wheel-inventory.json').exists():
        return write_public(json.loads((ROOT/'scripts/data/breakdown-pins.json').read_text(encoding='utf8')))
    wheels = json.loads((BASE/'native/wheel-inventory.json').read_text(encoding='utf8'))
    binary_audit = json.loads((BASE/'binary-audit.json').read_text(encoding='utf8'))
    for w in wheels:
        w['license'] = LICENSES[w['name']]
        w['licenseUrl'] = w['metadataUrl']
        w['bundledLicenses'] = []
        with zipfile.ZipFile(BASE/'cache/wheels'/w['file']) as z:
            names = z.namelist()
            if w['name'] in ('numpy','scipy'):
                evidence = next(n for n in names if n.endswith('.dist-info/LICENSE.txt'))
                text = z.read(evidence).decode('utf8')
                for part in re.split(r'(?m)^Name:',text)[1:]:
                    name = part.splitlines()[0].strip()
                    if name in ('Meson','spin','tempita'):
                        continue  # Explicitly excluded from installed binaries by the supplier notice.
                    match = re.search(r'(?m)^License:\s*(.+)',part)
                    if not match:
                        continue
                    license_id = match.group(1).strip()
                    if license_id == 'GPL-3.0-with-GCC-exception':
                        license_id = 'GPL-3.0-or-later WITH GCC-exception-3.1'
                    binaries = [n for n in names if n.endswith(('.dll','.pyd'))]
                    w['bundledLicenses'].append(component(w,z,name,license_id,evidence,binaries))
            elif w['name'] == 'opencv-python-headless':
                evidence = 'cv2/LICENSE-3RD-PARTY.txt'
                text = z.read(evidence).decode('utf8')
                if 'Intel Simplified Software License' not in text:
                    raise ValueError('Intel IPP licence evidence missing')
                w['bundledLicenses'].append(component(w,z,'FFmpeg','LGPL-2.1-or-later',evidence,[n for n in names if 'ffmpeg' in n and n.endswith('.dll')]))
                intel = component(w,z,'Intel IPP ICV','LicenseRef-Intel-Simplified-Software-License',evidence,['cv2/cv2.pyd'])
                intel['binaryEvidence'] = [b for b in binary_audit['binaries'] if b['package']==w['name'] and any('ippicv' in t.lower() for t in b['markers'])]
                if not intel['binaryEvidence']:
                    raise ValueError('Intel IPP binary evidence missing')
                w['bundledLicenses'].append(intel)
            elif w['name'] == 'onnxruntime':
                w['binaryAudit'] = binary_audit
                evidence = 'onnxruntime/ThirdPartyNotices.txt'
                eigen_binaries = [b for b in binary_audit['binaries'] if b['package']=='onnxruntime' and any('EigenNonBlockingThreadPool' in t for t in b['markers'])]
                if not eigen_binaries:
                    raise ValueError('Recheck Eigen binary evidence')
                eigen = component(w,z,'Eigen','MPL-2.0',evidence,[b['binary'] for b in eigen_binaries])
                eigen['description'] = 'Eigen non-blocking thread pool'
                eigen['binaryEvidence'] = eigen_binaries
                eigen['sourceEvidence'] = binary_audit['eigen']
                w['bundledLicenses'].append(eigen)
    for wheel in wheels:
        for c in wheel['bundledLicenses']:
            if c['license'] not in ('MIT','Apache-2.0','BSD-3-Clause','BSD-2-Clause'):
                c['approval']={'date':'2026-11-15','statement':STATEMENTS[c['name']]}
    models = {'keys':None,'yamnet':None,'yamnetClassMap':None}
    for m in json.loads((BASE/'models-inventory.json').read_text(encoding='utf8')):
        key = m.pop('key')
        models[key] = {**m,'license':'Apache-2.0','licenseUrl':'https://github.com/RapidAI/RapidOCR/blob/v3.4.2/LICENSE','bundledLicenses':[],
                       'officialHashManifest':'https://raw.githubusercontent.com/RapidAI/RapidOCR/v3.4.2/python/rapidocr/default_models.yaml'}
    chars = json.loads((BASE/'character-metadata.json').read_text(encoding='utf8'))
    eigen_decision = {'approvedOn':'2026-11-15','package':'onnxruntime','version':'1.23.2','name':'Eigen','license':'MPL-2.0',
                      'binary':'onnxruntime/capi/onnxruntime.dll','scope':'Inside the unmodified official PyPI wheel, downloaded at add-on install time; never committed or redistributed.',
                      'authority':'Owner explicitly approved Eigen immediately on 2026-11-15; no alternative runtime trial requested.'}
    exceptions = [{'package':p,'name':c['name'],'license':c['license'],'approval':c['approval']} for p in ('numpy','scipy','opencv-python-headless','onnxruntime') for w in wheels if w['name']==p for c in w['bundledLicenses'] if c['license'] not in ('MIT','Apache-2.0','BSD-3-Clause','BSD-2-Clause')]
    pins = {'schema':1,'python':{'min':'3.10','maxExclusive':'3.14'},'wheelTarget':{'python':'3.11','implementation':'cp','platform':'win_amd64'},
            'packages':[f"{w['name']}=={w['version']}" for w in wheels],'wheels':wheels,'models':models,
            'ocr':{'backend':'local-onnx','visualOrder':False,'orderVerified':True,'characterSource':chars,'gateReceipt':'state/tmp/breakdown-artifacts/native-ocr-gate.json'},
            'acquisition':{'directory':'state/tmp/breakdown-artifacts','selectedInventory':'state/tmp/breakdown-artifacts/native/wheel-inventory.json',
                           'wheelBytes':sum(w['bytes'] for w in wheels),'modelBytes':sum(m['bytes'] for m in models.values() if m),'retained':False,'cachePolicy':'Discard all downloaded staging and wheel/bytecode caches after verified install; no worktree archive dependency. Re-download requires a new user yes.'},
            'licenseException':{'approvedOn':'2026-11-15','scope':'Named components only inside unmodified official PyPI wheels, downloaded at add-on install time; never committed or redistributed.',
                                'components':exceptions,'eigenDecision':eigen_decision,'onnxIntelScope':'Intel code under the same Intel Simplified licence only if binary-backed evidence proves inclusion. No such entitlement used for this wheel.'},
            'audit':{'status':'approved','checkedAt':datetime.now(timezone.utc).isoformat(),'blockers':[],'eigenDecision':eigen_decision,
                     'removed':'RapidOCR and every sole dependency excluded from the selected closure; transient downloads are discarded after verified installation, while hashes and provenance remain in pins.',
                     'intelFinding':binary_audit['intelOnnxruntime'],
                     'optionalYamnet':'Not downloaded: exact official artifact/licence not verified; local spectral rules remain available.'}}
    (BASE/'requirements.lock').write_text(''.join(f"{w['name']}=={w['version']} --hash=sha256:{w['sha256']}\n" for w in sorted(wheels,key=lambda w:w['name'])),encoding='utf8')
    # Check the complete generated audit against the live scoped policy before publishing it.
    subprocess.run(['node','--input-type=module','-e',"import fs from 'node:fs'; import {validatePins} from './scripts/lib/breakdown-runtime.mjs'; validatePins(JSON.parse(fs.readFileSync(0,'utf8')));"],
                   input=json.dumps(pins,ensure_ascii=False),text=True,encoding='utf8',cwd=ROOT,check=True)
    write_public(pins)



if __name__ == '__main__':
    main()
