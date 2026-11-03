import type { ProjectLinks } from '@/content/projects';

export interface LinkItem {
  label: string;
  url: string;
  kind: 'site' | 'store' | 'code';
}

/** A project's links as labelled entries, site first. */
export function projectLinks(links: ProjectLinks): LinkItem[] {
  const items: LinkItem[] = [];
  if (links.external)
    items.push({
      label: new URL(links.external).host.replace(/^www\./, ''),
      url: links.external,
      kind: 'site',
    });
  if (links.appStore) items.push({ label: 'App Store', url: links.appStore, kind: 'store' });
  if (links.playStore) items.push({ label: 'Google Play', url: links.playStore, kind: 'store' });
  if (links.github) items.push({ label: 'Code', url: links.github, kind: 'code' });
  return items;
}
