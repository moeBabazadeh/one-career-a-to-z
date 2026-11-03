// The palette: skills as node types, grouped like an editor's categories. Each one knows which
// projects use it, matched on the projects' own tech lists.

import { featuredProjects, oss, otherProjects, skills } from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';
import type { IconName } from './icons';

export interface Skill {
  id: string;
  label: string;
  match: string[];
  core: boolean;
}

export interface Category {
  id: string;
  label: string;
  color: string;
  icon: IconName;
  skills: Skill[];
}

const CORE = new Set(skills);
const skill = (label: string, match: string[]): Skill => ({
  id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  label,
  match,
  core: CORE.has(label),
});

export const PALETTE: Category[] = [
  {
    id: 'web',
    label: 'web',
    color: '#fdd0a2',
    icon: 'browser',
    skills: [
      skill('TypeScript', ['TypeScript']),
      skill('React & Next.js', ['React', 'Next.js']),
      skill('Laravel (PHP)', ['Laravel', 'PHP 8']),
      skill('Python & FastAPI', ['FastAPI']),
      skill('SvelteKit', ['SvelteKit']),
      skill('Autodesk APS', ['Autodesk APS']),
      skill('Office.js', ['Office.js']),
    ],
  },
  {
    id: 'mobile',
    label: 'mobile',
    color: '#a6bbcf',
    icon: 'phone',
    skills: [
      skill('React Native & Expo', ['React Native', 'Expo']),
      skill('Swift', ['Swift', 'SwiftUI']),
    ],
  },
  {
    id: 'cloud',
    label: 'cloud & data',
    color: '#deb887',
    icon: 'db',
    skills: [skill('AWS', ['AWS', 'AWS Amplify']), skill('PostgreSQL & MySQL', ['pgvector'])],
  },
  {
    id: 'embedded',
    label: 'embedded',
    color: '#87a980',
    icon: 'chip',
    skills: [
      skill('Embedded C', ['C', 'Firmware']),
      skill('ESP32', ['ESP32']),
      skill('nRF52840', ['nRF52840']),
      skill('STM', ['STM']),
      skill('FreeRTOS', ['FreeRTOS']),
      skill('GSM', ['GSM']),
    ],
  },
  {
    id: 'ai',
    label: 'ai',
    color: '#ffc2b3',
    icon: 'spark',
    skills: [
      skill('OpenAI', ['OpenAI']),
      skill('pgvector', ['pgvector']),
      skill('Vision', ['Vision']),
    ],
  },
];

/** Contributed upstream: listed in the palette like installed contrib nodes. */
export const CONTRIB = oss.map((c, i) => ({
  id: `c${i}`,
  label: c.repo.split('/')[1],
  repo: c.repo,
  weekly: c.weekly,
}));

export const SKILLS = PALETTE.flatMap((c) => c.skills.map((s) => ({ ...s, category: c })));

const PROJECTS = [...featuredProjects, ...otherProjects];

/** The projects whose tech list mentions any of the skill's names. */
export function usedIn(s: Skill): { title: string; tech: string[]; links: LinkItem[] }[] {
  return PROJECTS.filter((p) => p.tech.some((t) => s.match.includes(t))).map((p) => ({
    title: p.title,
    tech: p.tech,
    links: projectLinks(p.links),
  }));
}
