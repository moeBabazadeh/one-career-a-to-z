'use client';

import { useEffect, useRef, useState } from 'react';
import { concept } from '../_shared/concepts';
import { db, profile } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import { geomFor } from './coil';
import { Card, Note, Receipt, Spike, describe, roleLine, type Opened, type Slip } from './Counter';
import Machine, { type Coin, type Display, type TrayItem } from './Machine';
import { Mechanism } from './mechanism';
import Planogram from './Planogram';
import { cvFile, itemByCode, rowById, rows } from './stock';
import s from './vending.module.scss';

const { person } = db;

/** The tray holds this many before the machine asks you to empty it. */
const TRAY_MAX = 4;
/** Below this width the counter becomes a sheet over the page. */
const NARROW = '(max-width: 1199px)';
const LAST_ROW = rows[rows.length - 1].id;

type Msg =
  | { kind: 'idle' }
  | { kind: 'row'; row: string }
  | { kind: 'ready'; code: string }
  | { kind: 'nope'; code: string }
  | { kind: 'rowFirst' }
  | { kind: 'enter' }
  | { kind: 'vending'; code: string }
  | { kind: 'landed'; code: string }
  | { kind: 'full' }
  | { kind: 'wait' }
  | { kind: 'coin' };

const TICKER = ['Type a code', ...db.headline.map((h) => `${h.value} ${h.label}`)].join('  ·  ');

function displayFor(msg: Msg): Display {
  const title = (code: string) => itemByCode(code)?.title ?? '';
  switch (msg.kind) {
    case 'idle':
      return { top: '--', bottom: TICKER, ticker: true };
    case 'row': {
      const r = rowById(msg.row);
      return {
        top: `${msg.row}`,
        bottom: `Row ${msg.row} · ${r?.name} · 1–${r?.items.length}`,
        ticker: false,
      };
    }
    case 'ready':
      return {
        top: msg.code,
        bottom: `${title(msg.code)} · press vend`,
        ticker: false,
        tone: 'ok',
      };
    case 'nope': {
      const r = rowById(msg.code[0]);
      return {
        top: msg.code,
        bottom: `No such slot · row ${msg.code[0]} has ${r?.items.length}`,
        ticker: false,
        tone: 'warn',
      };
    }
    case 'rowFirst':
      return { top: '--', bottom: `Row first: A–${LAST_ROW}`, ticker: false, tone: 'warn' };
    case 'enter':
      return { top: '--', bottom: 'Enter a code first', ticker: false, tone: 'warn' };
    case 'vending':
      return { top: msg.code, bottom: `Vending ${title(msg.code)}…`, ticker: false };
    case 'landed':
      return { top: msg.code, bottom: 'Take your item below', ticker: false, tone: 'ok' };
    case 'full':
      return { top: '--', bottom: 'Tray full · take an item', ticker: false, tone: 'warn' };
    case 'wait':
      return { top: '..', bottom: 'Please wait…', ticker: false };
    case 'coin':
      return { top: '0.00', bottom: 'No charge · coin returned', ticker: false, tone: 'ok' };
  }
}

/** The vend's local date and time, as the receipt prints it. */
function stamp() {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export default function Vending() {
  const reduced = useReducedMotion();
  const [entry, setEntry] = useState('');
  const [msg, setMsg] = useState<Msg>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [kept, setKept] = useState<Slip[]>([]);
  const [coin, setCoin] = useState<Coin>('none');
  const [printJob, setPrintJob] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [focusCode, setFocusCode] = useState('A1');
  const [announce, setAnnounce] = useState('');

  const root = useRef<HTMLDivElement>(null);
  const cabinet = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const drop = useRef<HTMLDivElement>(null);
  const floor = useRef<HTMLSpanElement>(null);
  const flap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const spikeRef = useRef<HTMLDivElement>(null);
  const mech = useRef<Mechanism | null>(null);
  const busyRef = useRef(false);
  const taking = useRef(new Set<number>());
  const uid = useRef(0);
  const said = useRef(0);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    if (!front.current || !drop.current || !floor.current || !cabinet.current || !flap.current)
      return;
    const m = new Mechanism({
      front: front.current,
      dropLayer: drop.current,
      trayFloor: floor.current,
      cabinet: cabinet.current,
      flap: flap.current,
      fallClass: s.falling,
    });
    mech.current = m;
    const pending = timers.current;
    return () => {
      m.dispose();
      mech.current = null;
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  /** Says it to screen readers; a repeat still gets read. */
  const say = (text: string) => {
    said.current += 1;
    setAnnounce(`${text}${said.current % 2 ? '' : ' '}`);
  };

  const selected = entry.length === 2 && itemByCode(entry) ? entry : null;
  const openItem = opened ? itemByCode(opened.slip.code) : undefined;
  const openTxn = opened?.slip.txn ?? 0;

  // The opened card takes focus, so the next thing read is what came out of the machine.
  useEffect(() => {
    if (openTxn) heading.current?.focus();
  }, [openTxn]);

  const flash = (key: string) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-key="${key}"]`);
    if (!el) return;
    el.dataset.down = '';
    later(() => delete el.dataset.down, 140);
  };

  /** Brings the slot into view in the glass when the glass scrolls sideways (phones). */
  const centre = (slot: HTMLElement) => {
    const sc = scroller.current;
    if (!sc || sc.scrollWidth <= sc.clientWidth + 1) return;
    const a = slot.getBoundingClientRect();
    const b = sc.getBoundingClientRect();
    sc.scrollBy({
      left: a.left + a.width / 2 - (b.left + b.width / 2),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  const vend = (code: string) => {
    const item = itemByCode(code);
    const m = mech.current;
    const slot = front.current?.querySelector<HTMLElement>(`[data-code="${code}"]`);
    const row = item && rowById(item.row);
    if (!item || !row || !m || !slot) return;
    if (busyRef.current) {
      setMsg({ kind: 'wait' });
      say('Still vending. One moment.');
      return;
    }
    if (tray.length >= TRAY_MAX) {
      setMsg({ kind: 'full' });
      say('The tray is full. Take an item out first.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setEntry(code);
    setFocusCode(code);
    setMsg({ kind: 'vending', code });
    setPrintJob((n) => n + 1);
    say(`Vending ${describe(item)}.`);
    centre(slot);
    const at = stamp();
    m.vend(slot, geomFor(row.h, row.items.length), {
      reduced,
      resting: tray.map((t) => t.pose),
      onLand: (pose) => {
        uid.current += 1;
        const id = uid.current;
        setTray((t) => [...t, { uid: id, code, pose, at }]);
        busyRef.current = false;
        setBusy(false);
        setEntry('');
        setMsg({ kind: 'landed', code });
        say(`${code} dispensed: ${item.title}. It’s in the tray below the glass.`);
      },
    });
  };

  const press = (key: string) => {
    flash(key);
    if (key === 'CLR') {
      setEntry('');
      setMsg({ kind: 'idle' });
      say('Cleared.');
      return;
    }
    if (key === 'VEND') {
      if (selected) vend(selected);
      else {
        setMsg({ kind: 'enter' });
        say(`Enter a code first: a row letter, A to ${LAST_ROW}, then a number.`);
      }
      return;
    }
    if (/^[A-Z]$/.test(key)) {
      const r = rowById(key);
      if (!r) return;
      setEntry(key);
      setMsg({ kind: 'row', row: key });
      say(`Row ${key}, ${r.name}: ${r.items.length} slots. Now a number.`);
      return;
    }
    const letter = entry[0];
    if (!letter) {
      setMsg({ kind: 'rowFirst' });
      say(`Pick a row first, A to ${LAST_ROW}.`);
      return;
    }
    const code = `${letter}${key}`;
    const item = itemByCode(code);
    setEntry(code);
    if (item) {
      setMsg({ kind: 'ready', code });
      setFocusCode(code);
      say(`${code}: ${item.title}. Press Vend.`);
    } else {
      setMsg({ kind: 'nope', code });
      say(`There’s no slot ${code}.`);
    }
  };

  // Tapping an item fills in its code; tapping it again vends it.
  const onSlot = (code: string) => {
    if (selected === code) {
      vend(code);
      return;
    }
    const item = itemByCode(code);
    if (!item) return;
    setEntry(code);
    setFocusCode(code);
    setMsg({ kind: 'ready', code });
    say(`${code}: ${item.title}, selected. Press Vend, Enter, or select it again.`);
  };

  const take = (id: number, el: HTMLElement) => {
    const t = tray.find((x) => x.uid === id);
    const item = t && itemByCode(t.code);
    if (!t || !item || taking.current.has(id)) return;
    taking.current.add(id);
    const finish = () => {
      taking.current.delete(id);
      setTray((ts) => ts.filter((x) => x.uid !== id));
      setOpened({
        slip: { txn: t.uid, code: t.code, at: t.at },
        fresh: !reduced,
        kept: false,
        tossed: false,
      });
      setSheet(true);
      setMsg((m) => (m.kind === 'landed' || m.kind === 'full' ? { kind: 'idle' } : m));
      say(`Opened ${item.title}. Its receipt is printing.`);
    };
    if (mech.current) mech.current.take(el, reduced, finish);
    else finish();
  };

  const onCoin = () => {
    setMsg({ kind: 'coin' });
    if (coin !== 'none') return;
    setCoin('in');
    say('Nothing to pay: every item is free. The coin drops back into the return cup.');
    later(() => setCoin('cup'), reduced ? 0 : 720);
  };

  const onCup = () => {
    if (coin !== 'cup') return;
    setCoin('none');
    say('You took your coin back.');
  };

  const keep = () => {
    if (!opened) return;
    setKept((k) => (k.some((x) => x.txn === opened.slip.txn) ? k : [opened.slip, ...k]));
    setOpened({ ...opened, kept: true });
    say('Receipt kept on the spike.');
  };

  const toss = () => {
    if (!opened) return;
    setOpened({ ...opened, tossed: true });
    say('Receipt tossed.');
  };

  const reopen = (slip: Slip) => {
    setOpened({ slip, fresh: false, kept: true, tossed: false });
    setSheet(true);
  };

  const closeCard = () => {
    setOpened(null);
    setSheet(false);
    root.current
      ?.querySelector<HTMLElement>('[data-key="VEND"]')
      ?.focus({ preventScroll: matchMedia(NARROW).matches ? false : true });
  };

  const showReceipts = () => {
    setSheet(true);
    later(() => {
      spikeRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      spikeRef.current?.querySelector<HTMLElement>('h2')?.focus();
    }, 30);
  };

  const fromPanel = (code: string) => {
    cabinet.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    vend(code);
  };

  const pick = (code: string) => {
    setSheet(false);
    vend(code);
  };

  // Codes typed anywhere on the page go to the keypad.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    onKey.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && t !== document.body && !root.current?.contains(t)) return;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const modal = sheet && matchMedia(NARROW).matches;
      if (e.key === 'Escape') {
        if (modal) closeCard();
        else if (entry) press('CLR');
        return;
      }
      if (modal) return;
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if ((/^[A-Z]$/.test(k) && rowById(k)) || /^[0-9]$/.test(k)) {
        e.preventDefault();
        press(k);
      } else if ((k === 'Backspace' || k === 'Delete') && entry) {
        e.preventDefault();
        press('CLR');
      } else if (k === 'Enter' && !t?.closest('button, a, summary')) {
        e.preventDefault();
        press('VEND');
      }
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const display = displayFor(msg);

  return (
    <div ref={root} className={s.root}>
      <a className={s.skip} href="#service">
        Skip to the planogram
      </a>

      <header className={s.top}>
        <h1 className={s.brand}>
          {person.name}
          <span>{roleLine}</span>
        </h1>
        <nav className={s.nav} aria-label="Page">
          <a href="#service">Planogram</a>
          <button type="button" onClick={showReceipts}>
            Receipts <b>{kept.length}</b>
          </button>
          <a href={person.cv} download={cvFile}>
            CV
          </a>
          <a href={`mailto:${person.email}`}>Email</a>
        </nav>
      </header>

      <main className={s.stage}>
        <div className={s.intro}>
          <p>{db.lede}</p>
          <p className={s.introHow}>
            Tap an item to fill in its code, tap again to vend. Then reach into the tray: it opens
            with a printed receipt.
          </p>
        </div>

        <div className={s.machineCol}>
          <span className={s.sun} aria-hidden="true" />
          <Machine
            cabinetRef={cabinet}
            frontRef={front}
            dropRef={drop}
            floorRef={floor}
            flapRef={flap}
            scrollerRef={scroller}
            selected={selected}
            focusCode={focusCode}
            busy={busy}
            display={display}
            tray={tray}
            coin={coin}
            printJob={printJob}
            onSlot={onSlot}
            onFocusCode={setFocusCode}
            onKey={press}
            onTake={take}
            onCoin={onCoin}
            onCup={onCup}
          />
        </div>

        <aside
          className={s.counter}
          data-open={sheet || undefined}
          aria-label="Counter: what came out of the machine"
        >
          <div className={s.counterInner}>
            <button type="button" className={s.sheetClose} onClick={closeCard}>
              <span aria-hidden="true">←</span> Back to the machine
            </button>
            {opened && openItem ? (
              <>
                <Card item={openItem} headingRef={heading} onClose={closeCard} />
                {!opened.tossed && (
                  <Receipt item={openItem} opened={opened} onKeep={keep} onToss={toss} />
                )}
              </>
            ) : (
              <Note onPick={pick} />
            )}
            <div ref={spikeRef}>
              <Spike kept={kept} onReopen={reopen} />
            </div>
          </div>
        </aside>
      </main>

      <Planogram onVend={fromPanel} />

      <footer className={s.footer}>
        <p>
          © {profile.fullName}, {person.since} → {db.asOf.y} · {concept('vending-machine').name},
          concept {concept('vending-machine').letter}
        </p>
        <p>
          The machine is a simulation; everything stocked in it is real. Nothing is charged, and
          nothing you do here is recorded or sent.
        </p>
      </footer>

      <p className={s.sr} aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
