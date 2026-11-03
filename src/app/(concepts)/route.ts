import { NextResponse, type NextRequest } from 'next/server';
import { concepts } from './concepts/_shared/concepts';
import {
  DEALT_COOKIE,
  DEAL_MODE_COOKIE,
  PIN_COOKIE,
  RANDOM,
  randomTheme,
  startTheme,
} from './concepts/_shared/theme';

export const dynamic = 'force-dynamic';

/**
 * The home page. Sends a visitor to the theme they pinned, deals one from the whole A to Z set if
 * they asked for surprises, and otherwise opens one of the top picks at random. `?shuffle` always
 * deals from the whole set, for "surprise me" links. `?after=<slug>` comes from reloading a dealt
 * page (see dealScript) and keeps the next deal off the theme just shown.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const shuffle = params.has('shuffle');
  const after = params.get('after') ?? undefined;
  const choice = shuffle ? RANDOM : request.cookies.get(PIN_COOKIE)?.value;
  const pinned = choice === RANDOM ? undefined : concepts.find((c) => c.slug === choice);
  const theme = pinned ?? (choice === RANDOM ? randomTheme(after) : startTheme(after));
  const response = NextResponse.redirect(new URL(`/concepts/${theme.slug}`, request.url), 307);
  response.headers.set('Cache-Control', 'no-store');
  // Anything not pinned was dealt, so the switcher can say so.
  if (!pinned) {
    response.cookies.set(DEALT_COOKIE, theme.slug, { path: '/', maxAge: 60, sameSite: 'lax' });
    response.cookies.set(DEAL_MODE_COOKIE, shuffle ? 'shuffle' : 'top', {
      path: '/',
      maxAge: 60,
      sameSite: 'lax',
    });
  }
  return response;
}
