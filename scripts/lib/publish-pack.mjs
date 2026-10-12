export const PLATFORM_LABELS = Object.freeze({tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube Shorts'});
export const CAPTION_MAX_CHARS = Object.freeze({tiktok: 2200, instagram: 2200, youtube: 5000});
export const YOUTUBE_TITLE_MAX_CHARS = 100;
export const MAX_HASHTAGS = 5;
const HASHTAG = /^#[\p{L}\p{N}_]{2,40}$/u;
const MENTION = /@[A-Za-z0-9_.]{1,30}/g;
const INLINE_HASHTAG = /(^|\s)#[\p{L}\p{N}_]/u;

const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > max) throw new Error(`${label} must be nonblank text of at most ${max} characters.`);
  return value.trim();
};


export function publishContext(profile, manifest) {
  return {cta: manifest?.creator?.ending?.cta ?? null,
    writingStyle: manifest?.writingStyle ?? (profile.preferences.writingStyle.mode === 'fixed' ? profile.preferences.writingStyle.value : null)};
}


export function validatePublishCopy(copy, {profile, cta, writingStyle}) {
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) throw new Error('Publish copy must be a JSON object.');
  const allowed = ['title', 'notes', 'credits', ...profile.platforms];
  const unknown = Object.keys(copy).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Unknown publish copy field: ${unknown}. This profile posts to ${profile.platforms.join(' and ')}.`);
  const out = {title: text(copy.title, 80, 'title'), notes: []};
  if (copy.notes !== undefined) {
    if (!Array.isArray(copy.notes) || copy.notes.length > 8) throw new Error('notes must be a list of at most 8 lines.');
    out.notes = copy.notes.map((note, i) => text(note, 240, `notes[${i}]`));
  }
  if (copy.credits !== undefined) {
    if (!Array.isArray(copy.credits) || copy.credits.length > 12) throw new Error('credits must be a list of at most 12 supplied attribution lines.');
    out.credits = copy.credits.map((credit, i) => text(credit, 1000, `credits[${i}]`));
  }
  for (const platform of profile.platforms) {
    const label = PLATFORM_LABELS[platform];
    if (!label) throw new Error(`Unsupported publishing platform: ${platform}.`);
    const entry = copy[platform];
    const captionField = platform === 'youtube' ? 'description' : 'caption';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Publish copy needs a ${platform} entry with ${captionField} and hashtags${platform === 'youtube' ? ', plus a title' : ''}.`);
    const caption = text(entry[captionField], CAPTION_MAX_CHARS[platform], `${platform}.${captionField}`);
    const title = platform === 'youtube' ? text(entry.title, YOUTUBE_TITLE_MAX_CHARS, 'youtube.title') : null;
    if (writingStyle === 'short' && Array.from(caption).length > 450) throw new Error(`The ${label} ${captionField} exceeds the saved short writing style (450 characters maximum).`);
    if (INLINE_HASHTAG.test(caption)) throw new Error(`Put the ${label} hashtags in ${platform}.hashtags, not inside the caption.`);
    if (title && INLINE_HASHTAG.test(title)) throw new Error('Put the YouTube Shorts hashtags in youtube.hashtags, not inside the title.');
    if (cta && !caption.includes(cta)) throw new Error(`The ${label} caption must include the video's comment keyword «${cta}».`);
    for (const mention of `${title ?? ''} ${caption}`.match(MENTION) ?? []) {
      if (mention !== profile.handle) throw new Error(`The ${label} caption mentions ${mention}; only the profile handle ${profile.handle ?? '(none set)'} may appear.`);
    }
    const tags = entry.hashtags;
    if (!Array.isArray(tags) || tags.length < 1 || tags.length > MAX_HASHTAGS) throw new Error(`${platform}.hashtags needs 1 to ${MAX_HASHTAGS} hashtags.`);
    const seen = new Set();
    for (const tag of tags) {
      if (typeof tag !== 'string' || !HASHTAG.test(tag)) throw new Error(`${platform}.hashtags: ${JSON.stringify(tag)} is not a hashtag like #تعديل_فيديو.`);
      const key = tag.toLowerCase();
      if (seen.has(key)) throw new Error(`${platform}.hashtags repeats ${tag}.`);
      seen.add(key);
    }
    out[platform] = {...(title === null ? {caption} : {title, description: caption}), hashtags: [...tags]};
    if (platform === 'instagram' && entry.altText !== undefined) out[platform].altText = text(entry.altText, 1000, 'instagram.altText');
    if (entry.pinnedComment !== undefined) out[platform].pinnedComment = text(entry.pinnedComment, 2200, `${platform}.pinnedComment`);
  }
  return out;
}


export function renderPublishPack({profile, copy, cta, video, source, writingStyle}) {
  const lines = [`# ${copy.title} — publishing copy`, '', 'Nothing has been posted.', '',
    `Source: ${source ? `\`${source}\`` : 'not recorded'}.`, `Final export: \`${video.path}\` (sha256 \`${video.sha256}\`).`,
    `Comment keyword: ${cta ? `«${cta}»` : 'none'}.`, ''];
  if (writingStyle) lines.push(`Description style: ${writingStyle}.`, '');
  for (const platform of profile.platforms) {
    const entry = copy[platform];
    lines.push(`## ${PLATFORM_LABELS[platform]}`, '');
    if (platform === 'youtube') lines.push('### Title', '', entry.title, '', '### Description', '', entry.description, '');
    else lines.push(entry.caption, '');
    lines.push(entry.hashtags.join(' '), '');
    if (entry.altText !== undefined) lines.push('### Alt text', '', entry.altText, '');
    if (entry.pinnedComment !== undefined) lines.push('### Pinned comment', '', entry.pinnedComment, '');
  }
  if (copy.credits?.length) lines.push('## Supplied credits', '', ...copy.credits.map((credit) => `- ${credit}`), '');
  if (copy.notes?.length) lines.push('## Notes', '', ...copy.notes.map((note) => `- ${note}`), '');
  return `${lines.join('\n')}`;
}
