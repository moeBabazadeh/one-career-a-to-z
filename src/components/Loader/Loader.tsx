import React, { useState, useEffect } from 'react';
import IconLogo from '@/assets/icons/IconLogo';

interface Props {
  finishLoading: () => void;
}

const Loader = ({ finishLoading }: Props) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    // document.body.classList.add('hidden');
    const timeout1 = setTimeout(() => setIsMounted(true), 10);
    const timeout2 = setTimeout(() => {
      finishLoading();
      setIsFinished(true);
    }, 1500);

    return () => {
      document.body.classList.remove('hidden');
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`loader ${isFinished ? 'hidden' : ''}`}>
      <div className={`logo-wrapper ${isMounted ? ' visible' : ' hidden'}`}>
        <IconLogo />
      </div>
    </div>
  );
};

export default Loader;
