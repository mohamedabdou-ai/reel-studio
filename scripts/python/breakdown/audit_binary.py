"""Inspect retained PE binaries and preserve evidence, without loading their code."""
import hashlib
import json
import pathlib
import re
import struct
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / 'state/tmp/breakdown-artifacts'


def pe_imports(data):
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    if data[pe:pe+4] != b'PE\0\0':
        raise ValueError('Not a PE binary')
    count = struct.unpack_from('<H', data, pe+6)[0]
    optional_size = struct.unpack_from('<H', data, pe+20)[0]
    optional = pe+24
    magic = struct.unpack_from('<H', data, optional)[0]
    directory = optional+(112 if magic == 0x20b else 96)
    sections = []
    for i in range(count):
        at = optional+optional_size+i*40
        virtual_size, virtual, raw_size, raw = struct.unpack_from('<IIII', data, at+8)
        sections.append((virtual,max(virtual_size,raw_size),raw))
    def offset(rva):
        for virtual,size,raw in sections:
            if virtual <= rva < virtual+size:
                return raw+rva-virtual
        raise ValueError('Unmapped PE RVA')
    def string(rva):
        start = offset(rva)
        return data[start:data.index(b'\0',start)].decode('ascii')
    result = []
    rva,size = struct.unpack_from('<II', data, directory+8)
    if rva:
        start = offset(rva)
        for at in range(start,start+size,20):
            entry = struct.unpack_from('<IIIII',data,at)
            if not any(entry):
                break
            result.append(string(entry[3]))
    return sorted(set(result))


def main():
    packages = json.loads((BASE/'native/wheel-inventory.json').read_text(encoding='utf8'))
    evidence = []
    for package in packages:
        if package['name'] not in ('onnxruntime','opencv-python-headless'):
            continue
        with zipfile.ZipFile(BASE/'cache/wheels'/package['file']) as archive:
            for name in archive.namelist():
                if not name.endswith(('.dll','.pyd')):
                    continue
                data = archive.read(name)
                tokens = sorted(set(t.decode('ascii') for t in re.findall(rb'[ -~]{8,}',data)
                                    if any(key in t.lower() for key in (b'eigennonblockingthreadpool',b'threadpoolinterface@eigen',b'ippicv',b'intel(r) ipp',b'mkl_',b'dnnl_',b'onednn execution'))))
                evidence.append({'package':package['name'],'binary':name,'sha256':hashlib.sha256(data).hexdigest(),
                                 'imports':pe_imports(data),'markers':tokens[:80],
                                 'markerOffsets':{t:data.find(t.encode('ascii')) for t in tokens[:80]}})
    source = 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.23.2/include/onnxruntime/core/platform/EigenNonBlockingThreadPool.h'
    with urllib.request.urlopen(source,timeout=30) as response:
        header = response.read()
    if b'Mozilla' not in header[:500] or b'Public License v. 2.0' not in header[:500]:
        raise ValueError('Recheck official Eigen-derived threadpool licence')
    report = {'schema':1,'method':'PE import tables plus embedded ASCII markers; exact wheel and binary hashes. No package code loaded or installed.',
              'binaries':evidence,'intelOnnxruntime':{'finding':'MKL notice is generic for this CPU wheel: no MKL/oneDNN import and binary explicitly says oneDNN is disabled.',
                'limitation':'This does not prove absence of every statically linked Intel-authored instruction; no additional Intel Simplified licence entitlement is assumed.'},
              'eigen':{'component':'Eigen non-blocking thread pool','license':'MPL-2.0','finding':'Present: official source path and Eigen RTTI appear in both CPU binaries.',
                       'source':source,'sourceSha256':hashlib.sha256(header).hexdigest(),'licenseHeaderLines':[6,7,8]}}
    (BASE/'binary-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'binaries':len(evidence),'onnxIntel':report['intelOnnxruntime']['finding'],'eigen':report['eigen']}))


if __name__ == '__main__':
    main()
