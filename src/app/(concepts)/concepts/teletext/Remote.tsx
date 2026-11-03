'use client';

import s from './teletext.module.scss';

export type Action =
  | `d${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'hold'
  | 'reveal'
  | 'size'
  | 'index'
  | 'cancel';

/** Keyboard keys for each action, as the key names a browser reports. */
export const KEYS: Record<string, Action> = {
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `d${i}` as Action])),
  r: 'red',
  R: 'red',
  F1: 'red',
  g: 'green',
  G: 'green',
  F2: 'green',
  y: 'yellow',
  Y: 'yellow',
  F3: 'yellow',
  b: 'blue',
  B: 'blue',
  F4: 'blue',
  ArrowUp: 'up',
  PageUp: 'up',
  '+': 'up',
  ArrowDown: 'down',
  PageDown: 'down',
  '-': 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  h: 'hold',
  H: 'hold',
  v: 'reveal',
  V: 'reveal',
  '?': 'reveal',
  s: 'size',
  S: 'size',
  i: 'index',
  I: 'index',
  Home: 'index',
  Escape: 'cancel',
  x: 'cancel',
  X: 'cancel',
};

// The teletext function keys carry the standard symbols: a page with a mark on it.
function Sym({ kind }: { kind: 'index' | 'reveal' | 'hold' | 'size' | 'sub' | 'cancel' }) {
  return (
    <svg viewBox="0 0 24 18" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="13" rx="1" />
      {kind === 'index' && (
        <>
          <path d="M6 6h3M6 9h3M6 12h3M11 6h7M11 9h7M11 12h7" />
        </>
      )}
      {kind === 'reveal' && (
        <path d="M9.5 7.2a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.6M12 13.2v.1" />
      )}
      {kind === 'hold' && <path d="M6 6h12M6 9h12M6 12h12M8.5 4v10M15.5 4v10" />}
      {kind === 'size' && <path d="M12 5v8M9.5 7.5 12 5l2.5 2.5M9.5 10.5 12 13l2.5-2.5" />}
      {kind === 'sub' && <path d="M7 6h8v6H7zM9.5 4.5h8v6" />}
      {kind === 'cancel' && <path d="m8 6 8 6M16 6l-8 6" />}
    </svg>
  );
}

interface Props {
  lit: Action | null;
  hold: boolean;
  reveal: boolean;
  size: number;
  onPress: (a: Action) => void;
}

/** A teletext remote: digits, the four Fastext keys and the text functions. */
export default function Remote({ lit, hold, reveal, size, onPress }: Props) {
  const key = (a: Action, label: React.ReactNode, title: string, cls = '', pressed?: boolean) => (
    <button
      key={a}
      type="button"
      className={`${s.key} ${cls}`}
      data-lit={lit === a || undefined}
      aria-pressed={pressed}
      aria-label={title}
      title={title}
      onClick={() => onPress(a)}
    >
      {label}
    </button>
  );
  const fn = (
    a: Action,
    kind: Parameters<typeof Sym>[0]['kind'],
    text: string,
    title: string,
    pressed?: boolean,
  ) =>
    key(
      a,
      <>
        <Sym kind={kind} />
        <span>{text}</span>
      </>,
      title,
      s.fnKey,
      pressed,
    );

  return (
    <div className={s.remote} role="group" aria-label="Remote control">
      <div className={s.remoteTop}>
        <span className={s.ir} aria-hidden="true" />
        <span className={s.remoteBrand} aria-hidden="true">
          TEXT
        </span>
      </div>
      <div className={s.fnRow}>
        {fn('index', 'index', 'Index', 'Index, page 100 (I)')}
        {fn('reveal', 'reveal', 'Reveal', 'Reveal hidden text (V)', reveal)}
        {fn('hold', 'hold', 'Hold', 'Hold this page (H)', hold)}
      </div>
      <div className={s.digits}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => key(`d${d}` as Action, d, `Digit ${d}`, s.digit))}
        {fn('cancel', 'cancel', 'Cancel', 'Cancel the search (Esc)')}
        {key('d0', 0, 'Digit 0', s.digit)}
        {fn(
          'size',
          'size',
          'Size',
          `Double height${size ? (size === 1 ? ': top half' : ': bottom half') : ''} (S)`,
          size > 0,
        )}
      </div>
      <div className={s.fastext}>
        {key('red', <span className={s.fastDot} />, 'Red Fastext key (R or F1)', s.red)}
        {key('green', <span className={s.fastDot} />, 'Green Fastext key (G or F2)', s.green)}
        {key('yellow', <span className={s.fastDot} />, 'Yellow Fastext key (Y or F3)', s.yellow)}
        {key('blue', <span className={s.fastDot} />, 'Blue Fastext key (B or F4)', s.blue)}
      </div>
      <div className={s.rocker}>
        {key('left', <span aria-hidden="true">◀</span>, 'Previous subpage (Left arrow)', s.nav)}
        <div className={s.pageRocker}>
          {key('up', <span aria-hidden="true">P+</span>, 'Next page (Up arrow)', s.nav)}
          {key('down', <span aria-hidden="true">P−</span>, 'Previous page (Down arrow)', s.nav)}
        </div>
        {key('right', <span aria-hidden="true">▶</span>, 'Next subpage (Right arrow)', s.nav)}
      </div>
      <div className={s.subLabel} aria-hidden="true">
        <Sym kind="sub" />
        <span>Subpage</span>
      </div>
    </div>
  );
}
