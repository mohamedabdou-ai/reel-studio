"""Inventory retained PyPI wheels without installing or executing their code."""
import argparse
import email
import hashlib
import json
import pathlib
import urllib.request
import zipfile


def evidence_target(root, package, entry):
    parts = pathlib.PurePosixPath(entry)
    if parts.is_absolute() or any(p in ('..','.') for p in parts.parts) or '\\' in entry or ':' in entry:
        raise ValueError('Unsafe licence evidence path')
    base = (root / package).resolve()
    target = (base / entry).resolve()
    if not target.is_relative_to(base):
        raise ValueError('Licence evidence resolves outside its package')
    return target


def inventory(directory):
    workspace = pathlib.Path(__file__).resolve().parents[3]
    if not directory.resolve().is_relative_to((workspace / 'state/tmp').resolve()):
        raise ValueError('Wheel audit scratch must stay in workspace state/tmp')
    result = []
    for file in sorted(directory.glob('*.whl')):
        with zipfile.ZipFile(file) as archive:
            names = archive.namelist()
            meta = email.message_from_bytes(archive.read(next(n for n in names if n.endswith('.dist-info/METADATA'))))
            name, version = meta['Name'], meta['Version']
            source = f'https://pypi.org/pypi/{name}/{version}/json'
            with urllib.request.urlopen(source, timeout=60) as response:
                pypi = json.load(response)
            official = next(a for a in pypi['urls'] if a['filename'] == file.name)
            actual = hashlib.sha256(file.read_bytes()).hexdigest()
            if official['digests']['sha256'] != actual or official['size'] != file.stat().st_size:
                raise ValueError(f'PyPI wheel integrity check failed: {file.name}')
            licenses = []
            for entry in names:
                if not entry.endswith('/') and any(t in entry.lower() for t in ('license', 'licence', 'copying', 'notice')):
                    data = archive.read(entry)
                    # Evidence stays ignored, while pins contain only names and digests.
                    target = evidence_target(directory.parents[1] / 'audit', name, entry)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    licenses.append({'path': entry, 'sha256': hashlib.sha256(data).hexdigest()})
            result.append({'name': name.lower().replace('_', '-').replace('.', '-'), 'version': version,
                           'file': file.name, 'url': official['url'], 'bytes': official['size'], 'sha256': actual,
                           'metadataUrl': source, 'requiresDist': meta.get_all('Requires-Dist', []),
                           'licenseExpression': meta.get('License-Expression'),
                           'licenseHeader': (meta.get('License') or '')[:120], 'licenseFiles': licenses})
            print(f'{name}=={version}: PyPI size/hash verified; {len(licenses)} licence evidence files', flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=pathlib.Path)
    args = parser.parse_args()
    data = inventory(args.directory.resolve())
    output = args.directory.resolve().parents[1] / 'wheel-inventory.json'
    output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
