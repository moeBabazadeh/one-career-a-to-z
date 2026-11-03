'use client';

import { useInView } from '../_shared/hooks';

/** Marks its box with `data-seen` the first time it scrolls into view, for CSS entrances. */
export default function Seen({
  className,
  children,
  threshold = 0.2,
}: {
  className?: string;
  children: React.ReactNode;
  threshold?: number;
}) {
  const [ref, seen] = useInView<HTMLDivElement>(true, threshold);
  return (
    <div ref={ref} className={className} data-seen={seen || undefined}>
      {children}
    </div>
  );
}
