import { person } from '@/content/db';
import { blog, getPosts, postDate, topics } from '../posts';

// The feed is written once, at build time.
export const dynamic = 'force-static';

const escape = (text: string) =>
  text.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string,
  );

/** The blog as an RSS feed: every post's title, address, date, topic and summary, newest first. */
export async function GET() {
  const posts = await getPosts();
  const items = posts.map(
    (post) => `    <item>
      <title>${escape(post.title)}</title>
      <link>${person.url}${post.url}</link>
      <guid>${person.url}${post.url}</guid>
      <pubDate>${postDate(post.date).toUTCString()}</pubDate>
      <category>${escape(topics[post.topic])}</category>
      <description>${escape(post.description)}</description>
    </item>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(`${person.name} · ${blog.title}`)}</title>
    <link>${person.url}${blog.url}</link>
    <description>${escape(blog.description)}</description>
    <language>en-gb</language>
    <atom:link href="${person.url}${blog.feed}" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
