import { useState, useEffect } from 'react';

const SCROLL_UP = 'up';
const SCROLL_DOWN = 'down';

const useScrollDirection = (
  initialDirection: 'up' | 'down',
  thresholdPixels: number,
  off: boolean,
): 'up' | 'down' => {
  const [scrollDir, setScrollDir] = useState(initialDirection);

  useEffect(() => {
    if (off) return;

    const threshold = thresholdPixels || 0;
    let lastScrollY = window.pageYOffset;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.pageYOffset;

      if (Math.abs(scrollY - lastScrollY) < threshold) {
        // We haven't exceeded the threshold
        ticking = false;
        return;
      }

      setScrollDir(scrollY > lastScrollY ? SCROLL_DOWN : SCROLL_UP);
      lastScrollY = scrollY > 0 ? scrollY : 0;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll);

    return () => window.removeEventListener('scroll', onScroll);
  }, [thresholdPixels, off]);

  // While `off`, report the initial direction instead of tracking scroll.
  return off ? initialDirection : scrollDir;
};

export default useScrollDirection;
