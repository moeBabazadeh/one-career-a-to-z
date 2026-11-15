'use client';

import { useSyncExternalStore } from 'react';
import type { Heading } from './posts';
import s from './blog.module.scss';

const subscribe = (onChange: () => void) => {
  addEventListener('scroll', onChange, { passive: true });
  addEventListener('resize', onChange);
  return () => {
    removeEventListener('scroll', onChange);
    removeEventListener('resize', onChange);
  };
};

/**
 * A post's sections, beside it on a wide screen, marking the one being read: the last whose heading
 * has passed the top quarter of the window, or the last of all once the page is at its end.
 */
export default function Contents({ headings }: { headings: Heading[] }) {
  const current = useSyncExternalStore(
    subscribe,
    () => {
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
        return headings.at(-1)?.id;
      let id = headings[0]?.id;
      for (const heading of headings) {
        const top = document.getElementById(heading.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= innerHeight / 4) id = heading.id;
      }
      return id;
    },
    () => headings[0]?.id,
  );
  return (
    <nav className={s.contents} aria-labelledby="contents">
      <p id="contents" className={s.label}>
        On this page
      </p>
      <ol>
        {headings.map(({ id, text }) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={id === current ? 'location' : undefined}>
              {text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
