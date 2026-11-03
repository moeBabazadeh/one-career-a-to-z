'use client';

import type { CSSProperties, KeyboardEvent, RefObject } from 'react';
import { db } from '../_shared/data';
import { geomFor, liftAt, restPaths, scaleAt, type CoilPaths, type Geom } from './coil';
import type { Pose } from './mechanism';
import Pack from './Pack';
import { itemByCode, rows, type Item, type Row } from './stock';
import s from './vending.module.scss';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const { person, current } = db;

/** Each row's coil, and the coil drawn at rest, worked out once. */
const shelves = rows.map((row) => {
  const g = geomFor(row.h, row.items.length);
  return { row, g, rest: restPaths(g) };
});

export interface TrayItem {
  /** Also the transaction number printed on its receipt. */
  uid: number;
  code: string;
  pose: Pose;
  /** When it was vended, as the receipt prints it. */
  at: string;
}

export type Coin = 'none' | 'in' | 'cup';

export interface Display {
  top: string;
  bottom: string;
  /** The idle ticker scrolls; messages sit still. */
  ticker: boolean;
  tone?: 'warn' | 'ok';
}

interface Props {
  cabinetRef: RefObject<HTMLDivElement | null>;
  frontRef: RefObject<HTMLDivElement | null>;
  dropRef: RefObject<HTMLDivElement | null>;
  floorRef: RefObject<HTMLSpanElement | null>;
  flapRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  selected: string | null;
  focusCode: string;
  busy: boolean;
  display: Display;
  tray: TrayItem[];
  coin: Coin;
  printJob: number;
  onSlot: (code: string) => void;
  onFocusCode: (code: string) => void;
  onKey: (key: string) => void;
  onTake: (uid: number, el: HTMLElement) => void;
  onCoin: () => void;
  onCup: () => void;
}

export const KEYS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'CLR',
  '0',
  'VEND',
];

const KEY_LABEL: Record<string, string> = { CLR: 'Clear the code', VEND: 'Vend the selected item' };

export const poseTransform = (p: Pose) =>
  `translate(calc(${p.x}cqw - 50%), calc(${p.y}cqw - 100%)) rotate(${p.rz}deg) scale(1, ${p.tilt})`;

export default function Machine(props: Props) {
  const {
    cabinetRef,
    frontRef,
    dropRef,
    floorRef,
    flapRef,
    scrollerRef,
    selected,
    focusCode,
    busy,
    display,
    tray,
    coin,
    printJob,
    onSlot,
    onFocusCode,
    onKey,
    onTake,
    onCoin,
    onCup,
  } = props;

  // Arrow keys move along the glass; Tab leaves it in one step.
  const onGlassKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const item = itemByCode(focusCode);
    if (!item) return;
    const r = rows.findIndex((x) => x.id === item.row);
    const n = rows[r].items.length;
    let next: Item | undefined;
    const sameSpot = (row: Row) =>
      row.items[
        Math.min(row.items.length - 1, Math.round(((item.col - 0.5) / n) * row.items.length - 0.5))
      ];
    if (e.key === 'ArrowRight') next = rows[r].items[Math.min(n - 1, item.col)];
    else if (e.key === 'ArrowLeft') next = rows[r].items[Math.max(0, item.col - 2)];
    else if (e.key === 'ArrowDown' && r < rows.length - 1) next = sameSpot(rows[r + 1]);
    else if (e.key === 'ArrowUp' && r > 0) next = sameSpot(rows[r - 1]);
    else if (e.key === 'Home') next = rows[r].items[0];
    else if (e.key === 'End') next = rows[r].items[n - 1];
    else return;
    e.preventDefault();
    if (!next) return;
    onFocusCode(next.code);
    e.currentTarget.querySelector<HTMLElement>(`[data-code="${next.code}"]`)?.focus();
  };

  return (
    <div ref={cabinetRef} className={s.cabinet}>
      <header className={s.marquee}>
        <span className={s.mqLamp} aria-hidden="true" />
        <span className={s.mqBrand}>{person.name}</span>
        <span className={s.mqSub}>
          {current.title} · {current.company} · est. {person.since}
        </span>
      </header>

      <div className={s.frontWrap}>
        <ol className={s.rails} aria-hidden="true">
          {rows.map((r) => (
            <li key={r.id} style={{ '--h': r.h } as Vars}>
              <b>{r.id}</b>
              <span>{r.name}</span>
            </li>
          ))}
        </ol>

        <div ref={scrollerRef} className={s.scroller}>
          <div ref={frontRef} className={s.front}>
            <div
              className={s.glass}
              role="group"
              aria-label={`The glass: ${rows.length} rows of coils, A to ${rows[rows.length - 1].id}. Arrow keys move between slots; Enter selects, Enter again vends.`}
              onKeyDown={onGlassKey}
            >
              {shelves.map(({ row, g, rest }) => (
                <div
                  key={row.id}
                  className={s.row}
                  role="group"
                  aria-label={`Row ${row.id}, ${row.name}`}
                  style={{ '--h': row.h, '--n': row.items.length } as Vars}
                >
                  {row.items.map((item) => (
                    <Slot
                      key={item.code}
                      item={item}
                      g={g}
                      rest={rest}
                      selected={selected === item.code}
                      tabbable={focusCode === item.code}
                      onSlot={onSlot}
                      onFocusCode={onFocusCode}
                    />
                  ))}
                </div>
              ))}
              <span className={s.sheen} aria-hidden="true" />
            </div>

            <div className={s.kick} aria-hidden="true">
              <span>Push flap · take your item</span>
            </div>

            <div className={s.tray}>
              <div className={s.bin}>
                <span ref={floorRef} className={s.binFloor} />
              </div>
              <div className={s.flapHinge} aria-hidden="true">
                <div ref={flapRef} className={s.flap}>
                  <span>Push</span>
                </div>
              </div>
            </div>

            <div ref={dropRef} className={s.dropLayer} aria-hidden="true" />

            <div
              className={s.trayLayer}
              role="group"
              aria-label={
                tray.length
                  ? `Pickup tray: ${tray.length} item${tray.length === 1 ? '' : 's'}`
                  : 'Pickup tray: empty'
              }
            >
              {tray.map((t) => {
                const item = itemByCode(t.code) as Item;
                return (
                  <button
                    key={t.uid}
                    type="button"
                    className={s.trayItem}
                    style={{
                      width: `${t.pose.w}cqw`,
                      height: `${t.pose.h}cqw`,
                      transform: poseTransform(t.pose),
                    }}
                    aria-label={`Take ${item.title} (${item.code}) from the tray`}
                    onClick={(e) => onTake(t.uid, e.currentTarget)}
                  >
                    <Pack item={item} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className={s.controls}>
        <div className={s.display} aria-hidden="true" data-tone={display.tone}>
          <span className={s.lcdTop}>
            {display.top}
            <i className={s.caret} />
          </span>
          <span className={s.lcdBottom} data-ticker={display.ticker || undefined}>
            <span key={display.bottom}>{display.bottom}</span>
          </span>
        </div>

        <div className={s.coinPlate}>
          <button
            type="button"
            className={s.coinSlot}
            onClick={onCoin}
            aria-label="Coin slot. Nothing is charged: a coin comes straight back."
          >
            <span className={s.slit} />
            <span className={s.coin} data-state={coin} aria-hidden="true">
              {person.since}
            </span>
          </button>
          <span className={s.coinLabel}>
            Coins
            <small>not needed</small>
          </span>
        </div>

        <div
          className={s.keypad}
          role="group"
          aria-label="Keypad: a row letter, then a number, then Vend"
        >
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={s.key}
              data-key={k}
              data-role={
                k === 'VEND' ? 'vend' : k === 'CLR' ? 'clear' : /\d/.test(k) ? 'digit' : 'row'
              }
              data-ready={k === 'VEND' && !!selected && !busy ? '' : undefined}
              style={{ gridArea: `k${k}` }}
              aria-label={KEY_LABEL[k] ?? k}
              onClick={() => onKey(k)}
            >
              {k}
            </button>
          ))}
        </div>

        <div className={s.printer} aria-hidden="true">
          <span className={s.printerSlot} />
          {printJob > 0 && (busy || tray.length > 0) && <span key={printJob} className={s.stub} />}
          <span className={s.plateLabel}>Receipt</span>
        </div>

        <button
          type="button"
          className={s.cup}
          onClick={onCup}
          aria-label={coin === 'cup' ? 'Coin return: take your coin back' : 'Coin return: empty'}
        >
          <span className={s.cupHole}>
            <span className={s.cupCoin} data-state={coin} aria-hidden="true">
              {person.since}
            </span>
          </span>
          <span className={s.plateLabel}>Change</span>
        </button>

        <a className={s.serviceLock} href="#service">
          <span aria-hidden="true" className={s.lock} />
          Service panel
        </a>
      </div>

      <div className={s.base} aria-hidden="true">
        <span className={s.vents} />
        <span className={s.sticker}>Free vend · no payment · no data</span>
      </div>
    </div>
  );
}

function Slot({
  item,
  g,
  rest,
  selected,
  tabbable,
  onSlot,
  onFocusCode,
}: {
  item: Item;
  g: Geom;
  rest: CoilPaths;
  selected: boolean;
  tabbable: boolean;
  onSlot: (code: string) => void;
  onFocusCode: (code: string) => void;
}) {
  const at = (z: number, shade: number) =>
    ({ '--lift': liftAt(g, z), '--sc': scaleAt(g, z), '--shade': shade }) as Vars;
  const qty = item.qty ? ` ${item.qty.n} ${item.qty.unit}.` : '';
  return (
    <button
      type="button"
      className={s.slot}
      data-code={item.code}
      data-kind={item.pack}
      aria-pressed={selected}
      aria-label={`${item.code}: ${item.title}. ${item.sub}.${qty}`}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onSlot(item.code)}
      onFocus={() => onFocusCode(item.code)}
    >
      <span className={s.bay}>
        <Coil layer="back" g={g} d={rest.back} />
        <span className={s.depth} data-depth="1" style={at(g.z0 + g.P, 0.82)}>
          <Pack item={item} />
        </span>
        <Coil layer="mid" g={g} d={rest.mid} />
        <span className={s.depth} data-depth="0" style={at(g.z0, 1)}>
          <Pack item={item} />
        </span>
        <Coil layer="front" g={g} d={rest.front} />
      </span>
      <span className={s.tag} aria-hidden="true">
        <span className={s.tagCode}>{item.code}</span>
        <span className={s.tagYear}>{item.year}</span>
        {item.qty && <span className={s.tagQty}>×{item.qty.n}</span>}
      </span>
    </button>
  );
}

function Coil({ layer, g, d }: { layer: 'front' | 'mid' | 'back'; g: Geom; d: string }) {
  return (
    <svg
      className={s.coil}
      data-coil={layer}
      viewBox={`0 0 100 ${g.hs}`}
      aria-hidden="true"
      focusable="false"
    >
      <path className={s.wire} d={d} />
      <path className={s.wireHi} d={d} />
    </svg>
  );
}
