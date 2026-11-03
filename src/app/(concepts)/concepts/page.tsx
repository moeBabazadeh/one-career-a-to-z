import type { Metadata } from 'next';
import Link from 'next/link';
import { bonusConcepts, mainConcepts, type Concept } from './_shared/concepts';
import { db, fmt } from './_shared/data';
import { shareDefaults, shareImage } from './_shared/metadata';
import { topPicks } from './_shared/theme';
import s from './index.module.scss';

export const metadata: Metadata = {
  title: 'All themes',
  alternates: { canonical: '/concepts' },
  openGraph: {
    ...shareDefaults,
    title: 'All themes',
    url: '/concepts',
    images: [shareImage('gallery', 'All themes')],
  },
};

export default function ConceptsIndex() {
  return (
    <main className={s.root}>
      <header className={s.head}>
        <p className={s.eyebrow}>
          {db.person.site} · {db.person.name}
        </p>
        <h1>{fmt.Spell(mainConcepts.length)} ways to read one career</h1>
        <p>
          Every theme is the whole site, built as a different working tool: an API reference, an
          oscilloscope, a Linux desktop, a robot simulator. Open one, then use the switcher in the
          bottom-right corner to move between them.
        </p>
        <Link href="/?shuffle" prefetch={false} className={s.shuffle}>
          Deal me a random one →
        </Link>
      </header>

      <ol className={s.grid}>
        {mainConcepts.map((c) => (
          <Card key={c.slug} c={c} />
        ))}
      </ol>

      <section className={s.bonus} aria-labelledby="bonus">
        <header className={s.head}>
          <h2 id="bonus">Bonus</h2>
          <p>
            {fmt.Spell(bonusConcepts.length)} earlier designs that didn’t make the A to Z set. Each
            still works as the whole site; they just sit out of the switcher’s rotation.
          </p>
        </header>
        <ol className={s.grid}>
          {bonusConcepts.map((c) => (
            <Card key={c.slug} c={c} />
          ))}
        </ol>
      </section>
    </main>
  );
}

function Card({ c }: { c: Concept }) {
  return (
    <li>
      <Link href={`/concepts/${c.slug}`} className={s.card}>
        <span className={s.band} style={{ background: c.palette[0] }}>
          {c.palette.slice(1).map((color) => (
            <i key={color} style={{ background: color }} />
          ))}
        </span>
        <span className={s.letter}>
          {c.bonus ? 'Bonus' : `Theme ${c.letter}`}
          {topPicks.includes(c) && ' · top pick'}
        </span>
        <span className={s.name}>{c.name}</span>
        <span className={s.thesis}>{c.thesis}</span>
        <span className={s.open}>Open the site →</span>
      </Link>
    </li>
  );
}
