import { builds, featuredIds, products, type Build, type ProductId, type ProjectLinks } from './db';

export type { ProjectLinks };

export interface Project {
  title: string;
  description: string;
  tech: string[];
  links: ProjectLinks;
}

export interface FeaturedProject extends Project {
  image: string;
}

export type ArchiveEntry = Build;

// The classic site's project lists, read from db.ts.
export const featuredProjects: FeaturedProject[] = featuredIds.map(
  (id) => products[id] as FeaturedProject,
);

const OTHER: ProductId[] = [
  'educationGuide',
  'schoolHow',
  'epc',
  'miniPlc',
  'reactQueryKit',
  'gatsby',
  'pulseIot',
  'photoDedup',
  'matrixKeypad',
  'nanostores',
  'learningKit',
  'examKit',
];

export const otherProjects: Project[] = OTHER.map((id) => products[id]);

export const archive: ArchiveEntry[] = builds;
