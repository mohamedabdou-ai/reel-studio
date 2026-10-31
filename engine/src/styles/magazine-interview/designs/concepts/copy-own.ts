/** Local keys are spread into MAGAZINE_COPY by the integration lane. */
export const CONCEPT_OWN_COPY = {
  "branchingTitle": {
    "ar": "شرط واحد، مسار واحد",
    "en": "One condition. One route."
  },
  "branchingYes": {
    "ar": "نعم",
    "en": "Yes"
  },
  "branchingNo": {
    "ar": "لا",
    "en": "No"
  },
  "branchingTrue": {
    "ar": "نعم",
    "en": "true"
  },
  "branchingFalse": {
    "ar": "لا",
    "en": "false"
  },
  "branchingEvaluating": {
    "ar": "تقييم الشرط",
    "en": "Evaluate condition"
  },
  "branchingMatched": {
    "ar": "الشرط متحقق",
    "en": "Condition matched"
  },
  "branchingUnmatched": {
    "ar": "الشرط غير متحقق",
    "en": "Condition not matched"
  },
  "dockedSeparator": {
    "ar": " · ",
    "en": " · "
  },
  "dockedEllipsis": {
    "ar": "…",
    "en": "…"
  }
} as const;

export const branchingCopy = (rtl: boolean) => {
  const lang = rtl ? 'ar' : 'en';
  return {
    title: CONCEPT_OWN_COPY.branchingTitle[lang],
    yes: CONCEPT_OWN_COPY.branchingYes[lang],
    no: CONCEPT_OWN_COPY.branchingNo[lang],
    true: CONCEPT_OWN_COPY.branchingTrue[lang],
    false: CONCEPT_OWN_COPY.branchingFalse[lang],
    evaluating: CONCEPT_OWN_COPY.branchingEvaluating[lang],
    matched: CONCEPT_OWN_COPY.branchingMatched[lang],
    unmatched: CONCEPT_OWN_COPY.branchingUnmatched[lang],
  };
};
export const DOCK_COPY = {separator: CONCEPT_OWN_COPY.dockedSeparator.en, ellipsis: CONCEPT_OWN_COPY.dockedEllipsis.en};
