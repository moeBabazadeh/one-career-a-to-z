'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../_shared/hooks';
import {
  ENDPOINTS,
  EXAMPLE_ID,
  HOST,
  METHODS,
  PLATFORMS,
  RATE_LIMIT,
  VERSIONS,
  parseTarget,
  queryString,
  type Endpoint,
  type Method,
  type Param,
} from './model';
import { curl } from './code';
import { CopyButton, Icon, Stream, StatusChip, Verb, cx, follow, followCursor } from './parts';
import {
  closeConsole,
  newKey,
  send,
  setDraft,
  setRequest,
  showExchange,
  useConsole,
  useModKey,
  useRateLimit,
  type Exchange,
} from './store';
import s from './api.module.scss';

// Paths the URL field suggests as you type.
const SUGGESTIONS = [
  ...new Set([
    '/v1',
    ...ENDPOINTS.map((e) => e.example),
    ...PLATFORMS.map((p) => `/v1/platforms/${p.id}`),
    '/v1/experience?current=true&expand[]=duties',
    '/v1/open-source?kind=security',
  ]),
];

const TRY_FIRST = [
  '/v1/experience?current=true',
  `/v1/platforms/${EXAMPLE_ID.attendum}`,
  '/v1/open-source?kind=type_safety',
  '/v1/experience?sinse=2020',
  '/v1',
  '/v1/coffee',
];

/** The endpoint a method and path resolve to, for the parameter editor. */
function endpointFor(method: Method, path: string): Endpoint | undefined {
  return ENDPOINTS.find(
    (ep) =>
      ep.method === method && new RegExp(`^${ep.path.replace(/\{\w+\}/g, '[^/]+')}/?$`).test(path),
  );
}

/* ------------------------------------------------------------------ request editor */

function ParamControl({
  param,
  values,
  onChange,
}: {
  param: Param;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const id = `console-${param.name}`;
  const value = values[0] ?? '';
  let control: React.ReactNode;
  if (param.kind === 'list') {
    control = (
      <span className={s.toggles} role="group" aria-labelledby={`${id}-label`}>
        {param.options?.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={values.includes(o)}
            onClick={() =>
              onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o])
            }
          >
            {o}
          </button>
        ))}
      </span>
    );
  } else if (param.kind === 'bool' || param.kind === 'enum') {
    const options = param.kind === 'bool' ? ['true', 'false'] : (param.options ?? []);
    control = (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        id={id}
        type={param.kind === 'int' ? 'number' : 'text'}
        inputMode={param.kind === 'int' ? 'numeric' : undefined}
        min={param.min}
        max={param.max}
        value={value}
        placeholder={param.kind === 'int' ? `${param.min}–${param.max}` : 'any'}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      />
    );
  }
  return (
    <div className={s.field}>
      <label id={`${id}-label`} htmlFor={param.kind === 'list' ? undefined : id}>
        {param.name}
        <span>{param.type}</span>
      </label>
      {control}
    </div>
  );
}

function Params({ ep, target }: { ep: Endpoint; target: string }) {
  const parsed = parseTarget(target);
  if (!parsed) return null;
  const { path, query } = parsed;
  const params = ep.params.filter((p) => p.in === 'query');
  const known = new Set(params.map((p) => p.name));
  const unknown = [...new Set([...query.keys()].filter((k) => !known.has(k)))];
  const qs = (next: URLSearchParams) => (queryString(next) ? `?${queryString(next)}` : '');
  const update = (name: string, values: string[]) => {
    const next = new URLSearchParams(query);
    next.delete(name);
    values.forEach((v) => next.append(name, v));
    setRequest({ target: `${path}${qs(next)}` });
  };
  const id = ep.id === 'platform' ? path.split('/')[3] : null;

  if (!params.length && id === null && !unknown.length) return null;
  return (
    <fieldset className={s.fields}>
      <legend>Parameters</legend>
      {id !== null && (
        <div className={s.field}>
          <label htmlFor="console-id">
            id<span>path</span>
          </label>
          <select
            id="console-id"
            value={id}
            onChange={(e) => setRequest({ target: `/v1/platforms/${e.target.value}${qs(query)}` })}
          >
            {!PLATFORMS.some((p) => p.id === id) && <option value={id}>{id || '—'}</option>}
            {PLATFORMS.map((p) => (
              <option key={p.id}>{p.id}</option>
            ))}
          </select>
        </div>
      )}
      {params.map((p) => (
        <ParamControl
          key={p.name}
          param={p}
          values={query.getAll(p.name)}
          onChange={(values) => update(p.name, values)}
        />
      ))}
      {unknown.map((name) => (
        <div key={name} className={cx(s.field, s.unknown)}>
          <label>
            {name}
            <span>unknown</span>
          </label>
          <button type="button" onClick={() => update(name, [])}>
            Remove
          </button>
        </div>
      ))}
    </fieldset>
  );
}

function MessageFields() {
  const c = useConsole();
  return (
    <fieldset className={s.fields}>
      <legend>Body · application/json</legend>
      {(['email', 'name', 'subject'] as const).map((k) => (
        <div key={k} className={s.field}>
          <label htmlFor={`console-${k}`}>
            {k}
            <span>{k === 'email' ? 'required' : 'string'}</span>
          </label>
          <input
            id={`console-${k}`}
            type={k === 'email' ? 'email' : 'text'}
            value={c.draft[k]}
            autoComplete={k === 'subject' ? 'off' : k}
            onChange={(e) => setDraft({ [k]: e.target.value })}
          />
        </div>
      ))}
      <div className={cx(s.field, s.fieldWide)}>
        <label htmlFor="console-body">
          body<span>required</span>
        </label>
        <textarea
          id="console-body"
          rows={3}
          value={c.draft.body}
          onChange={(e) => setDraft({ body: e.target.value })}
        />
      </div>
      <div className={cx(s.field, s.fieldWide)}>
        <label htmlFor="console-key">
          Idempotency-Key<span>header</span>
        </label>
        <span className={s.keyRow}>
          <input
            id="console-key"
            value={c.key}
            spellCheck={false}
            onChange={(e) => setRequest({ key: e.target.value })}
          />
          <button type="button" onClick={newKey}>
            New key
          </button>
        </span>
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ response */

const PHASE_TONES = ['queue', 'dns', 'connect', 'tls', 'send', 'wait', 'download'];

function Waterfall({
  exchange,
  animate,
  slow,
}: {
  exchange: Exchange;
  animate: boolean;
  slow: number;
}) {
  const pct = (ms: number) => `${(ms / exchange.total) * 100}%`;
  return (
    <ol className={s.waterfall} aria-label="Request timing, simulated">
      {exchange.timing.map((p, i) => (
        <li key={p.label}>
          <span className={s.wfLabel}>{p.label}</span>
          <span className={s.wfTrack}>
            {p.ms > 0 && (
              <span
                className={s.wfBar}
                data-tone={PHASE_TONES[i]}
                data-animate={animate || undefined}
                style={{
                  left: pct(p.start),
                  width: pct(p.ms),
                  animationDelay: `${p.start * slow}ms`,
                  animationDuration: `${Math.max(60, p.ms * slow)}ms`,
                }}
              />
            )}
          </span>
          <span className={s.wfMs}>{p.ms > 0 ? `${p.ms.toFixed(1)} ms` : 'reused'}</span>
        </li>
      ))}
    </ol>
  );
}

function HeadersView({ exchange }: { exchange: Exchange }) {
  return (
    <pre className={cx(s.pre, s.headers)} tabIndex={0} aria-label="Response headers">
      <code className={s.code}>
        <span className={s.line}>
          <span className={s.t_kw}>HTTP/2</span>{' '}
          <span className={s.t_num}>{exchange.result.status}</span>
        </span>
        {exchange.headers.map(([k, v]) => (
          <span key={k} className={s.line}>
            <span className={s.t_key}>{k}</span>
            <span className={s.t_pun}>: </span>
            <span className={s.t_str}>{v}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

function Response({
  exchange,
  pending,
  reduced,
  slow,
}: {
  exchange: Exchange;
  pending: boolean;
  reduced: boolean;
  slow: number;
}) {
  const [tab, setTab] = useState<'body' | 'headers'>('body');
  const box = useRef<HTMLElement>(null);

  // A new response scrolls into view when it would start off screen, e.g. after following a cursor.
  useEffect(() => {
    const el = box.current;
    const scroller = el?.parentElement;
    if (!el || !scroller) return;
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (top < 0 || top > scroller.clientHeight * 0.6)
      scroller.scrollBy({ top: top - 12, behavior: reduced ? 'auto' : 'smooth' });
  }, [reduced]);

  const body = exchange.result.body;
  const mailto =
    body && typeof body === 'object' && !Array.isArray(body) && body.object === 'message'
      ? ((body.delivery as { href?: string } | undefined)?.href ?? null)
      : null;
  const kb =
    exchange.size > 1024 ? `${(exchange.size / 1024).toFixed(1)} kB` : `${exchange.size} B`;
  return (
    <section ref={box} className={s.response} aria-label="Response">
      <div className={s.statusLine} aria-live="polite">
        {pending ? (
          <span className={s.sending}>Sending…</span>
        ) : (
          <StatusChip status={exchange.result.status} />
        )}
        {!pending && (
          <>
            <span>{exchange.total.toFixed(0)} ms</span>
            <span>{kb}</span>
            {exchange.reused && <span>connection reused</span>}
          </>
        )}
      </div>
      <Waterfall exchange={exchange} animate={pending && !reduced} slow={slow} />
      {!pending && (
        <>
          {mailto && (
            <a className={s.mailto} href={mailto}>
              <Icon.mail /> Open the draft in your mail app
            </a>
          )}
          <div className={s.resTabs} role="tablist" aria-label="Response view">
            {(['body', 'headers'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {t === 'body' ? 'Body' : `Headers (${exchange.headers.length})`}
              </button>
            ))}
            <code className={s.reqId}>{exchange.id}</code>
          </div>
          {tab === 'body' ? (
            exchange.text ? (
              <Stream
                key={exchange.id}
                text={exchange.text}
                animate={!reduced}
                onFollow={follow}
                onCursor={(c) => followCursor(exchange.target, c)}
                label="Response body"
              />
            ) : (
              <p className={s.muted}>No body.</p>
            )
          ) : (
            <HeadersView exchange={exchange} />
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ console */

export default function Console() {
  const c = useConsole();
  const reduced = useReducedMotion();
  const mod = useModKey();
  const url = useRef<HTMLInputElement>(null);
  const slow = reduced ? 0 : 6;

  useEffect(() => {
    if (c.open) url.current?.focus({ preventScroll: true });
  }, [c.open]);

  const parsed = parseTarget(c.target);
  const ep = parsed ? endpointFor(c.method, parsed.path.replace(/(.)\/$/, '$1')) : undefined;
  const shown = c.pending ?? c.exchange;
  const { remaining } = useRateLimit();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send(slow);
    }
  };

  const pick = (id: string) => {
    const next = ENDPOINTS.find((x) => x.id === id);
    if (next) setRequest({ method: next.method, target: next.example });
  };

  return (
    <aside
      className={s.console}
      data-open={c.open || undefined}
      inert={!c.open}
      aria-label="API console"
      onKeyDown={onKeyDown}
    >
      <header className={s.consoleHead}>
        <p>
          <b>Console</b>
          <span className={s.env}>sandbox · computed in your browser</span>
        </p>
        <CopyButton
          text={curl({
            method: c.method,
            target: c.target,
            version: c.version,
            body: c.method === 'POST' ? { ...c.draft } : undefined,
            key: c.method === 'POST' ? c.key : undefined,
          })}
          className={s.copyCurl}
        >
          Copy as cURL
        </CopyButton>
        <button type="button" className={s.close} onClick={closeConsole} aria-label="Close console">
          <Icon.close />
        </button>
      </header>

      <div className={s.consoleBody}>
        <div className={s.consoleRow}>
          <label className={s.field}>
            <span className={s.fieldLabel}>Endpoint</span>
            <select value={ep?.id ?? ''} onChange={(e) => pick(e.target.value)}>
              {!ep && <option value="">Custom request</option>}
              {ENDPOINTS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.method} {x.path}
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Api-Version</span>
            <select value={c.version} onChange={(e) => setRequest({ version: e.target.value })}>
              {VERSIONS.map((v, i) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                  {i === 0 ? ' (latest)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <form
          className={s.requestLine}
          onSubmit={(e) => {
            e.preventDefault();
            send(slow);
          }}
        >
          <select
            className={s.methodSelect}
            data-method={c.method}
            value={c.method}
            aria-label="Method"
            onChange={(e) => setRequest({ method: e.target.value as Method })}
          >
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <span className={s.urlField}>
            <span aria-hidden="true">{HOST}</span>
            <input
              ref={url}
              value={c.target}
              onChange={(e) => setRequest({ target: e.target.value })}
              list="console-paths"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-label="Request path and query"
            />
          </span>
          <button type="submit" className={s.send} disabled={Boolean(c.pending)}>
            {c.pending ? 'Sending' : 'Send'}
            <kbd>{mod}↵</kbd>
          </button>
        </form>
        <datalist id="console-paths">
          {SUGGESTIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        {ep && c.method !== 'POST' && <Params ep={ep} target={c.target} />}
        {ep?.id === 'messages' && <MessageFields />}

        {shown ? (
          <Response
            key={shown.id}
            exchange={shown}
            pending={Boolean(c.pending)}
            reduced={reduced}
            slow={slow}
          />
        ) : (
          <div className={s.empty}>
            <p>
              Press <b>Send</b> or <kbd>{mod}↵</kbd>. Responses are computed in your browser from
              the same data as this page, so filters, expansions and cursors really work. Links in a
              response are clickable.
            </p>
            <p className={s.fieldLabel}>Or try one of these</p>
            <ul>
              {TRY_FIRST.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => {
                      setRequest({ method: 'GET', target: t });
                      send(slow);
                    }}
                  >
                    <Verb method="GET" small /> {t}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {c.history.length > 0 && (
          <section className={s.history} aria-label="History">
            <p className={s.fieldLabel}>History</p>
            <ol>
              {c.history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => showExchange(h)}
                    aria-current={h.id === c.exchange?.id || undefined}
                  >
                    <Verb method={h.method} small />
                    <span>{h.target}</span>
                    <StatusChip status={h.result.status} small />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className={s.consoleFoot}>
        <span
          className={s.meter}
          aria-label={`${remaining} of ${RATE_LIMIT} requests left this minute`}
        >
          <span
            style={{ width: `${(remaining / RATE_LIMIT) * 100}%` }}
            data-low={remaining < 6 || undefined}
          />
        </span>
        <span>
          {remaining}/{RATE_LIMIT} requests left
        </span>
      </footer>
    </aside>
  );
}
