'use client';

import { useEffect, useRef, useState } from 'react';
import s from './blog.module.scss';

type Props =
  /** A post's address, beside its share link: a round icon button. */
  | { kind: 'link'; text: string }
  /** The code block the button sits in, in the block's top bar. */
  | { kind: 'code' };

/** Copies to the clipboard, then says "Copied" for a moment, to screen readers too. */
export default function CopyButton(props: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(event: React.MouseEvent<HTMLButtonElement>) {
    const lines = event.currentTarget.closest('figure')?.querySelectorAll('pre [data-line]') ?? [];
    const text =
      props.kind === 'link' ? props.text : [...lines].map((line) => line.textContent).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // No clipboard (an old browser, or permission refused): nothing to say.
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  const link = props.kind === 'link';
  return (
    <button
      type="button"
      className={link ? s.copyLink : s.copyCode}
      onClick={copy}
      aria-label={link ? 'Copy the link to this post' : 'Copy the code'}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ) : link ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
      {!link && <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>}
      <span role="status" className={s.hidden}>
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}
