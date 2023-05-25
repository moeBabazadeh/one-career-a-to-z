import React, { useState, useEffect, useRef } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { loaderDelay } from '@/configs/constants';

interface Props {
  children: React.ReactNode;
  orientation: string;
}

const Side = ({ children, orientation }: Props) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setIsMounted(true), loaderDelay);

    return () => clearTimeout(timeout);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`side-element ${orientation === 'left' ? 'left' : ''}`}>
      <TransitionGroup component={null}>
        {isMounted && (
          <CSSTransition classNames="fade" timeout={loaderDelay} nodeRef={nodeRef}>
            <div ref={nodeRef}>{children}</div>
          </CSSTransition>
        )}
      </TransitionGroup>
    </div>
  );
};

export default Side;
