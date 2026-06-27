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
        I’m a Chief Full Stack Engineer with over 10 years behind me, most of it at early-stage and
        growth startups where what I built had to hold up under real production load. I work mainly
        in TypeScript, Python, React, Next.js, and Laravel, and I’m at home across cloud, DevOps, and
        performance work. I like owning the architecture and setting how a team builds, while keeping
        the engineering pointed at what the business actually needs.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        Currently, I lead engineering at{' '}
        <a href="https://neuroject.com/" target="_blank" rel="noreferrer">
          Neuroject
        </a>
        , where I architect and build NeuroBuild — an AI platform that turns scattered construction
        project data into predictions and automated workflows, owned from the data model up to the
        interface. A lot of my recent work has been making AI genuinely useful inside the product:
        wiring{' '}
        <a href="https://nextjs.org/" target="_blank" rel="noreferrer">
          Next.js
        </a>{' '}
        and Laravel together with language models and automation, hosted on AWS Amplify and Laravel
        Vapor, so people get decisions they can actually trust.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        Previously, I led the frontend at{' '}
        <a href="https://0and1.co.uk/" target="_blank" rel="noreferrer">
          0&1
        </a>
        , building an integrated LMS and exam-monitoring platform — including face-based identity
        checks during live exams using the Microsoft Azure Face API, which tightened up security and
        helped on the compliance side.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        I enjoy working at the intersection of software architecture, AI integration, and product
        engineering — turning messy, complex workflows into intuitive, scalable, and data-driven
        systems.
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
