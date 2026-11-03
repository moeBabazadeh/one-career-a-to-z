// The tracker's state as one small external store. A visitor's edits (status, priority, labels,
// project, order, new issues, comments, checklists) and their view settings live in localStorage
// so the workspace is as they left it; db's issues underneath never change, and Reset drops the
// edits. The server and the hydration pass see INITIAL with `ready` off, so hydration never
// mismatches; the saved state is read on the first client snapshot.

import { useSyncExternalStore } from 'react';
import type { ProductId } from '@/content/db';
import {
  CYCLES,
  ISSUES,
  LABELS,
  PRIORITIES,
  PROJECTS,
  STATUSES,
  TEAMS,
  dateKey,
  isClosed,
  label,
  priorityName,
  priorityRank,
  project,
  statusName,
  team,
  type Activity,
  type Issue,
  type LabelId,
  type Priority,
  type StatusId,
  type TeamId,
} from './model';

export type ViewId = 'board' | 'list' | 'roadmap' | 'my' | 'projects' | 'cycles' | 'profile';
export const VIEWS: ViewId[] = ['board', 'list', 'roadmap', 'my', 'projects', 'cycles', 'profile'];
export const VIEW_NAME: Record<ViewId, string> = {
  board: 'Board',
  list: 'List',
  roadmap: 'Roadmap',
  my: 'My issues',
  projects: 'Projects',
  cycles: 'Cycles',
  profile: 'Profile',
};
/** The views that show issues, and so take filters and display options. */
export const ISSUE_VIEWS: ViewId[] = ['board', 'list', 'my'];

export type Grouping = 'status' | 'project' | 'team' | 'priority' | 'cycle' | 'none';
export type Ordering = 'manual' | 'priority' | 'date' | 'id';
export type Field = 'team' | 'status' | 'priority' | 'label' | 'project' | 'cycle';
export type Prop =
  'id' | 'status' | 'priority' | 'labels' | 'project' | 'date' | 'links' | 'assignee';
export type MyTab = 'assigned' | 'completed' | 'activity' | 'created';

export const GROUPINGS: { id: Grouping; name: string }[] = [
  { id: 'status', name: 'Status' },
  { id: 'project', name: 'Project' },
  { id: 'team', name: 'Team' },
  { id: 'priority', name: 'Priority' },
  { id: 'cycle', name: 'Cycle' },
  { id: 'none', name: 'No grouping' },
];
export const ORDERINGS: { id: Ordering; name: string }[] = [
  { id: 'manual', name: 'Manual' },
  { id: 'priority', name: 'Priority' },
  { id: 'date', name: 'Start date' },
  { id: 'id', name: 'Identifier' },
];
export const FIELDS: { id: Field; name: string }[] = [
  { id: 'status', name: 'Status' },
  { id: 'team', name: 'Team' },
  { id: 'label', name: 'Label' },
  { id: 'project', name: 'Project' },
  { id: 'priority', name: 'Priority' },
  { id: 'cycle', name: 'Cycle' },
];
export const PROPS: { id: Prop; name: string }[] = [
  { id: 'id', name: 'ID' },
  { id: 'status', name: 'Status' },
  { id: 'priority', name: 'Priority' },
  { id: 'labels', name: 'Labels' },
  { id: 'project', name: 'Project' },
  { id: 'date', name: 'Date' },
  { id: 'links', name: 'Links' },
  { id: 'assignee', name: 'Assignee' },
];

export interface Filter {
  field: Field;
  values: string[];
}

export interface Display {
  grouping: Grouping;
  ordering: Ordering;
  showEmpty: boolean;
  props: Prop[];
}

export interface Patch {
  status?: StatusId;
  priority?: Priority;
  labels?: LabelId[];
  project?: ProductId | null;
  sort?: number;
}

export interface LocalEvent {
  id: number;
  issue: string;
  at: number;
  stamp: string;
  kind: Activity['kind'];
  text: string;
  from?: StatusId;
  to?: StatusId;
}

interface Data {
  patches: Record<string, Patch>;
  created: Issue[];
  log: LocalEvent[];
  checks: Record<string, boolean>;
  seq: number;
}

interface Saved extends Data {
  view: ViewId;
  myTab: MyTab;
  display: Display;
  filters: Filter[];
  query: string;
}

export type Picker =
  | { kind: 'command' }
  | { kind: 'status' | 'priority' | 'labels' | 'project'; targets: string[] }
  | { kind: 'filter'; field?: Field };

export interface Peek {
  kind: 'issue' | 'project';
  id: string;
}

export interface State extends Saved {
  ready: boolean;
  focus: string | null;
  selected: string[];
  peek: Peek | null;
  picker: Picker | null;
  create: { status?: StatusId; team?: TeamId } | null;
  help: boolean;
  reading: boolean;
  drawer: boolean;
  toast: { id: number; text: string; undo: boolean } | null;
  undo: Data[];
  chord: boolean;
}

/** Bump when the saved shape changes. */
const KEY = 'concepts.tracker.v1';

export const DEFAULT_DISPLAY: Display = {
  grouping: 'status',
  ordering: 'manual',
  showEmpty: true,
  props: ['id', 'status', 'priority', 'labels', 'project', 'date', 'links', 'assignee'],
};

const DATA: Data = { patches: {}, created: [], log: [], checks: {}, seq: 0 };

export const INITIAL: State = {
  ...DATA,
  view: 'board',
  myTab: 'assigned',
  display: DEFAULT_DISPLAY,
  filters: [],
  query: '',
  ready: false,
  focus: null,
  selected: [],
  peek: null,
  picker: null,
  create: null,
  help: false,
  reading: false,
  drawer: false,
  toast: null,
  undo: [],
  chord: false,
};

/* ------------------------------------------------------------------ the URL hash: view, peek, page */

function fromHash(): Pick<State, 'view' | 'peek' | 'reading'> | null {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return null;
  if (raw === 'read') return { view: 'board', peek: null, reading: true };
  const [v, id] = raw.split('/');
  if (!VIEWS.includes(v as ViewId)) return null;
  let peek: Peek | null = null;
  if (id && PROJECTS.some((p) => p.id === id)) peek = { kind: 'project', id };
  else if (id) peek = { kind: 'issue', id: id.toUpperCase() };
  return { view: v as ViewId, peek, reading: false };
}

function toHash(s: State) {
  if (s.reading) return '#read';
  return `#${s.view}${s.peek ? `/${s.peek.id}` : ''}`;
}

function writeHash(s: State) {
  try {
    const next = toHash(s);
    if (location.hash !== next) history.replaceState(null, '', next);
  } catch {
    // Some embeds disallow it; the view still changes.
  }
}

/* ------------------------------------------------------------------ the store */

let state: State | null = null;
const listeners = new Set<() => void>();

const phone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches;

function load(): State {
  let s: State = { ...INITIAL, ready: true };
  let savedView = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Saved>;
      s = { ...s, ...saved, display: { ...DEFAULT_DISPLAY, ...saved.display }, ready: true };
      savedView = Boolean(saved.view);
    }
  } catch {
    // Storage blocked or unreadable: start fresh.
  }
  // Phones open on the list; a saved choice or a link wins.
  if (!savedView && phone()) s.view = 'list';
  const linked = fromHash();
  if (linked) s = { ...s, ...linked };
  if (s.peek?.kind === 'issue' && !issuesOf(s).some((i) => i.id === s.peek?.id)) s.peek = null;
  return s;
}

export const get = (): State => (state ??= load());

function save(s: State) {
  try {
    const saved: Saved = {
      patches: s.patches,
      created: s.created,
      log: s.log,
      checks: s.checks,
      seq: s.seq,
      view: s.view,
      myTab: s.myTab,
      display: s.display,
      filters: s.filters,
      query: s.query,
    };
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Not persisted; the page still works for this visit.
  }
}

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const prev = get();
  const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
  state = next;
  save(next);
  if (next.view !== prev.view || next.peek !== prev.peek || next.reading !== prev.reading)
    writeHash(next);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onHash = () => {
    const linked = fromHash();
    if (linked && toHash({ ...get(), ...linked }) !== toHash(get())) set(linked);
  };
  window.addEventListener('hashchange', onHash);
  return () => {
    listeners.delete(l);
    window.removeEventListener('hashchange', onHash);
  };
}

export const useTracker = () => useSyncExternalStore(subscribe, get, () => INITIAL);

/* ------------------------------------------------------------------ derived */

let issueCache: { patches: State['patches']; created: Issue[]; list: Issue[] } | null = null;

/** Every issue as it stands: db's, with the visitor's edits on top, then theirs. */
export function issuesOf(s: Pick<State, 'patches' | 'created'>): Issue[] {
  if (issueCache && issueCache.patches === s.patches && issueCache.created === s.created)
    return issueCache.list;
  const list = [...ISSUES, ...s.created].map((i) => {
    const p = s.patches[i.id];
    return p ? { ...i, ...p } : i;
  });
  issueCache = { patches: s.patches, created: s.created, list };
  return list;
}

export const findIssue = (s: State, id: string) => issuesOf(s).find((i) => i.id === id);

function valueOf(i: Issue, field: Field): string[] {
  switch (field) {
    case 'team':
      return [i.team];
    case 'status':
      return [i.status];
    case 'priority':
      return [String(i.priority)];
    case 'label':
      return i.labels;
    case 'project':
      return [i.project ?? 'none'];
    case 'cycle':
      return [i.cycle ?? 'none'];
  }
}

export function matches(i: Issue, filters: Filter[], query: string) {
  for (const f of filters) {
    if (!f.values.length) continue;
    const have = valueOf(i, f.field);
    if (!f.values.some((v) => have.includes(v))) return false;
  }
  const q = query.trim().toLowerCase();
  if (q && !`${i.id} ${i.title}`.toLowerCase().includes(q)) return false;
  return true;
}

let visibleCache: { all: Issue[]; filters: Filter[]; query: string; list: Issue[] } | null = null;

export function visibleOf(s: State): Issue[] {
  const all = issuesOf(s);
  if (
    visibleCache &&
    visibleCache.all === all &&
    visibleCache.filters === s.filters &&
    visibleCache.query === s.query
  )
    return visibleCache.list;
  const list = all.filter((i) => matches(i, s.filters, s.query));
  visibleCache = { all, filters: s.filters, query: s.query, list };
  return list;
}

const teamIndex = (id: TeamId) => TEAMS.findIndex((t) => t.id === id);

export function sortIssues(list: Issue[], ordering: Ordering): Issue[] {
  const out = [...list];
  const byId = (a: Issue, b: Issue) => teamIndex(a.team) - teamIndex(b.team) || a.num - b.num;
  if (ordering === 'manual') out.sort((a, b) => a.sort - b.sort);
  if (ordering === 'priority')
    out.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.sort - b.sort);
  if (ordering === 'date')
    out.sort((a, b) => dateKey(b.start) - dateKey(a.start) || a.sort - b.sort);
  if (ordering === 'id') out.sort(byId);
  return out;
}

export interface Group {
  key: string;
  field: Grouping;
  name: string;
  issues: Issue[];
}

/** Issues in groups, in the grouping's own order, each group sorted. */
export function groupIssues(
  list: Issue[],
  d: Pick<Display, 'grouping' | 'ordering' | 'showEmpty'>,
): Group[] {
  const sorted = sortIssues(list, d.ordering);
  const make = (keys: { key: string; name: string }[], of: (i: Issue) => string): Group[] =>
    keys
      .map((k) => ({
        key: k.key,
        field: d.grouping,
        name: k.name,
        issues: sorted.filter((i) => of(i) === k.key),
      }))
      .filter((g) => d.showEmpty || g.issues.length);
  switch (d.grouping) {
    case 'status':
      return make(
        STATUSES.map((s) => ({ key: s.id, name: s.name })),
        (i) => i.status,
      );
    case 'team':
      return make(
        TEAMS.map((t) => ({ key: t.id, name: t.name })),
        (i) => i.team,
      );
    case 'priority':
      return make(
        PRIORITIES.map((p) => ({ key: String(p.id), name: p.name })),
        (i) => String(i.priority),
      );
    case 'project':
      return make(
        [
          ...PROJECTS.map((p) => ({ key: p.id as string, name: p.name })),
          { key: 'none', name: 'No project' },
        ],
        (i) => i.project ?? 'none',
      );
    case 'cycle':
      return make(
        [
          ...[...CYCLES]
            .reverse()
            .map((c) => ({ key: c.id as string, name: `Cycle ${c.n} · ${c.org}` })),
          { key: 'none', name: 'No cycle' },
        ],
        (i) => i.cycle ?? 'none',
      );
    case 'none':
      return [{ key: 'all', field: 'none', name: 'All issues', issues: sorted }];
  }
}

/** A value's display name, for filters and groups. */
export function valueName(field: Field, value: string): string {
  if (value === 'none') return field === 'project' ? 'No project' : 'No cycle';
  switch (field) {
    case 'team':
      return team(value as TeamId).name;
    case 'status':
      return statusName(value as StatusId);
    case 'priority':
      return priorityName(Number(value) as Priority);
    case 'label':
      return label(value as LabelId).name;
    case 'project':
      return project(value as ProductId).name;
    case 'cycle': {
      const c = CYCLES.find((x) => x.id === value);
      return c ? `Cycle ${c.n} · ${c.org}` : value;
    }
  }
}

export function fieldValues(field: Field): string[] {
  switch (field) {
    case 'team':
      return TEAMS.map((t) => t.id);
    case 'status':
      return STATUSES.map((s) => s.id);
    case 'priority':
      return PRIORITIES.map((p) => String(p.id));
    case 'label':
      return LABELS.map((l) => l.id);
    case 'project':
      return [...PROJECTS.map((p) => p.id as string), 'none'];
    case 'cycle':
      return [...[...CYCLES].reverse().map((c) => c.id as string), 'none'];
  }
}

/** The visitor's own events on an issue, oldest first. */
export const localActivity = (s: State, id: string) => s.log.filter((e) => e.issue === id);

/** What an action acts on: the selection, else the issue in the peek, else the one under the cursor. */
export function targetsOf(s: State): string[] {
  if (s.selected.length) return s.selected;
  if (s.peek?.kind === 'issue') return [s.peek.id];
  if (s.focus) return [s.focus];
  return [];
}

/* ------------------------------------------------------------------ onboarding */

// The welcome issue's "Try it" checklist ticks itself as the visitor does each thing.
const WELCOME = ISSUES[0];
const TRY_IT = WELCOME.body.findIndex((b) => b.t === 'check');
export type Step = 'drag' | 'command' | 'roadmap' | 'read';
const STEPS: Step[] = ['drag', 'command', 'roadmap', 'read'];

function stepDone(s: State, step: Step): Partial<State> {
  if (TRY_IT < 0) return {};
  const key = `${WELCOME.id}:${TRY_IT}.${STEPS.indexOf(step)}`;
  return s.checks[key] ? {} : { checks: { ...s.checks, [key]: true } };
}

export const markStep = (step: Step) => set((s) => stepDone(s, step));

/* ------------------------------------------------------------------ navigation and UI */

export function setView(view: ViewId) {
  set((s) => ({
    view,
    reading: false,
    drawer: false,
    peek: s.peek?.kind === 'project' && view !== 'projects' ? null : s.peek,
    focus: null,
    selected: view === s.view ? s.selected : [],
    ...(view === 'roadmap' ? stepDone(s, 'roadmap') : {}),
  }));
}

export const openIssue = (id: string) =>
  set({ peek: { kind: 'issue', id }, focus: id, drawer: false });
export const openProject = (id: ProductId) => set({ peek: { kind: 'project', id }, drawer: false });
export const closePeek = () => set({ peek: null });
export const setFocus = (focus: string | null) => set({ focus });
export const setMyTab = (myTab: MyTab) => set({ myTab, focus: null, selected: [] });

export function toggleSelect(id: string) {
  set((s) => ({
    selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id],
    focus: id,
  }));
}

/** Shift-click: everything between the cursor and this issue, in the order on screen. */
export function selectRange(order: string[], id: string) {
  set((s) => {
    const from = order.indexOf(s.focus ?? id);
    const to = order.indexOf(id);
    if (from < 0 || to < 0) return { selected: [...new Set([...s.selected, id])], focus: id };
    const [a, b] = from < to ? [from, to] : [to, from];
    return { selected: [...new Set([...s.selected, ...order.slice(a, b + 1)])], focus: id };
  });
}

export const selectAll = (ids: string[]) => set({ selected: ids });
export const clearSelection = () => set({ selected: [] });

export const openPicker = (picker: Picker) => set({ picker, chord: false });
export const closePicker = () => set({ picker: null });
export const openCreate = (preset: State['create'] = {}) =>
  set({ create: preset ?? {}, picker: null });
export const closeCreate = () => set({ create: null });
export const setHelp = (help: boolean) => set({ help, picker: null });
export const setReading = (reading: boolean) =>
  set((s) => ({ reading, picker: null, drawer: false, ...(reading ? stepDone(s, 'read') : {}) }));
export const setDrawer = (drawer: boolean) => set({ drawer });
export const setChord = (chord: boolean) => set({ chord });

let toastTimer = 0;
export function toast(text: string, undo = false) {
  window.clearTimeout(toastTimer);
  const id = (get().toast?.id ?? 0) + 1;
  set({ toast: { id, text, undo } });
  toastTimer = window.setTimeout(
    () => set((s) => (s.toast?.id === id ? { toast: null } : {})),
    5000,
  );
}
export const dismissToast = () => set({ toast: null });

/* ------------------------------------------------------------------ filters and display */

export function setFilter(field: Field, values: string[]) {
  set((s) => {
    const rest = s.filters.filter((f) => f.field !== field);
    return {
      filters: values.length ? [...rest, { field, values }] : rest,
      focus: null,
      selected: [],
    };
  });
}

export function toggleFilterValue(field: Field, value: string) {
  const cur = get().filters.find((f) => f.field === field)?.values ?? [];
  setFilter(field, cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]);
}

/** Shows only this value: the sidebar's teams and the command bar's "Filter by". */
export const onlyFilter = (field: Field, value: string) => setFilter(field, [value]);
export const clearFilters = () => set({ filters: [], query: '' });
export const setQuery = (query: string) => set({ query });

export const setDisplay = (patch: Partial<Display>) =>
  set((s) => ({ display: { ...s.display, ...patch } }));
export const resetDisplay = () => set({ display: DEFAULT_DISPLAY });

export function toggleProp(prop: Prop) {
  set((s) => ({
    display: {
      ...s.display,
      props: s.display.props.includes(prop)
        ? s.display.props.filter((p) => p !== prop)
        : [...s.display.props, prop],
    },
  }));
}

/* ------------------------------------------------------------------ edits */

const snap = (s: State): Data => ({
  patches: s.patches,
  created: s.created,
  log: s.log,
  checks: s.checks,
  seq: s.seq,
});

const STAMP =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

function stampNow() {
  const at = Date.now();
  return { at, stamp: STAMP ? STAMP.format(at) : '' };
}

/** Applies a change to some issues and records it in their activity. */
function edit(
  ids: string[],
  change: (
    i: Issue,
  ) => { patch: Patch; event?: Omit<LocalEvent, 'id' | 'issue' | 'at' | 'stamp'> } | null,
): number {
  const s = get();
  const all = issuesOf(s);
  const patches = { ...s.patches };
  const log = [...s.log];
  let seq = s.seq;
  let changed = 0;
  const { at, stamp } = stampNow();
  for (const id of ids) {
    const i = all.find((x) => x.id === id);
    if (!i) continue;
    const out = change(i);
    if (!out) continue;
    patches[id] = { ...patches[id], ...out.patch };
    if (out.event) log.push({ ...out.event, id: ++seq, issue: id, at, stamp });
    changed++;
  }
  if (changed) set({ undo: [...s.undo.slice(-19), snap(s)], patches, log, seq });
  return changed;
}

const names = (ids: string[]) => (ids.length === 1 ? ids[0] : `${ids.length} issues`);

export function setStatus(ids: string[], status: StatusId, quiet = false) {
  const n = edit(ids, (i) =>
    i.status === status
      ? null
      : {
          patch: { status },
          event: {
            kind: 'status',
            text: `moved it from ${statusName(i.status)} to ${statusName(status)}`,
            from: i.status,
            to: status,
          },
        },
  );
  if (n && !quiet) toast(`Moved ${names(ids)} to ${statusName(status)}`, true);
}

export function setPriority(ids: string[], priority: Priority) {
  const n = edit(ids, (i) =>
    i.priority === priority
      ? null
      : {
          patch: { priority },
          event: { kind: 'priority', text: `set priority to ${priorityName(priority)}` },
        },
  );
  if (n) toast(`Set ${names(ids)} to ${priorityName(priority)}`, true);
}

/** Adds the label to all of them, or takes it off all of them when they all have it. */
export function toggleLabel(ids: string[], id: LabelId) {
  const all = issuesOf(get()).filter((i) => ids.includes(i.id));
  const remove = all.length > 0 && all.every((i) => i.labels.includes(id));
  const n = edit(ids, (i) => {
    if (remove)
      return {
        patch: { labels: i.labels.filter((l) => l !== id) },
        event: { kind: 'label', text: `removed ${label(id).name}` },
      };
    if (i.labels.includes(id)) return null;
    return {
      patch: { labels: [...i.labels, id] },
      event: { kind: 'label', text: `added ${label(id).name}` },
    };
  });
  if (n)
    toast(
      `${remove ? 'Removed' : 'Added'} ${label(id).name} ${remove ? 'from' : 'to'} ${names(ids)}`,
      true,
    );
}

export function setProject(ids: string[], pid: ProductId | null) {
  const n = edit(ids, (i) =>
    i.project === pid
      ? null
      : {
          patch: { project: pid },
          event: {
            kind: 'project',
            text: pid ? `moved it to ${project(pid).name}` : 'removed it from its project',
          },
        },
  );
  if (n)
    toast(
      pid
        ? `Moved ${names(ids)} to ${project(pid).name}`
        : `Removed ${names(ids)} from its project`,
      true,
    );
}

/** A drop on the board: a new column and a place in it. */
export function moveIssue(id: string, status: StatusId, sort: number) {
  const s = get();
  const i = findIssue(s, id);
  if (!i) return;
  const moved = i.status !== status;
  edit([id], () => ({
    patch: { status, sort },
    event: moved
      ? {
          kind: 'status',
          text: `moved it from ${statusName(i.status)} to ${statusName(status)}`,
          from: i.status,
          to: status,
        }
      : undefined,
  }));
  if (moved) toast(`Moved ${id} to ${statusName(status)}`, true);
  markStep('drag');
}

/** A checklist item in a description, by its place: "block.item". */
export function toggleCheck(id: string, at: string, initial: boolean) {
  const s = get();
  const key = `${id}:${at}`;
  const cur = s.checks[key] ?? initial;
  set({ undo: [...s.undo.slice(-19), snap(s)], checks: { ...s.checks, [key]: !cur } });
}

export function addComment(id: string, text: string) {
  const body = text.trim();
  if (!body) return;
  const s = get();
  const { at, stamp } = stampNow();
  set({
    undo: [...s.undo.slice(-19), snap(s)],
    log: [...s.log, { id: s.seq + 1, issue: id, at, stamp, kind: 'comment', text: body }],
    seq: s.seq + 1,
  });
}

export interface Draft {
  team: TeamId;
  title: string;
  description: string;
  status: StatusId;
  priority: Priority;
  labels: LabelId[];
  project: ProductId | null;
}

/** A new issue, kept on this device only. Its number follows the team's last one. */
export function createIssue(d: Draft): string {
  const s = get();
  const all = issuesOf(s);
  const num = Math.max(0, ...all.filter((i) => i.team === d.team).map((i) => i.num)) + 1;
  const id = `${team(d.team).key}-${num}`;
  const top = Math.min(0, ...all.filter((i) => i.status === d.status).map((i) => i.sort)) - 1024;
  const { at, stamp } = stampNow();
  const issue: Issue = {
    id,
    team: d.team,
    num,
    title: d.title.trim() || 'Untitled',
    body: d.description.trim()
      ? d.description
          .trim()
          .split(/\n{2,}/)
          .map((text) => ({ t: 'p' as const, text }))
      : [],
    status: d.status,
    priority: d.priority,
    labels: d.labels,
    project: d.project,
    cycle: null,
    links: [],
    stack: [],
    sort: top,
    assignee: null,
    creator: 'you',
    local: true,
  };
  set({
    undo: [...s.undo.slice(-19), snap(s)],
    created: [...s.created, issue],
    log: [
      ...s.log,
      { id: s.seq + 1, issue: id, at, stamp, kind: 'create', text: 'created the issue' },
    ],
    seq: s.seq + 1,
    focus: id,
  });
  toast(`Created ${id}`, true);
  return id;
}

export function deleteIssue(id: string) {
  const s = get();
  if (!s.created.some((i) => i.id === id)) return;
  const patches = { ...s.patches };
  delete patches[id];
  set({
    undo: [...s.undo.slice(-19), snap(s)],
    created: s.created.filter((i) => i.id !== id),
    patches,
    log: s.log.filter((e) => e.issue !== id),
    peek: s.peek?.id === id ? null : s.peek,
    selected: s.selected.filter((x) => x !== id),
    focus: s.focus === id ? null : s.focus,
  });
  toast(`Deleted ${id}`, true);
}

export function undo() {
  const s = get();
  const last = s.undo[s.undo.length - 1];
  if (!last) {
    toast('Nothing to undo');
    return;
  }
  const exists = (id: string | null) =>
    !id || ISSUES.some((i) => i.id === id) || last.created.some((i) => i.id === id);
  set({
    ...last,
    undo: s.undo.slice(0, -1),
    peek: s.peek && s.peek.kind === 'issue' && !exists(s.peek.id) ? null : s.peek,
    focus: exists(s.focus) ? s.focus : null,
    selected: s.selected.filter((id) => exists(id)),
  });
  toast('Undone');
}

/** Drops every local edit, issue, comment and setting. */
export function resetAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing saved.
  }
  const s = get();
  set({
    ...INITIAL,
    ready: true,
    view: phone() ? 'list' : 'board',
    drawer: false,
    peek: null,
    toast: s.toast,
  });
  toast('Reset to the workspace as filed');
}

/** How many local changes there are, for the reset button. */
export const editCount = (s: State) =>
  Object.keys(s.patches).length +
  s.created.length +
  s.log.filter((e) => e.kind === 'comment').length +
  Object.keys(s.checks).length;

export const closedShare = (list: Issue[]) =>
  list.length ? list.filter((i) => isClosed(i.status)).length / list.length : 0;
