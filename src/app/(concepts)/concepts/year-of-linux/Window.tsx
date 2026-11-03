import { useEffect, useRef, useState } from 'react';
import { clamp } from './geom';
import { Icon } from './icons';
import { Menu, type MenuItem } from './Menu';
import { startMove } from './wobbly';
import { APPS, MIN_H, MIN_W, WORKSPACES, type AppId, type Win, type WmAction } from './wm';
import s from './desktop.module.scss';

const PHONE = '(max-width: 700px)';

interface WindowProps {
  id: AppId;
  win: Win;
  focused: boolean;
  /** The top window of its workspace: the one a phone shows. */
  top: boolean;
  title?: string;
  dispatch: (a: WmAction) => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  /** Moves the window to another workspace (and follows it there). */
  onSend: (ws: number) => void;
  wobbly: () => boolean;
  children: React.ReactNode;
}

function Glyph({ kind }: { kind: 'min' | 'max' | 'restore' | 'close' }) {
  const d = {
    min: 'M3 9.5h6',
    max: 'M2.5 2.5h7v7h-7zM2.5 3.5h7',
    restore: 'M4.5 1.5h6v6M1.5 4.5h6v6h-6zM1.5 5.5h6',
    close: 'M3 3l6 6M9 3l-6 6',
  }[kind];
  return (
    <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={kind === 'close' ? 1.8 : 1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * One window in a Metacity frame: a title bar you drag (wobbly, if Compiz says so), the
 * window menu on its icon or Alt+Space, whose Move and Resize take the arrow keys, and edges
 * to resize by.
 */
export default function Window({
  id,
  win,
  focused,
  top,
  title,
  dispatch,
  onClose,
  onMinimize,
  onMaximize,
  onSend,
  wobbly,
  children,
}: WindowProps) {
  const spec = APPS[id];
  const ref = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState<'mouse' | 'key' | null>(null);
  const [kbMode, setKbMode] = useState<'move' | 'size' | null>(null);
  const resizable = !spec.dialog;
  const name = title ?? spec.title;

  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.querySelector(`.${s.winMenu}`)?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [menu]);

  const desk = () => {
    const p = ref.current?.offsetParent as HTMLElement | null;
    return { w: p?.clientWidth ?? innerWidth, h: p?.clientHeight ?? innerHeight };
  };

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (
      !el ||
      e.button !== 0 ||
      win.max ||
      (e.target as HTMLElement).closest('button') ||
      matchMedia(PHONE).matches
    )
      return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const box = el.getBoundingClientRect();
    const { w: dw, h: dh } = desk();
    const width = el.offsetWidth,
      height = el.offsetHeight;
    const sx = e.clientX,
      sy = e.clientY;
    const mover = startMove({
      el,
      x: win.x,
      y: win.y,
      w: width,
      h: height,
      gx: e.clientX - box.left,
      gy: e.clientY - box.top,
      wobbly,
      limit: (x, y) => [clamp(x, 80 - width, dw - 80), clamp(y, 0, dh - 30)],
      onDrop: (x, y) => dispatch({ type: 'place', id, x, y }),
    });
    const onMove = (ev: PointerEvent) => mover.move(ev.clientX - sx, ev.clientY - sy);
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      mover.drop();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  // Resizing writes the size straight to the element and tells the reducer once, on release.
  const startResize = (e: React.PointerEvent<HTMLElement>, edges: 'r' | 'b' | 'rb') => {
    const el = ref.current;
    if (!el || e.button !== 0 || win.max) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const { w: dw, h: dh } = desk();
    const sx = e.clientX,
      sy = e.clientY;
    const w0 = el.offsetWidth,
      h0 = el.offsetHeight;
    let next = { w: w0, h: h0 };
    const onMove = (ev: PointerEvent) => {
      next = {
        w: edges.includes('r') ? clamp(w0 + ev.clientX - sx, MIN_W, dw - win.x) : w0,
        h: edges.includes('b') ? clamp(h0 + ev.clientY - sy, MIN_H, dh - win.y) : h0,
      };
      el.style.width = `${next.w}px`;
      el.style.height = `${next.h}px`;
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      dispatch({ type: 'place', id, x: win.x, y: win.y, w: next.w, h: next.h });
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey && (e.key === ' ' || e.code === 'Space')) {
      e.preventDefault();
      setMenu('key');
      return;
    }
    if (!kbMode) return;
    const step = e.shiftKey ? 40 : 10;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key in d && !e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      const [dx, dy] = d[e.key];
      const { w, h } = desk();
      dispatch({ type: 'nudge', id, mode: kbMode, dx, dy, vw: w, vh: h });
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      setKbMode(null);
    }
  };

  const focus = () => {
    if (!focused) dispatch({ type: 'focus', id });
  };

  // The window's content is portalled in (so it survives moving between workspaces), and React
  // events from a portal don't bubble through this frame; so the frame listens natively.
  const handlers = useRef({ focus, onKeyDown });
  useEffect(() => {
    handlers.current = { focus, onKeyDown };
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onFocus = () => handlers.current.focus();
    const onKey = (e: KeyboardEvent) => handlers.current.onKeyDown(e);
    el.addEventListener('pointerdown', onFocus, { capture: true });
    el.addEventListener('focusin', onFocus);
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onFocus, { capture: true });
      el.removeEventListener('focusin', onFocus);
      el.removeEventListener('keydown', onKey);
    };
  }, []);

  const menuItems: MenuItem[] = [
    { label: 'Minimize', disabled: !resizable, onSelect: onMinimize },
    { label: win.max ? 'Unmaximize' : 'Maximize', disabled: !resizable, onSelect: onMaximize },
    { label: 'Move', disabled: win.max, onSelect: () => (setKbMode('move'), ref.current?.focus()) },
    {
      label: 'Resize',
      disabled: win.max || !resizable,
      onSelect: () => (setKbMode('size'), ref.current?.focus()),
    },
    { separator: true },
    {
      label: 'Move to Workspace Left',
      hint: 'Ctrl+Alt+Shift+←',
      onSelect: () => onSend(win.ws - 1),
    },
    {
      label: 'Move to Workspace Right',
      hint: 'Ctrl+Alt+Shift+→',
      onSelect: () => onSend(win.ws + 1),
    },
    {
      label: 'Move to Another Workspace',
      sub: WORKSPACES.map((w, i) => ({
        label: `${i + 1} · ${w.name}`,
        disabled: i === win.ws,
        onSelect: () => onSend(i),
      })),
    },
    { separator: true },
    { label: 'Close', hint: 'Alt+F4', onSelect: onClose },
  ];

  const autoW = spec.rect[2] === 0,
    autoH = spec.rect[3] === 0;
  const cls = [
    s.win,
    focused ? s.winActive : '',
    top ? s.winTop : '',
    win.max ? s.winMax : '',
    spec.dialog ? s.winDialog : '',
    kbMode ? s.winKb : '',
    s[`app_${id}`] ?? '',
  ].join(' ');

  return (
    <section
      ref={ref}
      id={`win-${id}`}
      data-win={id}
      aria-labelledby={`win-${id}-title`}
      tabIndex={-1}
      className={cls}
      hidden={win.min}
      style={{
        left: win.x,
        top: win.y,
        width: autoW ? undefined : win.w,
        height: autoH ? undefined : win.h,
        zIndex: win.z,
      }}
    >
      <header
        className={s.titlebar}
        onPointerDown={startDrag}
        onDoubleClick={(e) =>
          resizable && !(e.target as HTMLElement).closest('button') && onMaximize()
        }
      >
        <button
          type="button"
          className={s.winMenuBtn}
          aria-label="Window menu"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={(e) => setMenu(menu ? null : e.detail === 0 ? 'key' : 'mouse')}
        >
          <Icon name={spec.icon} size={16} />
        </button>
        <h2 id={`win-${id}-title`} className={s.title}>
          {name}
        </h2>
        <div className={s.captionBtns}>
          {resizable && (
            <>
              <button type="button" aria-label="Minimize" data-cap="min" onClick={onMinimize}>
                <Glyph kind="min" />
              </button>
              <button
                type="button"
                aria-label={win.max ? 'Unmaximize' : 'Maximize'}
                data-cap="max"
                onClick={onMaximize}
              >
                <Glyph kind={win.max ? 'restore' : 'max'} />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="Close"
            data-cap="close"
            className={s.closeBtn}
            onClick={onClose}
          >
            <Glyph kind="close" />
          </button>
        </div>
      </header>
      {menu && (
        <Menu
          label={`${name}: window menu`}
          className={s.winMenu}
          autoFocus={menu === 'key'}
          items={menuItems}
          onClose={(refocus) => {
            setMenu(null);
            if (refocus) ref.current?.querySelector<HTMLElement>(`.${s.winMenuBtn}`)?.focus();
          }}
        />
      )}
      {kbMode && (
        <p className={s.kbHint} role="status">
          {kbMode === 'move' ? 'Moving' : 'Resizing'}: arrow keys, Shift for bigger steps, Enter
          when done.
        </p>
      )}
      <div className={s.winBody}>{children}</div>
      {resizable && !win.max && (
        <>
          <div className={s.edgeR} onPointerDown={(e) => startResize(e, 'r')} aria-hidden="true" />
          <div className={s.edgeB} onPointerDown={(e) => startResize(e, 'b')} aria-hidden="true" />
          <div className={s.grip} onPointerDown={(e) => startResize(e, 'rb')} aria-hidden="true" />
        </>
      )}
    </section>
  );
}
