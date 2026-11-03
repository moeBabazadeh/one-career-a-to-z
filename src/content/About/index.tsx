import { awards, current, devices, person, roles, skills } from '../db';

export { skills };

const link = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
);

export const aboutParagraphs = [
  <p key="start">
    Hello! I’m {person.first}. I started building websites as a freelancer in {person.since},
    studied electrical engineering with a focus on control systems, and spent my university years
    building robots — including a {awards.robocup.place} at {awards.robocup.event}{' '}
    {awards.robocup.year}.
  </p>,
  <p key="now">
    Fast-forward to today, and I’ve had the privilege of building for {roles.niknam.sector},{' '}
    {roles.alget.sector}, {roles.zeroone.sector} ({link(roles.zeroone.url, roles.zeroone.org)}), and{' '}
    {roles.neuroject.sector}. These days I’m {current.title} at{' '}
    {link(current.companyUrl, current.company)}, leading the platform that connects BIM, schedules,
    budgets, and risks for construction enterprises — and bringing AI into it.
  </p>,
  <p key="along">
    Along the way I’ve shipped apps to the App Store and Google Play, hardware that’s still logging
    data after {devices.logger.online.n} years, and fixes to open source projects like Gatsby and
    DefinitelyTyped. I enjoy working at the intersection of software architecture, AI integration,
    and product engineering — turning messy, complex workflows into intuitive, scalable systems.
  </p>,
  <p key="skills">Here are a few technologies I’ve been working with recently:</p>,
];
