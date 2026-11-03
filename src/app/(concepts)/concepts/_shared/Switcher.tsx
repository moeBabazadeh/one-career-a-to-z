'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  bonusConcepts,
  concepts,
  conceptMark,
  conceptTitle,
  mainConcepts,
  type Concept,
} from './concepts';
import { readChoice, readScheme, subscribeScheme, writeScheme } from './scheme';
import {
  DEALT_COOKIE,
  RANDOM,
  clearCookie,
  randomTheme,
  readCookie,
  readPin,
  subscribePin,
  topPicks,
  writePin,
} from './theme';
import s from './switcher.module.scss';

const count = mainConcepts.length;
const HINT_KEY = 'themes-hint-seen';

/** True the first time it's asked on this device, so the intro hint shows once. */
function firstHint() {
  try {
    if (localStorage.getItem(HINT_KEY)) return false;
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // Storage can be blocked; showing the hint again is harmless.
  }
  return true;
}

const colors = (c: Concept) => ({ '--bg': c.palette[0], '--fg': c.palette[1] }) as CSSProperties;

/**
 * The theme picker, in the same bottom-right spot on every concept: step through A–Z, shuffle,
 * open the grid of all of them (bonus themes listed under it), or flip light and dark. Pages with fixed UI along the bottom
 * keep out of its corner (see --switcher-room-x/y in concepts.css).
 */
export default function Switcher() {
  const path = usePathname();
  const router = useRouter();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Concept | null>(null);
  const [hint, setHint] = useState<'intro' | 'dealt' | null>(null);
  const pin = useSyncExternalStore(subscribePin, readPin, () => null);
  const dark = useSyncExternalStore(
    subscribeScheme,
    () => readScheme() === 'dark',
    () => false,
  );
  const choice = useSyncExternalStore(subscribeScheme, readChoice, () => null);

  const current = concepts.find((c) => path === `/concepts/${c.slug}`) ?? null;
  // Previous and next stay in the set you are in: A to Z, or the bonus themes.
  const set = current?.bonus ? bonusConcepts : mainConcepts;
  const index = current ? set.indexOf(current) : -1;
  const prev = set[index < 0 ? set.length - 1 : (index - 1 + set.length) % set.length];
  const next = set[(index + 1) % set.length];
  const shown = preview ?? current;
  const kept = pin !== null && pin !== RANDOM;

  // "Keep this theme" means whatever I'm on, so a pin follows the visitor from theme to theme.
  useEffect(() => {
    if (kept && current && pin !== current.slug) writePin(current.slug);
  }, [kept, pin, current]);

  // Introduce the themes once per device, and say so when `/` dealt this one at random.
  useEffect(() => {
    if (!current) return;
    const show = setTimeout(() => {
      const dealt = readCookie(DEALT_COOKIE) === current.slug;
      clearCookie(DEALT_COOKIE);
      if (firstHint()) setHint(dealt ? 'dealt' : 'intro');
    }, 1200);
    return () => clearTimeout(show);
  }, [current]);

  useEffect(() => {
    if (!hint) return;
    const hide = setTimeout(() => setHint(null), 12000);
    return () => clearTimeout(hide);
  }, [hint]);

  useEffect(() => {
    if (!open) return;
    (
      panel.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
      grid.current?.querySelector<HTMLElement>('a')
    )?.focus({ preventScroll: true });
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setPreview(null);
  };

  const shuffle = () => {
    close();
    router.push(`/concepts/${randomTheme(current?.slug).slug}`);
  };

  // Arrow keys move through the grid the way it's laid out, whatever the column count.
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const tiles = [...e.currentTarget.querySelectorAll<HTMLElement>('a')];
    const columns = getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').length;
    const at = tiles.indexOf(document.activeElement as HTMLElement);
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
    };
    let to: number;
    if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tiles.length - 1;
    else if (e.key in step) to = Math.min(tiles.length - 1, Math.max(0, at + step[e.key]));
    else return;
    e.preventDefault();
    tiles[to]?.focus();
  };

  return (
    <div ref={root} className={s.root} data-open={open || undefined}>
      {hint && current && (
        <div className={s.hint} role="status">
          <p>
            {hint === 'dealt' ? (
              <>
                <b>Dealt at random:</b> {conceptTitle(current.slug)}, one of {count} themes, A to Z.
              </>
            ) : (
              <>
                <b>This site comes in {count} themes.</b> You’re on {conceptTitle(current.slug)}.
                Switch any time, down here.
              </>
            )}
          </p>
          <div className={s.hintActions}>
            <button
              type="button"
              onClick={() => {
                setHint(null);
                setOpen(true);
              }}
            >
              Show me
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => setHint(null)}>
              ×
            </button>
          </div>
        </div>
      )}

      {open && (
        <div ref={panel} id={panelId} className={s.panel} role="dialog" aria-label="Themes">
          <header className={s.head}>
            <h2>Pick a theme</h2>
            <p>{count} designs, A to Z</p>
            <nav className={s.headLinks} aria-label="More">
              <Link href="/concepts" onClick={close} className={s.headLink}>
                Gallery
              </Link>
              <Link href="/classic" onClick={close} className={s.headLink}>
                Classic site
              </Link>
            </nav>
          </header>

          <div
            ref={grid}
            className={s.grid}
            onKeyDown={onGridKey}
            onMouseLeave={() => setPreview(null)}
          >
            {mainConcepts.map((c, i) => (
              <Link
                key={c.slug}
                href={`/concepts/${c.slug}`}
                onClick={close}
                onMouseEnter={() => setPreview(c)}
                onFocus={() => setPreview(c)}
                aria-current={c === current ? 'page' : undefined}
                className={s.tile}
                style={{ ...colors(c), '--i': i } as CSSProperties}
              >
                <span className={s.poster}>
                  <span className={s.letter}>{c.letter}</span>
                  {topPicks.includes(c) && <span className={s.badge}>Top</span>}
                  <span className={s.swatches} aria-hidden="true">
                    {c.palette.slice(2, 6).map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                </span>
                <span className={s.tileName}>{c.name}</span>
              </Link>
            ))}
          </div>

          <section className={s.bonus} aria-labelledby={`${panelId}-bonus`}>
            <h3 id={`${panelId}-bonus`}>
              Bonus <span>{bonusConcepts.length} earlier designs, still working</span>
            </h3>
            <div
              className={s.bonusList}
              onKeyDown={onGridKey}
              onMouseLeave={() => setPreview(null)}
            >
              {bonusConcepts.map((c) => (
                <Link
                  key={c.slug}
                  href={`/concepts/${c.slug}`}
                  onClick={close}
                  onMouseEnter={() => setPreview(c)}
                  onFocus={() => setPreview(c)}
                  aria-current={c === current ? 'page' : undefined}
                  className={s.bonusItem}
                  style={colors(c)}
                >
                  <span className={s.bonusDot} aria-hidden="true" />
                  <span className={s.bonusName}>{c.name}</span>
                </Link>
              ))}
            </div>
          </section>

          <p className={s.caption} aria-live="polite">
            {shown ? (
              <>
                <b>{conceptTitle(shown.slug)}.</b> {shown.thesis}
              </>
            ) : (
              'Every theme is the whole site, built around a different idea. Pick one, or let chance decide.'
            )}
          </p>

          <footer className={s.foot}>
            <span className={s.footLabel}>Appearance</span>
            <div className={s.segmented} role="group" aria-label="Light or dark">
              <button
                type="button"
                aria-pressed={choice === null}
                onClick={() => writeScheme(null)}
                title="Follow your system setting"
              >
                <MonitorIcon /> Auto
              </button>
              <button
                type="button"
                aria-pressed={choice === 'light'}
                onClick={() => writeScheme('light')}
              >
                <SunIcon /> Light
              </button>
              <button
                type="button"
                aria-pressed={choice === 'dark'}
                onClick={() => writeScheme('dark')}
              >
                <MoonIcon /> Dark
              </button>
            </div>
            <span className={s.footLabel}>Next visit opens</span>
            <div
              className={s.segmented}
              role="group"
              aria-label="What babazadeh.dev opens on your next visit"
            >
              <button
                type="button"
                aria-pressed={pin === null}
                onClick={() => writePin(null)}
                title={`One of ${topPicks.length} top picks, at random`}
              >
                <StarIcon /> Top picks
              </button>
              <button type="button" aria-pressed={pin === RANDOM} onClick={() => writePin(RANDOM)}>
                <Dice /> Surprise me
              </button>
              <button
                type="button"
                aria-pressed={kept}
                disabled={!current}
                onClick={() => current && writePin(current.slug)}
                title={current ? conceptTitle(current.slug) : undefined}
              >
                <PinIcon /> This theme
              </button>
            </div>
          </footer>
        </div>
      )}

      <div className={s.bar} data-attention={hint ? '' : undefined}>
        <button
          ref={toggle}
          type="button"
          className={s.current}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={
            current
              ? `Theme ${conceptTitle(current.slug)}. Show all ${count} themes`
              : `Show all ${count} themes`
          }
          onClick={() => {
            setHint(null);
            setOpen((o) => !o);
          }}
        >
          {current ? (
            <span className={s.chip} style={colors(current)}>
              {conceptMark(current)}
            </span>
          ) : (
            <span className={`${s.chip} ${s.chipAll}`}>{count}</span>
          )}
          <span className={s.label}>
            <small>
              {current
                ? `${current.bonus ? 'Bonus' : 'Theme'} ${index + 1} of ${set.length}`
                : 'Themes'}
            </small>
            <span className={s.name}>{current ? current.name : 'Pick one'}</span>
          </span>
          <svg className={s.caret} viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 6.5 5 3.5l3 3" />
          </svg>
        </button>
        <span className={s.divider} aria-hidden="true" />
        <Link
          href={`/concepts/${prev.slug}`}
          onClick={close}
          className={s.step}
          aria-label={`Previous theme: ${conceptTitle(prev.slug)}`}
        >
          <Chevron flip />
          <Tip theme={prev}>Previous</Tip>
        </Link>
        <Link
          href={`/concepts/${next.slug}`}
          onClick={close}
          className={s.step}
          aria-label={`Next theme: ${conceptTitle(next.slug)}`}
        >
          <Chevron />
          <Tip theme={next}>Next</Tip>
        </Link>
        <button
          type="button"
          className={`${s.step} ${s.dice}`}
          onClick={shuffle}
          aria-label="Random theme"
        >
          <Dice />
          <Tip>Random theme</Tip>
        </button>
        <span className={s.divider} aria-hidden="true" />
        <button
          type="button"
          className={`${s.step} ${s.scheme}`}
          onClick={() => writeScheme(dark ? 'light' : 'dark')}
          aria-label="Dark mode"
          aria-pressed={dark}
        >
          <MoonIcon className={s.moon} />
          <SunIcon className={s.sun} />
          <Tip>{dark ? 'Light mode' : 'Dark mode'}</Tip>
        </button>
      </div>
    </div>
  );
}

/** A hover label above a pill button, with the theme it leads to. */
function Tip({ theme, children }: { theme?: Concept; children: ReactNode }) {
  return (
    <span className={s.tip} aria-hidden="true">
      {theme && (
        <span className={s.tipChip} style={colors(theme)}>
          {conceptMark(theme)}
        </span>
      )}
      <span>
        <small>{children}</small>
        {theme?.name}
      </span>
    </span>
  );
}

function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

function Dice() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
      <circle cx="5.6" cy="5.6" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="10.4" cy="10.4" r="1" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 2.5h4l-.6 4 2.1 2H4.5l2.1-2-.6-4ZM8 8.5v5" />
    </svg>
  );
}

// The pill shows the moon in light mode and the sun in dark, picked by CSS so it is right
// before hydration.
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM6 14.5h4M8 11.5v3" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m8 2.2 1.75 3.6 3.95.55-2.87 2.77.7 3.93L8 11.17l-3.53 1.88.7-3.93L2.3 6.35l3.95-.55L8 2.2Z" />
    </svg>
  );
}
