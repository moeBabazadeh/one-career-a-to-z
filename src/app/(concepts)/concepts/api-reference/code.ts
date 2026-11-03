// Code samples in five languages, a JSON printer and a small syntax highlighter for the code panels.
import { BASE, type Json } from './model';

export type Lang = 'curl' | 'javascript' | 'python' | 'go' | 'swift';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'curl', label: 'curl' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'swift', label: 'Swift' },
];

export interface Sample {
  method: string;
  target: string;
  version: string;
  body?: Record<string, string>;
  key?: string;
}

/* ------------------------------------------------------------------ samples */

function split(target: string) {
  const url = new URL(target, BASE);
  return { url: `${BASE}${decodeURIComponent(url.pathname)}`, query: [...url.searchParams] };
}

const isArray = (name: string) => name.endsWith('[]');
const isNumber = (value: string) => /^\d+$/.test(value);
const shellQuote = (text: string) =>
  /^[\w.:/=-]+$/.test(text) ? text : `"${text.replace(/(["\\$`])/g, '\\$1')}"`;
const jsString = (text: string) =>
  `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const bodyOf = (sample: Sample) => Object.entries(sample.body ?? {}).filter(([, v]) => v !== '');

function headersOf(sample: Sample): [string, string][] {
  const headers: [string, string][] = [['Api-Version', sample.version]];
  if (sample.method === 'POST') headers.push(['Content-Type', 'application/json']);
  if (sample.key) headers.push(['Idempotency-Key', sample.key]);
  return headers;
}

export function curl(sample: Sample) {
  const { url, query } = split(sample.target);
  const lines: string[] = [];
  if (sample.method === 'GET' && query.length) lines.push(`curl -G ${url}`);
  else
    lines.push(
      sample.method === 'GET' || sample.method === 'POST'
        ? `curl ${url}`
        : `curl -X ${sample.method} ${url}`,
    );
  if (sample.method === 'GET')
    for (const [k, v] of query) lines.push(`  -d ${shellQuote(`${k}=${v}`)}`);
  for (const [k, v] of headersOf(sample)) lines.push(`  -H "${k}: ${v}"`);
  const body = bodyOf(sample);
  if (sample.method === 'POST') {
    const json = pretty(Object.fromEntries(body)).replace(/'/g, `'\\''`).replace(/\n/g, '\n  ');
    lines.push(`  -d '${json}'`);
  }
  return lines.join(' \\\n');
}

function javascript(sample: Sample) {
  const { url, query } = split(sample.target);
  const headers = headersOf(sample).map(([k, v]) => `'${k}': '${v}'`);
  if (sample.method === 'POST') {
    const body = bodyOf(sample).map(([k, v]) => `    ${k}: ${jsString(v)},`);
    return [
      `const res = await fetch('${url}', {`,
      `  method: 'POST',`,
      `  headers: {`,
      ...headers.map((h) => `    ${h},`),
      `  },`,
      `  body: JSON.stringify({`,
      ...body,
      `  }),`,
      `});`,
      `const message = await res.json();`,
    ].join('\n');
  }
  const lines = [`const url = new URL('${url}');`];
  for (const [k, v] of query)
    lines.push(`url.searchParams.${isArray(k) ? 'append' : 'set'}('${k}', '${v}');`);
  return [
    ...lines,
    '',
    `const res = await fetch(url, {`,
    `  headers: { ${headers.join(', ')} },`,
    `});`,
    `const data = await res.json();`,
  ].join('\n');
}

function python(sample: Sample) {
  const { url, query } = split(sample.target);
  const headers = `{${headersOf(sample)
    .map(([k, v]) => `"${k}": "${v}"`)
    .join(', ')}}`;
  if (sample.method === 'POST') {
    const body = bodyOf(sample).map(([k, v]) => `        "${k}": ${JSON.stringify(v)},`);
    return [
      'import requests',
      '',
      'res = requests.post(',
      `    "${url}",`,
      '    json={',
      ...body,
      '    },',
      `    headers=${headers},`,
      ')',
      'message = res.json()',
    ].join('\n');
  }
  const grouped = new Map<string, string[]>();
  for (const [k, v] of query) grouped.set(k, [...(grouped.get(k) ?? []), v]);
  const value = (k: string, values: string[]) =>
    isArray(k)
      ? `[${values.map((x) => `"${x}"`).join(', ')}]`
      : isNumber(values[0])
        ? values[0]
        : `"${values[0]}"`;
  const params = [...grouped].map(([k, values]) => `"${k}": ${value(k, values)}`);
  const inline = `    params={${params.join(', ')}},`;
  const block =
    inline.length > 60
      ? ['    params={', ...params.map((p) => `        ${p},`), '    },']
      : [inline];
  return [
    'import requests',
    '',
    'res = requests.get(',
    `    "${url}",`,
    ...(params.length ? block : []),
    `    headers=${headers},`,
    ')',
    'data = res.json()',
  ].join('\n');
}

function go(sample: Sample) {
  const { url, query } = split(sample.target);
  const set = headersOf(sample).map(([k, v]) => `req.Header.Set("${k}", "${v}")`);
  const tail = [
    '',
    'res, err := http.DefaultClient.Do(req)',
    'if err != nil {',
    '\tlog.Fatal(err)',
    '}',
    'defer res.Body.Close()',
  ];
  if (sample.method === 'POST') {
    const body = bodyOf(sample);
    const width = Math.max(0, ...body.map(([k]) => k.length + 3));
    return [
      'body, _ := json.Marshal(map[string]string{',
      ...body.map(([k, v]) => `\t${`"${k}":`.padEnd(width)} ${JSON.stringify(v)},`),
      '})',
      '',
      `req, _ := http.NewRequest("POST", "${url}", bytes.NewReader(body))`,
      ...set,
      ...tail,
    ].join('\n');
  }
  if (!query.length)
    return [`req, _ := http.NewRequest("${sample.method}", "${url}", nil)`, ...set, ...tail].join(
      '\n',
    );
  return [
    'q := url.Values{}',
    ...query.map(([k, v]) => `q.${isArray(k) ? 'Add' : 'Set'}("${k}", "${v}")`),
    '',
    `req, _ := http.NewRequest("${sample.method}", "${url}?"+q.Encode(), nil)`,
    ...set,
    ...tail,
  ].join('\n');
}

function swift(sample: Sample) {
  const { url, query } = split(sample.target);
  const set = headersOf(sample).map(
    ([k, v]) => `request.setValue("${v}", forHTTPHeaderField: "${k}")`,
  );
  const tail = ['', 'let (data, _) = try await URLSession.shared.data(for: request)'];
  if (sample.method === 'POST') {
    const body = bodyOf(sample).map(([k, v]) => `    "${k}": ${JSON.stringify(v)},`);
    return [
      `var request = URLRequest(url: URL(string: "${url}")!)`,
      'request.httpMethod = "POST"',
      ...set,
      'request.httpBody = try JSONSerialization.data(withJSONObject: [',
      ...body,
      '])',
      ...tail,
    ].join('\n');
  }
  if (!query.length)
    return [
      `var request = URLRequest(url: URL(string: "${url}")!)`,
      ...(sample.method !== 'GET' ? [`request.httpMethod = "${sample.method}"`] : []),
      ...set,
      ...tail,
    ].join('\n');
  return [
    `var components = URLComponents(string: "${url}")!`,
    'components.queryItems = [',
    ...query.map(([k, v]) => `    URLQueryItem(name: "${k}", value: "${v}"),`),
    ']',
    '',
    'var request = URLRequest(url: components.url!)',
    ...set,
    ...tail,
  ].join('\n');
}

export const SAMPLES: Record<Lang, (sample: Sample) => string> = {
  curl,
  javascript,
  python,
  go,
  swift,
};

/* ------------------------------------------------------------------ JSON */

/** JSON.stringify with two-space indents, but short arrays of scalars stay on one line. */
export function pretty(value: Json | undefined, indent = 0): string {
  const pad = '  '.repeat(indent + 1);
  const end = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const inline = `[${value.map((v) => pretty(v)).join(', ')}]`;
    if (value.every((v) => v === null || typeof v !== 'object') && inline.length + indent * 2 < 62)
      return inline;
    return `[\n${value.map((v) => pad + pretty(v, indent + 1)).join(',\n')}\n${end}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pretty(v, indent + 1)}`).join(',\n')}\n${end}}`;
  }
  return JSON.stringify(value ?? null);
}

/* ------------------------------------------------------------------ highlighter */

export type Kind = 'key' | 'str' | 'num' | 'lit' | 'kw' | 'fn' | 'type' | 'com' | 'pun' | 'flag';

export interface Token {
  text: string;
  kind?: Kind;
}

export interface Line {
  tokens: Token[];
  /** The first JSON key on the line, for hover sync. */
  key?: string;
  indent: number;
  length: number;
  text: string;
}

const KEYWORDS: Record<string, Set<string>> = {
  javascript: new Set([
    'const',
    'let',
    'await',
    'async',
    'new',
    'return',
    'do',
    'while',
    'for',
    'of',
    'if',
    'function',
  ]),
  python: new Set(['import', 'from', 'def', 'return', 'for', 'in', 'if', 'while', 'with', 'as']),
  go: new Set([
    'func',
    'var',
    'if',
    'defer',
    'return',
    'package',
    'import',
    'for',
    'range',
    'map',
    'string',
  ]),
  swift: new Set(['var', 'let', 'try', 'await', 'func', 'return', 'if', 'guard', 'import']),
  curl: new Set([]),
};
const LITERALS = new Set(['true', 'false', 'null', 'nil', 'None', 'True', 'False', 'undefined']);

const STRING = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`[^`]*`/;
const COMMENT: Record<string, RegExp> = {
  javascript: /\/\/[^\n]*/,
  go: /\/\/[^\n]*/,
  swift: /\/\/[^\n]*/,
  python: /#[^\n]*/,
};
const NEVER = /(?!)/;
const KINDS: (Kind | 'word' | undefined)[] = ['com', 'str', 'str', 'num', 'flag', 'word', 'pun'];

const patterns = new Map<string, RegExp>();
function pattern(lang: string) {
  let re = patterns.get(lang);
  if (!re) {
    const parts = [
      COMMENT[lang] ?? NEVER,
      STRING,
      /https?:\/\/[^\s'"`)]+/,
      /\b\d+(?:\.\d+)?\b/,
      lang === 'curl' ? /(?<![\w-])--?[A-Za-z][\w-]*/ : NEVER,
      /[A-Za-z_$][\w$]*/,
      /[^\s\w]/,
    ];
    re = new RegExp(parts.map((p) => `(${p.source})`).join('|'), 'g');
    patterns.set(lang, re);
  }
  return re;
}

function tokenizeCode(code: string, lang: string): Token[] {
  const tokens: Token[] = [];
  const re = pattern(lang);
  re.lastIndex = 0;
  let last = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m.index > last) tokens.push({ text: code.slice(last, m.index) });
    const group = m.slice(1).findIndex((g) => g !== undefined);
    let kind = KINDS[group];
    const text = m[0];
    if (kind === 'word') {
      const next = code.slice(m.index + text.length).match(/^\s*(.)/)?.[1];
      if (KEYWORDS[lang]?.has(text)) kind = 'kw';
      else if (LITERALS.has(text)) kind = 'lit';
      else if (next === '(' || (lang === 'curl' && text === 'curl')) kind = 'fn';
      else if (/^[A-Z]/.test(text) && lang !== 'curl') kind = 'type';
      else kind = undefined;
    }
    tokens.push({ text, kind: kind as Kind | undefined });
    last = m.index + text.length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last) });
  return tokens;
}

const JSON_TOKENS =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

function tokenizeJson(code: string): Token[] {
  const tokens: Token[] = [];
  JSON_TOKENS.lastIndex = 0;
  let last = 0;
  for (let m = JSON_TOKENS.exec(code); m; m = JSON_TOKENS.exec(code)) {
    if (m.index > last) tokens.push({ text: code.slice(last, m.index) });
    if (m[1] && m[2]) {
      tokens.push({ text: m[1], kind: 'key' }, { text: m[2], kind: 'pun' });
    } else if (m[1]) tokens.push({ text: m[1], kind: 'str' });
    else if (m[3]) tokens.push({ text: m[3], kind: 'num' });
    else if (m[4]) tokens.push({ text: m[4], kind: 'lit' });
    else tokens.push({ text: m[5], kind: 'pun' });
    last = m.index + m[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last) });
  return tokens;
}

/** Highlights code and splits it into lines, keeping each line's indent and first JSON key. */
export function highlight(code: string, lang: Lang | 'json'): Line[] {
  const tokens = lang === 'json' ? tokenizeJson(code) : tokenizeCode(code, lang);
  const lines: Line[] = [];
  let current: Token[] = [];
  const flush = () => {
    const text = current.map((t) => t.text).join('');
    const key = current.find((t) => t.kind === 'key')?.text.slice(1, -1);
    lines.push({
      tokens: current,
      key,
      indent: text.length - text.trimStart().length,
      length: text.length,
      text,
    });
    current = [];
  };
  for (const token of tokens) {
    const parts = token.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) flush();
      if (part) current.push({ text: part, kind: token.kind });
    });
  }
  flush();
  return lines;
}

/** Total characters, counting one per line break, for streaming. */
export const lengthOf = (lines: Line[]) => lines.reduce((sum, l) => sum + l.length + 1, 0);
