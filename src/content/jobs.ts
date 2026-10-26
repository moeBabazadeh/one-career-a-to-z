export interface Job {
  company: string;
  title: string;
  url?: string;
  range: string;
  duties: string[];
}

export const jobs: Job[] = [
  {
    company: 'Neuroject',
    title: 'CTO',
    url: 'https://neuroject.com',
    range: 'June 2024 – Present',
    duties: [
      'CTO since September 2026, after two years as Chief Full Stack Engineer. I lead the architecture, roadmap, and delivery of a cloud-native, multi-tenant platform that connects BIM, schedules, budgets, and risks into traceable decisions.',
      'Bringing AI into the platform, from natural-language access to project data to early warning on schedule and cost risk.',
      'Led the architecture and build of NeuroBuild on Next.js, React 19, and Laravel, hosted on AWS Amplify and Laravel Vapor, with 4,700+ commits across five codebases.',
      'Set the engineering bar: a permission check on every API route, audit trails, and production alarms and GuardDuty alerts kept in infrastructure as code.',
    ],
  },
  {
    company: 'Neuroship',
    title: 'Chief Full Stack Engineer',
    range: 'May 2026 – Present',
    duties: ['Chief Full Stack Engineer on contract, alongside my role at Neuroject.'],
  },
  {
    company: '0&1',
    title: 'Lead Frontend Developer',
    url: 'https://0and1.co.uk',
    range: 'February 2021 – December 2024',
    duties: [
      'Led the frontend architecture of Active-Class, an integrated LMS and exam monitoring platform, including identity checks during live exams with the Microsoft Azure Face API.',
      'Shipped Attendum end to end: firmware for the ESP32 card readers and nRF52840 BLE beacons, the iOS and Android app, the staff dashboard, and a Canvas LTI app.',
      'Built Office.js add-ins for PowerPoint and Word, the School.how dashboard, the Education Guide app, and the Learning Kit and Exam Kit websites.',
      'Redesigned the CI/CD pipelines to cut build and deployment overhead, then stayed on as a technical consultant for architecture, performance, and release reliability.',
    ],
  },
  {
    company: 'Alget.nl',
    title: 'Senior Frontend Developer',
    range: 'August 2020 – February 2021',
    duties: [
      'Built the React frontend of a digital marketplace that helps local supermarkets and grocery businesses sell online.',
      'Implemented state management and client-side data handling that cut unnecessary API requests.',
      'Shipped MVP features quickly with the product and backend teams, and improved deployment workflows with CI/CD.',
    ],
  },
  {
    company: 'Niknam',
    title: 'Senior Software Engineer',
    range: 'October 2012 – August 2020',
    duties: [
      'At Niknam Electronic Rayan, built IoT platforms and connected systems for monitoring, tracking, and data visualisation across multiple industries.',
      'Designed web applications and real-time dashboards, and integrated hardware devices with GPS and mapping services for live tracking.',
      'Modernised legacy platforms for performance, usability, and maintainability. Software Engineer from 2012, Senior Software Engineer from 2017.',
    ],
  },
  {
    company: 'Freelance',
    title: 'Web Developer',
    range: 'August 2007 – October 2012',
    duties: ['Built websites and web applications for clients with PHP, JavaScript, jQuery, HTML, and CSS.'],
  },
];
