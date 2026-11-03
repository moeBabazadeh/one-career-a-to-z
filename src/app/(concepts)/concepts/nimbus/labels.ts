// Names for console paths: breadcrumbs, recently visited, and icons per service.
import {
  ACCOUNT,
  bucketById,
  resourceByKey,
  roleById,
  serviceById,
  type ServiceId,
} from './inventory';
import type { IconName } from './ui';

const SERVICE_ICON: Record<ServiceId, IconName> = {
  compute: 'compute',
  iot: 'iot',
  databases: 'databases',
  ml: 'ml',
  storage: 'storage',
  iam: 'iam',
};
const PAGE_ICON: Record<string, IconName> = {
  resources: 'resources',
  regions: 'regions',
  events: 'events',
  billing: 'billing',
  marketplace: 'marketplace',
  services: 'services',
  read: 'book',
};

export const iconOf = (id: string): IconName =>
  SERVICE_ICON[id as ServiceId] ?? PAGE_ICON[id] ?? 'home';

const LABELS: Record<string, string> = {
  regions: 'Regions',
  billing: 'Billing',
  events: 'Audit trail',
  marketplace: 'Marketplace',
  services: 'All services',
  resources: 'All resources',
};

/** Breadcrumbs for a path, home first. */
export function crumbs(path: string): { label: string; path: string }[] {
  const out = [{ label: 'Console Home', path: '' }];
  const seg = path.split('/').filter(Boolean);
  if (!seg.length) return out;
  const [a, b, c] = seg;
  const svc = serviceById(a);
  if (svc && a !== 'iam' && a !== 'storage') {
    out.push({ label: svc.name, path: a });
    return out;
  }
  switch (a) {
    case 'resources': {
      out.push({ label: LABELS.resources, path: a });
      const sv = b ? serviceById(b) : undefined;
      if (sv) out.push({ label: sv.name, path: b });
      const r = b && c ? resourceByKey(`${b}/${c}`) : undefined;
      if (r) out.push({ label: r.name, path });
      break;
    }
    case 'iam':
      out.push({ label: 'Identity', path: 'iam' });
      if (b === 'roles') out.push({ label: 'Roles', path: 'iam/roles' });
      if (b === 'roles' && c) out.push({ label: roleById(c)?.id ?? c, path });
      if (b === 'simulator') out.push({ label: 'Policy simulator', path });
      if (b === 'users') out.push({ label: `User ${c ?? ACCOUNT}`, path });
      break;
    case 'storage':
      out.push({ label: 'Storage', path: 'storage' });
      if (b) {
        out.push({ label: bucketById(b)?.id ?? b, path: `storage/${b}` });
        seg.slice(2).forEach((p, i) => out.push({ label: p, path: seg.slice(0, 3 + i).join('/') }));
      }
      break;
    default:
      out.push({ label: LABELS[a] ?? a, path: a });
  }
  return out;
}

/** The last breadcrumb's label: what a path is called. */
export const crumbLabel = (path: string) => crumbs(path).at(-1)?.label ?? path;
