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
    text: <h3 className="big-heading">I build things for the web.</h3>,
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        As a diligent software engineer at{' '}
        <a href="https://0and1.co.uk/" target="_blank" rel="noreferrer">
          0and1
        </a>
        , I harness the power of{' '}
        <a href="https://nextjs.org/" target="_blank" rel="noreferrer">
          NextJs
        </a>{' '}
        to build our state-of-the-art Learning Management System, crafting meaningful and modern web
        experiences.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        In my spare time, I immerse myself in embedded systems projects as a personal hobby, always
        learning something new.
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
