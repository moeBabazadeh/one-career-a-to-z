import { useState } from 'react';
import Head from '@/components/Head';
import Loader from '@/components/Loader/Loader';

interface Props {
  children: React.ReactNode;
}

const MainLayout = (props: Props) => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <>
      <Head />

      <div id="root">
        {isLoading ? (
          <Loader finishLoading={() => setTimeout(() => setIsLoading(false), 300)} />
        ) : (
          <div className="layout-wrapper">
            <div id="content">{props.children}</div>
          </div>
        )}
      </div>
    </>
  );
};

export default MainLayout;
