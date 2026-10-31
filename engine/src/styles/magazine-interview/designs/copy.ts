import {SHARED_STYLE_WORDS} from '../../../creative-kit/labels';
import type {SceneCopy} from '../../scene-copy';
import {KINETIC_COPY} from './copy-kinetic';
import {SCREENS_COPY} from './copy-screens';
import {CONCEPT_PARTS_COPY} from './concepts/copy-parts';
import {CONCEPT_OWN_COPY} from './concepts/copy-own';
import {CONCEPT_MORE_COPY} from './concepts/copy-more';

export const MAGAZINE_BASE_COPY = {
  "issue": {
    "ar": "العدد ٠٤",
    "en": "ISSUE 04"
  },
  "opening": {
    "ar": "افتتاحية",
    "en": "Opening"
  },
  "figures": {
    "ar": "بالأرقام",
    "en": "In figures"
  },
  "number": {
    "ar": "الرقم",
    "en": "The number"
  },
  "contents": {
    "ar": "المحتويات",
    "en": "Contents"
  },
  "review": {
    "ar": "ورقة المراجعة",
    "en": "Review sheet"
  },
  "missing": SHARED_STYLE_WORDS.missingTitle,
  "beforeAfter": {
    "ar": "قبل وبعد",
    "en": "Before and after"
  },
  "before": {
    "ar": "قبل",
    "en": "Before"
  },
  "after": {
    "ar": "بعد",
    "en": "After"
  },
  "quote": {
    "ar": "اقتباس",
    "en": "Quote"
  },
  "comments": {
    "ar": "رسائل وردود",
    "en": "Letters and replies"
  },
  "commentTitle": {
    "ar": "اكتب الكلمة في التعليقات",
    "en": "Write the word in comments"
  },
  "readers": {
    "ar": "بريد القراء",
    "en": "Readers’ mail"
  },
  "contributors": {
    "ar": "المساهمون",
    "en": "Contributors"
  },
  "contributorPage": {
    "ar": "صفحة المساهم",
    "en": "Contributor page"
  },
  "follow": SHARED_STYLE_WORDS.followWord,
  "followed": SHARED_STYLE_WORDS.followingWord,
  "judgment": {
    "ar": "الحكم",
    "en": "Verdict"
  }
} as const;
export const MAGAZINE_COPY={...MAGAZINE_BASE_COPY,...KINETIC_COPY,...SCREENS_COPY,...CONCEPT_PARTS_COPY,...CONCEPT_OWN_COPY,...CONCEPT_MORE_COPY} as const;
export const magazineCopy=(key:keyof typeof MAGAZINE_COPY,copy:Pick<SceneCopy,'ar'>):string=>MAGAZINE_COPY[key][copy.ar?'ar':'en'];
