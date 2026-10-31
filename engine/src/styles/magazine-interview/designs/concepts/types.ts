import type {Theme} from '../../system/base';
import type {ConceptMode, ConceptBackdrop} from '../../../../motion-concepts/types';

export type ConceptDesignProps<Config> = {
  config: Config;
  durationInFrames: number;
  seam: number;
  th: Theme;
  /** Components default an omitted sectionIndex to 0. */
  sectionIndex?: number;
  mode?: ConceptMode;
  backdrop?: ConceptBackdrop;
};
