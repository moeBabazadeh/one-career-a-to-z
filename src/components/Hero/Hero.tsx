import React, { useState, useEffect } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { navDelay, loaderDelay } from '@/configs/constants';
import HeroData from '@/content/Hero';

const Hero = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setIsMounted(true), navDelay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <section className="hero-section">
      <TransitionGroup component={null}>
        {isMounted &&
          HeroData.map((item, i) => (
            <CSSTransition key={i} nodeRef={item.nodeRef} classNames="fadeup" timeout={loaderDelay}>
              <div ref={item.nodeRef} style={{ transitionDelay: `${i + 1}00ms` }}>
                {item.text}
              </div>
            </CSSTransition>
          ))}
      </TransitionGroup>
    </section>
  );
};

export default Hero;
