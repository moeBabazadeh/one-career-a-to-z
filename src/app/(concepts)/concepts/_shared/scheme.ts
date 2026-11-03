/**
 * Light or dark, for the themes that support both. With no saved choice it follows the system;
 * a choice lives in localStorage and on `<html data-scheme>`, which the layout's inline script
 * sets before first paint so a dark page never flashes light.
 */
export type Scheme = 'light' | 'dark';

const KEY = 'scheme';

export const schemeScript = `try{var s=localStorage.getItem('${KEY}');if(s==='light'||s==='dark')document.documentElement.dataset.scheme=s}catch(e){}`;

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function subscribeScheme(onChange: () => void) {
  const mq = media();
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-scheme'],
  });
  mq.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    mq.removeEventListener('change', onChange);
  };
}

/** The scheme in effect right now: the saved choice, else the system's. */
export function readScheme(): Scheme {
  return readChoice() ?? (media().matches ? 'dark' : 'light');
}

/** The saved choice, or `null` when following the system. */
export function readChoice(): Scheme | null {
  const saved = document.documentElement.dataset.scheme;
  return saved === 'light' || saved === 'dark' ? saved : null;
}

/** A CSS custom property's value on an element, for drawing code that paints with tokens. */
export const token = (el: Element, name: string) =>
  getComputedStyle(el).getPropertyValue(name).trim();

/** Saves a choice, or with `null` goes back to following the system. */
export function writeScheme(scheme: Scheme | null) {
  const root = document.documentElement;
  if (scheme) root.dataset.scheme = scheme;
  else delete root.dataset.scheme;
  try {
    if (scheme) localStorage.setItem(KEY, scheme);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked; the choice still holds for this page.
  }
}
