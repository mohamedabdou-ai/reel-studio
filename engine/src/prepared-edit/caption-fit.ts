import type {compileEdit} from './timeline.ts';
type CaptionCue = ReturnType<typeof compileEdit>['captionGroups'][number];



export function fittingCaptionCue(cue: CaptionCue, frame: number, fits: (text: string) => boolean): CaptionCue {
  const text = (words: CaptionCue['words']) => words.map(word => word.text.trim()).join(' ');
  if (fits(text(cue.words))) return cue;
  const chunks: CaptionCue[] = [];
  for (const word of cue.words) {
    if (!fits(word.text.trim())) throw new Error(`Caption token does not fit safely: ${word.text}`);
    const previous = chunks.at(-1);
    if (!previous || !fits(text([...previous.words, word]))) {
      if (previous) previous.toFrame = word.fromFrame;
      chunks.push({fromFrame: previous ? word.fromFrame : cue.fromFrame, toFrame: cue.toFrame, words: [word]});
    } else previous.words.push(word);
  }
  if (chunks.some(chunk => chunk.toFrame <= chunk.fromFrame)) {
    throw new Error('Caption timing collapses below one video frame. Review the word timestamps.');
  }
  const current = chunks.find(chunk => frame >= chunk.fromFrame && frame < chunk.toFrame);
  if (!current) throw new Error('Caption fit cannot map the current frame.');
  return current;
}
