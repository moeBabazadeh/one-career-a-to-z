// A small CommonMark-flavoured Markdown renderer for the preview and the reading page: front
// matter (shown as a table, the way the preview's front matter option does), headings with
// GitHub-style anchors, paragraphs, lists, block quotes, tables, fenced code highlighted by the
// editor's own tokenizer, rules, images and links. Every block keeps its source line, so the
// preview can follow the editor and jump back to the source.

import Image from 'next/image';
import { Fragment, type MouseEvent, type ReactNode } from 'react';
import { db } from '../_shared/data';
import { slugify, tokenize, type Lang } from './syntax';
import { frontMatter, yamlText } from './yaml';
import s from './editor.module.scss';

type Align = 'left' | 'right' | 'center' | null;

type Block =
  | { t: 'fm'; line: number; rows: [string, string][] }
  | { t: 'h'; line: number; level: number; text: string }
  | { t: 'p'; line: number; text: string }
  | { t: 'code'; line: number; lang: string; text: string }
  | { t: 'quote'; line: number; children: Block[] }
  | {
      t: 'list';
      line: number;
      ordered: boolean;
      start: number;
      items: { line: number; children: Block[] }[];
    }
  | { t: 'table'; line: number; align: Align[]; head: string[]; rows: string[][] }
  | { t: 'hr'; line: number };

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST = /^(\s{0,3})([-*+]|(\d{1,9})[.)])(\s+|$)/;
const TABLE_SEP = /^\s*\|?(\s*:?-+:?\s*\|)+\s*(:?-+:?\s*)?$/;

const startsBlock = (line: string) =>
  FENCE.test(line) ||
  HEADING.test(line) ||
  HR.test(line) ||
  /^\s{0,3}>/.test(line) ||
  LIST.test(line) ||
  line.trimStart().startsWith('<!--');

function cells(line: string) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (trimmed[i] === '|') {
      out.push(cur.trim());
      cur = '';
    } else cur += trimmed[i];
  }
  out.push(cur.trim());
  return out;
}

function parseBlocks(lines: string[], offset: number): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const n = offset + i;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith('<!--')) {
      while (i < lines.length && !lines[i].includes('-->')) i++;
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (
        i < lines.length &&
        !(lines[i].trim().startsWith(fence[2]) && /^\s*[`~]+\s*$/.test(lines[i]))
      )
        body.push(lines[i++]);
      i++;
      blocks.push({ t: 'code', line: n, lang: fence[3], text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ t: 'h', line: n, level: heading[1].length, text: heading[2] ?? '' });
      i++;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ t: 'hr', line: n });
      i++;
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      const inner: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        (/^\s{0,3}>/.test(lines[i]) || !startsBlock(lines[i]))
      )
        inner.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      blocks.push({ t: 'quote', line: n, children: parseBlocks(inner, n) });
      continue;
    }
    const list = LIST.exec(line);
    if (list) {
      const ordered = !!list[3];
      const items: { line: number; children: Block[] }[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (!m || !!m[3] !== ordered) break;
        const indent = m[0].length;
        const body = [lines[i].slice(indent)];
        const at = offset + i;
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (!next.trim()) {
            // A blank line continues the item only if indented content follows.
            if (
              i + 1 < lines.length &&
              /^\s{2,}\S/.test(lines[i + 1]) &&
              !LIST.exec(lines[i + 1])
            ) {
              body.push('');
              i++;
              continue;
            }
            break;
          }
          if (LIST.exec(next) && next.search(/\S/) < indent) break;
          if (next.search(/\S/) < 2 && startsBlock(next)) break;
          body.push(next.replace(new RegExp(`^\\s{0,${indent}}`), ''));
          i++;
        }
        items.push({ line: at, children: parseBlocks(body, at) });
        while (i < lines.length && !lines[i].trim() && LIST.exec(lines[i + 1] ?? '')) i++;
      }
      blocks.push({ t: 'list', line: n, ordered, start: ordered ? Number(list[3]) : 1, items });
      continue;
    }
    if (line.includes('|') && TABLE_SEP.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const align: Align[] = cells(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':')
          ? 'center'
          : c.endsWith(':')
            ? 'right'
            : c.startsWith(':')
              ? 'left'
              : null,
      );
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|'))
        rows.push(cells(lines[i++]));
      blocks.push({ t: 'table', line: n, align, head, rows });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      (!para.length || !startsBlock(lines[i])) &&
      !(lines[i].includes('|') && TABLE_SEP.test(lines[i + 1] ?? ''))
    )
      para.push(lines[i++]);
    blocks.push({ t: 'p', line: n, text: para.join('\n') });
  }
  return blocks;
}

export function parseMarkdown(text: string): Block[] {
  const lines = text.split('\n');
  const fm = frontMatter(text);
  if (fm && fm.close > 0) {
    const rows = Object.entries(fm.data).map(([k, v]) => [k, yamlText(v)] as [string, string]);
    return [{ t: 'fm', line: 0, rows }, ...parseBlocks(lines.slice(fm.close + 1), fm.close + 1)];
  }
  return parseBlocks(lines, 0);
}

/* ------------------------------------------------------------------ inline */

export interface LinkTarget {
  href: string;
  /** For links inside the repository: the file (or folder) and anchor they point at. */
  path?: string;
  anchor?: string;
}

export interface MdOptions {
  /** The folder of the file being shown, to resolve relative links. */
  dir: string;
  /** Called for links into the repository; return false to let the browser follow it. */
  onLink?: (target: LinkTarget, e: MouseEvent) => void;
  /** Rewrites a link into the repository, e.g. into an anchor on the reading page. */
  rewrite?: (target: LinkTarget) => string | null;
  /** Adds the source line to each block for scroll sync. */
  lines?: boolean;
}

export function resolve(dir: string, href: string): LinkTarget {
  if (/^[a-z]+:/i.test(href) || href.startsWith('//')) return { href };
  if (href.startsWith('/')) return { href };
  const [rawPath, anchor] = href.split('#');
  if (!rawPath) return { href, anchor };
  const parts = (dir ? dir.split('/') : []).concat(rawPath.split('/'));
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return { href, path: out.join('/'), anchor };
}

const INLINE =
  /(`+)([\s\S]*?[^`])\1(?!`)|!\[([^\]]*)\]\(([^)\s]*)(?:\s+"([^"]*)")?\)|\[((?:[^\]\\]|\\.|!\[[^\]]*\]\([^)]*\))*)\]\(([^)\s]*)(?:\s+"([^"]*)")?\)|<((?:https?:\/\/|mailto:)[^>\s]+)>|(\*\*|__)(.+?)\10|(\*|_)(?=\S)(.+?)(?<=\S)\12(?![\w*])|((?:https?:\/\/)[^\s<>)\]]+[^\s<>)\].,;:])|\\([\\`*_{}[\]()#+\-.!|>])/g;

const PHOTO = db.person.photo;

function external(href: string) {
  return /^(https?:)?\/\//.test(href) || href.startsWith('/');
}

function A({ href, children, o }: { href: string; children: ReactNode; o: MdOptions }) {
  const target = resolve(o.dir, href);
  const rewritten = target.path !== undefined || target.anchor ? o.rewrite?.(target) : null;
  if (rewritten) return <a href={rewritten}>{children}</a>;
  if (href.startsWith('mailto:')) return <a href={href}>{children}</a>;
  if (external(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={href}>
        {children}
      </a>
    );
  }
  return (
    <a
      href={`#${target.anchor ?? ''}`}
      data-path={target.path || undefined}
      title={target.path ? `Open ${target.path}` : undefined}
      onClick={(e) => {
        if (!o.onLink) return;
        e.preventDefault();
        o.onLink(target, e);
      }}
    >
      {children}
    </a>
  );
}

export function inline(text: string, o: MdOptions, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  const re = new RegExp(INLINE.source, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const id = `${key}${k++}`;
    if (m[1]) out.push(<code key={id}>{m[2].replace(/^ (.*) $/, '$1')}</code>);
    else if (m[4] !== undefined) {
      const src = m[4];
      const photo = src === PHOTO;
      out.push(
        <Image
          key={id}
          src={src}
          alt={m[3]}
          title={m[5]}
          width={photo ? 600 : 1280}
          height={photo ? 600 : 800}
          className={photo ? s.mdAvatar : s.mdImage}
          unoptimized
        />,
      );
    } else if (m[7] !== undefined) {
      out.push(
        <A key={id} href={m[7]} o={o}>
          {inline(m[6], o, id)}
        </A>,
      );
    } else if (m[9]) {
      out.push(
        <A key={id} href={m[9]} o={o}>
          {m[9].replace(/^mailto:/, '')}
        </A>,
      );
    } else if (m[11]) out.push(<strong key={id}>{inline(m[11], o, id)}</strong>);
    else if (m[13]) out.push(<em key={id}>{inline(m[13], o, id)}</em>);
    else if (m[14]) {
      out.push(
        <A key={id} href={m[14]} o={o}>
          {m[14]}
        </A>,
      );
    } else if (m[15]) out.push(m[15]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  // Soft line breaks read as spaces; two trailing spaces force a break.
  const flat: ReactNode[] = [];
  out.forEach((node, i) => {
    if (typeof node !== 'string') {
      flat.push(node);
      return;
    }
    const parts = node.split(/ {2,}\n|\\\n/);
    parts.forEach((part, j) => {
      if (part) flat.push(part.replace(/\n/g, ' '));
      if (j < parts.length - 1) flat.push(<br key={`${key}br${i}-${j}`} />);
    });
  });
  return flat;
}

/* ------------------------------------------------------------------ blocks */

const FENCE_LANG: Record<string, Lang> = {
  ts: 'typescript',
  typescript: 'typescript',
  js: 'typescript',
  json: 'json',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  console: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
};

export function Highlighted({ text, lang }: { text: string; lang: Lang }) {
  const lines = text.split('\n');
  const tokens = tokenize(text, lang);
  return (
    <>
      {lines.map((line, n) => {
        const parts: ReactNode[] = [];
        let at = 0;
        tokens[n].forEach((t, j) => {
          if (t.start > at) parts.push(line.slice(at, t.start));
          parts.push(
            <span key={j} className={s[`tk_${t.kind}`]}>
              {line.slice(t.start, t.end)}
            </span>,
          );
          at = t.end;
        });
        if (at < line.length) parts.push(line.slice(at));
        return (
          <Fragment key={n}>
            {parts}
            {n < lines.length - 1 ? '\n' : ''}
          </Fragment>
        );
      })}
    </>
  );
}

function render(blocks: Block[], o: MdOptions, ids: Map<string, number>, key: string): ReactNode[] {
  return blocks.map((b, i) => {
    const k = `${key}-${i}`;
    const line = o.lines ? { 'data-line': b.line } : {};
    switch (b.t) {
      case 'fm':
        return (
          <table key={k} className={s.mdFrontMatter} {...line}>
            <tbody>
              {b.rows.map(([name, value]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>
                    {/^https?:\/\//.test(value) ? (
                      <A href={value} o={o}>
                        {value}
                      </A>
                    ) : (
                      value
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'h': {
        const base = slugify(b.text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
        const seen = ids.get(base) ?? 0;
        ids.set(base, seen + 1);
        const id = seen ? `${base}-${seen}` : base;
        const Tag = `h${b.level}` as 'h1';
        return (
          <Tag key={k} id={o.lines ? undefined : id} data-anchor={id} {...line}>
            {inline(b.text, o, k)}
          </Tag>
        );
      }
      case 'p':
        return (
          <p key={k} {...line}>
            {inline(b.text, o, k)}
          </p>
        );
      case 'code': {
        const lang = FENCE_LANG[b.lang.toLowerCase()];
        return (
          <pre key={k} className={s.mdCode} data-lang={b.lang || undefined} {...line}>
            <code>{lang ? <Highlighted text={b.text} lang={lang} /> : b.text}</code>
          </pre>
        );
      }
      case 'quote':
        return (
          <blockquote key={k} {...line}>
            {render(b.children, o, ids, k)}
          </blockquote>
        );
      case 'list': {
        const items = b.items.map((item, j) => {
          // A list item of one paragraph renders tight, without the paragraph.
          const tight =
            item.children.length && item.children[0].t === 'p'
              ? [
                  inline((item.children[0] as { text: string }).text, o, `${k}-${j}`),
                  ...render(item.children.slice(1), o, ids, `${k}-${j}`),
                ]
              : render(item.children, o, ids, `${k}-${j}`);
          return (
            <li key={j} {...(o.lines ? { 'data-line': item.line } : {})}>
              {tight}
            </li>
          );
        });
        return b.ordered ? (
          <ol key={k} start={b.start} {...line}>
            {items}
          </ol>
        ) : (
          <ul key={k} {...line}>
            {items}
          </ul>
        );
      }
      case 'table':
        return (
          <div key={k} className={s.mdTableWrap} {...line}>
            <table>
              {b.head.some(Boolean) && (
                <thead>
                  <tr>
                    {b.head.map((h, j) => (
                      <th
                        key={j}
                        style={b.align[j] ? { textAlign: b.align[j] as Align & string } : undefined}
                      >
                        {inline(h, o, `${k}h${j}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {b.head.map((_, j) => (
                      <td
                        key={j}
                        style={b.align[j] ? { textAlign: b.align[j] as Align & string } : undefined}
                      >
                        {inline(row[j] ?? '', o, `${k}r${r}c${j}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'hr':
        return <hr key={k} {...line} />;
    }
    return null;
  });
}

export function Markdown({ text, options }: { text: string; options: MdOptions }) {
  const blocks = parseMarkdown(text);
  return <>{render(blocks, options, new Map(), 'b')}</>;
}
