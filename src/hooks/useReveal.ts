import { useEffect, useRef } from 'react';

/**
 * Marks an element as revealed the first time it scrolls into view.
 * Give the element the `reveal` class; the styles handle the fade-up and reduced motion.
 */
const useReveal = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed');
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
};

export default useReveal;
