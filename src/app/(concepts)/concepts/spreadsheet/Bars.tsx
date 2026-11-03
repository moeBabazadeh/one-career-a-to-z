'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { db, fmt, profile } from '../_shared/data';
import { a1, colName } from './engine/address';
import { format } from './engine/numfmt';
import { isErr, MAX_R } from './engine/types';
import { Assist, FormulaInput } from './Editor';
import { canPoint, shown, useStore, type Store } from './store';
import { cx, focusGrid, Icon, isMac, isPhone } from './ui';
import s from './sheet.module.scss';

const noop = () => () => {};
/** "⌘" on a Mac, "Ctrl+" elsewhere; ⌘ on the server, corrected after hydration. */
export const useMod = () =>
  useSyncExternalStore(
    noop,
    () => (isMac() ? '⌘' : 'Ctrl+'),
    () => '⌘',
  );

/* ------------------------------------------------------------------ menus */

export interface MenuItem {
  label: string;
  keys?: string;
  run?: () => void;
  checked?: boolean;
  disabled?: boolean;
  sep?: boolean;
}

export function Menu({
  label,
  items,
  icon,
  className,
}: {
  label: string;
  items: MenuItem[];
  icon?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    const list = [
      ...(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []),
    ];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      root.current?.querySelector<HTMLElement>('button')?.focus();
    } else if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && open) {
      // Across the menu bar, as in a desktop app.
      e.preventDefault();
      const bar = [
        ...document.querySelectorAll<HTMLElement>('[data-menubar] > [data-menu] > button'),
      ];
      const me = root.current?.querySelector<HTMLElement>('button');
      const j = bar.indexOf(me as HTMLElement);
      if (j >= 0) {
        setOpen(false);
        const next = bar[(j + (e.key === 'ArrowRight' ? 1 : bar.length - 1)) % bar.length];
        next?.click();
      }
    }
  };

  return (
    <div className={cx(s.menu, className)} ref={root} data-menu="" onKeyDown={onKey}>
      <button
        type="button"
        className={cx(s.menuBtn, open && s.menuBtnOn)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {icon ? <span className={s.srOnly}>{label}</span> : label}
      </button>
      {open && (
        <div className={s.menuList} role="menu" id={id} aria-label={label}>
          {items.map((it, i) =>
            it.sep ? (
              <hr key={i} />
            ) : (
              <button
                key={i}
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                disabled={it.disabled}
                className={s.menuItem}
                onClick={() => {
                  setOpen(false);
                  it.run?.();
                }}
              >
                <span className={s.menuCheck}>{it.checked ? <Icon.check /> : null}</span>
                <span>{it.label}</span>
                {it.keys && <kbd>{it.keys}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export const FORMATS: { label: string; code?: string }[] = [
  { label: 'Automatic' },
  { label: 'Plain text', code: '@' },
  { label: 'Number', code: '#,##0.00' },
  { label: 'Percent', code: '0.00%' },
  { label: 'Thousands', code: '0.0,"k"' },
  { label: 'Date', code: 'd mmm yyyy' },
  { label: 'Month and year', code: 'mmm yyyy' },
  { label: 'Year', code: 'yyyy' },
  { label: 'ISO date', code: 'yyyy-mm-dd' },
];

/** Downloads the visible sheet as CSV: its values, as shown. */
function downloadCsv(st: Store) {
  const view = st.ui.view;
  const L = st.layouts[view];
  const rows = st.book.usedRows(view);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < L.cols.length; c++) {
      const t = shown(st.book.cell(view, r, c)).text;
      row.push(/[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
    }
    lines.push(row.join(',').replace(/,+$/, ''));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${L.name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function menusFor(st: Store, mod: string): { label: string; items: MenuItem[] }[] {
  const ui = st.ui;
  const L = st.layouts[ui.view];
  const sel = st.sel().active;
  const cell = st.book.cell(ui.view, sel.r, sel.c);
  const freeze = (r: number, c: number) => st.setFreeze(r, c);
  return [
    {
      label: 'File',
      items: [
        { label: 'Read as a page', run: () => st.set({ reader: true }) },
        { label: `Download ${L.name} as CSV`, run: () => downloadCsv(st) },
        { sep: true, label: '' },
        { label: 'Restore every cell from the facts', run: () => st.reset() },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: st.canUndo ? `Undo ${st.undoLabel?.toLowerCase()}` : 'Undo',
          keys: `${mod}Z`,
          run: () => st.undo(),
          disabled: !st.canUndo,
        },
        {
          label: st.canRedo ? `Redo ${st.redoLabel?.toLowerCase()}` : 'Redo',
          keys: `${mod}⇧Z`,
          run: () => st.redo(),
          disabled: !st.canRedo,
        },
        { sep: true, label: '' },
        {
          label: 'Copy',
          keys: `${mod}C`,
          run: () => navigator.clipboard?.writeText(st.copy(false)).catch(() => {}),
        },
        {
          label: 'Cut',
          keys: `${mod}X`,
          run: () => navigator.clipboard?.writeText(st.copy(true)).catch(() => {}),
        },
        { label: 'Paste', keys: `${mod}V`, run: () => st.paste(), disabled: !ui.clip },
        { label: 'Delete values', keys: 'Del', run: () => st.clear() },
        { sep: true, label: '' },
        { label: 'Select all', keys: `${mod}A`, run: () => st.selectAll() },
        { label: 'Fill down', run: () => st.fillDown() },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Show formulas',
          keys: `${mod}\``,
          checked: ui.showFormulas,
          run: () => st.set({ showFormulas: !ui.showFormulas }),
        },
        {
          label: 'Gridlines',
          checked: ui.gridlines,
          run: () => st.set({ gridlines: !ui.gridlines }),
        },
        { sep: true, label: '' },
        {
          label: 'Freeze: none',
          checked: L.freeze.r === 0 && L.freeze.c === 0,
          run: () => freeze(0, 0),
        },
        {
          label: 'Freeze: 1 row',
          checked: L.freeze.r === 1 && L.freeze.c === 0,
          run: () => freeze(1, 0),
        },
        {
          label: 'Freeze: 1 row and column A',
          checked: L.freeze.r === 1 && L.freeze.c === 1,
          run: () => freeze(1, 1),
        },
        { label: `Freeze up to ${a1(sel.r, sel.c)}`, run: () => freeze(sel.r, sel.c) },
      ],
    },
    {
      label: 'Insert',
      items: [
        { label: 'Sum', keys: '⌥=', run: () => st.autoSum() },
        {
          label: 'Function…',
          keys: '=',
          run: () => st.startEdit(isPhone() ? 'sheet' : 'cell', 'enter', '='),
        },
        {
          label: 'Name for the selection…',
          run: () => document.querySelector<HTMLInputElement>('[data-namebox]')?.focus(),
        },
      ],
    },
    {
      label: 'Format',
      items: [
        ...FORMATS.map((f) => ({
          label: f.label,
          checked: (cell?.fmt ?? undefined) === f.code,
          run: () => st.setFormat(f.code),
        })),
        { sep: true, label: '' },
        {
          label: 'Bold',
          keys: `${mod}B`,
          checked: !!cell?.style?.b,
          run: () => st.toggleStyle('b'),
        },
        {
          label: 'Italic',
          keys: `${mod}I`,
          checked: !!cell?.style?.i,
          run: () => st.toggleStyle('i'),
        },
      ],
    },
    {
      label: 'Formulas',
      items: [
        {
          label: 'Trace precedents as you select',
          checked: ui.autoTrace,
          run: () => st.setAutoTrace(!ui.autoTrace),
        },
        { label: 'Trace precedents of this cell', run: () => st.traceHere() },
        { label: 'Trace one level further', run: () => st.traceFurther(), disabled: !ui.trace },
        { label: 'Remove arrows', run: () => st.set({ trace: null }), disabled: !ui.trace },
        { label: 'Select precedents', keys: `${mod}[`, run: () => st.selectPrecedents() },
        { sep: true, label: '' },
        { label: 'Calculate now', keys: 'F9', run: () => st.recalcAll() },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'Keyboard shortcuts and functions',
          keys: `${mod}/`,
          run: () => st.set({ dialog: 'help' }),
        },
        { label: 'Read as a page', run: () => st.set({ reader: true }) },
      ],
    },
  ];
}

export function TitleBar() {
  const st = useStore();
  const mod = useMod();
  const menus = menusFor(st, mod);
  return (
    <header className={s.titleBar}>
      <span className={s.appIcon}>
        <Icon.app />
      </span>
      <div className={s.docMeta}>
        <h1 className={s.docName}>{profile.name}</h1>
        <nav className={s.menuBar} data-menubar="" aria-label="Menus">
          {menus.map((m) => (
            <Menu key={m.label} label={m.label} items={m.items} />
          ))}
        </nav>
      </div>
      <span className={s.savedNote}>Facts as of {fmt.month(db.asOf)} · edits stay in this tab</span>
      <div className={s.titleActions}>
        <Menu
          label="Menu"
          icon={<Icon.menu />}
          className={s.phoneMenu}
          items={menus
            .flatMap((m) => [{ sep: true, label: '' }, ...m.items.filter((i) => !i.sep)])
            .slice(1)}
        />
        <button type="button" className={s.readBtn} onClick={() => st.set({ reader: true })}>
          <Icon.page />
          <span>Read as a page</span>
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ toolbar */

function Tool({
  label,
  keys,
  on,
  disabled,
  onClick,
  children,
  wide,
}: {
  label: string;
  keys?: string;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(s.tool, on && s.toolOn, wide && s.toolWide)}
      aria-label={label}
      aria-pressed={on}
      title={keys ? `${label} (${keys})` : label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onClick();
        focusGrid();
      }}
    >
      {children}
    </button>
  );
}

export function Toolbar() {
  const st = useStore();
  const mod = useMod();
  const ui = st.ui;
  const a = st.sel().active;
  const cell = st.book.cell(ui.view, a.r, a.c);
  const style = cell?.style;
  const current = FORMATS.find((f) => f.code === cell?.fmt);
  const sample = typeof cell?.value === 'number' ? cell.value : null;
  return (
    <div className={s.toolbar} role="toolbar" aria-label="Formatting and formulas">
      <Tool label="Undo" keys={`${mod}Z`} disabled={!st.canUndo} onClick={() => st.undo()}>
        <Icon.undo />
      </Tool>
      <Tool label="Redo" keys={`${mod}⇧Z`} disabled={!st.canRedo} onClick={() => st.redo()}>
        <Icon.redo />
      </Tool>
      <i className={s.toolSep} />
      <Tool label="Format as percent" onClick={() => st.setFormat('0.00%')}>
        <Icon.percent />
      </Tool>
      <Tool label="Fewer decimal places" onClick={() => st.stepDecimals(-1)}>
        <Icon.decLess />
      </Tool>
      <Tool label="More decimal places" onClick={() => st.stepDecimals(1)}>
        <Icon.decMore />
      </Tool>
      <Menu
        label={`Number format: ${current?.label ?? (cell?.fmt ? 'Custom' : 'Automatic')}`}
        className={s.fmtMenu}
        icon={
          <span className={s.fmtBtn} aria-hidden="true">
            {cell?.fmt ? (current?.label ?? cell.fmt) : '123'}
            <Icon.chevron />
          </span>
        }
        items={FORMATS.map((f) => ({
          label:
            sample !== null && f.code ? `${f.label} · ${format(sample, f.code).text}` : f.label,
          checked: cell?.fmt === f.code,
          run: () => st.setFormat(f.code),
        }))}
      />
      <i className={s.toolSep} />
      <Tool label="Bold" keys={`${mod}B`} on={!!style?.b} onClick={() => st.toggleStyle('b')}>
        <Icon.bold />
      </Tool>
      <Tool label="Italic" keys={`${mod}I`} on={!!style?.i} onClick={() => st.toggleStyle('i')}>
        <Icon.italic />
      </Tool>
      <i className={s.toolSep} />
      <Tool
        label="Align left"
        on={style?.align === 'left'}
        onClick={() => st.setAlign(style?.align === 'left' ? undefined : 'left')}
      >
        <Icon.alignLeft />
      </Tool>
      <Tool
        label="Align center"
        on={style?.align === 'center'}
        onClick={() => st.setAlign(style?.align === 'center' ? undefined : 'center')}
      >
        <Icon.alignCenter />
      </Tool>
      <Tool
        label="Align right"
        on={style?.align === 'right'}
        onClick={() => st.setAlign(style?.align === 'right' ? undefined : 'right')}
      >
        <Icon.alignRight />
      </Tool>
      <i className={s.toolSep} />
      <Tool label="Sum" keys="⌥=" onClick={() => st.autoSum()}>
        <Icon.sigma />
      </Tool>
      <Tool
        label="Show formulas"
        keys={`${mod}\``}
        on={ui.showFormulas}
        onClick={() => st.set({ showFormulas: !ui.showFormulas })}
      >
        <Icon.formulas />
      </Tool>
      <i className={s.toolSep} />
      <Tool
        label="Trace precedents"
        on={ui.autoTrace}
        onClick={() => st.setAutoTrace(!ui.autoTrace)}
        wide
      >
        <Icon.trace />
        <span>Trace precedents</span>
      </Tool>
      <Tool label="Trace one level further" disabled={!ui.trace} onClick={() => st.traceFurther()}>
        <Icon.further />
      </Tool>
      <Tool label="Remove arrows" disabled={!ui.trace} onClick={() => st.set({ trace: null })}>
        <Icon.noArrows />
      </Tool>
      <i className={s.toolSep} />
      <Tool label="Calculate now" keys="F9" onClick={() => st.recalcAll()}>
        <Icon.recalc />
      </Tool>
      <Tool label="Keyboard shortcuts" keys={`${mod}/`} onClick={() => st.set({ dialog: 'help' })}>
        <Icon.help />
      </Tool>
    </div>
  );
}

/* ------------------------------------------------------------------ formula bar */

function selectionLabel(st: Store) {
  const x = st.rect();
  const view = st.ui.view;
  const L = st.layouts[view];
  const name = st.book.nameFor({ sheet: view, ...x });
  if (name) return name;
  if (x.r0 === 0 && x.r1 === L.rows - 1) return `${colName(x.c0)}:${colName(x.c1)}`;
  if (x.c0 === 0 && x.c1 === L.cols.length - 1) return `${x.r0 + 1}:${x.r1 + 1}`;
  const m = st.mergeAt(x.r0, x.c0);
  if ((x.r0 === x.r1 && x.c0 === x.c1) || (m && x.r0 === x.r1 && x.c1 <= m.c1))
    return a1(st.sel().active.r, st.sel().active.c);
  return `${a1(x.r0, x.c0)}:${a1(x.r1, x.c1)}`;
}

function NameBox() {
  const st = useStore();
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const names = [...st.book.names.values()];
  const label = selectionLabel(st);
  const go = (t: string) => {
    if (st.nameBox(t)) focusGrid();
    setDraft(null);
    setOpen(false);
  };
  return (
    <div className={s.nameBox}>
      <input
        data-namebox=""
        aria-label="Name box: type a cell, a range or a name, or a new name for the selection"
        value={draft ?? label}
        spellCheck={false}
        onFocus={(e) => {
          setDraft(label);
          e.currentTarget.select();
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            go(e.currentTarget.value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(null);
            focusGrid();
          }
        }}
      />
      <button
        type="button"
        className={s.nameDrop}
        aria-label="Named ranges"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon.chevron />
      </button>
      {open && (
        <div className={s.nameList} role="listbox" aria-label="Named ranges">
          {names.map((n) => (
            <button
              key={n.name}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => go(n.name)}
            >
              <b>{n.name}</b>
              <span>{st.book.areaLabel(n.area)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FormulaBar() {
  const st = useStore();
  const e = st.ui.edit;
  const a = st.sel().active;
  const cell = st.book.cell(st.ui.view, a.r, a.c);
  const inBar = e && e.where !== 'sheet';
  return (
    <div className={s.formulaBar}>
      <NameBox />
      <span className={s.fxMark} aria-hidden="true">
        <Icon.fx />
      </span>
      <div className={s.fbField}>
        {inBar && e ? (
          <>
            <FormulaInput where="bar" label="Formula bar" className={s.fbInput} />
            {e.where === 'bar' && <Assist edit={e} className={s.fbAssist} />}
          </>
        ) : (
          <input
            className={cx(s.fbStatic, cell?.input.startsWith('=') && s.fbFormula)}
            aria-label={`Formula bar: ${a1(a.r, a.c)}`}
            value={cell?.input ?? ''}
            readOnly
            onFocus={(ev) => {
              ev.currentTarget.blur();
              st.startEdit(isPhone() ? 'sheet' : 'bar', 'edit');
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tabs and status */

export function SheetTabs() {
  const st = useStore();
  const view = st.ui.view;
  const e = st.ui.edit;
  const pointing = !!e && canPoint(e);
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const n = st.layouts.length;
    let next = -1;
    if (ev.key === 'ArrowRight') next = (view + 1) % n;
    else if (ev.key === 'ArrowLeft') next = (view + n - 1) % n;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = n - 1;
    if (next < 0) return;
    ev.preventDefault();
    st.setView(next);
    document.getElementById(`sheet-tab-${next}`)?.focus();
  };
  return (
    <div className={s.tabs} role="tablist" aria-label="Sheets" onKeyDown={onKey}>
      {st.layouts.map((L, i) => (
        <button
          key={L.name}
          id={`sheet-tab-${i}`}
          type="button"
          role="tab"
          aria-selected={i === view}
          tabIndex={i === view ? 0 : -1}
          className={cx(s.tab, i === view && s.tabOn, pointing && i !== view && s.tabPoint)}
          onMouseDown={(ev) => {
            if (pointing) ev.preventDefault();
          }}
          onClick={() => st.setView(i)}
        >
          {L.name}
        </button>
      ))}
    </div>
  );
}

export function StatusBar() {
  const st = useStore();
  const ui = st.ui;
  const view = ui.view;
  const x = st.rect();
  const e = ui.edit;
  const mode = e
    ? canPoint(e) && (e.mode === 'enter' || (e.point && e.point.end === e.caret))
      ? 'Point'
      : e.mode === 'enter'
        ? 'Enter'
        : 'Edit'
    : 'Ready';
  const nums: number[] = [];
  let count = 0;
  let fmtCode: string | undefined;
  const r1 = Math.min(x.r1, Math.max(x.r0, st.book.usedRows(view) - 1));
  for (let r = x.r0; r <= Math.min(r1, x.r0 + MAX_R); r++) {
    for (let c = x.c0; c <= x.c1; c++) {
      const cell = st.book.cell(view, r, c);
      if (!cell || cell.value === null) continue;
      count++;
      if (typeof cell.value === 'number' && !isErr(cell.value)) {
        nums.push(cell.value);
        if (fmtCode === undefined) fmtCode = cell.fmt;
      }
    }
  }
  const multi = x.r0 !== x.r1 || x.c0 !== x.c1;
  const f = (n: number) => format(n, fmtCode && !fmtCode.includes('"') ? fmtCode : undefined).text;
  const sum = nums.reduce((a, b) => a + b, 0);
  const rc = st.lastRecalc;
  return (
    <div className={s.status} role="status">
      <span className={cx(s.mode, s[`mode_${mode}`])}>{mode}</span>
      <span className={s.statusMsg}>
        {ui.flash
          ? ui.flash.text
          : rc
            ? rc.ms < 0
              ? `${rc.cells} formulas, all calculated`
              : `Recalculated ${rc.cells} ${rc.cells === 1 ? 'formula' : 'formulas'} · ${rc.ms < 0.1 ? '<0.1' : rc.ms.toFixed(1)} ms${rc.cycles ? ` · ${rc.cycles} circular` : ''}`
            : ''}
      </span>
      {multi && count > 0 && (
        <span className={s.stats}>
          {nums.length > 0 && (
            <>
              <span>
                Sum <b>{f(sum)}</b>
              </span>
              <span>
                Average <b>{f(sum / nums.length)}</b>
              </span>
              <span className={s.statWide}>
                Min <b>{f(Math.min(...nums))}</b>
              </span>
              <span className={s.statWide}>
                Max <b>{f(Math.max(...nums))}</b>
              </span>
            </>
          )}
          <span>
            Count <b>{count}</b>
          </span>
        </span>
      )}
    </div>
  );
}
