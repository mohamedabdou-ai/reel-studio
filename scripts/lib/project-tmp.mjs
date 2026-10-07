import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT} from './project-paths.mjs';

export const PROJECT_TMP=path.join(ROOT,'state','tmp');
fs.mkdirSync(PROJECT_TMP,{recursive:true});
process.env.TEMP=PROJECT_TMP;process.env.TMP=PROJECT_TMP;process.env.TMPDIR=PROJECT_TMP;
for(const [name,relative] of Object.entries({npm_config_cache:'state/cache/npm',PIP_CACHE_DIR:'state/cache/pip',HF_HOME:'Tools/models/huggingface',TORCH_HOME:'Tools/models/torch',U2NET_HOME:'Tools/models/rembg',XDG_CACHE_HOME:'state/cache/xdg',PYTHONPYCACHEPREFIX:'state/cache/pycache'}))process.env[name]=path.join(ROOT,relative);
process.env.npm_config_update_notifier='false';process.env.PYTHONDONTWRITEBYTECODE='1';
const toolBin=path.join(ROOT,'Tools','bin'),prefix=[toolBin,path.dirname(process.execPath)];
process.env.PATH=[...prefix,...(process.env.PATH??'').split(path.delimiter).filter(value=>!prefix.includes(value))].join(path.delimiter);
if(os.tmpdir()!==PROJECT_TMP)throw new Error(`Project-local temporary directory could not be activated: ${PROJECT_TMP}`);
