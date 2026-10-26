import React from 'react';
import Image from 'next/image';
import ProjectLinks, { primaryLink } from '@/components/ProjectLinks';
import { featuredProjects, type FeaturedProject } from '@/content/projects';
import { useReveal } from '@/hooks';

const Project = ({ project }: { project: FeaturedProject }) => {
  const revealProject = useReveal<HTMLLIElement>();
  const { title, description, tech, links, image } = project;
  const href = primaryLink(links);
  const picture = <Image className="img" src={image} width={1280} height={800} alt={title} />;

  return (
    <li className="featured-projects-project reveal" ref={revealProject}>
      <div className="project-content">
        <div>
          <p className="project-overline">Featured Project</p>

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

          <ul className="project-tech-list">
            {tech.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <ProjectLinks title={title} links={links} />
        </div>
      </div>

      <div className="project-image">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {picture}
          </a>
        ) : (
          <div className="frame">{picture}</div>
        )}
      </div>
    </li>
  );
};

const Featured = () => {
  const revealTitle = useReveal<HTMLHeadingElement>();

  return (
    <section id="projects">
      <h2 className="numbered-heading reveal" ref={revealTitle}>
        Some Things I’ve Built
      </h2>

      <ul className="featured-projects-grid">
        {featuredProjects.map((project) => (
          <Project key={project.title} project={project} />
        ))}
      </ul>
    </section>
  );
};

export default Featured;
