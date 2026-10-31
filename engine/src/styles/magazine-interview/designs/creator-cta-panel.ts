import {EASE, clamp01} from '../../../core/motion';
import {LIFT_TRAVEL} from '../../../creative-kit/head-clear';
import {presenterDuration} from './presenter';

type PanelInput = {
  frame: number; fps: number; motion: 'land' | 'stagger' | 'quiet';
  panelTop: number; panelBottom: number; promptTop: number; promptHeight: number;
  labelTop: number; cardTop: number; cardHeight: number;
  followFrame: number; clickedFrame: number; pad: number;
};

/** Only the backing moves. Content retains its round-2 positions, masks and press. */
export const panelMotion = (o: PanelInput) => {
  const duration = presenterDuration(o.motion, o.fps);
  const prompt = EASE.land((o.frame - 12) / duration);
  const follow = EASE.land((o.frame - o.followFrame) / duration);
  const opacity = clamp01(prompt * 1.8);
  const travel = LIFT_TRAVEL[o.motion];
  const compactBottom = o.promptTop + o.promptHeight + o.pad;
  const candidate = compactBottom + (o.panelBottom - compactBottom) * follow;
  // Preserve the existing 2px border's containing block, now painted transparently.
  const border = 2;
  const press = o.frame >= o.clickedFrame && o.frame < o.clickedFrame + 5 ? 0.97 : 1;
  const cardCenter = o.cardTop + border + o.cardHeight / 2;
  const boxes = [
    {alpha: opacity, top: o.promptTop + border + (1 - prompt) * travel, bottom: o.promptTop + border + o.promptHeight},
    {alpha: follow, top: o.labelTop + border + (1 - follow) * travel, bottom: o.labelTop + border + 36},
    {alpha: follow, top: cardCenter + ((1 - follow) * travel - o.cardHeight / 2) * press, bottom: cardCenter + o.cardHeight / 2 * press},
  ];
  const visible = boxes.filter(b => b.alpha > 0 && b.top < Math.min(b.bottom, candidate));
  const lowest = visible.length ? Math.max(...visible.map(b => Math.min(b.bottom, candidate))) : o.panelTop;
  // Cap the easing while a gap or the existing press would expose excess empty paper.
  const bottom = opacity > 0 && visible.length ? Math.min(candidate, lowest + o.pad) : o.panelTop;
  return {bottom, opacity: visible.length ? opacity : 0, rule: visible.length ? prompt : 0};
};
