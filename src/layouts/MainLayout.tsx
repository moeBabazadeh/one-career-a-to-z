import Head from '@/components/Head';

interface Props {
  children: React.ReactNode;
}

const MainLayout = (props: Props) => {
  return (
    <>
      <Head />

      <div id="root">
        <div className="layout-wrapper">
          <div id="content">{props.children}</div>
        </div>
      </div>
    </>
  );
};

export default MainLayout;
