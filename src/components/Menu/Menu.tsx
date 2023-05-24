import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { navLinks } from '@/configs/navLinks';
import { KEY_CODES } from '@/configs/constants';
import { useOnClickOutside } from '@/hooks';

const Menu = () => {
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useOnClickOutside(wrapperRef, () => setMenuOpen(false));

  let menuFocusAbles: HTMLElement[];
  let firstFocusableEl: HTMLElement;
  let lastFocusableEl: HTMLElement;

  const toggleMenu = () => setMenuOpen(!menuOpen);

  const setFocusables = () => {
    if (!buttonRef.current || !navRef.current) return;

    menuFocusAbles = [buttonRef.current, ...Array.from(navRef.current.querySelectorAll('a'))];
    firstFocusableEl = menuFocusAbles[0];
    lastFocusableEl = menuFocusAbles[menuFocusAbles.length - 1];
  };

  const handleBackwardTab = (e: KeyboardEvent) => {
    if (document.activeElement === firstFocusableEl) {
      e.preventDefault();
      lastFocusableEl.focus();
    }
  };

  const handleForwardTab = (e: KeyboardEvent) => {
    if (document.activeElement === lastFocusableEl) {
      e.preventDefault();
      firstFocusableEl.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case KEY_CODES.ESCAPE:
      case KEY_CODES.ESCAPE_IE11: {
        setMenuOpen(false);
        break;
      }

      case KEY_CODES.TAB: {
        if (menuFocusAbles && menuFocusAbles.length === 1) {
          e.preventDefault();
          break;
        }
        if (e.shiftKey) {
          handleBackwardTab(e);
        } else {
          handleForwardTab(e);
        }
        break;
      }

      default: {
        break;
      }
    }
  };

  const onResize = (e: UIEvent) => {
    if (window.innerWidth > 768) {
      setMenuOpen(false);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    setFocusables();

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
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
