import { createRef } from 'react';
import { current, devices, person } from '../db';

const Hero = [
  {
    text: <h1>Hi, my name is</h1>,
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: <h2 className="big-heading">{person.fullName}.</h2>,
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: <h3 className="big-heading">{person.tagline}</h3>,
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <p>
        I’m a {current.title} and engineer who has been building since {person.since} — from robots
        and GSM weather stations still running after {devices.logger.online.n} years to web, mobile,
        and AI platforms. Currently, I’m leading technology at{' '}
        <a href={current.companyUrl} target="_blank" rel="noreferrer">
          {current.company}
        </a>
        , {current.pitch}.
      </p>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
  {
    text: (
      <a className="email-link" href={person.cv} target="_blank" rel="noreferrer">
        Check out my CV!
      </a>
    ),
    nodeRef: createRef<HTMLDivElement>(),
  },
];

export default Hero;
