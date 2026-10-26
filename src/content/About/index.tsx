const link = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
);

export const aboutParagraphs = [
  <p key="start">
    Hello! I’m Moe. I started building websites as a freelancer in 2007, studied electrical
    engineering with a focus on control systems, and spent my university years building robots —
    including a 1st place at RoboCup IranOpen 2010.
  </p>,
  <p key="now">
    Fast-forward to today, and I’ve had the privilege of building for an electronics and IoT company,
    a grocery marketplace, an edtech company ({link('https://0and1.co.uk/', '0&1')}), and a
    construction-tech company. These days I’m CTO at {link('https://neuroject.com/', 'Neuroject')},
    leading the platform that connects BIM, schedules, budgets, and risks for construction
    enterprises — and bringing AI into it.
  </p>,
  <p key="along">
    Along the way I’ve shipped apps to the App Store and Google Play, hardware that’s still logging
    data after 15 years, and fixes to open source projects like Gatsby and DefinitelyTyped. I enjoy
    working at the intersection of software architecture, AI integration, and product engineering —
    turning messy, complex workflows into intuitive, scalable systems.
  </p>,
  <p key="skills">Here are a few technologies I’ve been working with recently:</p>,
];

export const skills = [
  'TypeScript',
  'React & Next.js',
  'Laravel (PHP)',
  'Python & FastAPI',
  'AWS',
  'React Native & Expo',
  'Embedded C',
  'PostgreSQL & MySQL',
];
