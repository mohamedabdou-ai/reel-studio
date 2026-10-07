import net from 'node:net';
import {createHash} from 'node:crypto';
import {realpath} from 'node:fs/promises';




export async function acquireProfileSaveLock(root) {
  const real = await realpath(root);
  const identity = process.platform === 'win32' ? real.toLowerCase() : real;
  const key = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  if (!['win32', 'linux'].includes(process.platform)) throw new Error('Reel Studio supports Windows 64-bit.');
  const address = process.platform === 'win32' ? '\\\\.\\pipe\\reel-studio-profile-' + key : '\0reel-studio-profile-' + key;
  const server = net.createServer(socket => socket.destroy());
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(address, () => {server.removeListener('error', reject); resolve();});
    });
  } catch (error) {
    if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
      const busy = new Error('شاشة تانية بتحفظ إعداداتك. جرّب تاني بعد لحظة.'); busy.status = 409; throw busy;
    }
    throw error;
  }
  return () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
