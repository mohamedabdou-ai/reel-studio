import type React from 'react';
import type {PartKind, Box} from '../../../../style-kit/system/types';
import type {Theme} from '../base';
import {KickerPart} from './kicker';
import {HeadlinePart} from './headline';
import {LinePart} from './line';
import {BodyPart} from './body';
import {RulePart} from './rule';
import {NumberPart} from './number';
import {BarsPart} from './bars';
import {RingPart} from './ring';
import {QuotePart} from './quote';
import {ListPart} from './list';
import {CardPart} from './card';
import {ChatPart} from './chat';
import {ScreenPart} from './screen';
import {StepsPart} from './steps';
import {MediaPart} from './media';
import {MarksPart} from './marks';

/** mediaCenterY is local to box; only a lone magazine takeover plate receives it. */
export type MagazinePartProps<P> = {part:P;box:Box;at:number;emphasis:boolean;th:Theme;dir:'rtl'|'ltr';fps:number;scale:number;cell?:boolean;mediaCenterY?:number};
export const MAGAZINE_PARTS:Record<PartKind,React.FC<MagazinePartProps<any>>>={
  kicker:KickerPart,
  headline:HeadlinePart,
  line:LinePart,
  body:BodyPart,
  rule:RulePart,
  number:NumberPart,
  bars:BarsPart,
  ring:RingPart,
  quote:QuotePart,
  list:ListPart,
  card:CardPart,
  chat:ChatPart,
  screen:ScreenPart,
  steps:StepsPart,
  media:MediaPart,
  marks:MarksPart,
};
