import { useState } from 'react';
import Head from '@/components/Head';
import Loader from '@/components/Loader/Loader';
import Nav from '@/components/Nav';
import Social from '@/components/Social';
import Email from '@/components/Email';
import Footer from '@/components/Footer';

interface Props {
  children: React.ReactNode;
  // The intro loader only plays on the home page.
  isHome?: boolean;
  title?: string;
}

const MainLayout = ({ isHome = true, title, ...props }: Props) => {
  const [isLoading, setIsLoading] = useState(isHome);

  return (
    <>
      <Head title={title} />

      <div id="root">
        {isLoading ? (
          <Loader finishLoading={() => setTimeout(() => setIsLoading(false), 300)} />
        ) : (
          <div className="layout-wrapper">
            <Nav />
            <Social />
            <Email />

            <div id="content" style={{ marginTop: 150 }}>
              {props.children}

              <Footer />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default MainLayout;
