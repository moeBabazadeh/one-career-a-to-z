import Link from 'next/link';
import { current, person } from '@/content/db';
import SchemeToggle from './SchemeToggle';
import { blog } from './posts';
import s from './blog.module.scss';

/** The bar across the top of every blog page: the wordmark home, and the way to the rest of the site. */
export function Header() {
  return (
    <header className={s.top}>
      <Link href="/" className={s.brand} aria-label={`${person.name}, home`}>
        {person.first.toLowerCase()}
        <i>.</i>
      </Link>
      <nav aria-label="Site">
        <Link href={blog.url}>Blog</Link>
        <Link href="/">About</Link>
        <Link href="/concepts">Themes</Link>
        <a href={person.cv} target="_blank" rel="noreferrer">
          CV
        </a>
        <SchemeToggle />
      </nav>
    </header>
  );
}

/** Who writes here and where else to find him, under every blog page. */
export function Footer() {
  return (
    <footer className={s.foot}>
      <p>
        Written by <Link href="/">{person.name}</Link>, {current.title} at{' '}
        <a href={current.companyUrl} target="_blank" rel="noreferrer">
          {current.company}
        </a>
        .
      </p>
      <nav aria-label="Elsewhere">
        <a href={person.linkedin} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <a href={person.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href={`mailto:${person.email}`}>Email</a>
        <a href={blog.feed}>RSS</a>
      </nav>
    </footer>
  );
}
