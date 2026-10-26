import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { navLinks } from '@/configs/navLinks';
import { KEY_CODES } from '@/configs/constants';
import { useOnClickOutside } from '@/hooks';

const Menu = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useOnClickOutside(wrapperRef, () => setMenuOpen(false));

  const toggleMenu = () => setMenuOpen(!menuOpen);

  useEffect(() => {
    // Keep Tab cycling between the menu button and the menu's links.
    const trapFocus = (e: KeyboardEvent) => {
      if (!buttonRef.current || !navRef.current) return;

      const focusables = [buttonRef.current, ...Array.from(navRef.current.querySelectorAll('a'))];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (focusables.length === 1) {
        e.preventDefault();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case KEY_CODES.ESCAPE:
        case KEY_CODES.ESCAPE_IE11:
          setMenuOpen(false);
          break;
        case KEY_CODES.TAB:
          trapFocus(e);
          break;
      }
    };

    const onResize = () => {
      if (window.innerWidth > 768) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add('blur');
    } else {
      document.body.classList.remove('blur');
    }

    return () => {
      document.body.classList.remove('blur');
    };
  }, [menuOpen]);

  return (
    <div>
      <div ref={wrapperRef}>
        <button
          className={`hamburger-button ${menuOpen ? 'menu-open' : ''}`}
          onClick={toggleMenu}
          ref={buttonRef}
          aria-label="Menu"
        >
          <div className="ham-box">
            <div className="ham-box-inner" />
          </div>
        </button>

        <aside
          className={`aside ${menuOpen ? 'menu-open' : ''}`}
          aria-hidden={!menuOpen}
          tabIndex={menuOpen ? 1 : -1}
        >
          <nav ref={navRef}>
            {navLinks && (
              <ol>
                {navLinks.map(({ url, name }, i) => (
                  <li key={i}>
                    <Link href={url} onClick={() => setMenuOpen(false)}>
                      {name}
                    </Link>
                  </li>
                ))}
              </ol>
            )}

            <a href="/resume.pdf" className="resume-link">
              Resume
            </a>
          </nav>
        </aside>
      </div>
    </div>
  );
};

export default Menu;
