// Syntax highlighting for the editor. A forgiving scanner, separate from the kernel's lexer, so a
// half-typed line still colours sensibly: keywords, builtins, strings (with f-string fields
// highlighted as code), numbers, comments and magics. Returns tokens split into lines.
import { keywords } from './lang/parser';

export interface Tok {
  text: string;
  cls?: string;
}

const KW = new Set(keywords.filter((k) => !['True', 'False', 'None'].includes(k)));
const CONST = new Set(['True', 'False', 'None']);
const OPS = /^(\*\*=?|\/\/=?|[=!<>]=|->|[-+*/%@&|^~<>=]=?)/;

function scan(src: string, builtins: Set<string>): Tok[] {
  const out: Tok[] = [];
  const push = (text: string, cls?: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.text += text;
    else out.push({ text, cls });
  };
  let i = 0;
  let lastWord = '';
  let lineStart = true;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      push('\n');
      i++;
      lineStart = true;
      continue;
    }
    if (lineStart && /[ \t]/.test(c)) {
      const ws = /^[ \t]+/.exec(src.slice(i))![0];
      push(ws);
      i += ws.length;
      continue;
    }
    if (lineStart && c === '%') {
      const end = src.indexOf('\n', i);
      const text = src.slice(i, end < 0 ? undefined : end);
      push(text, 'magic');
      i += text.length;
      lineStart = false;
      continue;
    }
    lineStart = false;
    if (c === '#') {
      const end = src.indexOf('\n', i);
      const text = src.slice(i, end < 0 ? undefined : end);
      push(text, 'com');
      i += text.length;
      continue;
    }
    const str = /^([rRfFbBuU]{0,2})('''|"""|'|")/.exec(src.slice(i));
    if (str && (str[1] === '' || /^[rRfFbBuU]{1,2}$/.test(str[1]))) {
      const prefix = str[1].toLowerCase();
      const quote = str[2];
      const triple = quote.length === 3;
      let j = i + str[0].length;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (!triple && src[j] === '\n') break;
        if (src.startsWith(quote, j)) {
          j += quote.length;
          break;
        }
        j++;
      }
      const text = src.slice(i, Math.min(j, src.length));
      if (prefix.includes('f')) fstring(text, builtins, push);
      else push(text, 'str');
      i += text.length;
      lastWord = '';
      continue;
    }
    const num = /^(0[xXoObB][\da-fA-F_]+|(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)([eE][-+]?\d+)?j?)/.exec(
      src.slice(i),
    );
    if (num && /[\d.]/.test(c) && (c !== '.' || /\d/.test(src[i + 1] ?? ''))) {
      push(num[0], 'num');
      i += num[0].length;
      continue;
    }
    const word = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i));
    if (word) {
      const w = word[0];
      const prev = lastWord;
      lastWord = w;
      const next = src.slice(i + w.length).match(/^\s*(\S)/)?.[1];
      if (prev === 'def') push(w, 'def');
      else if (KW.has(w)) push(w, 'kw');
      else if (CONST.has(w)) push(w, 'const');
      else if (builtins.has(w) && src[i - 1] !== '.') push(w, 'bi');
      else if (next === '(') push(w, 'call');
      else push(w);
      i += w.length;
      continue;
    }
    const op = OPS.exec(src.slice(i));
    if (op) {
      push(op[0], 'op');
      i += op[0].length;
      lastWord = '';
      continue;
    }
    push(c, /[()[\]{},:;.]/.test(c) ? 'punct' : undefined);
    i++;
  }
  return out;
}

/** An f-string: the literal parts as a string, the `{fields}` as code. */
function fstring(text: string, builtins: Set<string>, push: (t: string, cls?: string) => void) {
  let i = 0;
  let buf = '';
  while (i < text.length) {
    const c = text[i];
    if ((c === '{' || c === '}') && text[i + 1] === c) {
      buf += c + c;
      i += 2;
      continue;
    }
    if (c === '{') {
      push(buf, 'str');
      buf = '';
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        if (depth) j++;
      }
      push('{', 'fbrace');
      const inner = text.slice(i + 1, j);
      const spec = inner.search(/[:!](?![=])/);
      const expr = spec >= 0 ? inner.slice(0, spec) : inner;
      for (const t of scan(expr, builtins)) push(t.text, t.cls);
      if (spec >= 0) push(inner.slice(spec), 'fspec');
      if (j < text.length) push('}', 'fbrace');
      i = j + 1;
      continue;
    }
    buf += c;
    i++;
  }
  push(buf, 'str');
}

function lines(toks: Tok[]): Tok[][] {
  const out: Tok[][] = [[]];
  for (const t of toks) {
    const parts = t.text.split('\n');
    parts.forEach((p, k) => {
      if (k > 0) out.push([]);
      if (p) out[out.length - 1].push({ text: p, cls: t.cls });
    });
  }
  return out;
}

export const highlightPython = (src: string, builtins: Set<string>) => lines(scan(src, builtins));

/** Markdown in the editor: headings, emphasis, code and links stand out. */
export function highlightMarkdown(src: string): Tok[][] {
  let fenced = false;
  return src.split('\n').map((line) => {
    if (/^```/.test(line)) {
      fenced = !fenced;
      return [{ text: line, cls: 'mdcode' }];
    }
    if (fenced) return [{ text: line, cls: 'mdcode' }];
    const h = /^(#{1,6}\s)(.*)$/.exec(line);
    if (h)
      return [
        { text: h[1], cls: 'mdmark' },
        { text: h[2], cls: 'mdh' },
      ];
    const toks: Tok[] = [];
    const re =
      /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]*\]\([^)]*\))|(<\/?kbd>)|(^\s*(?:[-*+]|\d+[.)])\s)/g;
    let last = 0;
    for (let m = re.exec(line); m; m = re.exec(line)) {
      if (m.index > last) toks.push({ text: line.slice(last, m.index) });
      const cls = m[1] ? 'mdcode' : m[2] ? 'mdb' : m[3] ? 'mdlink' : 'mdmark';
      toks.push({ text: m[0], cls });
      last = m.index + m[0].length;
    }
    if (last < line.length) toks.push({ text: line.slice(last) });
    return toks;
  });
}
