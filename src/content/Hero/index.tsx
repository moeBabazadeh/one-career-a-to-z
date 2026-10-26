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
        I’m a CTO and engineer who has been building since 2007 — from robots and GSM weather
        stations still running after 15 years to web, mobile, and AI platforms. Currently, I’m leading
        technology at{' '}
        <a href="https://neuroject.com/" target="_blank" rel="noreferrer">
          Neuroject
        </a>
        , the alignment layer for construction enterprises.
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
