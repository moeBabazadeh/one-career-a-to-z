'use client';

// The panels' building blocks: icons, number fields you can scrub by dragging their label and
// type arithmetic into, a colour picker with saturation, hue and alpha, and small selects.

import { useEffect, useRef, useState } from 'react';
import { beginGesture, endGesture } from './store';
import { hexOf, hexToRgb, rgbToHex } from './model';
import s from './vector.module.scss';

/* ------------------------------------------------------------------ icons */

const P = {
  move: 'M5 3.5 18.5 10l-6.2 1.6-2.9 5.9z',
  frame: 'M8 3.5v17M16 3.5v17M3.5 8h17M3.5 16h17',
  rect: 'M5 5h14v14H5z',
  ellipse: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
  text: 'M5 6V4.5h14V6M12 4.5v15M9 19.5h6',
  hand: 'M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11.5 11V4.8a1.5 1.5 0 0 1 3 0V11M14.5 11.5V6.8a1.5 1.5 0 0 1 3 0V14a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-5-2.7l-2.2-3.4a1.5 1.5 0 0 1 2.5-1.7l1.8 2.4',
  comment: 'M4.5 18.5V7a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8z',
  eye: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  eyeOff:
    'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.3M6.5 7.6A16.5 16.5 0 0 0 2.5 12s3.5 6 9.5 6a9.6 9.6 0 0 0 4.3-1',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5.5 11h13v9h-13z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  component: 'M12 3l4 4-4 4-4-4zM12 13l4 4-4 4-4-4zM7 8l4 4-4 4-4-4zM17 8l4 4-4 4-4-4z',
  instance: 'M12 3.5 20.5 12 12 20.5 3.5 12z',
  image: 'M4.5 5h15v14h-15zM4.5 15.5l4.5-4.5 4 4 2.5-2.5 4 4M15 9.2a1.2 1.2 0 1 0 0-.1z',
  rows: 'M5 6h14M5 12h14M5 18h14',
  cols: 'M6 5v14M12 5v14M18 5v14',
  alH: 'M4 7h4v10H4zM10 9h4v6h-4zM16 6h4v12h-4z',
  alV: 'M7 4h10v4H7zM9 10h6v4H9zM6 16h12v4H6z',
  wrap: 'M4 6h10M4 12h16a3 3 0 0 1 0 6h-5M16 15l-3 3 3 3M4 18h5',
  play: 'M7 4.5v15l12.5-7.5z',
  share: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v6.5h14V13',
  page: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4',
  book: 'M4 5.5c3-1.5 5.5-1.5 8 0v14c-2.5-1.5-5-1.5-8 0zM20 5.5c-3-1.5-5.5-1.5-8 0v14c2.5-1.5 5-1.5 8 0z',
  close: 'M6 6l12 12M18 6 6 18',
  copy: 'M8 8h11v11H8zM5 15V5h10',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  detach:
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7M4 4l3 3M17 17l3 3',
  target: 'M12 4v4M12 16v4M4 12h4M16 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  reset: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7',
  rotate: 'M19 12a7 7 0 1 1-2-4.9M19 4v4h-4',
  radius: 'M5 19v-7a7 7 0 0 1 7-7h7',
  keyboard: 'M3.5 6.5h17v11h-17zM7 10h1M11 10h1M15 10h1M7 14h10',
  menu: 'M4 7h16M4 12h16M4 17h16',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  alignL: 'M4 3v18M8 7h10v4H8zM8 13h6v4H8z',
  alignHC: 'M12 3v18M6 7h12v4H6zM8 13h8v4H8z',
  alignR: 'M20 3v18M6 7h10v4H6zM10 13h6v4h-6z',
  alignT: 'M3 4h18M7 8h4v10H7zM13 8h4v6h-4z',
  alignVC: 'M3 12h18M7 6h4v12H7zM13 8h4v8h-4z',
  alignB: 'M3 20h18M7 6h4v10H7zM13 10h4v6h-4z',
  fill: 'M5 5h14v14H5z',
  stroke: 'M5 5h14v14H5zM8 8h8v8H8z',
  shadow: 'M5 5h11v11H5zM8 19h11V8',
  export: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  target2: 'M12 3v18M3 12h18',
  clip: 'M7 3v14h14M3 7h14v14',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
  hug: 'M8 6 4 12l4 6M16 6l4 6-4 6',
  fillW: 'M4 6v12M20 6v12M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3',
  fixed: 'M4 12h16M4 8v8M20 8v8',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20',
  resolve: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM8 12.5l2.7 2.7L16 9.8',
  send: 'M4 12 20 4l-6 16-3-7z',
};

export type IconName = keyof typeof P;

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const solid = name === 'play' || name === 'instance' || name === 'component';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`${s.icon}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      data-solid={solid || undefined}
    >
      <path d={P[name]} />
    </svg>
  );
}

/* ------------------------------------------------------------------ arithmetic */

/** Evaluates what's typed into a number field: "120+24", "(1440-48)/3", "*2" against the current value. */
export function calc(input: string, current: number | null): number | null {
  let src = input.replace(/px|%|°|\s+/gi, '');
  if (!src) return null;
  if (current !== null && /^[*/]/.test(src)) src = `${current}${src}`;
  let i = 0;
  const num = (): number | null => {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const factor = (): number | null => {
    if (src[i] === '-') {
      i++;
      const v = factor();
      return v === null ? null : -v;
    }
    if (src[i] === '+') {
      i++;
      return factor();
    }
    if (src[i] === '(') {
      i++;
      const v = expr();
      if (src[i] !== ')') return null;
      i++;
      return v;
    }
    return num();
  };
  const term = (): number | null => {
    let v = factor();
    while (v !== null && (src[i] === '*' || src[i] === '/')) {
      const op = src[i++];
      const r = factor();
      if (r === null) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    while (v !== null && (src[i] === '+' || src[i] === '-')) {
      const op = src[i++];
      const r = term();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  return i === src.length && v !== null && Number.isFinite(v) ? v : null;
}

const show = (v: number) => String(Math.round(v * 100) / 100);

/* ------------------------------------------------------------------ number field */

interface NumProps {
  label: React.ReactNode;
  title: string;
  value: number | null;
  onChange: (v: number, live: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown and typed as a percentage of the stored 0–1 value. */
  percent?: boolean;
  suffix?: string;
  disabled?: boolean;
  wide?: boolean;
}

export function Num({
  label,
  title,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  percent,
  suffix,
  disabled,
  wide,
}: NumProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const k = percent ? 100 : 1;
  const shown = value === null ? 'Mixed' : `${show(value * k)}${suffix ?? ''}`;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const commit = (text: string) => {
    const v = calc(text, value === null ? null : value * k);
    if (v !== null) onChange(clamp(v / k), false);
  };
  return (
    <label
      className={`${s.num}${wide ? ` ${s.numWide}` : ''}`}
      data-disabled={disabled || undefined}
      title={title}
    >
      <span
        className={s.numLabel}
        onPointerDown={(e) => {
          if (disabled || value === null) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub.current = { x: e.clientX, v: value, moved: false };
        }}
        onPointerMove={(e) => {
          const sc = scrub.current;
          if (!sc) return;
          const dx = e.clientX - sc.x;
          if (!sc.moved && Math.abs(dx) < 2) return;
          if (!sc.moved) beginGesture();
          sc.moved = true;
          const per = (e.shiftKey ? 10 : 1) * step;
          onChange(clamp(Math.round((sc.v + (dx * per) / k) * 100) / 100), true);
        }}
        onPointerUp={() => {
          if (scrub.current?.moved) endGesture();
          scrub.current = null;
        }}
        onPointerCancel={() => {
          if (scrub.current?.moved) endGesture();
          scrub.current = null;
        }}
      >
        {label}
      </span>
      <input
        className={s.numInput}
        value={draft ?? shown}
        disabled={disabled}
        aria-label={title}
        inputMode="decimal"
        onFocus={(e) => {
          setDraft(value === null ? '' : show(value * k));
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== show((value ?? 0) * k)) commit(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            commit(draft ?? '');
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
            e.preventDefault();
            const nv = clamp(
              value + ((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) * step) / k,
            );
            onChange(Math.round(nv * 1000) / 1000, false);
            setDraft(show(nv * k));
          }
        }}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ colour */

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function hsvToHex(h: number, sv: number, v: number) {
  const c = v * sv,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

interface ColorProps {
  hex: string;
  opacity: number;
  onChange: (hex: string, opacity: number, live: boolean) => void;
  styleName?: string | null;
  styles?: { id: string; name: string; color: string }[];
  onStyle?: (id: string) => void;
  onDetach?: () => void;
  label: string;
  disabled?: boolean;
}

export function ColorField({
  hex,
  opacity,
  onChange,
  styleName,
  styles,
  onStyle,
  onDetach,
  label,
  disabled,
}: ColorProps) {
  const [open, setOpen] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const swatch = useRef<HTMLButtonElement>(null);
  return (
    <div className={s.color}>
      <button
        ref={swatch}
        type="button"
        className={s.swatch}
        style={{ '--c': hex, '--a': opacity } as React.CSSProperties}
        aria-label={`${label}: pick a colour`}
        aria-expanded={!!open}
        disabled={disabled}
        onClick={(e) => setOpen(open ? null : e.currentTarget.getBoundingClientRect())}
      />
      {styleName ? (
        <span className={s.styleName} title={styleName}>
          {styleName}
          {onDetach && (
            <button
              type="button"
              className={s.mini}
              onClick={onDetach}
              aria-label="Detach style"
              title="Detach style"
              disabled={disabled}
            >
              <Icon name="detach" size={13} />
            </button>
          )}
        </span>
      ) : (
        <>
          <input
            className={s.hex}
            value={draft ?? hexOf(hex).slice(1)}
            aria-label={`${label} hex`}
            disabled={disabled}
            onFocus={(e) => {
              setDraft(hexOf(hex).slice(1));
              const el = e.currentTarget;
              requestAnimationFrame(() => el.select());
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(draft.trim()))
                onChange(hexOf(draft.trim()), opacity, false);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
          />
          <Num
            label=""
            title={`${label} opacity`}
            value={opacity}
            percent
            suffix="%"
            min={0}
            max={1}
            step={0.01}
            onChange={(v, live) => onChange(hex, v, live)}
            disabled={disabled}
          />
        </>
      )}
      {open && (
        <Picker
          at={open}
          hex={hex}
          opacity={opacity}
          onChange={onChange}
          onClose={() => setOpen(null)}
          styles={styles}
          onStyle={onStyle}
          anchor={swatch}
        />
      )}
    </div>
  );
}

function Picker({
  at,
  hex,
  opacity,
  onChange,
  onClose,
  styles,
  onStyle,
  anchor,
}: {
  at: DOMRect;
  hex: string;
  opacity: number;
  onChange: ColorProps['onChange'];
  onClose: () => void;
  styles?: ColorProps['styles'];
  onStyle?: (id: string) => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
}) {
  const [hsv, setHsv] = useState(() => rgbToHsv(...hexToRgb(hex)));
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node))
        return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [onClose, anchor]);

  const emit = (h: number, sv: number, v: number, live: boolean) => {
    setHsv([h, sv, v]);
    onChange(hsvToHex(h, sv, v), opacity, live);
  };
  const drag = (
    e: React.PointerEvent<HTMLElement>,
    fn: (fx: number, fy: number, live: boolean) => void,
  ) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      beginGesture();
    }
    if (!dragging.current) return;
    fn(fx, fy, true);
    if (e.type === 'pointerup') {
      dragging.current = false;
      endGesture();
    }
  };
  const top = Math.min(at.top, (typeof window === 'undefined' ? 800 : window.innerHeight) - 330);
  const [h, sv, v] = hsv;
  return (
    <div
      ref={box}
      className={s.picker}
      style={{ top: Math.max(8, top), left: Math.max(8, at.left - 252) }}
      role="dialog"
      aria-label="Colour picker"
    >
      <div
        className={s.sv}
        style={{ '--hue': `hsl(${h} 100% 50%)` } as React.CSSProperties}
        onPointerDown={(e) => drag(e, (fx, fy, live) => emit(h, fx, 1 - fy, live))}
        onPointerMove={(e) => drag(e, (fx, fy, live) => emit(h, fx, 1 - fy, live))}
        onPointerUp={(e) => drag(e, (fx, fy) => emit(h, fx, 1 - fy, false))}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuetext={`${Math.round(sv * 100)}% saturation, ${Math.round(v * 100)}% brightness`}
        aria-valuenow={Math.round(sv * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02;
          if (e.key === 'ArrowRight') emit(h, Math.min(1, sv + d), v, false);
          else if (e.key === 'ArrowLeft') emit(h, Math.max(0, sv - d), v, false);
          else if (e.key === 'ArrowUp') emit(h, sv, Math.min(1, v + d), false);
          else if (e.key === 'ArrowDown') emit(h, sv, Math.max(0, v - d), false);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <span className={s.svDot} style={{ left: `${sv * 100}%`, top: `${(1 - v) * 100}%` }} />
      </div>
      <div
        className={s.hue}
        onPointerDown={(e) => drag(e, (fx, _fy, live) => emit(fx * 359.9, sv, v, live))}
        onPointerMove={(e) => drag(e, (fx, _fy, live) => emit(fx * 359.9, sv, v, live))}
        onPointerUp={(e) => drag(e, (fx) => emit(fx * 359.9, sv, v, false))}
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(h)}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
            emit(Math.min(359.9, h + d), sv, v, false);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
            emit(Math.max(0, h - d), sv, v, false);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <span className={s.thumb} style={{ left: `${(h / 360) * 100}%` }} />
      </div>
      <div
        className={s.alpha}
        style={{ '--c': hex } as React.CSSProperties}
        onPointerDown={(e) =>
          drag(e, (fx, _fy, live) => onChange(hsvToHex(h, sv, v), Math.round(fx * 100) / 100, live))
        }
        onPointerMove={(e) =>
          drag(e, (fx, _fy, live) => onChange(hsvToHex(h, sv, v), Math.round(fx * 100) / 100, live))
        }
        onPointerUp={(e) =>
          drag(e, (fx) => onChange(hsvToHex(h, sv, v), Math.round(fx * 100) / 100, false))
        }
        role="slider"
        aria-label="Opacity"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(opacity * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.01;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
            onChange(hex, Math.min(1, Math.round((opacity + d) * 100) / 100), false);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
            onChange(hex, Math.max(0, Math.round((opacity - d) * 100) / 100), false);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <span className={s.thumb} style={{ left: `${opacity * 100}%` }} />
      </div>
      <div className={s.pickerRow}>
        <span className={s.pickerHex}>{hexOf(hex)}</span>
        <span className={s.pickerHex}>{Math.round(opacity * 100)}%</span>
      </div>
      {styles && onStyle && (
        <div className={s.pickerStyles}>
          <span className={s.overline}>Colour styles</span>
          <div className={s.styleSwatches}>
            {styles.map((st) => (
              <button
                key={st.id}
                type="button"
                className={s.styleSwatch}
                style={{ '--c': st.color } as React.CSSProperties}
                title={st.name}
                aria-label={`Apply ${st.name}`}
                onClick={() => {
                  onStyle(st.id);
                  setHsv(rgbToHsv(...hexToRgb(st.color)));
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ small things */

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  className,
}: {
  value: T | '';
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span className={`${s.select}${className ? ` ${className}` : ''}`}>
      <select
        value={value}
        aria-label={label}
        title={label}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {value === '' && <option value="">Mixed</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="down" size={12} />
    </span>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  pressed,
  disabled,
  className,
  kbd,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  kbd?: string;
}) {
  return (
    <button
      type="button"
      className={`${s.iconBtn}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={label}
      title={kbd ? `${label} (${kbd})` : label}
      aria-pressed={pressed}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className={s.section}>
      <header className={s.sectionHead}>
        <h3>{title}</h3>
        {actions && <span className={s.sectionActions}>{actions}</span>}
      </header>
      {children}
    </section>
  );
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
