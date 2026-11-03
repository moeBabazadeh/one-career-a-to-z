'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { db, hardware } from '../_shared/data';
import { useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import { splitFigure } from './Apps';
import { Icon } from './icons';
import type { Anchor, Lab } from './lab';
import type { DeviceInfo } from './models';
import { clamp, type Pose } from './space';
import s from './spatial.module.scss';

const DEVICES: DeviceInfo[] = (Object.keys(db.devices) as db.DeviceId[]).map((key) => {
  const d = db.devices[key] as db.Device & { chip?: string };
  return { key, tag: d.tag, name: d.name, kind: d.kind, ...(d.chip ? { chip: d.chip } : {}) };
});

const STEP = 0.35;

/**
 * An immersive space for the hardware: the room dims behind a portal you can widen with the
 * crown (scroll, or the slider), and the devices float in front of you to be turned over.
 */
export default function Immersive({
  yaw,
  getPose,
  getP,
  reduced,
  onLook,
  onFace,
  onExit,
}: {
  yaw: number;
  getPose: () => Pose;
  getP: () => number;
  reduced: boolean;
  onLook: (dx: number, dy: number, done: boolean) => void;
  onFace: (az: number) => void;
  onExit: () => void;
}) {
  const scheme = useScheme();
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);
  const lab = useRef<Lab | null>(null);
  const live = useRef({
    selected: null as number | null,
    reduced,
    onLook,
    onFace,
    onExit,
    yaw,
    getPose,
    getP,
  });
  const [level, setLevel] = useState(0.55);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    live.current = { selected, reduced, onLook, onFace, onExit, yaw, getPose, getP };
  });

  // Picking a device brings it forward and turns your head to it.
  useEffect(() => {
    lab.current?.select(selected);
    if (selected !== null && lab.current) live.current.onFace(lab.current.azOf(selected));
  }, [selected]);

  // Three.js and the models load only when the space opens.
  useEffect(() => {
    let alive = true;
    const el = canvas.current;
    if (!el) return;
    import('./lab').then(({ createLab }) => {
      if (!alive || !root.current) return;
      const font = token(document.documentElement, '--font-inter') || 'system-ui';
      lab.current = createLab({
        canvas: el,
        devices: DEVICES,
        font,
        accent: token(root.current, '--accent') || '#7aa2ff',
        yaw: live.current.yaw,
        getPose: () => live.current.getPose(),
        getP: () => live.current.getP(),
        reduced: () => live.current.reduced,
        onHover: (i) => setHover(i),
        onSelect: (i) => setSelected((cur) => (cur === i ? null : i)),
        onLook: (dx, dy, done) => live.current.onLook(dx, dy, done),
        onFrame: (anchors: Anchor[]) => {
          const W = el.clientWidth;
          anchors.forEach((a, i) => {
            const b = labels.current[i];
            if (!b) return;
            b.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, 0)`;
            b.style.opacity = a.visible ? '' : '0';
          });
          const sel = live.current.selected;
          const c = card.current;
          if (c && sel !== null && anchors[sel] && W > 700) {
            const a = anchors[sel];
            const cw = c.offsetWidth;
            const x = a.x < W * 0.55 ? a.x + 150 : a.x - 150 - cw;
            c.style.transform = `translate(${clamp(x, 16, W - cw - 16).toFixed(1)}px, 0)`;
          }
        },
      });
      setLoaded(true);
    });
    return () => {
      alive = false;
      lab.current?.destroy();
      lab.current = null;
    };
    // The lab is built once per opening and reads everything else live.
  }, []);

  // The glow under each device follows the scheme's accent.
  useEffect(() => {
    if (root.current && lab.current) lab.current.setAccent(token(root.current, '--accent'));
  }, [scheme, loaded]);

  // The crown: scrolling changes how far the space replaces the room.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-scrolls]')) return;
      e.preventDefault();
      setLevel((l) => clamp(l - e.deltaY * 0.0012, 0, 1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const n = DEVICES.length;
      const cur = live.current.selected;
      const k = e.key;
      if (k === 'Escape') {
        e.preventDefault();
        if (cur !== null) setSelected(null);
        else live.current.onExit();
      } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault();
        const d = k === 'ArrowRight' ? 1 : -1;
        setSelected(cur === null ? (d > 0 ? 0 : n - 1) : (cur + d + n) % n);
      } else if ((k === 'a' || k === 'd' || k === 'w' || k === 's') && cur !== null) {
        e.preventDefault();
        lab.current?.turn(
          cur,
          k === 'a' ? -STEP : k === 'd' ? STEP : 0,
          k === 'w' ? -STEP / 1.5 : k === 's' ? STEP / 1.5 : 0,
        );
      } else if (k === 'r') {
        lab.current?.reset();
      } else if (k === '=' || k === '+' || k === ']') {
        setLevel((l) => clamp(l + 0.1, 0, 1));
      } else if (k === '-' || k === '[') {
        setLevel((l) => clamp(l - 0.1, 0, 1));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const info = selected === null ? null : hardware[selected];

  return (
    <div
      className={s.immersive}
      ref={root}
      style={{ '--level': level } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label="Hardware, in your space"
      data-loaded={loaded || undefined}
    >
      <div className={s.portal} aria-hidden="true">
        <i className={s.portalHorizon} />
      </div>
      <canvas
        ref={canvas}
        className={s.labCanvas}
        aria-label="The devices in 3D. Drag one to turn it; drag elsewhere to look around."
      />
      {!loaded && <p className={s.labLoading}>Placing the devices…</p>}

      <ul className={s.labLabels}>
        {DEVICES.map((d, i) => (
          <li key={d.key}>
            <button
              type="button"
              ref={(el) => {
                labels.current[i] = el;
              }}
              className={`${s.labLabel} ${s.gz}`}
              aria-pressed={selected === i}
              data-hover={hover === i || undefined}
              onClick={() => setSelected(selected === i ? null : i)}
            >
              <span className={s.tag}>{d.tag}</span>
              <span>{d.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div
        className={s.labCard}
        ref={card}
        data-open={info ? '' : undefined}
        aria-live="polite"
        data-scrolls
      >
        {info && (
          <>
            <p className={s.tag}>{info.tag}</p>
            <h2>{info.name}</h2>
            <p className={s.kind}>{info.kind}</p>
            <p>{info.detail}</p>
            <dl className={s.figs}>
              {info.figures.map((f) => {
                const { value, label } = splitFigure(f);
                return (
                  <div key={f} data-text={label ? undefined : ''}>
                    <dd>{value}</dd>
                    {label && <dt>{label}</dt>}
                  </div>
                );
              })}
            </dl>
            <p className={s.labHint}>Drag it to turn it over, or use A, D, W and S.</p>
          </>
        )}
      </div>

      <div className={s.labBar} role="toolbar" aria-label="Immersive space">
        <button type="button" className={`${s.pill} ${s.gz}`} onClick={onExit}>
          <Icon name="close" size={16} />
          <span>Exit</span>
        </button>
        <label className={s.crown}>
          <Icon name="crown" size={18} />
          <span className={s.crownLabel}>Immersion</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(level * 100)}
            onChange={(e) => setLevel(Number(e.target.value) / 100)}
            aria-valuetext={`${Math.round(level * 100)} percent`}
          />
        </label>
        <button type="button" className={`${s.pill} ${s.gz}`} onClick={() => lab.current?.reset()}>
          <Icon name="rotate" size={16} />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}
