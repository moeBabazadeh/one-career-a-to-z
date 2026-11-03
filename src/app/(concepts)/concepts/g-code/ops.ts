// The CAM operations for the setup sheet, built once and shared by the server-rendered
// headers and the client previews (both get the same deterministic programs).

import { oss } from '../_shared/data';
import { buildOps } from './gcode';

const pr = (url: string) => `PR #${url.split('/').pop()}`;

export const OPS = buildOps(oss.map((c) => pr(c.url)));

export const opById = (id: string) => OPS.find((o) => o.id === id) ?? OPS[0];
