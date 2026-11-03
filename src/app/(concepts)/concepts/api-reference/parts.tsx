'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { HOST, STATUS, parseTarget, queryString, type ApiResult, type Method } from './model';
import {
  LANGS,
  SAMPLES,
  highlight,
  lengthOf,
  pretty,
  type Line,
  type Sample,
  type Token,
} from './code';
import { openConsole, setLang, setRequest, send, useLang } from './store';
import s from './api.module.scss';

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ icons */

const Svg = ({ children, size = 14 }: { children: React.ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Icon = {
  copy: () => (
    <Svg>
      <rect x={5} y={5} width={8.5} height={8.5} rx={1.6} />
      <path d="M10.5 5V3.6c0-.9-.7-1.6-1.6-1.6H3.6C2.7 2 2 2.7 2 3.6v5.3c0 .9.7 1.6 1.6 1.6H5" />
    </Svg>
  ),
  check: () => (
    <Svg>
      <path d="M3 8.5l3 3 7-7" />
    </Svg>
  ),
  play: () => (
    <Svg size={12}>
      <path d="M4.5 3v10l8-5z" fill="currentColor" />
    </Svg>
  ),
  search: () => (
    <Svg>
      <circle cx={7} cy={7} r={4.5} />
      <path d="M10.5 10.5L14 14" />
    </Svg>
  ),
  close: () => (
    <Svg>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  ),
  menu: () => (
    <Svg size={18}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Svg>
  ),
  out: () => (
    <Svg size={11}>
      <path d="M6 3h7v7M13 3L4 12" />
    </Svg>
  ),
  mail: () => (
    <Svg>
      <rect x={2} y={3.5} width={12} height={9} rx={1.5} />
      <path d="M2.5 4.5L8 9l5.5-4.5" />
    </Svg>
  ),
  file: () => (
    <Svg>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </Svg>
  ),
  link: () => (
    <Svg>
      <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1" />
    </Svg>
  ),
};

/* ------------------------------------------------------------------ small parts */

/** Inline `code` in plain strings. */
export function Md({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/)
        .map((part, i) =>
          part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
            <code key={i}>{part.slice(1, -1)}</code>
          ) : (
            part
          ),
        )}
    </>
  );
}

export function Verb({ method, small }: { method: Method | string; small?: boolean }) {
  return (
    <span className={cx(s.verb, small && s.verbSmall)} data-method={method}>
      {method}
    </span>
  );
}

export function StatusChip({ status, small }: { status: number; small?: boolean }) {
  const tone = status < 300 ? 'ok' : status === 418 ? 'tea' : status === 429 ? 'bad' : 'warn';
  return (
    <span className={cx(s.status, small && s.statusSmall)} data-tone={tone}>
      <i aria-hidden="true" />
      {status} {small ? '' : STATUS[status]}
    </span>
  );
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function CopyButton({
  text,
  label = 'Copy',
  className,
  children,
}: {
  text: string;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (!(await writeClipboard(text))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      className={cx(s.copy, className)}
      onClick={copy}
      aria-label={children ? undefined : label}
      data-copied={copied || undefined}
    >
      {copied ? <Icon.check /> : <Icon.copy />}
      {children ? (
        <span>{copied ? 'Copied' : children}</span>
      ) : (
        <span className={s.copyNote} aria-live="polite">
          {copied ? 'Copied' : ''}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ code view */

interface CodeViewProps {
  lines: Line[];
  /** How many characters to show, for streaming. */
  upto?: number;
  /** JSON keys (or, for code, substrings) whose lines light up. */
  hot?: string[] | null;
  json?: boolean;
  /** Indent wrapped lines under their first character. */
  wrap?: boolean;
  onFollow?: (path: string) => void;
  onCursor?: (cursor: string) => void;
}

const EXTERNAL = /^(https?:\/\/|mailto:)/;

function TokenView({
  token,
  text,
  line,
  complete,
  onFollow,
  onCursor,
}: { token: Token; text: string; line: Line; complete: boolean } & Pick<
  CodeViewProps,
  'onFollow' | 'onCursor'
>) {
  const cls = token.kind ? s[`t_${token.kind}`] : undefined;
  if (token.kind === 'str' && complete && token.text.startsWith('"')) {
    const value = token.text.slice(1, -1);
    if (onCursor && line.key === 'next_cursor') {
      return (
        <button
          type="button"
          className={cx(cls, s.follow)}
          onClick={() => onCursor(value)}
          title="Fetch the next page"
        >
          {text}
        </button>
      );
    }
    if (onFollow && /^\/v1(\/|$)/.test(value) && line.key !== 'type') {
      const path = value.replace(/\{[^}]*\}/g, '');
      return (
        <button
          type="button"
          className={cx(cls, s.follow)}
          onClick={() => onFollow(path)}
          title={`GET ${path}`}
        >
          {text}
        </button>
      );
    }
    if (
      (EXTERNAL.test(value) && !value.includes(HOST)) ||
      /^\/(resume|assets|concepts)/.test(value)
    ) {
      return (
        <a
          className={cx(cls, s.follow)}
          href={value}
          {...(value.startsWith('mailto:') ? {} : { target: '_blank', rel: 'noreferrer' })}
        >
          {text}
        </a>
      );
    }
  }
  return <span className={cls}>{text}</span>;
}

export function CodeView({
  lines,
  upto = Infinity,
  hot,
  json,
  wrap,
  onFollow,
  onCursor,
}: CodeViewProps) {
  const out: React.ReactNode[] = [];
  let budget = upto;
  for (const [i, line] of lines.entries()) {
    if (budget <= 0) break;
    const tokens: React.ReactNode[] = [];
    for (const [j, token] of line.tokens.entries()) {
      if (budget <= 0) break;
      const text = token.text.length > budget ? token.text.slice(0, budget) : token.text;
      budget -= token.text.length;
      tokens.push(
        <TokenView
          key={j}
          token={token}
          text={text}
          line={line}
          complete={text.length === token.text.length}
          onFollow={onFollow}
          onCursor={onCursor}
        />,
      );
    }
    budget -= 1;
    const lit = hot?.length
      ? json
        ? Boolean(line.key && hot.includes(line.key))
        : hot.some((h) => line.text.includes(h))
      : false;
    const pad = line.indent + 2;
    out.push(
      <span
        key={i}
        className={cx(s.line, lit && s.lineHot)}
        style={wrap ? { paddingLeft: `calc(16px + ${pad}ch)`, textIndent: `-${pad}ch` } : undefined}
      >
        {tokens.length ? tokens : ' '}
      </span>,
    );
  }
  return <code className={s.code}>{out}</code>;
}

/* ------------------------------------------------------------------ panels */

export function LangTabs({ controls }: { controls: string }) {
  const lang = useLang();
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = LANGS.findIndex((l) => l.id === lang);
    const next = LANGS[(i + (e.key === 'ArrowRight' ? 1 : LANGS.length - 1)) % LANGS.length];
    setLang(next.id);
    (e.currentTarget.querySelector(`[data-lang="${next.id}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div className={s.tabs} role="tablist" aria-label="Language" onKeyDown={onKeyDown}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="tab"
          data-lang={l.id}
          aria-selected={l.id === lang}
          aria-controls={controls}
          tabIndex={l.id === lang ? 0 : -1}
          onClick={() => setLang(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function RequestPanel({
  sample,
  title,
  hot,
  onTry,
  tryLabel = 'Try it',
}: {
  sample: Sample;
  title: React.ReactNode;
  hot?: string[];
  onTry?: () => void;
  tryLabel?: string;
}) {
  const lang = useLang();
  const id = useId();
  const code = SAMPLES[lang](sample);
  const lines = useMemo(() => highlight(code, lang), [code, lang]);
  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <span className={s.panelTitle}>{title}</span>
        {onTry && (
          <button type="button" className={s.try} onClick={onTry}>
            <Icon.play /> {tryLabel}
          </button>
        )}
      </div>
      <div className={s.panelBar}>
        <LangTabs controls={id} />
        <CopyButton text={code} label="Copy code" />
      </div>
      <pre id={id} role="tabpanel" className={s.pre} tabIndex={0}>
        <CodeView lines={lines} hot={hot} />
      </pre>
    </div>
  );
}

/** Opens a path from a response in the console and sends it. */
export const follow = (path: string) => openConsole({ method: 'GET', target: path, send: true });

/** Follows a `next_cursor` from the console's current request. */
export function followCursor(target: string, cursor: string) {
  const parsed = parseTarget(target);
  if (!parsed) return;
  const query = new URLSearchParams(parsed.query);
  query.set('cursor', cursor);
  setRequest({ method: 'GET', target: `${parsed.path}?${queryString(query)}` });
  send();
}

export function ResponsePanel({
  result,
  hot,
  label = 'Response',
  target,
}: {
  result: ApiResult;
  hot?: string[];
  label?: React.ReactNode;
  target?: string;
}) {
  const text = useMemo(() => pretty(result.body), [result]);
  const lines = useMemo(() => highlight(text, 'json'), [text]);
  const type = result.headers.find(([k]) => k === 'content-type')?.[1].split(';')[0];
  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <span className={s.panelTitle}>{label}</span>
        <StatusChip status={result.status} />
        {typeof label === 'string' && <span className={s.mime}>{type}</span>}
        <CopyButton text={text} label="Copy response" />
      </div>
      <pre className={cx(s.pre, s.json)} tabIndex={0} aria-label="Example response">
        <CodeView
          lines={lines}
          hot={hot}
          json
          wrap
          onFollow={follow}
          onCursor={
            target
              ? (c) => openConsole({ method: 'GET', target: withCursor(target, c), send: true })
              : undefined
          }
        />
      </pre>
    </div>
  );
}

const withCursor = (target: string, cursor: string) => {
  const parsed = parseTarget(target);
  if (!parsed) return target;
  const query = new URLSearchParams(parsed.query);
  query.set('cursor', cursor);
  return `${parsed.path}?${queryString(query)}`;
};

/* ------------------------------------------------------------------ streaming */

/** Reveals a response a chunk per frame, the way a streamed body arrives. */
export function Stream({
  text,
  animate,
  onFollow,
  onCursor,
  label,
}: {
  text: string;
  animate: boolean;
  onFollow?: (path: string) => void;
  onCursor?: (cursor: string) => void;
  label: string;
}) {
  const lines = useMemo(() => highlight(text, 'json'), [text]);
  const total = lengthOf(lines);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let start = 0;
    const duration = Math.min(1300, 220 + total * 0.55);
    const tick = (now: number) => {
      start ||= now;
      const n = Math.min(total, Math.ceil(((now - start) / duration) * total));
      setCount(n);
      if (n < total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, total]);
  const upto = animate ? count : total;
  return (
    <pre className={cx(s.pre, s.json, s.stream)} tabIndex={0} aria-label={label}>
      <CodeView
        lines={lines}
        upto={upto}
        json
        wrap
        onFollow={upto >= total ? onFollow : undefined}
        onCursor={upto >= total ? onCursor : undefined}
      />
      {upto < total && <span className={s.caret} aria-hidden="true" />}
    </pre>
  );
}

/** Scrolls to a section or item, updates the hash, moves focus and flashes it. */
export function jumpTo(id: string, reduced: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  window.history.replaceState(window.history.state, '', `#${id}`);
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  if (!reduced)
    el.animate(
      [{ backgroundColor: 'rgba(91, 91, 214, 0.14)' }, { backgroundColor: 'rgba(91, 91, 214, 0)' }],
      { duration: 1800, easing: 'ease-out' },
    );
}
