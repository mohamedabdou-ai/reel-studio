import {promises as fs} from 'node:fs';
import {resolvePreviewSource} from '../../engine/src/core/preview-source.ts';
import {readJson,checkedPath,fileSnapshot} from './job-paths.mjs';

export async function verifyBenchmarkProxy(props,prepared){
  const registry=await readJson('engine/proxies.json');
  const source=props.plate.src,proxy=prepared.proxy?.path?.replace(/^engine\/public\//,'');
  if(!proxy || registry[source]?.proxy!==proxy) throw new Error('Current preview registry does not select the benchmark proxy. Re-prepare the edit.');
  const assets={};
  for(const name of [source,proxy]){
    const stat=await fs.stat(await checkedPath(`engine/public/${name}`,{mustExist:true}));
    assets[name]={sizeInBytes:stat.size,lastModified:Math.floor(stat.mtimeMs)};
  }
  const selected=resolvePreviewSource({source,transparent:false,isPreview:true,registry,assets});
  if(selected!==proxy) throw new Error('Preview would fall back to the original because proxy asset identities are stale.');
  const sourceHash=(await fileSnapshot(`engine/public/${source}`)).sha256;
  const proxyHash=(await fileSnapshot(`engine/public/${proxy}`)).sha256;
  if(registry[source].sourceHash!==sourceHash || registry[source].outputHash!==proxyHash) throw new Error('Preview registry hashes do not match current footage bytes.');
  return {source,proxy,assets};
}
