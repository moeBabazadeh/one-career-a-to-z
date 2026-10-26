import MainLayout from '@/layouts/MainLayout';
import ProjectLinks from '@/components/ProjectLinks';
import { archive } from '@/content/projects';
import { useReveal } from '@/hooks';

export default function Archive() {
  const revealTitle = useReveal<HTMLElement>();
  const revealTable = useReveal<HTMLDivElement>();

  return (
    <MainLayout isHome={false} title="Archive | Mohammad Babazadeh">
      <main>
        <header className="archive-header reveal" ref={revealTitle}>
          <h1 className="big-heading">Archive</h1>
          <p className="subtitle">A big list of things I’ve worked on</p>
        </header>

        <div className="archive-table reveal" ref={revealTable}>
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Title</th>
                <th className="hide-on-mobile">Made at</th>
                <th className="hide-on-mobile">Built with</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {archive.map(({ year, title, madeAt, tech, links }) => (
                <tr key={title}>
                  <td className="overline year">{year}</td>
                  <td className="title">{title}</td>
                  <td className="company hide-on-mobile">{madeAt ?? '—'}</td>
                  <td className="tech hide-on-mobile">
                    {tech.map((item, i) => (
                      <span key={item}>
                        {item}
                        {i < tech.length - 1 && <span className="separator">&middot;</span>}
                      </span>
                    ))}
                  </td>
                  <td className="links">
                    <ProjectLinks title={title} links={links} className="links-list" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </MainLayout>
  );
}
