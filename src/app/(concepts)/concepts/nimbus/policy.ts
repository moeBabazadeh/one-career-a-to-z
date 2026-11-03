// IAM for the career. Each role gets a trust policy (the organisation that could assume it, when,
// and under which titles) and a permissions policy whose Allow statements are the role's real
// duties, time-boxed by the role's dates. A small evaluator runs them the way IAM does: an
// explicit Deny wins, then any matching Allow, and anything else is implicitly denied.
import { db, fmt } from '../_shared/data';
import {
  BRAND,
  ACCOUNT,
  PascalCase,
  RESOURCES,
  ROLES,
  crn,
  endOf,
  ym,
  type RoleInfo,
} from './inventory';

type Value = string | string[] | boolean;
export type Conditions = Record<string, Record<string, Value>>;

export interface Statement {
  Sid: string;
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Conditions;
  /** The duty, word for word from the CV. */
  Duty?: string;
}

export interface Policy {
  Version: string;
  Statement: Statement[];
}

export interface TrustPolicy {
  Version: string;
  Statement: {
    Sid: string;
    Effect: 'Allow';
    Principal: Record<string, string>;
    Action: string;
    Condition: Conditions;
  }[];
}

export const TIME_KEY = `${BRAND}:CurrentTime`;
export const TITLE_KEY = 'identity:Title';
export const CONTRACT_KEY = 'identity:Contract';

/** Words a cut-off clause should not end on. */
const TRAIL = new Set(['to', 'by', 'via', 'across', 'than']);
const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'of',
  'my',
  'i',
  'on',
  'for',
  'with',
  'at',
  'as',
  'from',
  'into',
  'in',
]);

/** A statement id from a duty's first clause: "Set the engineering bar: …" → SetEngineeringBar. */
export function sidOf(duty: string) {
  const text = duty.replace(/^At [^,]+,\s*/, '');
  const clause = text.split(/[,:;]\s|\.\s/)[0];
  const words = clause
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()) && !w.includes('.'));
  const kept = words.length <= 5 ? words : words.slice(0, 4);
  while (kept.length > 1 && TRAIL.has(kept[kept.length - 1].toLowerCase())) kept.pop();
  return PascalCase(kept);
}

const timeBox = (r: db.Role): Conditions => ({
  DateGreaterThanEquals: { [TIME_KEY]: fmt.iso(r.from) },
  ...(r.to ? { DateLessThan: { [TIME_KEY]: fmt.iso(r.to) } } : {}),
});

/** CRNs of the resources a duty names: products by title, devices by chip. */
function resourcesIn(duty: string, r: db.Role) {
  const hits = RESOURCES.filter((res) => {
    if (res.service === 'iam' || res.service === 'storage' || res.service === 'databases')
      return false;
    if (res.service === 'ml') return false;
    const chip = res.tags.find(([k]) => k === 'chip')?.[1];
    return duty.includes(res.name) || (chip !== undefined && duty.includes(chip));
  }).map((res) => res.crn);
  return hits.length ? hits : [`${crn('iam', '', 'org', r.id)}/*`];
}

export function permissionsPolicy(info: RoleInfo): Policy {
  const r = info.role;
  return {
    Version: fmt.iso(r.from),
    Statement: r.duties.map((duty) => {
      const sid = sidOf(duty);
      const res = resourcesIn(duty, r);
      return {
        Sid: sid,
        Effect: 'Allow',
        Action: `${r.id}:${sid}`,
        Resource: res.length === 1 ? res[0] : res,
        Condition: timeBox(r),
        Duty: duty,
      };
    }),
  };
}

export function trustPolicy(info: RoleInfo): TrustPolicy {
  const r = info.role;
  const principal: Record<string, string> = { Organization: r.org };
  if (r.url) principal.Url = r.url;
  if (r.sector) principal.Sector = r.sector;
  return {
    Version: fmt.iso(r.from),
    Statement: [
      {
        Sid: `Trust${PascalCase([r.short ?? r.org])}`,
        Effect: 'Allow',
        Principal: principal,
        Action: 'identity:AssumeRole',
        Condition: {
          StringEquals: { [TITLE_KEY]: r.steps.map((s) => s.title) },
          ...(r.contract ? { Bool: { [CONTRACT_KEY]: true } } : {}),
          ...timeBox(r),
        },
      },
    ],
  };
}

export const POLICIES = Object.fromEntries(
  ROLES.map((info) => [
    info.id,
    { permissions: permissionsPolicy(info), trust: trustPolicy(info) },
  ]),
);

/* ------------------------------------------------------------------ evaluation */

export type Context = Record<string, string | boolean | undefined>;

/** "2021-02" or "2017" as a month number; a bare year counts from mid-year, as the facts do. */
const monthOf = (s: string) => {
  const [y, m] = s.split('-').map(Number);
  return ym({ y, m: m || undefined });
};

const glob = (pattern: string, value: string) =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`,
    'i',
  ).test(value);
const list = <T>(v: T | T[]) => (Array.isArray(v) ? v : [v]);

function conditionHolds(conditions: Conditions | undefined, ctx: Context) {
  if (!conditions) return true;
  return Object.entries(conditions).every(([op, pairs]) =>
    Object.entries(pairs).every(([key, want]) => {
      const have = ctx[key];
      if (have === undefined) return false;
      switch (op) {
        case 'DateGreaterThanEquals':
          return monthOf(String(have)) >= monthOf(String(want));
        case 'DateLessThan':
          return monthOf(String(have)) < monthOf(String(want));
        case 'StringEquals':
          return list(want as string | string[]).some((w) => w === have);
        case 'Bool':
          return String(have) === String(want);
        default:
          return false;
      }
    }),
  );
}

export interface Decision {
  decision: 'Allow' | 'ExplicitDeny' | 'ImplicitDeny';
  matched: string[];
}

export function evaluate(
  statements: Pick<Statement, 'Sid' | 'Effect' | 'Action' | 'Condition'>[],
  action: string,
  ctx: Context,
): Decision {
  const hits = statements.filter(
    (s) => list(s.Action).some((a) => glob(a, action)) && conditionHolds(s.Condition, ctx),
  );
  const deny = hits.filter((s) => s.Effect === 'Deny');
  if (deny.length) return { decision: 'ExplicitDeny', matched: deny.map((s) => s.Sid) };
  const allow = hits.filter((s) => s.Effect === 'Allow');
  if (allow.length) return { decision: 'Allow', matched: allow.map((s) => s.Sid) };
  return { decision: 'ImplicitDeny', matched: [] };
}

/** The title a role carried at a month, if it was held then. */
export function titleAt(r: db.Role, at: db.YearMonth) {
  const t = ym(at);
  if (t < ym(r.from) || t >= ym(endOf(r)) + (r.to ? 0 : 1)) return null;
  return [...r.steps].reverse().find((s) => ym(s.from) <= t)?.title ?? r.steps[0].title;
}

export interface Simulation {
  info: RoleInfo;
  trust: Decision;
  title: string | null;
  actions: { action: string; sid: string; duty: string; result: Decision }[];
}

/** Every role at one month: could it be assumed, and which of its actions were allowed. */
export function simulate(at: db.YearMonth): Simulation[] {
  const time = fmt.iso({ y: at.y, m: at.m ?? 1 });
  return ROLES.map((info) => {
    const { trust, permissions } = POLICIES[info.id];
    const title = titleAt(info.role, at);
    const ctx: Context = {
      [TIME_KEY]: time,
      [TITLE_KEY]: title ?? undefined,
      [CONTRACT_KEY]: info.role.contract ? true : undefined,
    };
    const trustResult = evaluate(trust.Statement, 'identity:AssumeRole', ctx);
    return {
      info,
      trust: trustResult,
      title,
      actions: permissions.Statement.map((s) => ({
        action: s.Action as string,
        sid: s.Sid,
        duty: s.Duty ?? '',
        result:
          trustResult.decision === 'Allow'
            ? evaluate(permissions.Statement, s.Action as string, ctx)
            : { decision: 'ImplicitDeny' as const, matched: [] },
      })),
    };
  });
}

/** The account's own user, for the IAM users page and `cloud whoami`. */
export const USER = { name: ACCOUNT, crn: crn('iam', '', 'user', ACCOUNT) };
