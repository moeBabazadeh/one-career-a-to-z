import MainLayout from '@/layouts/MainLayout';

export default function Home() {
  return (
    <MainLayout>
      <main className="fillHeight" style={{ counterReset: 'section' }}>
        Hello World!
      </main>
    </MainLayout>
  );
}
