import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import GithubSlugger from 'github-slugger';
import type { MDXContent } from 'mdx/types';

/*
 * The blog's posts. A post is one MDX file in src/content/blog: the file name is its address
 * (`my-post.mdx` is /blog/my-post) and it describes itself at the top with
 * `export const metadata = { title, description, date, topic }`. Nothing else needs registering.
 */

/** The blog's own name and line, for its index page, its feed and its share card. */
export const blog = {
  title: 'Blog',
  description: 'Notes from building platforms, firmware and hardware.',
  url: '/blog',
  feed: '/blog/rss.xml',
};

/** What a post can be about. A post names one by its key, which is also its topic page's address. */
export const topics = {
  platforms: 'Platforms',
  hardware: 'Firmware & hardware',
  'side-projects': 'Side projects',
  notes: 'Notes',
} as const;

export type Topic = keyof typeof topics;

/** The topic an address names, if it names one. */
export const asTopic = (key: string): Topic | undefined =>
  Object.hasOwn(topics, key) ? (key as Topic) : undefined;

/** What a post says about itself. */
export interface PostMeta {
  title: string;
  /** A sentence or two: the summary in the list, in search results, in the feed and on share cards. */
  description: string;
  /** The day it was published, as YYYY-MM-DD. */
  date: string;
  /** What it is about: one of the keys of `topics`. */
  topic: Topic;
  /** Still being written: shown on the dev server, left out of every production build. */
  draft?: boolean;
}

/** One of a post's sections, for its contents list. */
export interface Heading {
  id: string;
  text: string;
}

export interface Post extends PostMeta {
  slug: string;
  url: string;
  /** Minutes to read, rounded up, as reading times usually are. */
  minutes: number;
  /** Its ## sections, in order. */
  headings: Heading[];
  Content: MDXContent;
}

const DIR = join(process.cwd(), 'src/content/blog');
const EXT = '.mdx';
const SHOW_DRAFTS = process.env.NODE_ENV !== 'production';
const WORDS_A_MINUTE = 220;

/** A post's source as a reader meets it: no metadata, comments or code blocks. */
const prose = (source: string) =>
  source
    .replace(/^export const metadata = \{[\s\S]*?^\};?/m, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');

/** Markdown inline text as it reads: links and images by their text, without marks or tags. */
const plain = (markdown: string) =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(^|\W)_{1,2}([^_]+)_{1,2}(?=\W|$)/g, '$1$2')
    .replace(/[*`]|~~/g, '')
    .trim();

/**
 * The sections of a post, with the ids rehype-slug gives its headings (next.config.mjs): the same
 * slugger, fed every heading in the same order, so the two always agree.
 */
function sections(text: string): Heading[] {
  const slugger = new GithubSlugger();
  return [...text.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t#]*$/gm)]
    .map(([, hashes, title]) => ({ depth: hashes.length, text: plain(title) }))
    .map(({ depth, text }) => ({ depth, text, id: slugger.slug(text) }))
    .filter(({ depth }) => depth === 2)
    .map(({ id, text }) => ({ id, text }));
}

async function load(slug: string): Promise<Post> {
  const file = `src/content/blog/${slug}${EXT}`;
  const { default: Content, metadata } = (await import(`@/content/blog/${slug}.mdx`)) as {
    default: MDXContent;
    metadata?: PostMeta;
  };
  // A post with a missing or mistyped field fails the build here, not quietly on the page.
  if (!metadata?.title || !metadata.description || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.date))
    throw new Error(
      `${file} needs "export const metadata = { title, description, date: 'YYYY-MM-DD', topic }".`,
    );
  if (!asTopic(metadata.topic))
    throw new Error(
      `${file} needs a topic, one of: ${Object.keys(topics)
        .map((key) => `'${key}'`)
        .join(', ')}.`,
    );
  const text = prose(readFileSync(join(DIR, `${slug}${EXT}`), 'utf8'));
  const words = plain(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)?.length ?? 0;
  return {
    ...metadata,
    slug,
    url: `${blog.url}/${slug}`,
    minutes: Math.max(1, Math.ceil(words / WORDS_A_MINUTE)),
    headings: sections(text),
    Content,
  };
}

/** Every post a visitor can read, newest first. */
export async function getPosts(): Promise<Post[]> {
  const slugs = readdirSync(DIR)
    .filter((file) => file.endsWith(EXT))
    .map((file) => file.slice(0, -EXT.length));
  const posts = await Promise.all(slugs.map(load));
  return posts
    .filter((post) => SHOW_DRAFTS || !post.draft)
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export const getPost = async (slug: string) => (await getPosts()).find((p) => p.slug === slug);

/** Whether there is anything to read yet, so links to the blog only appear once there is. */
export const hasPosts = async () => (await getPosts()).length > 0;

/** The posts either side of one in time, where there are any. */
export async function neighbours(slug: string) {
  const posts = await getPosts();
  const i = posts.findIndex((post) => post.slug === slug);
  return { newer: i > 0 ? posts[i - 1] : undefined, older: i < 0 ? undefined : posts[i + 1] };
}

/** The topics that have posts, in the order `topics` lists them. */
export async function usedTopics(): Promise<Topic[]> {
  const posts = await getPosts();
  return (Object.keys(topics) as Topic[]).filter((key) => posts.some((p) => p.topic === key));
}

/* ------------------------------------------------------------------ pages of the list */

/**
 * Cards on a page of the list: twelve fill rows of two or three. The first page has one more, the
 * newest post, shown large above them.
 */
export const PAGE_SIZE = 12;
const FIRST_PAGE = PAGE_SIZE + 1;

/** The page the post at this place in the list is on, and where a page starts. */
const pageOf = (i: number) => (i < FIRST_PAGE ? 1 : 2 + Math.floor((i - FIRST_PAGE) / PAGE_SIZE));
const pageStart = (n: number) => (n === 1 ? 0 : FIRST_PAGE + (n - 2) * PAGE_SIZE);

/** How many pages a list of this many posts takes; always at least one. */
const pageCount = (posts: number) => pageOf(Math.max(posts - 1, 0));

/** Where a page of the list lives: /blog, /blog/page/2…, or the same under /blog/topic/<topic>. */
export const pageUrl = (n: number, topic?: Topic) => {
  const base = topic ? `${blog.url}/topic/${topic}` : blog.url;
  return n === 1 ? base : `${base}/page/${n}`;
};

const postsAbout = async (topic?: Topic) =>
  (await getPosts()).filter((post) => !topic || post.topic === topic);

/**
 * One page of the list, of every post or of one topic's, or nothing if there is no such page. The
 * whole list's first page always exists, so the blog shows its empty state rather than a 404.
 */
export async function getPage(n: number, topic?: Topic) {
  const posts = await postsAbout(topic);
  const pages = pageCount(posts.length);
  if (!Number.isInteger(n) || n < 1 || n > pages || (topic && !posts.length)) return undefined;
  return {
    n,
    pages,
    topic,
    topics: await usedTopics(),
    posts: posts.slice(pageStart(n), pageStart(n + 1)),
  };
}

/** Route params for the pages after the first, as /blog/page/[n] and its share image need them. */
export const laterPages = async () =>
  Array.from({ length: pageCount((await getPosts()).length) - 1 }, (_, i) => ({
    n: String(i + 2),
  }));

/** Route params for each topic's first page. */
export const topicPages = async () => (await usedTopics()).map((topic) => ({ topic }));

/** Route params for each topic's later pages. */
export async function laterTopicPages() {
  const params: { topic: Topic; n: string }[] = [];
  for (const topic of await usedTopics()) {
    const pages = pageCount((await postsAbout(topic)).length);
    for (let n = 2; n <= pages; n++) params.push({ topic, n: String(n) });
  }
  return params;
}

/** A page number written the one way it should be ("2", not "02"), or NaN. */
export const parsePage = (n: string) => (/^[1-9]\d*$/.test(n) ? Number(n) : NaN);

/**
 * The way back from a post to the list: the page it is on, scrolled down to it. A post that heads
 * its page is already in view there, so that link stays a plain page address.
 */
export async function listUrl(slug: string) {
  const i = Math.max(
    (await getPosts()).findIndex((post) => post.slug === slug),
    0,
  );
  const n = pageOf(i);
  return i > pageStart(n) ? `${pageUrl(n)}#${slug}` : pageUrl(n);
}

/* ------------------------------------------------------------------ dates */

/** A post's date as a moment (midnight UTC), for feeds and metadata. */
export const postDate = (date: string) => new Date(`${date}T00:00:00Z`);

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "15 November 2026". */
export const formatDate = (date: string) => DAY.format(postDate(date));

/** The line under the title on a post's share card and cover: "Side projects · 15 November 2026". */
export const cardLine = (post: PostMeta) => `${topics[post.topic]} · ${formatDate(post.date)}`;
