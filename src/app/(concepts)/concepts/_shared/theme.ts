import { mainConcepts, type Concept } from './concepts';

/**
 * What `/` opens: the theme a visitor pinned, a random one if they chose "surprise me", or the
 * default theme. The choice lives in a cookie so the server can read it before anything renders.
 */
export const PIN_COOKIE = 'theme';
/** The pin value for "deal me a random theme every visit". */
export const RANDOM = 'random';
/** Set for a minute after a random deal, so the switcher can say what just happened. */
export const DEALT_COOKIE = 'theme_dealt';
/** How that deal was asked for: `shuffle` (a `?shuffle` link) or `pin` (the visitor's "surprise me"). */
export const DEAL_MODE_COOKIE = 'theme_deal';
/** The page a deal landed on, kept for the tab so reloading it deals again. */
const DEALT_KEY = 'theme-dealt';

/**
 * The theme `/` opens for a visitor who hasn't chosen one. It is the one that reads most like a
 * plain page: every section in order, top to bottom, under ordinary headings. Change the slug
 * here to open the site on a different theme.
 */
const DEFAULT_THEME = 'circuit-board';
export const defaultTheme = mainConcepts.find((c) => c.slug === DEFAULT_THEME) as Concept;

/** The top picks (the themes Moe rated 10), badged in the switcher and the gallery. */
const TOP_PICKS = ['circuit-board', 'kickoff', 'pull-request', 'spatial', 'whiteboard'];
export const topPicks = mainConcepts.filter((c) => TOP_PICKS.includes(c.slug));

/**
 * Runs before paint on every concept page. A page that `/` dealt (the dealt cookie names it) is
 * remembered for the tab, and reloading it goes back to `/` for a fresh deal of the same kind,
 * skipping the theme just shown. A theme the visitor opened on purpose stays put on reload. The
 * memory is cleared before going back, so if `/` answers with the same page (the default theme,
 * once the visitor has stopped asking for surprises) it can't bounce a second time.
 */
export const dealScript = `try{var p=location.pathname,s=sessionStorage,d=(s.getItem('${DEALT_KEY}')||'').split(' '),n=performance.getEntriesByType('navigation')[0],c=function(k){var m=document.cookie.match(new RegExp('(?:^|; )'+k+'=([^;]*)'));return m?decodeURIComponent(m[1]):null};if(n&&n.type==='reload'&&d[0]===p){s.removeItem('${DEALT_KEY}');location.replace('/?'+(d[1]==='shuffle'?'shuffle&':'')+'after='+p.split('/').pop())}else if('/concepts/'+c('${DEALT_COOKIE}')===p)s.setItem('${DEALT_KEY}',p+' '+(c('${DEAL_MODE_COOKIE}')||'pin'))}catch(e){}`;

/** A random theme from the A to Z set; bonus themes are never dealt. */
export function randomTheme(except?: string) {
  const pool = mainConcepts.filter((c) => c.slug !== except);
  return pool[Math.floor(Math.random() * pool.length)];
}

const listeners = new Set<() => void>();

export function subscribePin(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function readCookie(name: string) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export const readPin = () => readCookie(PIN_COOKIE);

/** Pins a theme (or `RANDOM`) for future visits, or goes back to the default with `null`. */
export function writePin(slug: string | null) {
  if (slug) document.cookie = `${PIN_COOKIE}=${slug}; Path=/; Max-Age=31536000; SameSite=Lax`;
  else clearCookie(PIN_COOKIE);
  listeners.forEach((onChange) => onChange());
}
