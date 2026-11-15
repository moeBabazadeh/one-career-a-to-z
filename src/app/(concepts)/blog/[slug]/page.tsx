import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { person } from '@/content/db';
import { shareDefaults } from '../../concepts/_shared/metadata';
import { Footer, Header } from '../Chrome';
import Contents from '../Contents';
import CopyButton from '../CopyButton';
import { Cover } from '../Cover';
import { Follow, Meta } from '../List';
import {
  blog,
  getPost,
  getPosts,
  listUrl,
  neighbours,
  pageUrl,
  postDate,
  topics,
  type Post,
} from '../posts';
import s from '../blog.module.scss';

type Props = { params: Promise<{ slug: string }> };

/** A post long enough to need a map: three sections or more. */
const MIN_SECTIONS = 3;

// One page per post, built ahead of time. Any other address under /blog is a 404 from notFound()
// below, not from `dynamicParams = false`: that would also hide a post added while the dev server
// is running, until it restarts.
export async function generateStaticParams() {
  return (await getPosts()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return {};
  const { title, description, url } = post;
  return {
    title,
    description,
    alternates: { canonical: url },
    // The share image comes from opengraph-image.tsx beside this file.
    openGraph: {
      ...shareDefaults,
      type: 'article',
      title,
      description,
      url,
      publishedTime: postDate(post.date).toISOString(),
      authors: [person.url],
    },
    twitter: { card: 'summary_large_image', title, description },
    // A draft only ever renders on the dev server, but say so anyway.
    ...(post.draft ? { robots: { index: false } } : {}),
  };
}

export default async function PostPage({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const { Content } = post;
  const address = `${person.url}${post.url}`;
  // Back to the page of the list this post is on, not always the first one.
  const back = await listUrl(post.slug);
  const { newer, older } = await neighbours(post.slug);
  const contents = post.headings.length >= MIN_SECTIONS;

  return (
    <div className={s.root}>
      <Header />
      <main className={s.page}>
        <p className={s.back}>
          <Link href={back}>← All posts</Link>
        </p>
        <article>
          <header className={s.title}>
            <p className={s.kicker}>
              <Link href={pageUrl(1, post.topic)}>{topics[post.topic]}</Link>
            </p>
            <h1>{post.title}</h1>
            <p>{post.description}</p>
            <div className={s.byline}>
              <div className={s.author}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a small square photo, already the right size */}
                <img src={person.photo} alt="" width={44} height={44} />
                <div>
                  <p>{person.name}</p>
                  <Meta post={post} />
                </div>
              </div>
              <p className={s.share}>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Share on LinkedIn
                </a>
                <CopyButton kind="link" text={address} />
              </p>
            </div>
          </header>

          <Cover post={post} large />

          <div className={contents ? s.withContents : s.body}>
            <div className={s.prose}>
              <Content />
            </div>
            {contents && <Contents headings={post.headings} />}
          </div>
        </article>

        <nav className={s.more} aria-label="More posts">
          {newer ? <Next label="← Newer post" post={newer} /> : <AllPosts href={back} />}
          {older ? <Next label="Older post →" post={older} /> : newer && <AllPosts href={back} />}
        </nav>

        <section className={s.subscribe} aria-labelledby="subscribe">
          <div>
            <h2 id="subscribe">Get the next post</h2>
            <p>New posts go out on the RSS feed, and I share each one on LinkedIn.</p>
          </div>
          <Follow dark />
        </section>
      </main>
      <Footer />
    </div>
  );
}

/** A card for the next post along, newer or older. */
function Next({ label, post }: { label: string; post: Post }) {
  return (
    <Link href={post.url} className={s.next}>
      <span>{label}</span>
      <span>{post.title}</span>
    </Link>
  );
}

/** The card back to the list, in place of a post when there is none that way. */
function AllPosts({ href }: { href: string }) {
  return (
    <Link href={href} className={s.next}>
      <span>← All posts</span>
      <span>{blog.description}</span>
    </Link>
  );
}
