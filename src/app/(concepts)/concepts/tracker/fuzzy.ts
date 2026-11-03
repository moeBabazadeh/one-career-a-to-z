// Fuzzy matching for the command bar and pickers: the query's letters in order, scored higher
// for runs, word starts and an exact substring, lower for long targets. Returns the matched
// positions so the list can underline them.

export interface Match {
  score: number;
  hits: number[];
}

const BOUNDARY = /[\s\-_/·:.,(#]/;

export function fuzzy(query: string, text: string): Match | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, hits: [] };
  const t = text.toLowerCase();

  // A substring is the best kind of match; at a word start, better still.
  const sub = t.indexOf(q);
  if (sub >= 0) {
    const atStart = sub === 0 || BOUNDARY.test(t[sub - 1]);
    return {
      score: 100 + (atStart ? 40 : 0) + (sub === 0 ? 20 : 0) - t.length * 0.05,
      hits: Array.from({ length: q.length }, (_, k) => sub + k),
    };
  }

  // Otherwise every letter in order: extend a run when the next letter follows on, else take
  // the next word start with that letter, else its next occurrence.
  const hits: number[] = [];
  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    let at = prev >= 0 && t[prev + 1] === ch ? prev + 1 : -1;
    if (at < 0) {
      let first = -1;
      for (let i = from; i < t.length; i++) {
        if (t[i] !== ch) continue;
        if (first < 0) first = i;
        if (i === 0 || BOUNDARY.test(t[i - 1])) {
          at = i;
          break;
        }
      }
      if (at < 0) at = first;
    }
    if (at < 0) return null;
    let bonus = 1;
    if (at === prev + 1) bonus += 5;
    if (at === 0 || BOUNDARY.test(t[at - 1])) bonus += 8;
    score += bonus;
    hits.push(at);
    prev = at;
    from = at + 1;
  }
  // Letters scattered across a long title are noise, not a match: allow a few runs at most.
  const pieces = hits.filter((h, i) => i === 0 || h !== hits[i - 1] + 1).length;
  if (pieces > Math.max(2, Math.ceil(q.replace(/\s/g, '').length / 3))) return null;
  return { score: score - t.length * 0.05 - pieces * 2, hits };
}

/** Splits text into plain and matched runs, for drawing. */
export function runs(text: string, hits: number[]): { text: string; hit: boolean }[] {
  if (!hits.length) return [{ text, hit: false }];
  const set = new Set(hits);
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else out.push({ text: text[i], hit });
  }
  return out;
}
