import type { Metadata } from 'next';
import Link from 'next/link';
import { person } from '@/content/db';
import { shareDefaults } from '../concepts/_shared/metadata';
import { Footer, Header } from './Chrome';
import { Cover } from './Cover';
import { blog, formatDate, getPage, pageUrl, topics, type Post, type Topic } from './posts';
import s from './blog.module.scss';

// The list of posts: the newest one large, then the rest as cards, a page at a time. /blog lists
// every post and /blog/topic/<topic> one topic's; page 2 and on add /page/<n>.

type Page = NonNullable<Awaited<ReturnType<typeof getPage>>>;

export function listMetadata(n: number, topic?: Topic): Metadata {
  const name = topic ? `${blog.title}: ${topics[topic]}` : blog.title;
  const title = n === 1 ? name : `${name}, page ${n}`;
  const url = pageUrl(n, topic);
  return {
    title,
    description: blog.description,
    alternates: {
      canonical: url,
      types: { 'application/rss+xml': [{ url: blog.feed, title: `${person.name}'s blog` }] },
    },
    openGraph: { ...shareDefaults, title, description: blog.description, url },
    twitter: { card: 'summary_large_image', title, description: blog.description },
  };
}

export function List({ n, pages, topic, topics: used, posts }: Page) {
  const featured = n === 1 ? posts[0] : undefined;
  const cards = featured ? posts.slice(1) : posts;
  return (
    <div className={s.root}>
      <Header />
      <main className={s.page}>
        <header className={s.intro}>
          <div>
            {n > 1 && (
              <p className={s.meta}>
                Page {n} of {pages}
              </p>
            )}
            <h1>{blog.title}</h1>
            <p>{blog.description}</p>
          </div>
          <Follow />
        </header>

        {used.length > 1 && (
          <nav className={s.topics} aria-label="Topics">
            <Link href={pageUrl(1)} aria-current={topic ? undefined : 'page'}>
              All
            </Link>
            {used.map((key) => (
              <Link
                key={key}
                href={pageUrl(1, key)}
                aria-current={key === topic ? 'page' : undefined}
              >
                {topics[key]}
              </Link>
            ))}
          </nav>
        )}

        {featured && (
          <article className={s.featured} id={featured.slug}>
            <Cover post={featured} large />
            <div>
              <p className={s.kicker}>Latest · {topics[featured.topic]}</p>
              <h2>
                <Link href={featured.url} className={s.stretch}>
                  {featured.title}
                </Link>
              </h2>
              <p>{featured.description}</p>
              <Meta post={featured} />
            </div>
          </article>
        )}

        {cards.length > 0 && (
          <section aria-labelledby="posts">
            <h2 id="posts" className={s.label}>
              {featured ? 'Earlier posts' : 'Posts'}
            </h2>
            <ol className={s.cards}>
              {cards.map((post) => (
                <li key={post.slug} id={post.slug}>
                  <article className={s.card}>
                    <Cover post={post} />
                    <div>
                      <h3>
                        <Link href={post.url} className={s.stretch}>
                          {post.title}
                        </Link>
                      </h3>
                      <p>{post.description}</p>
                      <Meta post={post} />
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!posts.length && <p className={s.empty}>The first post is on its way.</p>}

        {pages > 1 && <Pager n={n} pages={pages} topic={topic} />}
      </main>
      <Footer />
    </div>
  );
}

/** "15 November 2026 · 2 min read", and whether it's still a draft. */
export function Meta({ post }: { post: Post }) {
  return (
    <p className={s.meta}>
      <time dateTime={post.date}>{formatDate(post.date)}</time>
      <span aria-hidden="true">·</span>
      <span>{post.minutes} min read</span>
      {post.draft && <span className={s.draft}>Draft</span>}
    </p>
  );
}

/** Where to hear about new posts: the feed, and LinkedIn, where each one is shared. */
export function Follow({ dark = false }: { dark?: boolean }) {
  return (
    <p className={dark ? s.followDark : s.follow}>
      <a href={blog.feed}>RSS feed</a>
      <a href={person.linkedin} target="_blank" rel="noreferrer">
        Follow on LinkedIn
      </a>
    </p>
  );
}

/**
 * Newer and older on either side, page numbers between them. On a phone the numbers give way to
 * "Page 2 of 5".
 */
function Pager({ n, pages, topic }: { n: number; pages: number; topic?: Topic }) {
  return (
    <nav className={s.pager} aria-label="Pages of posts">
      {n > 1 ? (
        <Link href={pageUrl(n - 1, topic)} rel="prev" className={s.newer}>
          ← Newer
        </Link>
      ) : (
        <span className={s.newer} />
      )}
      <p className={s.count}>
        Page {n} of {pages}
      </p>
      <ol className={s.numbers}>
        {pageNumbers(n, pages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={pageUrl(p, topic)}
                aria-label={`Page ${p}`}
                aria-current={p === n ? 'page' : undefined}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ol>
      {n < pages ? (
        <Link href={pageUrl(n + 1, topic)} rel="next" className={s.older}>
          Older →
        </Link>
      ) : (
        <span className={s.older} />
      )}
    </nav>
  );
}

/**
 * The page numbers to show, with null for a gap: all of them when there are up to seven, otherwise
 * the first, the last, and the current page with its neighbours ("1 … 4 5 6 … 12"). Where a gap
 * would hide just one page, that page is shown instead.
 */
function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const shown = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: (number | null)[] = [];
  shown.forEach((p, i) => {
    const before = shown[i - 1];
    if (before !== undefined && p - before === 2) out.push(p - 1);
    else if (before !== undefined && p - before > 2) out.push(null);
    out.push(p);
  });
  return out;
}
