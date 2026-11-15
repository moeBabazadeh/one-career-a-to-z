import type { MetadataRoute } from 'next';
import { blog, getPosts, postDate } from './(concepts)/blog/posts';
import { concepts } from './(concepts)/concepts/_shared/concepts';
import { asOf, person } from '@/content/db';

// Every public page: the gallery, each theme (the A to Z set ahead of the bonus ones), the blog
// and its posts, and the classic site. `/` itself only redirects to a theme, so it isn't listed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  const checked = new Date(Date.UTC(asOf.y, (asOf.m ?? 1) - 1, asOf.d ?? 1));
  const page = (path: string, priority: number, lastModified = checked) => ({
    url: `${person.url}${path}`,
    lastModified,
    priority,
  });
  return [
    page('/concepts', 0.9),
    ...concepts.map((c) => page(`/concepts/${c.slug}`, c.bonus ? 0.4 : 0.7)),
    // The blog changes when its newest post does; with nothing published it isn't listed.
    ...(posts.length ? [page(blog.url, 0.8, postDate(posts[0].date))] : []),
    ...posts.map((post) => page(post.url, 0.8, postDate(post.date))),
    page('/classic', 0.5),
    page('/archive', 0.5),
  ];
}
