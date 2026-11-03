'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { profile } from '../_shared/data';
import { DOC, PAGES, PART, type ThumbKind } from './content';
import s from './datasheet.module.scss';

const WIDE = '(min-width: 1100px)';
const subscribeWide = (onChange: () => void) => {
  const query = matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/* ------------------------------------------------------------------ page thumbnails */

// Each thumbnail is a sketch of its page: header rule, text lines, and the page's main figure.
const lines = (x: number, y: number, w: number, n: number, gap = 4) =>
  Array.from({ length: n }, (_, i) => (
    <rect
      key={`${x}-${y}-${i}`}
      x={x}
      y={y + i * gap}
      width={i === n - 1 ? w * 0.6 : w}
      height={1.6}
      className={s.tLine}
    />
  ));

function Thumb({ kind }: { kind: ThumbKind }) {
  return (
    <svg viewBox="0 0 85 110" aria-hidden="true">
      <rect width={85} height={110} className={s.tPaper} />
      {kind === 'title' ? (
        <rect width={85} height={3} className={s.tRed} />
      ) : (
        <rect x={6} y={8} width={73} height={0.8} className={s.tRule} />
      )}
      {kind === 'title' && (
        <>
          <rect x={6} y={8} width={30} height={5} className={s.tInk} />
          <rect x={6} y={17} width={60} height={3} className={s.tInk} />
          {lines(6, 26, 22, 8)}
          {lines(31, 26, 22, 8)}
          {lines(56, 26, 22, 6)}
          <rect x={10} y={66} width={65} height={34} className={s.tBox} />
          <rect x={16} y={74} width={16} height={12} className={s.tBox} />
          <rect x={36} y={74} width={16} height={12} className={s.tBox} />
          <rect x={56} y={74} width={14} height={12} className={s.tBox} />
        </>
      )}
      {kind === 'toc' && (
        <>
          {lines(6, 16, 73, 9, 4)}
          <rect x={6} y={56} width={30} height={2.6} className={s.tInk} />
          {lines(6, 63, 73, 10, 4)}
        </>
      )}
      {kind === 'pins' && (
        <>
          <rect x={10} y={22} width={30} height={30} className={s.tBox} />
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i}>
              <rect x={7} y={25 + i * 4.5} width={3} height={1.6} className={s.tInk} />
              <rect x={40} y={25 + i * 4.5} width={3} height={1.6} className={s.tInk} />
              <rect x={13 + i * 4.5} y={19} width={1.6} height={3} className={s.tInk} />
              <rect x={13 + i * 4.5} y={52} width={1.6} height={3} className={s.tInk} />
            </g>
          ))}
          {lines(48, 18, 31, 20, 4)}
          {lines(6, 64, 36, 10, 4)}
        </>
      )}
      {kind === 'tables' && (
        <>
          {[16, 40, 60].map((y, i) => (
            <g key={y}>
              <rect x={6} y={y} width={73} height={3} className={s.tHead} />
              {lines(6, y + 6, 73, [4, 3, 10][i], 3.6)}
            </g>
          ))}
        </>
      )}
      {kind === 'timing' && (
        <>
          <rect x={6} y={16} width={73} height={3} className={s.tHead} />
          {lines(6, 22, 73, 7, 3.6)}
          {Array.from({ length: 6 }, (_, i) => (
            <path
              key={i}
              d={`M8,${58 + i * 7} h${8 + i * 9} l1,-3 h${14 - i} l1,3 H78`}
              className={s.tWave}
            />
          ))}
        </>
      )}
      {kind === 'plots' && (
        <>
          {[0, 1, 2].map((r) =>
            [0, 1].map((c) => (
              <g key={`${r}${c}`}>
                <rect x={7 + c * 37} y={16 + r * 30} width={33} height={22} className={s.tBox} />
                <path
                  d={`M${8 + c * 37},${34 + r * 30} q10,-${10 + r * 4} 31,-${12 - c * 3}`}
                  className={s.tCurve}
                />
              </g>
            )),
          )}
        </>
      )}
      {kind === 'desc' && (
        <>
          {lines(6, 16, 73, 12, 4)}
          <rect x={6} y={68} width={73} height={3} className={s.tHead} />
          {lines(6, 74, 73, 7, 3.6)}
        </>
      )}
      {kind === 'app' && (
        <>
          <rect x={30} y={16} width={22} height={30} className={s.tBox} />
          {[20, 28, 36].map((y) => (
            <g key={y}>
              <rect x={60} y={y - 2} width={18} height={6} className={s.tBox} />
              <rect x={52} y={y} width={8} height={0.8} className={s.tInk} />
            </g>
          ))}
          <rect x={8} y={28} width={16} height={8} className={s.tBox} />
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={7 + (i % 2) * 37}
              y={56 + Math.floor(i / 2) * 26}
              width={33}
              height={20}
              className={s.tShot}
            />
          ))}
        </>
      )}
      {kind === 'other' && (
        <>
          <rect x={6} y={16} width={73} height={3} className={s.tHead} />
          {lines(6, 22, 73, 9, 3.6)}
          {Array.from({ length: 6 }, (_, i) => (
            <path
              key={i}
              d={`M8,${66 + i * 6} h${6 + i * 8} l${4 + (i % 2) * 6},-3 H78`}
              className={s.tWave}
            />
          ))}
        </>
      )}
      {kind === 'support' && (
        <>
          {lines(6, 16, 73, 5, 4)}
          <rect x={6} y={38} width={73} height={3} className={s.tHead} />
          {lines(6, 44, 73, 10, 3.6)}
          <path d="M14,86 l6,-10 l6,10 z" className={s.tBox} />
          {lines(30, 80, 48, 3, 4)}
        </>
      )}
      {kind === 'mech' && (
        <>
          <rect x={6} y={16} width={73} height={3} className={s.tHead} />
          {lines(6, 22, 73, 4, 3.6)}
          <rect x={8} y={44} width={20} height={20} className={s.tBox} />
          <rect x={32} y={52} width={20} height={4} className={s.tBox} />
          <rect x={57} y={44} width={20} height={20} className={s.tBox} />
          <rect x={63} y={50} width={8} height={8} className={s.tInk} />
          {lines(6, 74, 73, 6, 4)}
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ viewer */

export default function Viewer({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState(1);
  const [rail, setRail] = useState<'auto' | 'open' | 'closed'>('auto');
  const wide = useSyncExternalStore(
    subscribeWide,
    () => matchMedia(WIDE).matches,
    () => true,
  );
  const doc = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const showRail = rail === 'open' || (rail === 'auto' && wide);

  // The current page is the one crossing the middle of the viewport.
  useEffect(() => {
    const pages = doc.current?.querySelectorAll<HTMLElement>('[data-page]');
    if (!pages?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) setPage(Number((e.target as HTMLElement).dataset.page));
      },
      { rootMargin: '-45% 0px -54% 0px' },
    );
    pages.forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, []);

  // Keep the current thumbnail in view inside the rail.
  useEffect(() => {
    const el = railRef.current;
    const thumb = el?.querySelector<HTMLElement>(`[data-thumb="${page}"]`);
    if (!el || !thumb || !el.clientHeight) return;
    el.scrollTo({ top: thumb.offsetTop - el.clientHeight / 2 + thumb.offsetHeight / 2 });
  }, [page]);

  // Escape closes the rail when it floats over the page.
  useEffect(() => {
    if (wide || rail !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRail('closed');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [wide, rail]);

  const go = (n: number) => {
    const to = Math.min(PAGES.length, Math.max(1, n));
    document.getElementById(`page-${to}`)?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className={s.root} data-rail={rail}>
      <header className={s.toolbar}>
        <div className={s.tbLeft}>
          <button
            type="button"
            className={s.tbButton}
            aria-expanded={showRail}
            aria-controls="ds-rail"
            aria-label="Page thumbnails"
            onClick={() => setRail(showRail ? 'closed' : 'open')}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 3.5h12M2 8h12M2 12.5h12" />
            </svg>
          </button>
          <span className={s.fileName}>
            {PART}_datasheet_<b>{DOC}</b>.pdf
          </span>
        </div>
        <nav className={s.tbPager} aria-label="Pages">
          <button
            type="button"
            className={s.tbButton}
            onClick={() => go(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 L5 8 L10 13" />
            </svg>
          </button>
          <span className={s.pageNo}>
            <b>{page}</b> / {PAGES.length}
          </span>
          <button
            type="button"
            className={s.tbButton}
            onClick={() => go(page + 1)}
            disabled={page === PAGES.length}
            aria-label="Next page"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3 L11 8 L6 13" />
            </svg>
          </button>
        </nav>
        <div className={s.tbRight}>
          <button
            type="button"
            className={`${s.tbButton} ${s.tbPrint}`}
            onClick={() => print()}
            aria-label="Print this data sheet"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6V2h8v4M4 12H2V6h12v6h-2M4 9.5h8V14H4z" />
            </svg>
          </button>
          <a className={s.tbCv} href={profile.cv} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
            </svg>
            <span>CV</span>
          </a>
        </div>
      </header>

      <div className={s.shell}>
        <aside
          id="ds-rail"
          ref={railRef}
          className={s.rail}
          aria-label="Page thumbnails"
          hidden={!showRail}
        >
          <ol>
            {PAGES.map((p) => (
              <li key={p.n}>
                <a
                  href={`#page-${p.n}`}
                  data-thumb={p.n}
                  aria-current={page === p.n ? 'page' : undefined}
                  onClick={() => {
                    if (!wide) setRail('closed');
                  }}
                >
                  <Thumb kind={p.kind} />
                  <span>
                    <b>{p.n}</b> {p.title}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </aside>
        {!wide && showRail && (
          <button
            type="button"
            className={s.scrim}
            aria-label="Close thumbnails"
            onClick={() => setRail('closed')}
          />
        )}
        <div ref={doc} className={s.doc}>
          {children}
        </div>
      </div>
    </div>
  );
}
