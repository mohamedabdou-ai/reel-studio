export function proxyGeometry(video, height) {
  if (!(video.width > 0 && video.height > 0)) throw new Error('Invalid source geometry');
  if (['arib-std-b67', 'smpte2084'].includes(video.color_transfer)) throw new Error('HDR source needs the approved tone-mapped SDR plate before making a preview proxy');
  const value = Number(video.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  const rotation = ((value % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) throw new Error('Unsupported display rotation; prepare a normalized source plate first');
  const [n, d] = (video.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  const sar = n > 0 && d > 0 ? n / d : 1;
  const codedAspect = video.width * sar / video.height;
  const aspect = rotation === 90 || rotation === 270 ? 1 / codedAspect : codedAspect;
  return { width: Math.max(2, Math.round(height * aspect / 2) * 2), height, aspect, rotation };
}
