import React, { useState } from 'react';
import Link from 'next/link';
import IconFolder from '@/assets/icons/folder';
import ProjectLinks, { primaryLink } from '@/components/ProjectLinks';
import { otherProjects, type Project } from '@/content/projects';
import { useReveal } from '@/hooks';

const GRID_LIMIT = 6;

const ProjectCard = ({ project, delay }: { project: Project; delay: number }) => {
  const revealCard = useReveal<HTMLLIElement>();
  const { title, description, tech, links } = project;
  const href = primaryLink(links);

  return (
    <li
      className="projects-project reveal"
      ref={revealCard}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="project-inner">
        <header>
          <div className="project-top">
            <div className="folder">
              <IconFolder />
            </div>
            <ProjectLinks title={title} links={links} />
          </div>

          <h3 className="project-title">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer">
                {title}
              </a>
            ) : (
              title
            )}
          </h3>

          <div className="project-description">
            <p>{description}</p>
          </div>
        </header>

        <footer>
          <ul className="project-tech-list">
            {tech.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </footer>
      </div>
    </li>
  );
};

const Projects = () => {
  const [showMore, setShowMore] = useState(false);
  const revealTitle = useReveal<HTMLHeadingElement>();
  const revealArchiveLink = useReveal<HTMLAnchorElement>();
  const shown = showMore ? otherProjects : otherProjects.slice(0, GRID_LIMIT);

  return (
    <section className="projects-section">
      <h2 className="reveal" ref={revealTitle}>
        Other Noteworthy Projects
      </h2>

      <Link className="inline-link archive-link reveal" href="/archive" ref={revealArchiveLink}>
        view the archive
      </Link>

      <ul className="projects-grid">
        {shown.map((project, i) => (
          <ProjectCard key={project.title} project={project} delay={(i % GRID_LIMIT) * 100} />
        ))}
      </ul>

      {otherProjects.length > GRID_LIMIT && (
        <button className="more-button" onClick={() => setShowMore(!showMore)}>
          Show {showMore ? 'Less' : 'More'}
        </button>
      )}
    </section>
  );
};

export default Projects;
