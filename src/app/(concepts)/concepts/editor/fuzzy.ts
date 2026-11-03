// Fuzzy matching for Quick Open, the command palette and Go to Symbol: the fzy scoring algorithm.
// A query matches when its characters appear in order; the score rewards matches at the start of
// words and path segments and runs of consecutive characters, and the positions come back so the
// list can highlight them.

const SCORE_MIN = -Infinity;
const GAP_LEADING = -0.005;
const GAP_TRAILING = -0.005;
const GAP_INNER = -0.01;
const MATCH_CONSECUTIVE = 1.0;
const MATCH_SLASH = 0.9;
const MATCH_WORD = 0.8;
const MATCH_CAPITAL = 0.7;
const MATCH_DOT = 0.6;

function bonuses(target: string) {
  const out = new Array<number>(target.length);
  let prev = '/';
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (prev === '/') out[i] = MATCH_SLASH;
    else if (prev === '-' || prev === '_' || prev === ' ' || prev === ':' || prev === '(')
      out[i] = MATCH_WORD;
    else if (prev === '.') out[i] = MATCH_DOT;
    else if (/[a-z]/.test(prev) && /[A-Z]/.test(ch)) out[i] = MATCH_CAPITAL;
    else out[i] = 0;
    prev = ch;
  }
  return out;
}

export interface Match {
  score: number;
  /** Matched positions in the target. */
  hits: number[];
}

export function fuzzy(query: string, target: string): Match | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  const t = target.toLowerCase();
  const n = q.length;
  const m = t.length;
  if (!n) return { score: 0, hits: [] };
  if (n > m) return null;
  // Quick reject: every character in order.
  let at = 0;
  for (const ch of q) {
    at = t.indexOf(ch, at);
    if (at < 0) return null;
    at++;
  }
  if (n === m) return { score: Infinity, hits: Array.from({ length: n }, (_, i) => i) };

  const bonus = bonuses(target);
  const D: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(SCORE_MIN));
  const M: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(SCORE_MIN));
  for (let i = 0; i < n; i++) {
    let prev = SCORE_MIN;
    const gap = i === n - 1 ? GAP_TRAILING : GAP_INNER;
    for (let j = 0; j < m; j++) {
      if (q[i] === t[j]) {
        let score = SCORE_MIN;
        if (i === 0) score = j * GAP_LEADING + bonus[j];
        else if (j > 0)
          score = Math.max(M[i - 1][j - 1] + bonus[j], D[i - 1][j - 1] + MATCH_CONSECUTIVE);
        D[i][j] = score;
        M[i][j] = prev = Math.max(score, prev + gap);
      } else {
        D[i][j] = SCORE_MIN;
        M[i][j] = prev = prev + gap;
      }
    }
  }
  // Walk back for the positions.
  const hits = new Array<number>(n);
  let matchRequired = false;
  for (let i = n - 1, j = m - 1; i >= 0; i--) {
    for (; j >= 0; j--) {
      if (D[i][j] !== SCORE_MIN && (matchRequired || D[i][j] === M[i][j])) {
        matchRequired = i > 0 && j > 0 && M[i][j] === D[i - 1][j - 1] + MATCH_CONSECUTIVE;
        hits[i] = j--;
        break;
      }
    }
  }
  return { score: M[n - 1][m - 1], hits };
}

/** Matches a path, preferring hits in the file name, and splits the hits between name and folder. */
export function fuzzyPath(
  query: string,
  path: string,
): { score: number; name: number[]; dir: number[] } | null {
  const slash = path.lastIndexOf('/');
  const name = path.slice(slash + 1);
  const inName = fuzzy(query, name);
  if (inName) return { score: inName.score + 2, name: inName.hits, dir: [] };
  const inPath = fuzzy(query, path);
  if (!inPath) return null;
  return {
    score: inPath.score,
    name: inPath.hits.filter((h) => h > slash).map((h) => h - slash - 1),
    dir: inPath.hits.filter((h) => h < slash),
  };
}
