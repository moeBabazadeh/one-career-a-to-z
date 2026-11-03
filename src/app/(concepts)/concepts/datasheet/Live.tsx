'use client';

import { useInView } from '../_shared/hooks';

/**
 * Marks its children with `data-in` while they're on screen, so plain CSS can run the
 * animations: curves draw in once (`loop` off), signal pulses run only while visible (`loop` on).
 * The figures inside stay server-rendered.
 */
export default function Live({
  loop = false,
  className,
  children,
}: {
  loop?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(!loop, loop ? 0 : 0.2);
  return (
    <div ref={ref} className={className} data-live="" data-in={inView || undefined}>
      {children}
    </div>
  );
}
