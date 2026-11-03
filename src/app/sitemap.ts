import type { MetadataRoute } from 'next';
import { concepts } from './(concepts)/concepts/_shared/concepts';
import { asOf, person } from '@/content/db';

// Every public page: the gallery, each theme (the A to Z set ahead of the bonus ones) and the
// classic site. `/` itself only redirects to a theme, so it isn't listed.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(Date.UTC(asOf.y, (asOf.m ?? 1) - 1, asOf.d ?? 1));
  const page = (path: string, priority: number) => ({
    url: `${person.url}${path}`,
    lastModified,
    priority,
  });
  return [
    page('/concepts', 0.9),
    ...concepts.map((c) => page(`/concepts/${c.slug}`, c.bonus ? 0.4 : 0.7)),
    page('/classic', 0.5),
    page('/archive', 0.5),
  ];
}
