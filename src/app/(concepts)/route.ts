import { NextResponse, type NextRequest } from 'next/server';
import { concepts } from './concepts/_shared/concepts';
import {
  DEALT_COOKIE,
  DEAL_MODE_COOKIE,
  PIN_COOKIE,
  RANDOM,
  defaultTheme,
  randomTheme,
} from './concepts/_shared/theme';

export const dynamic = 'force-dynamic';

/**
 * The home page. Sends a visitor to the theme they pinned, deals one from the whole A to Z set if
 * they asked for surprises, and otherwise opens the default theme. `?shuffle` always deals from
 * the whole set, for "surprise me" links. `?after=<slug>` comes from reloading a dealt page (see
 * dealScript) and keeps the next deal off the theme just shown.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const shuffle = params.has('shuffle');
  const after = params.get('after') ?? undefined;
  const choice = shuffle ? RANDOM : request.cookies.get(PIN_COOKIE)?.value;
  const dealt = choice === RANDOM;
  const pinned = dealt ? undefined : concepts.find((c) => c.slug === choice);
  const theme = dealt ? randomTheme(after) : (pinned ?? defaultTheme);
  const response = NextResponse.redirect(new URL(`/concepts/${theme.slug}`, request.url), 307);
  response.headers.set('Cache-Control', 'no-store');
  // A random deal is announced, so the switcher can say so.
  if (dealt) {
    response.cookies.set(DEALT_COOKIE, theme.slug, { path: '/', maxAge: 60, sameSite: 'lax' });
    response.cookies.set(DEAL_MODE_COOKIE, shuffle ? 'shuffle' : 'pin', {
      path: '/',
      maxAge: 60,
      sameSite: 'lax',
    });
  }
  return response;
}
