import {promises as fs} from 'node:fs';

// Every file takes at least one cluster: on exFAT with 1 MB clusters the 28k package files alone need about 30 GB.
export const spaceNeeded = (need, blockSize) => Math.ceil((need.bytes + need.files * blockSize) * 1.1);

export async function freeSpace(root, {statfs = fs.statfs} = {}) {
  try {
    const stats = await statfs(root);
    return {free: stats.bavail * stats.bsize, blockSize: stats.bsize};
  } catch {
    return null; // A network share or an old host: setup runs as before.
  }
}

const gb = bytes => new Intl.NumberFormat('ar-EG', {maximumFractionDigits: 1}).format(Math.ceil(bytes / 1e8) / 10);

export async function assertFreeSpace(root, need, options = {}) {
  if (!need) return;
  const disk = await freeSpace(root, options);
  if (!disk) return;
  const required = spaceNeeded(need, disk.blockSize);
  if (disk.free >= required) return;
  const line = `المساحة الفاضية على القرص ${gb(disk.free)} جيجا، والخطوة دي محتاجة حوالي ${gb(required)} جيجا. فضّي مساحة أو انقل فولدر الاستوديو لقرص تاني، وبعدين شغّل setup تاني.`;
  throw Object.assign(new Error(line), {reason: 'disk-full', code: 'ENOSPC', hint: line});
}
