import React from 'react';
import IconGitHub from '@/assets/icons/github';
import IconAppStore from '@/assets/icons/appstore';
import IconPlayStore from '@/assets/icons/playstore';
import IconExternal from '@/assets/icons/external';
import type { ProjectLinks as Links } from '@/content/projects';

const LINK_TYPES: { key: keyof Links; label: string; Icon: () => React.JSX.Element; className?: string }[] = [
  { key: 'github', label: 'GitHub', Icon: IconGitHub },
  { key: 'appStore', label: 'the App Store', Icon: IconAppStore },
  { key: 'playStore', label: 'Google Play', Icon: IconPlayStore },
  { key: 'external', label: 'the web', Icon: IconExternal, className: 'external' },
];

// The link a project's title points to: its site first, then its code, then a store.
export const primaryLink = (links: Links) =>
  links.external ?? links.github ?? links.appStore ?? links.playStore;

interface Props {
  title: string;
  links: Links;
  className?: string;
}

const ProjectLinks = ({ title, links, className = 'project-links' }: Props) => (
  <div className={className}>
    {LINK_TYPES.filter(({ key }) => links[key]).map(({ key, label, Icon, className }) => (
      <a
        key={key}
        href={links[key]}
        aria-label={`${title} on ${label}`}
        className={className}
        target="_blank"
        rel="noreferrer"
      >
        <Icon />
      </a>
    ))}
  </div>
);

export default ProjectLinks;
