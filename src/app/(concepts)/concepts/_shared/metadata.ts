import type { Metadata } from 'next';
import { person } from '@/content/db';
import { concept, conceptTitle } from './concepts';

/** What every page shares when it's posted: the site's name and the page's own image. */
export const shareDefaults = { type: 'website', siteName: person.name, locale: 'en_GB' } as const;

/** A 1200 × 630 share image from public/og, made from a screenshot of the page. */
export const shareImage = (name: string, alt: string) => ({
  url: `/og/${name}.jpg`,
  width: 1200,
  height: 630,
  alt,
});

/** A theme page's metadata: its title, its thesis as the description, and its own share image. */
export function conceptMetadata(slug: string): Metadata {
  const { thesis } = concept(slug);
  const title = conceptTitle(slug);
  const url = `/concepts/${slug}`;
  const images = [shareImage(slug, `${title}, a theme of ${person.site}`)];
  return {
    title,
    description: thesis,
    alternates: { canonical: url },
    openGraph: { ...shareDefaults, title, description: thesis, url, images },
    twitter: { card: 'summary_large_image', title, description: thesis, images },
  };
}
