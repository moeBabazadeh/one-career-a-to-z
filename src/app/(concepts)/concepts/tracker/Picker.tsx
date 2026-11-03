'use client';

// The command bar and every picker (status, priority, labels, project, filter) share one palette:
// a search box over a list, fuzzy-matched, driven by arrows, Enter, Escape and number keys.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProductId } from '@/content/db';
import { db } from '../_shared/data';
import { writeScheme } from '../_shared/scheme';
import { fuzzy, runs } from './fuzzy';
import {
  CONTACT,
  CYCLES,
  LABELS,
  PRIORITIES,
  PROJECTS,
  STATUSES,
  TEAMS,
  type Issue,
  type LabelId,
} from './model';
import {
  FIELDS,
  VIEW_NAME,
  clearFilters,
  clearSelection,
  closePicker,
  deleteIssue,
  fieldValues,
  issuesOf,
  markStep,
  onlyFilter,
  openCreate,
  openIssue,
  openPicker,
  openProject,
  resetAll,
  setHelp,
  setPriority,
  setProject,
  setQuery,
  setReading,
  setStatus,
  setView,
  toast,
  toggleFilterValue,
  toggleLabel,
  toggleSelect,
  undo,
  valueName,
  type Field,
  type Picker,
  type State,
  type ViewId,
} from './store';
import {
  Icon,
  LINK_ICON,
  LabelDot,
  PriorityIcon,
  ProjectMark,
  StatusIcon,
  TeamMark,
  cx,
  type IconName,
} from './kit';
import s from './tracker.module.scss';

export interface Item {
  key: string;
  label: string;
  group: string;
  icon?: ReactNode;
  hint?: string;
  keys?: string;
  checked?: boolean | 'some';
  /** Stays open after running: multi-select pickers. */
  keep?: boolean;
  /** More words to match on. */
  extra?: string;
  /** Only listed once something is typed. */
  searchOnly?: boolean;
  run: () => void;
}

interface PaletteProps {
  title?: ReactNode;
  placeholder: string;
  items: Item[];
  onClose: () => void;
  onBack?: () => void;
  /** Number keys pick the nth item while the box is empty. */
  numbered?: boolean;
  wide?: boolean;
  /** What to offer for free text, e.g. "Title contains …". */
  freeText?: (q: string) => Item | null;
  checkable?: boolean;
}

export function Palette({
  title,
  placeholder,
  items,
  onClose,
  onBack,
  numbered,
  wide,
  freeText,
  checkable,
}: PaletteProps) {
  const [query, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const shown = useMemo(() => {
    const q = query.trim();
    if (!q)
      return items.filter((i) => !i.searchOnly).map((item) => ({ item, hits: [] as number[] }));
    const scored: { item: Item; hits: number[]; score: number }[] = [];
    for (const item of items) {
      const m = fuzzy(q, item.label);
      if (m) {
        scored.push({ item, hits: m.hits, score: m.score });
        continue;
      }
      const e = item.extra ? fuzzy(q, `${item.label} ${item.extra}`) : null;
      if (e) scored.push({ item, hits: [], score: e.score - 30 });
    }
    scored.sort((a, b) => b.score - a.score);
    const extra = freeText?.(q);
    return [...scored, ...(extra ? [{ item: extra, hits: [] as number[], score: 0 }] : [])];
  }, [items, query, freeText]);

  const safe = Math.min(active, Math.max(0, shown.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${safe}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [safe]);

  const run = (i: number) => {
    const hit = shown[i];
    if (!hit) return;
    hit.item.run();
    if (!hit.item.keep) onClose();
    else inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown' || (e.ctrlKey && k === 'n')) {
      e.preventDefault();
      setActive((safe + 1) % Math.max(1, shown.length));
    } else if (k === 'ArrowUp' || (e.ctrlKey && k === 'p')) {
      e.preventDefault();
      setActive((safe - 1 + shown.length) % Math.max(1, shown.length));
    } else if (k === 'Home' && !query) {
      e.preventDefault();
      setActive(0);
    } else if (k === 'End' && !query) {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (k === 'Enter') {
      e.preventDefault();
      run(safe);
    } else if (k === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (k === 'Backspace' && !query && onBack) {
      e.preventDefault();
      onBack();
    } else if (numbered && !query && /^[0-9]$/.test(k)) {
      e.preventDefault();
      const n = k === '0' ? 9 : Number(k) - 1;
      if (shown[n]) run(n);
    }
  };

  // Group headings only while browsing; a search ranks across groups.
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={cx(s.palette, wide && s.paletteWide)}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : placeholder}
      >
        {title && <div className={s.paletteTitle}>{title}</div>}
        <div className={s.paletteSearch}>
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder={placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={shown[safe] ? `${id}-${safe}` : undefined}
            aria-autocomplete="list"
            spellCheck={false}
          />
          {onBack && (
            <button type="button" className={s.paletteBack} onClick={onBack}>
              Back
            </button>
          )}
        </div>
        <div
          className={s.paletteList}
          id={`${id}-list`}
          role="listbox"
          ref={listRef}
          aria-multiselectable={checkable || undefined}
        >
          {shown.length === 0 && <p className={s.paletteEmpty}>No results</p>}
          {shown.map(({ item, hits }, i) => {
            const heading =
              !query.trim() && (i === 0 || shown[i - 1].item.group !== item.group)
                ? item.group
                : null;
            return (
              <div key={item.key} role="presentation">
                {heading && <div className={s.paletteGroup}>{heading}</div>}
                <div
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={i === safe}
                  aria-checked={checkable ? item.checked === true : undefined}
                  data-index={i}
                  className={s.paletteItem}
                  onPointerMove={() => i !== safe && setActive(i)}
                  onClick={() => run(i)}
                >
                  {checkable && (
                    <span
                      className={s.check}
                      data-on={item.checked === true || undefined}
                      data-some={item.checked === 'some' || undefined}
                      aria-hidden="true"
                    >
                      <Icon name="check" size={11} />
                    </span>
                  )}
                  {item.icon && <span className={s.paletteIcon}>{item.icon}</span>}
                  <span className={s.paletteLabel}>
                    {runs(item.label, hits).map((r, j) =>
                      r.hit ? <mark key={j}>{r.text}</mark> : <span key={j}>{r.text}</span>,
                    )}
                  </span>
                  {query.trim() && <span className={s.paletteTag}>{item.group}</span>}
                  {item.hint && <span className={s.paletteHint}>{item.hint}</span>}
                  {!checkable && item.checked === true && (
                    <Icon name="check" size={14} className={s.paletteTick} />
                  )}
                  {numbered && !query && i < 9 && <kbd className={s.kbd}>{i + 1}</kbd>}
                  {item.keys && (
                    <span className={s.keys}>
                      {item.keys.split(' ').map((k, j) => (
                        <kbd key={j} className={s.kbd}>
                          {k}
                        </kbd>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.paletteFoot} aria-hidden="true">
          <span>
            <kbd className={s.kbd}>↑</kbd>
            <kbd className={s.kbd}>↓</kbd> to move
          </span>
          <span>
            <kbd className={s.kbd}>↵</kbd> {checkable ? 'to toggle' : 'to select'}
          </span>
          <span>
            <kbd className={s.kbd}>esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ what each picker lists */

const targetsTitle = (ids: string[], verb: string) => (
  <>
    <span className={s.paletteChip}>{ids.length === 1 ? ids[0] : `${ids.length} issues`}</span>
    <span>{verb}</span>
  </>
);

function statusItems(all: Issue[], ids: string[]): Item[] {
  const sel = all.filter((i) => ids.includes(i.id));
  return STATUSES.map((st) => ({
    key: st.id,
    label: st.name,
    group: 'Status',
    icon: <StatusIcon status={st.id} />,
    checked: sel.length > 0 && sel.every((i) => i.status === st.id),
    run: () => setStatus(ids, st.id),
  }));
}

function priorityItems(all: Issue[], ids: string[]): Item[] {
  const sel = all.filter((i) => ids.includes(i.id));
  return [...PRIORITIES.filter((p) => p.id === 0), ...PRIORITIES.filter((p) => p.id !== 0)].map(
    (p) => ({
      key: String(p.id),
      label: p.name,
      group: 'Priority',
      icon: <PriorityIcon priority={p.id} />,
      checked: sel.length > 0 && sel.every((i) => i.priority === p.id),
      run: () => setPriority(ids, p.id),
    }),
  );
}

function labelItems(all: Issue[], ids: string[]): Item[] {
  const sel = all.filter((i) => ids.includes(i.id));
  return LABELS.map((l) => {
    const n = sel.filter((i) => i.labels.includes(l.id)).length;
    return {
      key: l.id,
      label: l.name,
      group: 'Labels',
      icon: <LabelDot id={l.id} />,
      checked: n === 0 ? false : n === sel.length ? true : 'some',
      keep: true,
      run: () => toggleLabel(ids, l.id),
    };
  });
}

function projectItems(all: Issue[], ids: string[]): Item[] {
  const sel = all.filter((i) => ids.includes(i.id));
  const same = (pid: ProductId | null) => sel.length > 0 && sel.every((i) => i.project === pid);
  return [
    {
      key: 'none',
      label: 'No project',
      group: 'Project',
      icon: <Icon name="projects" size={14} />,
      checked: same(null),
      run: () => setProject(ids, null),
    },
    ...PROJECTS.map((p) => ({
      key: p.id,
      label: p.name,
      group: 'Project',
      icon: <ProjectMark id={p.id} />,
      checked: same(p.id),
      run: () => setProject(ids, p.id),
    })),
  ];
}

const FIELD_ICON: Record<Field, IconName> = {
  status: 'sparkle',
  team: 'team',
  label: 'tag',
  project: 'projects',
  priority: 'filter',
  cycle: 'cycles',
};

function valueIcon(field: Field, v: string): ReactNode {
  if (field === 'status') return <StatusIcon status={v as Issue['status']} />;
  if (field === 'priority') return <PriorityIcon priority={Number(v) as Issue['priority']} />;
  if (field === 'label') return <LabelDot id={v as LabelId} />;
  if (field === 'team') return <TeamMark id={v as Issue['team']} size={14} />;
  if (field === 'project')
    return v === 'none' ? <Icon name="projects" size={14} /> : <ProjectMark id={v as ProductId} />;
  return <Icon name="cycles" size={14} />;
}

function filterFieldItems(s: State): Item[] {
  const fields: Item[] = FIELDS.map((f) => ({
    key: `f-${f.id}`,
    label: f.name,
    group: 'Filter by',
    icon: <Icon name={FIELD_ICON[f.id]} size={14} />,
    hint: s.filters.find((x) => x.field === f.id)?.values.length
      ? `${s.filters.find((x) => x.field === f.id)?.values.length} selected`
      : undefined,
    keep: true,
    run: () => openPicker({ kind: 'filter', field: f.id }),
  }));
  // Typing a value finds it in any field: "firm" offers Team › Firmware.
  const values: Item[] = FIELDS.flatMap((f) =>
    fieldValues(f.id).map((v) => ({
      key: `v-${f.id}-${v}`,
      label: valueName(f.id, v),
      group: f.name,
      icon: valueIcon(f.id, v),
      searchOnly: true,
      checked: s.filters.some((x) => x.field === f.id && x.values.includes(v)),
      run: () => toggleFilterValue(f.id, v),
    })),
  );
  const clear: Item[] =
    s.filters.length || s.query
      ? [
          {
            key: 'clear',
            label: 'Clear all filters',
            group: 'Filter by',
            icon: <Icon name="close" size={14} />,
            run: clearFilters,
          },
        ]
      : [];
  return [...fields, ...clear, ...values];
}

function filterValueItems(s: State, field: Field): Item[] {
  const all = issuesOf(s);
  const cur = s.filters.find((f) => f.field === field)?.values ?? [];
  const count = (v: string) =>
    all.filter((i) => {
      if (field === 'label') return i.labels.includes(v as LabelId);
      const val =
        field === 'team'
          ? i.team
          : field === 'status'
            ? i.status
            : field === 'priority'
              ? String(i.priority)
              : field === 'project'
                ? (i.project ?? 'none')
                : (i.cycle ?? 'none');
      return val === v;
    }).length;
  return fieldValues(field).map((v) => ({
    key: v,
    label: valueName(field, v),
    group: FIELDS.find((f) => f.id === field)?.name ?? '',
    icon: valueIcon(field, v),
    hint: String(count(v)),
    checked: cur.includes(v),
    keep: true,
    run: () => toggleFilterValue(field, v),
  }));
}

/* ------------------------------------------------------------------ the command bar */

const GO: { view: ViewId; keys?: string; icon: IconName }[] = [
  { view: 'board', keys: 'G B', icon: 'board' },
  { view: 'list', keys: 'G L', icon: 'list' },
  { view: 'roadmap', keys: 'G R', icon: 'roadmap' },
  { view: 'my', keys: 'G M', icon: 'my' },
  { view: 'projects', keys: 'G P', icon: 'projects' },
  { view: 'cycles', keys: 'G C', icon: 'cycles' },
  { view: 'profile', icon: 'profile' },
];

function copyLink(id: string) {
  const url = `${location.origin}${location.pathname}#list/${id}`;
  navigator.clipboard?.writeText(url).then(
    () => toast(`Copied a link to ${id}`),
    () => toast('Could not copy the link'),
  );
}

function commandItems(s: State): Item[] {
  const all = issuesOf(s);
  const targets = s.selected.length
    ? s.selected
    : s.peek?.kind === 'issue'
      ? [s.peek.id]
      : s.focus
        ? [s.focus]
        : [];
  const one = targets.length === 1 ? all.find((i) => i.id === targets[0]) : undefined;
  const ctx = targets.length
    ? targets.length === 1
      ? targets[0]
      : `${targets.length} issues`
    : '';
  const items: Item[] = [];

  if (targets.length) {
    items.push(
      {
        key: 'c-status',
        label: 'Change status…',
        group: ctx,
        icon: <StatusIcon status={one?.status ?? 'todo'} />,
        keys: 'S',
        keep: true,
        run: () => openPicker({ kind: 'status', targets }),
      },
      {
        key: 'c-prio',
        label: 'Change priority…',
        group: ctx,
        icon: <PriorityIcon priority={one?.priority ?? 2} />,
        keys: 'P',
        keep: true,
        run: () => openPicker({ kind: 'priority', targets }),
      },
      {
        key: 'c-label',
        label: 'Add or remove labels…',
        group: ctx,
        icon: <Icon name="tag" size={14} />,
        keys: 'L',
        keep: true,
        run: () => openPicker({ kind: 'labels', targets }),
      },
      {
        key: 'c-project',
        label: 'Move to project…',
        group: ctx,
        icon: <Icon name="projects" size={14} />,
        keep: true,
        run: () => openPicker({ kind: 'project', targets }),
      },
    );
    if (one) {
      items.push({
        key: 'c-open',
        label: `Open ${one.id}`,
        group: ctx,
        icon: <Icon name="external" size={14} />,
        keys: '↵',
        run: () => openIssue(one.id),
      });
      items.push({
        key: 'c-copy',
        label: 'Copy link to issue',
        group: ctx,
        icon: <Icon name="copy" size={14} />,
        run: () => copyLink(one.id),
      });
      if (!s.selected.length)
        items.push({
          key: 'c-sel',
          label: 'Select issue',
          group: ctx,
          icon: <Icon name="check" size={14} />,
          keys: 'X',
          run: () => toggleSelect(one.id),
        });
      if (one.local)
        items.push({
          key: 'c-del',
          label: `Delete ${one.id}`,
          group: ctx,
          icon: <Icon name="trash" size={14} />,
          run: () => deleteIssue(one.id),
        });
    }
    if (s.selected.length)
      items.push({
        key: 'c-clear',
        label: 'Clear selection',
        group: ctx,
        icon: <Icon name="close" size={14} />,
        keys: 'esc',
        run: clearSelection,
      });
  }

  items.push({
    key: 'create',
    label: 'Create new issue',
    group: 'Issues',
    icon: <Icon name="compose" size={14} />,
    keys: 'C',
    run: () => openCreate(),
  });

  for (const g of GO) {
    items.push({
      key: `go-${g.view}`,
      label: `Go to ${VIEW_NAME[g.view].toLowerCase()}`,
      group: 'Navigation',
      icon: <Icon name={g.icon} size={14} />,
      keys: g.keys,
      extra: VIEW_NAME[g.view],
      run: () => setView(g.view),
    });
  }
  items.push({
    key: 'read',
    label: 'Read as a page',
    group: 'Navigation',
    icon: <Icon name="book" size={14} />,
    extra: 'plain document cv',
    run: () => setReading(true),
  });

  items.push({
    key: 'filter',
    label: 'Filter…',
    group: 'Filter',
    icon: <Icon name="filter" size={14} />,
    keys: '/',
    keep: true,
    run: () => openPicker({ kind: 'filter' }),
  });
  if (s.filters.length || s.query)
    items.push({
      key: 'filter-clear',
      label: 'Clear filters',
      group: 'Filter',
      icon: <Icon name="close" size={14} />,
      run: clearFilters,
    });
  for (const t of TEAMS)
    items.push({
      key: `ft-${t.id}`,
      label: `Filter by team: ${t.name}`,
      group: 'Filter',
      icon: <TeamMark id={t.id} size={14} />,
      searchOnly: true,
      run: () => onlyFilter('team', t.id),
    });
  for (const l of LABELS)
    items.push({
      key: `fl-${l.id}`,
      label: `Filter by label: ${l.name}`,
      group: 'Filter',
      icon: <LabelDot id={l.id} />,
      searchOnly: true,
      run: () => onlyFilter('label', l.id),
    });
  for (const st of STATUSES)
    items.push({
      key: `fs-${st.id}`,
      label: `Filter by status: ${st.name}`,
      group: 'Filter',
      icon: <StatusIcon status={st.id} />,
      searchOnly: true,
      run: () => onlyFilter('status', st.id),
    });
  for (const p of PROJECTS)
    items.push({
      key: `fp-${p.id}`,
      label: `Filter by project: ${p.name}`,
      group: 'Filter',
      icon: <ProjectMark id={p.id} />,
      searchOnly: true,
      run: () => onlyFilter('project', p.id),
    });
  for (const c of CYCLES)
    items.push({
      key: `fc-${c.id}`,
      label: `Filter by cycle: Cycle ${c.n} · ${c.org}`,
      group: 'Filter',
      icon: <Icon name="cycles" size={14} />,
      extra: c.title,
      searchOnly: true,
      run: () => onlyFilter('cycle', c.id),
    });

  items.push(
    {
      key: 'th-dark',
      label: 'Switch to dark theme',
      group: 'Theme',
      icon: <Icon name="moon" size={14} />,
      extra: 'toggle appearance',
      run: () => writeScheme('dark'),
    },
    {
      key: 'th-light',
      label: 'Switch to light theme',
      group: 'Theme',
      icon: <Icon name="sun" size={14} />,
      extra: 'toggle appearance',
      run: () => writeScheme('light'),
    },
    {
      key: 'th-system',
      label: 'Use system theme',
      group: 'Theme',
      icon: <Icon name="display" size={14} />,
      extra: 'toggle appearance',
      run: () => writeScheme(null),
    },
  );

  for (const l of CONTACT) {
    const text =
      l.kind === 'mail'
        ? `Email ${db.person.first}`
        : l.kind === 'cv'
          ? `Download the ${l.label}`
          : `Open ${l.label}`;
    items.push({
      key: `ct-${l.kind}`,
      label: text,
      group: 'Contact',
      icon: <Icon name={LINK_ICON[l.kind]} size={14} />,
      extra: `contact get in touch ${l.label}`,
      run: () => window.open(l.url, l.kind === 'mail' ? '_self' : '_blank', 'noopener'),
    });
  }

  items.push(
    {
      key: 'help',
      label: 'Keyboard shortcuts',
      group: 'Workspace',
      icon: <Icon name="help" size={14} />,
      keys: '?',
      run: () => setHelp(true),
    },
    {
      key: 'undo',
      label: 'Undo',
      group: 'Workspace',
      icon: <Icon name="undo" size={14} />,
      keys: '⌘ Z',
      run: undo,
    },
    {
      key: 'reset',
      label: 'Reset local changes',
      group: 'Workspace',
      icon: <Icon name="reset" size={14} />,
      extra: 'clear restore',
      run: resetAll,
    },
  );

  for (const p of PROJECTS)
    items.push({
      key: `p-${p.id}`,
      label: p.name,
      group: 'Projects',
      icon: <ProjectMark id={p.id} />,
      searchOnly: true,
      run: () => {
        openProject(p.id);
        markStep('command');
      },
    });
  for (const i of all)
    items.push({
      key: `i-${i.id}`,
      label: `${i.id} ${i.title}`,
      group: 'Issues',
      icon: <StatusIcon status={i.status} />,
      searchOnly: true,
      run: () => openIssue(i.id),
    });

  return items;
}

/* ------------------------------------------------------------------ the host */

export function PickerHost({ picker, state }: { picker: Picker; state: State }) {
  const all = issuesOf(state);
  switch (picker.kind) {
    case 'command':
      return (
        <Palette
          placeholder="Type a command or search…"
          items={commandItems(state)}
          onClose={closePicker}
          wide
        />
      );
    case 'status':
      return (
        <Palette
          title={targetsTitle(picker.targets, 'Change status')}
          placeholder="Change status to…"
          items={statusItems(all, picker.targets)}
          onClose={closePicker}
          numbered
        />
      );
    case 'priority':
      return (
        <Palette
          title={targetsTitle(picker.targets, 'Change priority')}
          placeholder="Set priority to…"
          items={priorityItems(all, picker.targets)}
          onClose={closePicker}
          numbered
        />
      );
    case 'labels':
      return (
        <Palette
          title={targetsTitle(picker.targets, 'Labels')}
          placeholder="Add or remove labels…"
          items={labelItems(all, picker.targets)}
          onClose={closePicker}
          checkable
        />
      );
    case 'project':
      return (
        <Palette
          title={targetsTitle(picker.targets, 'Project')}
          placeholder="Move to project…"
          items={projectItems(all, picker.targets)}
          onClose={closePicker}
        />
      );
    case 'filter':
      if (picker.field) {
        const field = picker.field;
        return (
          <Palette
            key={field}
            title={
              <>
                <span className={s.paletteChip}>Filter</span>
                <span>{FIELDS.find((f) => f.id === field)?.name}</span>
              </>
            }
            placeholder={`Filter by ${FIELDS.find((f) => f.id === field)?.name.toLowerCase()}…`}
            items={filterValueItems(state, field)}
            onClose={closePicker}
            onBack={() => openPicker({ kind: 'filter' })}
            checkable
          />
        );
      }
      return (
        <Palette
          key="fields"
          placeholder="Filter by…"
          items={filterFieldItems(state)}
          onClose={closePicker}
          checkable={false}
          freeText={(q) => ({
            key: 'q',
            label: `Title contains “${q}”`,
            group: 'Text',
            icon: <Icon name="search" size={14} />,
            run: () => setQuery(q),
          })}
        />
      );
  }
}

/** A field's chip label: "Team is Firmware, Web". */
export function filterSummary(field: Field, values: string[]) {
  const names = values.map((v) => valueName(field, v));
  return names.length > 2
    ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
    : names.join(', ');
}
