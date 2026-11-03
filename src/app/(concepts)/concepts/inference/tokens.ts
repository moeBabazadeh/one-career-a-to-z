// A toy tokenizer for the streamed tagline and the Inference box. The pre-tokenizer is GPT-2's
// pattern, where a leading space sticks to the word after it. Long words are then split at a
// common suffix or in half, roughly as BPE splits a rare word. Ids are an FNV-1a hash into a
// GPT-2 sized vocabulary (50,257), so they're stable but not real.

const PATTERN = new RegExp(
  "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+",
  'gu',
);
const SUFFIXES = ['ation', 'ment', 'ing', 'ness', 'able', 'ally', 'ed', 'er', 'ly', 'es'];

export const pretokenize = (text: string) => text.match(PATTERN) ?? [];

function split(word: string): string[] {
  const core = word.trimStart();
  if (core.length <= 7) return [word];
  const lead = word.slice(0, word.length - core.length);
  const suffix = SUFFIXES.find((x) => core.endsWith(x) && core.length - x.length >= 4);
  if (suffix) return [...split(lead + core.slice(0, -suffix.length)), suffix];
  const mid = Math.ceil(core.length / 2);
  return [lead + core.slice(0, mid), core.slice(mid)];
}

export const tokenize = (text: string) => pretokenize(text).flatMap(split);

export function tokenId(token: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 50257;
}
