import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

// Facts live in src/content/db.ts and nowhere else. These patterns catch a fact typed straight
// into a concept's or a content file's text (dates, counts, figures, names), so every page reads
// it from the source and a change happens in one place. esquery regexes can't contain "/".
const FACTS = [
  // A month and a year: "Sep 2026", "June 2024".
  String.raw`\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec) (19|20)\d\d\b`,
  // A lower bound: "200+", "0.5B+", "11.8k+".
  String.raw`\b\d[\d.,]*[kKMB]?\+`,
  // Counts and figures.
  String.raw`\b(4,700|11\.8k|11,800|30[03]k|163k|82k|31k|22k|5\.4k|56k|51k|10,000 classes|1708\.08008)\b|half a billion|3 million|16 months`,
  // Names, places and lines that belong to the source.
  String.raw`IranOpen|Nanoelectronics|Deminer|University of Tabriz|Niknam Electronic Rayan|alignment layer for construction|moe@babazadeh\.dev|linkedin\.com|github\.com.moeBabazadeh|\bCTO (at|since|from|in)\b|\bsince 2007\b|\b(19|nineteen) (years|yrs|seasons)\b|full-stack and embedded engineer`,
];

const factSelectors = FACTS.flatMap((re) => [
  `Literal[value=/${re}/i]`,
  `TemplateElement[value.raw=/${re}/i]`,
  `JSXText[value=/${re}/i]`,
]).map((selector) => ({
  selector,
  message:
    'This looks like a fact. Read it from src/content/db.ts (via db or fmt) instead of typing it here.',
}));

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/app/**/concepts/**/*.{ts,tsx}', 'src/content/**/*.{ts,tsx}'],
    ignores: ['src/content/db.ts', 'src/content/format.ts'],
    rules: { 'no-restricted-syntax': ['error', ...factSelectors] },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
