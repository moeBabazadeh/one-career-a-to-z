import { createRef } from 'react';

const Hero = [
  {
    text: <h1>Hi, my name is</h1>,
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: <h2 className="big-heading">Mohammad Babazadeh.</h2>,
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <h3 className="big-heading">
        I architect AI-driven platforms and scalable digital products.
      </h3>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        I’m a Chief Full Stack Engineer with over 10 years of experience building scalable,
        high-performance systems across startups and international teams. My work focuses on
        designing intelligent platforms that combine modern web technologies, cloud infrastructure,
        workflow automation, and AI-driven insights to solve complex operational challenges.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        Currently, I lead engineering initiatives at{' '}
        <a href="https://neuroject.com/" target="_blank" rel="noreferrer">
          Neuroject
        </a>
        , where I work on AI-enabled construction and project management solutions using{' '}
        <a href="https://nextjs.org/" target="_blank" rel="noreferrer">
          Next.js
        </a>
        , Laravel, AWS, and modern DevOps practices. My role spans full system architecture,
        workflow optimization, cloud infrastructure, and leading development teams from concept to
        production.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        Previously, I helped build and scale digital products at{' '}
        <a href="https://0and1.co.uk/" target="_blank" rel="noreferrer">
          0&1
        </a>
        , contributing to the development of an advanced LMS and exam monitoring platform, including
        secure identity verification systems powered by AI technologies.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        I enjoy working at the intersection of software architecture, AI integration, and product
        engineering — transforming complex workflows into intuitive, scalable, and data-driven
        systems.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        Outside of work, I explore embedded systems, real-time technologies, and emerging tools that
        push the boundaries of modern software engineering.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <a className="email-link" href="/resume.pdf" target="_blank" rel="noreferrer">
        Check out my CV!
      </a>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
];

export default Hero;
