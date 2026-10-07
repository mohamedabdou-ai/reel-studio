import path from 'node:path';
import {ROOT,readJson} from './job-paths.mjs';

export async function readRenderProps(args,{composition}={}){
  if(args.props!==undefined && args['props-file']!==undefined) throw new Error('Choose --props or --props-file, not both.');
  let value={};
  if(args['props-file']!==undefined){
    if(typeof args['props-file']!=='string') throw new Error('--props-file needs a JSON filename.');
    value=await readJson(path.relative(ROOT,path.resolve(ROOT,args['props-file'])).split(path.sep).join('/'));
  }else if(args.props!==undefined){
    if(typeof args.props!=='string' || Buffer.byteLength(args.props)>8*1024*1024) throw new Error('Props must be JSON under 8 MiB.');
    value=JSON.parse(args.props);
  }
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Render props must be a JSON object.');
  if(composition==='PreparedEdit'){
    const {verifyPreparedProps}=await import('./prepared-props.mjs');
    await verifyPreparedProps(value);
  }
  return value;
}
