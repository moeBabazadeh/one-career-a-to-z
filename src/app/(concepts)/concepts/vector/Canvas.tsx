'use client';

// The canvas element and what floats over it: comment pins and their threads. The Stage class
// does the drawing and the gestures; this mounts it and keeps the pins on their frames as the
// camera moves.

import { useEffect, useRef, useState } from 'react';
import { db } from '../_shared/data';
import { useReducedMotion, useScheme } from '../_shared/hooks';
import { Icon } from './controls';
import { worldBox } from './model';
import { dropEmptyThread, reply, resolveThread, set, store, useSlice, type Thread } from './store';
import { setStage, Stage, useStage } from './stage';
import s from './vector.module.scss';

export default function Canvas({
  readOnly,
  onTap,
}: {
  readOnly: boolean;
  onTap?: (id: string | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const flags = useRef({ readOnly, reduced, onTap });

  useEffect(() => {
    flags.current = { readOnly, reduced, onTap };
  });

  useEffect(() => {
    if (!wrap.current || !canvas.current) return;
    const st = new Stage(wrap.current, canvas.current, {
      readOnly: () => flags.current.readOnly,
      reduced: () => flags.current.reduced,
      onTap: (id) => flags.current.onTap?.(id),
    });
    st.mount();
    setStage(st);
    return () => {
      st.dispose();
      setStage(null);
    };
  }, []);

  // Colours come from the theme's tokens; repaint when the scheme flips.
  const stage = useStage();
  useEffect(() => {
    stage?.readColors();
  }, [scheme, stage]);

  return (
    <div ref={wrap} className={s.canvasWrap}>
      <canvas
        ref={canvas}
        className={s.canvas}
        tabIndex={0}
        aria-label="Canvas. Drag to move layers, Space and drag to pan, Ctrl or Cmd and scroll to zoom. The layers panel lists everything on this page."
      />
      <Pins />
    </div>
  );
}

/* ------------------------------------------------------------------ comments */

function Avatar({ who }: { who: 'moe' | 'you' }) {
  return who === 'moe' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={s.avatar} src={db.person.photo} alt="" width={24} height={24} />
  ) : (
    <span className={`${s.avatar} ${s.avatarYou}`} aria-hidden="true">
      Y
    </span>
  );
}

function Pins() {
  const threads = useSlice((st) => st.threads);
  const open = useSlice((st) => st.open);
  const doc = useSlice((st) => st.doc);
  const page = useSlice((st) => st.page);
  const ready = useSlice((st) => st.ready);
  const show = useSlice((st) => st.showComments);
  const tool = useSlice((st) => st.tool);
  const stage = useStage();
  const layer = useRef<HTMLDivElement>(null);
  const N = doc.nodes;
  const onPage = threads.filter(
    (t) => N[t.at] && pageOf(N, t.at) === page && (!t.resolved || t.id === open),
  );

  useEffect(() => {
    const el = layer.current;
    if (!stage || !el) return;
    const place = () => {
      const st = store.get();
      const nodes = st.doc.nodes;
      el.querySelectorAll<HTMLElement>('[data-pin]').forEach((p) => {
        const t = st.threads.find((th) => th.id === p.dataset.pin);
        if (!t || !nodes[t.at]) return;
        const b = worldBox(nodes, t.at);
        const [x, y] = stage.screenOf(b.x + b.w * t.fx, b.y + b.h * t.fy);
        p.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        // Far out, pins would pile up on each other; they come back as you zoom in.
        const far = stage.cam.z < 0.08 && t.id !== st.open;
        p.style.visibility =
          far || x < -40 || y < -40 || x > stage.W + 40 || y > stage.H + 40 ? 'hidden' : 'visible';
        // The thread card opens towards the room it has.
        p.toggleAttribute('data-flip-x', x > stage.W - 360);
        p.toggleAttribute('data-flip-y', y < 320);
      });
    };
    place();
    return stage.onView(place);
  }, [stage, onPage.length, open, doc, ready, show, page, threads]);

  if (!ready || !show) return <div ref={layer} className={s.pins} />;
  return (
    <div ref={layer} className={s.pins} data-tool={tool}>
      {onPage.map((t, i) => (
        <div key={t.id} className={s.pin} data-pin={t.id} data-open={t.id === open || undefined}>
          <button
            type="button"
            className={s.pinBtn}
            aria-expanded={t.id === open}
            aria-label={`Comment ${i + 1}${t.replies[0] ? `: ${t.replies[0].body.slice(0, 60)}` : ''}`}
            onClick={() => set({ open: t.id === open ? null : t.id })}
          >
            {t.replies[0] ? (
              <Avatar who={t.replies[0].who} />
            ) : (
              <span className={`${s.avatar} ${s.avatarYou}`}>+</span>
            )}
          </button>
          {t.id === open && <ThreadCard thread={t} />}
        </div>
      ))}
    </div>
  );
}

function ThreadCard({ thread }: { thread: Thread }) {
  const [text, setText] = useState('');
  const close = () => {
    dropEmptyThread(thread.id);
    set({ open: null });
  };
  const post = () => {
    if (!text.trim()) return;
    reply(thread.id, text);
    setText('');
  };
  return (
    <div
      className={s.thread}
      role="dialog"
      aria-label="Comment thread"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className={s.threadHead}>
        <span>{thread.replies.length ? 'Comment' : 'New comment'}</span>
        {thread.replies.length > 0 && (
          <button
            type="button"
            className={s.mini}
            onClick={() => resolveThread(thread.id)}
            aria-label={thread.resolved ? 'Reopen' : 'Resolve'}
            title={thread.resolved ? 'Reopen' : 'Resolve'}
          >
            <Icon name="resolve" size={15} />
          </button>
        )}
        <button type="button" className={s.mini} onClick={close} aria-label="Close comment">
          <Icon name="close" size={14} />
        </button>
      </header>
      <ol className={s.replies}>
        {thread.replies.map((r) => (
          <li key={r.id}>
            <Avatar who={r.who} />
            <div>
              <b>{r.who === 'moe' ? db.person.first : 'You'}</b>
              <p>{r.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <form
        className={s.replyForm}
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <textarea
          value={text}
          rows={2}
          placeholder={
            thread.replies.length
              ? 'Reply (only you will see it)'
              : 'Add a comment (only you will see it)'
          }
          aria-label="Reply"
          autoFocus={!thread.replies.length}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              post();
            }
            if (e.key === 'Escape') close();
          }}
        />
        <button type="submit" className={s.send} aria-label="Post" disabled={!text.trim()}>
          <Icon name="send" size={14} />
        </button>
      </form>
    </div>
  );
}

function pageOf(N: Record<string, { parent: string; type: string }>, id: string) {
  let n = N[id];
  while (n && n.type !== 'page') n = N[n.parent];
  return (n as { id?: string } | undefined)?.id ?? '';
}
