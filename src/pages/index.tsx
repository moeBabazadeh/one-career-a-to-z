import MainLayout from '@/layouts/MainLayout';
import Hero from '@/components/Hero';
import About from '@/components/About';
import Jobs from '@/components/Jobs';
import Featured from '@/components/Featured';
import Projects from '@/components/Projects';
import Contact from '@/components/Contact';

export default function Home() {
  return (
    <MainLayout>
      <main className="fillHeight" style={{ counterReset: 'section' }}>
        <Hero />
        <About />
        <Jobs />
        <Featured />
        <Projects />
        <Contact />
      </main>
    </MainLayout>
  );
}
