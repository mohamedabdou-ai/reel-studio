import { loadFont } from "@remotion/fonts";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import manifest from "../../public/fonts/manifest.json";















const RANGE_ARABIC =
  "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, " +
  "U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, " +
  "U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, " +
  "U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, " +
  "U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, " +
  "U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, " +
  "U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, " +
  "U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1";

const RANGE_LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, " +
  "U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, " +
  "U+FEFF, U+FFFD";


export const UNICODE_RANGE = { arabic: RANGE_ARABIC, latin: RANGE_LATIN } as const;









export const FAMILY = {

  cairo: "Cairo",

  tajawal: "Tajawal",

  plexMono: "IBM Plex Mono",

  plexDisplay: "Plex Display",

  naskh: "Noto Naskh Arabic",

  latinSerif: "Source Serif 4",
} as const;

export type FamilyName = (typeof FAMILY)[keyof typeof FAMILY];



type Subset = "arabic" | "latin" | "latin-ext" | "vietnamese";

type Face = {

  family: string;

  source: string;
  subset: Subset;

  file: number;

  css: string;
};





























const FACES: Face[] = [


  { family: FAMILY.cairo, source: "Cairo", subset: "arabic", file: 400, css: "200 1000" },
  { family: FAMILY.cairo, source: "Cairo", subset: "latin", file: 400, css: "200 1000" },


  { family: FAMILY.tajawal, source: "Tajawal", subset: "arabic", file: 400, css: "400" },
  { family: FAMILY.tajawal, source: "Tajawal", subset: "arabic", file: 700, css: "700" },
  { family: FAMILY.tajawal, source: "Tajawal", subset: "arabic", file: 800, css: "800" },
  { family: FAMILY.tajawal, source: "Tajawal", subset: "latin", file: 400, css: "400" },
  { family: FAMILY.tajawal, source: "Tajawal", subset: "latin", file: 700, css: "700" },
  { family: FAMILY.tajawal, source: "Tajawal", subset: "latin", file: 800, css: "800" },







  { family: FAMILY.plexMono, source: "IBM Plex Mono", subset: "latin", file: 400, css: "400" },
  { family: FAMILY.plexMono, source: "IBM Plex Mono", subset: "latin", file: 600, css: "600" },


  { family: FAMILY.plexDisplay, source: "IBM Plex Sans Arabic", subset: "latin", file: 700, css: "1 1000" },
  { family: FAMILY.plexDisplay, source: "IBM Plex Sans Arabic", subset: "arabic", file: 700, css: "1 1000" },



  ...([400, 700] as const).flatMap<Face>((file) => [
    { family: FAMILY.naskh, source: "Noto Naskh Arabic", subset: "arabic", file, css: String(file) },
    { family: FAMILY.naskh, source: "Noto Naskh Arabic", subset: "latin-ext", file, css: String(file) },
    { family: FAMILY.naskh, source: "Noto Naskh Arabic", subset: "latin", file, css: String(file) },
    { family: FAMILY.latinSerif, source: "Source Serif 4", subset: "vietnamese", file, css: String(file) },
    { family: FAMILY.latinSerif, source: "Source Serif 4", subset: "latin-ext", file, css: String(file) },
    { family: FAMILY.latinSerif, source: "Source Serif 4", subset: "latin", file, css: String(file) },
  ]),
];



type ManifestEntry = {
  family: string;
  file: string;
  subset: string;
  weight: number;
  style: string;
  bytes: number;
  unicodeRange?: string;
};

const ENTRIES = manifest as ManifestEntry[];







const fileFor = (f: Face): ManifestEntry => {
  const hit = ENTRIES.find(
    (e) => e.family === f.source && e.subset === f.subset && e.weight === f.file && e.style === "normal",
  );
  if (!hit) {
    throw new Error(
      `core/fonts: engine/public/fonts/manifest.json has no ${f.source} ${f.subset} ${f.file}. ` +
        `Re-run \`node scripts/fetch-fonts.mjs\` (its DECLARED list must contain that family and weight).`,
    );
  }
  return hit;
};


const rangeFor = (f: Face, entry: ManifestEntry): string => {
  const legacyRange = f.subset === "arabic" || f.subset === "latin" ? UNICODE_RANGE[f.subset] : undefined;
  const range = entry.unicodeRange ?? legacyRange;
  if (!range) throw new Error(`core/fonts: ${f.source} ${f.subset} has no recorded unicode-range.`);
  return range;
};


export const REGISTERED = FACES.map((f) => {
  const entry = fileFor(f);
  return {
    family: f.family, subset: f.subset, weight: f.css, file: entry.file,
    bytes: entry.bytes, unicodeRange: rangeFor(f, entry),
  };
});


export const LOADED_FAMILIES: string[] = REGISTERED.reduce<string[]>((acc, r) => {
  if (acc.indexOf(r.family) === -1) acc.push(r.family);
  return acc;
}, []);












let ready = false;
let failure: unknown = null;

if (typeof document !== "undefined") {
  const handle = delayRender(`core/fonts: loading ${REGISTERED.length} faces (${LOADED_FAMILIES.join(", ")})`);
  Promise.all(
    FACES.map((f) => {
      const entry = fileFor(f);
      return loadFont({
        family: f.family,
        url: staticFile(`fonts/${entry.file}`),
        weight: f.css,
        style: "normal",
        unicodeRange: rangeFor(f, entry),
        format: "woff2",



        display: "block",
      });
    }),
  )
    .then(() => {





      const missing = missingFamilies();
      if (missing.length > 0) {
        throw new Error(
          `core/fonts: ${missing.join(", ")} did not register. Check engine/public/fonts ` +
            `against manifest.json and re-run \`node scripts/fetch-fonts.mjs\`.`,
        );
      }
      ready = true;
      continueRender(handle);
    })
    .catch((err) => {
      failure = err;
      cancelRender(err);
    });
}










const bareFamily = (name: string): string => name.replace(/^['"]|['"]$/g, "");


export const missingFamilies = (): string[] => {
  if (typeof document === "undefined") return LOADED_FAMILIES.slice();
  const present: string[] = [];
  document.fonts.forEach((face) => {
    const name = bareFamily(face.family);
    if (face.status === "loaded" && present.indexOf(name) === -1) present.push(name);
  });
  return LOADED_FAMILIES.filter((f) => present.indexOf(f) === -1);
};









export const fontsReady = (): boolean => ready && missingFamilies().length === 0;


export const familyReady = (family: string): boolean => missingFamilies().indexOf(family) === -1;










export const assertFontsReady = (): void => {
  if (typeof document === "undefined") {
    throw new Error("core/fonts: assertFontsReady() needs a browser — fonts only load inside the render page.");
  }
  if (failure) throw failure;
  const missing = missingFamilies();
  if (missing.length > 0) {
    throw new Error(
      `core/fonts: not ready — ${missing.join(", ")} missing. ` +
        `Every measurement taken now would be against the fallback face (see core/type.ts:36-45).`,
    );
  }
};
