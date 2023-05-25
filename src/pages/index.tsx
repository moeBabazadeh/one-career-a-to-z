import MainLayout from '@/layouts/MainLayout';
import Hero from '@/components/Hero';

export default function Home() {
  return (
    <MainLayout>
      <main className="fillHeight" style={{ counterReset: 'section' }}>
        <Hero />
      </main>
    </MainLayout>
  );
}
