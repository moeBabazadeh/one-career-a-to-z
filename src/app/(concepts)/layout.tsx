import type { Metadata } from 'next';
import { lede, person } from '@/content/db';
import Switcher from './concepts/_shared/Switcher';
import { fontVariables } from './concepts/_shared/fonts';
import { shareDefaults, shareImage } from './concepts/_shared/metadata';
import { schemeScript } from './concepts/_shared/scheme';
import { dealScript } from './concepts/_shared/theme';
import './concepts.css';

export const metadata: Metadata = {
  metadataBase: new URL(person.url),
  title: { template: `%s · ${person.name}`, default: `${person.name} · ${person.headline}` },
  description: lede,
  applicationName: person.name,
  authors: [{ name: person.name, url: person.url }],
  openGraph: { ...shareDefaults, images: [shareImage('gallery', `${person.name}'s themes`)] },
  twitter: { card: 'summary_large_image' },
};

// Root layout for the design concepts. It lives in its own route group, so none of the
// live site's global styles (pages/_app) reach it.
export default function ConceptsLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline scripts run before paint: one re-deals a reloaded random theme, the other sets
    // data-scheme on <html> before React hydrates it.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: dealScript }} />
        <script dangerouslySetInnerHTML={{ __html: schemeScript }} />
      </head>
      <body>
        {children}
        <Switcher />
      </body>
    </html>
  );
}
