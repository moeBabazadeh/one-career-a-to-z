'use client';

// The bill of materials: one line per distinct part, quantities rolled up from the assembly,
// sortable, selectable, and exportable as CSV. Names are generic; the marking column carries
// the one real part, the main chip, where db names it.
import { useMemo, useState } from 'react';
import { Icon } from './icons';
import { KIND_LABEL, type BomRow, type Flat } from './models';
import s from './viewer.module.scss';

type Col = 'item' | 'pn' | 'name' | 'kind' | 'refs' | 'qty' | 'marking';

const COLS: { id: Col; label: string; num?: boolean }[] = [
  { id: 'item', label: '#', num: true },
  { id: 'pn', label: 'Part number' },
  { id: 'name', label: 'Name' },
  { id: 'kind', label: 'Category' },
  { id: 'refs', label: 'Designators' },
  { id: 'qty', label: 'Qty', num: true },
  { id: 'marking', label: 'Marking' },
];

const cell = (r: BomRow, c: Col): string | number =>
  c === 'refs'
    ? r.refs.join(', ')
    : c === 'kind'
      ? KIND_LABEL[r.kind]
      : c === 'marking'
        ? (r.marking ?? '')
        : r[c];

function refRange(refs: string[]) {
  if (refs.length < 3) return refs.join(', ');
  const m = /^([A-Z]+)(\d+)$/;
  const a = m.exec(refs[0]),
    b = m.exec(refs[refs.length - 1]);
  return a && b && a[1] === b[1] ? `${refs[0]}–${refs[refs.length - 1]}` : refs.join(', ');
}

export function Bom({
  flat,
  selParts,
  onSelect,
  onClose,
}: {
  flat: Flat;
  selParts: Set<string>;
  onSelect(ids: string[]): void;
  onClose(): void;
}) {
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: 'item', dir: 1 });
  const rows = useMemo(() => {
    const out = [...flat.bom];
    out.sort((a, b) => {
      const x = cell(a, sort.col),
        y = cell(b, sort.col);
      return (
        (typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y))) * sort.dir
      );
    });
    return out;
  }, [flat, sort]);
  const total = flat.bom.reduce((n, r) => n + r.qty, 0);

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      COLS.map((c) => c.label).concat('Description'),
      ...flat.bom.map((r) => COLS.map((c) => cell(r, c.id)).concat(r.desc)),
    ].map((l) => l.map(esc).join(','));
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${flat.model.tag}-bom.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className={s.bom}>
      <div className={s.paneHead}>
        <h2>Bill of materials</h2>
        <span>{`${flat.bom.length} line items · ${total} parts`}</span>
        <span className={s.headTools}>
          <button type="button" className={s.miniBtn} onClick={exportCsv}>
            <Icon name="download" size={13} />
            CSV
          </button>
          <button
            type="button"
            className={`${s.miniBtn} ${s.deskOnly}`}
            onClick={onClose}
            aria-label="Close the bill of materials"
          >
            <Icon name="close" size={13} />
          </button>
        </span>
      </div>
      <div className={s.bomScroll} tabIndex={0} role="region" aria-label="Bill of materials table">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.id}
                  aria-sort={
                    sort.col === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
                  }
                  data-num={c.num || undefined}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort((o) => ({
                        col: c.id,
                        dir: o.col === c.id ? (o.dir === 1 ? -1 : 1) : 1,
                      }))
                    }
                  >
                    {c.label}
                    {sort.col === c.id && (
                      <span aria-hidden="true">{sort.dir === 1 ? '▲' : '▼'}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = r.ids.every((id) => selParts.has(id));
              return (
                <tr key={r.pn} aria-selected={on} data-chip={r.marking ? true : undefined}>
                  <td data-num>{r.item}</td>
                  <td className={s.mono}>{r.pn}</td>
                  <td>
                    <button
                      type="button"
                      className={s.bomName}
                      onClick={() => onSelect(r.ids)}
                      title={r.desc}
                    >
                      {r.name}
                    </button>
                    <small>{r.desc}</small>
                  </td>
                  <td>{KIND_LABEL[r.kind]}</td>
                  <td className={s.mono}>{refRange(r.refs) || '—'}</td>
                  <td data-num>{r.qty}</td>
                  <td className={s.mono}>{r.marking ? <mark>{r.marking}</mark> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={s.bomNote}>
        Generic parts on an illustrative model. Only the main chip’s marking is a real part name,
        and only where it is on record.
      </p>
    </div>
  );
}
