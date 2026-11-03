'use client';

// Everything in the repository as one plain page, for reading without the tool: the README's
// introduction, every role, the projects, hardware, open source, roots, every build and contact.
// It's always in the document (so it reads without scripts too) and shown over the editor at #read.

import { useEffect, useRef } from 'react';
import { profile } from '../_shared/data';
import { Icon } from './icons';
import { Markdown, type LinkTarget } from './markdown';
import { PAGE } from './repo';
import { set, useWb } from './store';
import s from './editor.module.scss';

/** Links into the repository become anchors on this page. */
function anchorFor(t: LinkTarget): string | null {
  const p = t.path ?? '';
  if (!p && t.anchor) return `#${t.anchor}`;
  if (p.startsWith('roles/')) return '#page-experience';
  if (p.startsWith('projects/')) return '#page-projects';
  if (p.startsWith('hardware')) return '#page-hardware';
  if (p.startsWith('open-source')) return '#page-open-source';
  if (p.startsWith('roots')) return '#page-roots';
  if (p === 'contact.json') return '#page-contact';
  return '#page-about';
}

const OPTIONS = { dir: '', rewrite: anchorFor };

export default function ReadPage() {
  const open = useWb((st) => st.page);
  const heading = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // #read opens it, from a link or the address bar.
  useEffect(() => {
    const sync = () => set({ page: window.location.hash === '#read' });
    if (window.location.hash === '#read') sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      if (window.location.hash !== '#read') window.history.replaceState(null, '', '#read');
      heading.current?.focus({ preventScroll: true });
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') set({ page: false });
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    if (window.location.hash === '#read')
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    returnTo.current?.focus?.({ preventScroll: true });
  }, [open]);

  return (
    <div
      className={s.page}
      hidden={!open}
      role="dialog"
      aria-modal={open}
      aria-label={`${profile.name}, as a page`}
    >
      <header className={s.pageBar}>
        <button type="button" className={s.pageBack} onClick={() => set({ page: false })}>
          <Icon.back /> Back to the editor
        </button>
        <nav aria-label="Sections" className={s.pageNav}>
          {PAGE.map((sec) => (
            <a
              key={sec.id}
              href={`#page-${sec.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`page-${sec.id}`)?.scrollIntoView({ block: 'start' });
              }}
            >
              {sec.title}
            </a>
          ))}
        </nav>
      </header>
      <div ref={scroller} className={s.pageScroll}>
        <article ref={heading} tabIndex={-1} className={`${s.md} ${s.pageArticle}`}>
          {PAGE.map((sec) => (
            <section key={sec.id} id={`page-${sec.id}`} aria-label={sec.title}>
              <Markdown text={sec.markdown} options={OPTIONS} />
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
