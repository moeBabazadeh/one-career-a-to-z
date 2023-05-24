import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import Menu from '@/components/Menu';
import IconLogo from '@/assets/icons/IconLogo';
import { navLinks } from '@/configs/navLinks';
import { loaderDelay } from '@/configs/constants';
import { useScrollDirection } from '@/hooks';

const Nav = () => {
  const timeout = loaderDelay;
  const fadeClass = 'fade';
  const fadeDownClass = 'fadedown';
  const logoNode = useRef(null);
  const btnNode = useRef(null);
  const menuNode = useRef(null);
  const [isMounted, setIsMounted] = useState(false);
  const scrollDirection = useScrollDirection('down', 100, false);
  const [scrolledToTop, setScrolledToTop] = useState(true);

  const handleScroll = () => {
    setScrolledToTop(window.pageYOffset < 50);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsMounted(true);
    }, 100);

    window.addEventListener('scroll', handleScroll);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('scroll', handleScroll);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header
      className={
        'header ' +
        (scrollDirection === 'up' && !scrolledToTop ? 'scroll-up' : '') +
        (scrollDirection === 'down' && !scrolledToTop ? 'scroll-down' : '')
      }
    >
      <nav className="nav">
        <>
          <TransitionGroup component={null}>
            {isMounted && (
              <CSSTransition classNames={fadeClass} timeout={timeout} nodeRef={logoNode}>
                <div ref={logoNode}>
                  <div className="logo" tabIndex={-1}>
                    <Link href="/" aria-label="home">
                      <IconLogo />
                    </Link>
                  </div>
                </div>
              </CSSTransition>
            )}
          </TransitionGroup>

          <div className="nav-link">
            <ol>
              <TransitionGroup component={null}>
                {isMounted &&
                  navLinks &&
                  navLinks.map(({ url, name, nodeRef }, i) => (
                    <CSSTransition
                      key={i}
                      classNames={fadeDownClass}
                      timeout={timeout}
                      nodeRef={nodeRef}
                    >
                      <li key={i} style={{ transitionDelay: `${i * 100}ms` }} ref={nodeRef}>
                        <Link href={url}>{name}</Link>
                      </li>
                    </CSSTransition>
                  ))}
              </TransitionGroup>
            </ol>

            <TransitionGroup component={null}>
              {isMounted && (
                <CSSTransition classNames={fadeDownClass} timeout={timeout} nodeRef={btnNode}>
                  <div style={{ transitionDelay: `${navLinks.length * 100}ms` }} ref={btnNode}>
                    <a
                      className="resume-button"
                      href="/resume.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Resume
                    </a>
                  </div>
                </CSSTransition>
              )}
            </TransitionGroup>
          </div>

          <TransitionGroup component={null}>
            {isMounted && (
              <CSSTransition classNames={fadeClass} timeout={timeout} nodeRef={menuNode}>
                <div className="menu" ref={menuNode}>
                  <Menu />
                </div>
              </CSSTransition>
            )}
          </TransitionGroup>
        </>
      </nav>
    </header>
  );
};

export default Nav;
