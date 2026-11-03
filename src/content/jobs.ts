import { roleList, titleOf } from './db';
import { monthSpan } from './format';

export interface Job {
  company: string;
  title: string;
  url?: string;
  range: string;
  duties: string[];
}

// The classic site's experience list, read from db.ts.
export const jobs: Job[] = roleList.map((r) => ({
  company: r.short ?? r.org,
  title: titleOf(r),
  ...(r.url ? { url: r.url } : {}),
  range: monthSpan(r.from, r.to),
  duties: r.duties,
}));
