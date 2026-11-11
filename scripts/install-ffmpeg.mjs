// Installs the pinned FFmpeg into Tools/bin. Setup runs the same installer in-process; this command stays for manual repairs.
import './lib/project-tmp.mjs';
import {ROOT} from './lib/project-paths.mjs';
import {readLock} from './lib/studio-lock.mjs';
import {installPinnedFfmpeg} from './lib/ffmpeg-install.mjs';

const lock = await readLock(ROOT);
const report = await installPinnedFfmpeg(lock.ffmpeg, {root: ROOT, log: message => console.error(message)});
console.log(JSON.stringify(report, null, 2));
