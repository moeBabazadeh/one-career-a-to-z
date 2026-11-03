// A small Markdown renderer for markdown cells: headings, paragraphs, emphasis, inline code,
// links, lists, quotes, rules, fenced code and pipe tables, plus <kbd>. It builds React nodes,
// never HTML strings, so nothing a visitor types can inject markup.
import { Fragment, type ReactNode } from 'react';
import s from './notebook.module.scss';

const SAFE = /^(https?:|mailto:|\/|#)/i;

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(`+)([^`]+?)\1|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>|<kbd>(.+?)<\/kbd>/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[2] !== undefined) out.push(<code key={k}>{m[2]}</code>);
    else if (m[3] !== undefined || m[4] !== undefined)
      out.push(<strong key={k}>{inline(m[3] ?? m[4], k)}</strong>);
    else if (m[5] !== undefined || m[6] !== undefined)
      out.push(<em key={k}>{inline(m[5] ?? m[6], k)}</em>);
    else if (m[7] !== undefined) {
      const href = m[8];
      out.push(
        SAFE.test(href) ? (
          <a
            key={k}
            href={href}
            {...(/^https?:/.test(href) ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            {inline(m[7], k)}
          </a>
        ) : (
          <Fragment key={k}>{m[7]}</Fragment>
        ),
      );
    } else if (m[9] !== undefined) {
      out.push(
        <a key={k} href={m[9]} target="_blank" rel="noreferrer">
          {m[9]}
        </a>,
      );
    } else if (m[10] !== undefined) out.push(<kbd key={k}>{m[10]}</kbd>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Heading text without its markup, for the table of contents. */
export const plain = (text: string) =>
  text
    .replace(/<\/?kbd>/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();

export function headings(source: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  let fenced = false;
  for (const line of source.split('\n')) {
    if (/^```/.test(line)) fenced = !fenced;
    const m = !fenced && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: plain(m[2]) });
  }
  return out;
}

const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export default function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const isBlockStart = (l: string) =>
    /^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s|(-{3,}|\*{3,}|_{3,})\s*$)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    const k = `b${key++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k} className={s.mdPre}>
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const Tag = `h${h[1].length}` as 'h1';
      blocks.push(<Tag key={k}>{inline(h[2], k)}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k} />);
      i++;
      continue;
    }
    if (/^>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={k}>
          <Markdown source={body.join('\n')} />
        </blockquote>,
      );
      continue;
    }
    const list = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        while (
          i < lines.length &&
          lines[i].trim() &&
          /^\s{2,}/.test(lines[i]) &&
          !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])
        )
          item += ` ${lines[i++].trim()}`;
        items.push(item);
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k}>
          {items.map((it, n) => (
            <li key={n}>{inline(it, `${k}-${n}`)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    if (line.includes('|') && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left',
      );
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim())
        rows.push(cells(lines[i++]));
      blocks.push(
        <div key={k} className={s.mdTable}>
          <table>
            <thead>
              <tr>
                {head.map((c, n) => (
                  <th key={n} style={{ textAlign: align[n] as 'left' }}>
                    {inline(c, `${k}h${n}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rn) => (
                <tr key={rn}>
                  {head.map((_, n) => (
                    <td key={n} style={{ textAlign: align[n] as 'left' }}>
                      {inline(r[n] ?? '', `${k}r${rn}c${n}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i])))
      para.push(lines[i++].trim());
    blocks.push(<p key={k}>{inline(para.join(' '), k)}</p>);
  }
  return <>{blocks}</>;
}
