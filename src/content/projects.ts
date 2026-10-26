export interface ProjectLinks {
  external?: string;
  github?: string;
  appStore?: string;
  playStore?: string;
}

export interface Project {
  title: string;
  description: string;
  tech: string[];
  links: ProjectLinks;
}

export interface FeaturedProject extends Project {
  image: string;
}

export interface ArchiveEntry {
  year: string;
  title: string;
  madeAt?: string;
  tech: string[];
  links: ProjectLinks;
}

const ATTENDUM_APP_STORE = 'https://apps.apple.com/us/app/attendum/id6450669101';
const ATTENDUM_PLAY = 'https://play.google.com/store/apps/details?id=com.attendum';
const EDUCATION_GUIDE_APP_STORE = 'https://apps.apple.com/us/app/education-guide/id6504922721';
const EDUCATION_GUIDE_PLAY = 'https://play.google.com/store/apps/details?id=guide.education';

export const featuredProjects: FeaturedProject[] = [
  {
    title: 'NeuroBuild',
    description:
      'The alignment layer for construction enterprises: one multi-tenant platform for BIM models, WBS, quantity take-off, bills of quantities, tenders, and 4D progress reports, now with AI for natural-language questions and early risk warnings. I lead it as CTO.',
    tech: ['Next.js', 'Laravel', 'AWS', 'Autodesk APS'],
    links: { external: 'https://neuroject.com' },
    image: '/assets/images/projects/neurobuild.jpg',
  },
  {
    title: 'SmartClaim',
    description:
      'AI-assisted R&D tax credit claims for the UK, Ireland, Australia, and South Africa. I work across the FastAPI and pgvector API, the SvelteKit app, and the TypeScript client SDK, and added its security gates: secret scanning, Semgrep, and Trivy on every pull request.',
    tech: ['FastAPI', 'OpenAI', 'pgvector', 'SvelteKit', 'TypeScript'],
    links: { external: 'https://smartclaim.uk' },
    image: '/assets/images/projects/smartclaim.jpg',
  },
  {
    title: 'Attendum',
    description:
      'Attendance monitoring live at universities in the UK and US. I wrote the firmware for the ESP32 card readers (NFC, RFID, BLE, over-the-air updates) and the nRF52840 Bluetooth beacons, and built the iOS and Android app, the staff dashboard, and a Canvas LTI app.',
    tech: ['ESP32', 'nRF52840', 'React Native', 'Next.js'],
    links: {
      external: 'https://attendum.com',
      appStore: ATTENDUM_APP_STORE,
      playStore: ATTENDUM_PLAY,
    },
    image: '/assets/images/projects/attendum.jpg',
  },
  {
    title: 'Logger',
    description:
      'GSM weather stations that take several sensors each and send their logs home. The fleet has been online for over 15 years: more than 50 active stations and over half a billion records.',
    tech: ['Hardware', 'Firmware', 'GSM', 'Sensors', 'Telemetry'],
    links: {},
    image: '/assets/images/projects/logger.svg',
  },
  {
    title: 'Active-Class',
    description:
      'An LMS with live exam proctoring and Azure Face identity checks. I built the user dashboard, an Office add-in that brings live polls and word clouds into PowerPoint and Word, and the product website.',
    tech: ['React', 'Redux', 'Firebase', 'Office.js'],
    links: { external: 'https://active-class.com' },
    image: '/assets/images/projects/active-class.jpg',
  },
];

export const otherProjects: Project[] = [
  {
    title: 'Education Guide',
    description:
      'A React Native app on both stores that helps students starting university get to know their course, campus, city, and career options.',
    tech: ['Expo', 'React Native', 'TypeScript'],
    links: {
      external: 'https://education.guide',
      appStore: EDUCATION_GUIDE_APP_STORE,
      playStore: EDUCATION_GUIDE_PLAY,
    },
  },
  {
    title: 'School.how',
    description:
      'Online tutoring for every child: diagnostic tests, courses, quizzes, and 1-to-1 lessons over live video. I built the dashboard and the website.',
    tech: ['Next.js', 'MUI', 'VideoSDK', 'Uppy'],
    links: { external: 'https://school.how' },
  },
  {
    title: 'EPC',
    description:
      'An electronic pressure and flow controller: embedded hardware and firmware that hold pressure and flow at their setpoints. In production.',
    tech: ['Hardware', 'Firmware', 'Process control'],
    links: {},
  },
  {
    title: 'Mini PLC',
    description:
      'A compact PLC controller built on STM microcontrollers: the board and firmware for automation on a small footprint. In production.',
    tech: ['STM', 'Firmware', 'PLC'],
    links: {},
  },
  {
    title: 'react-query-kit: strictVariables',
    description:
      'An opt-in flag I added to react-query-kit (31k weekly downloads) so a forgotten query argument fails at compile time instead of at runtime.',
    tech: ['TypeScript', 'React Query'],
    links: { github: 'https://github.com/HuolalaTech/react-query-kit/pull/78' },
  },
  {
    title: 'Gatsby: insecure uuid removed',
    description:
      'Removed a deprecated uuid version from gatsby-cli and gatsby-plugin-sharp that could fall back to Math.random() and was flagged on every Gatsby install.',
    tech: ['Node.js', 'Security'],
    links: { github: 'https://github.com/gatsbyjs/gatsby/pull/35657' },
  },
  {
    title: 'Pulse IoT',
    description:
      'Device telemetry on plain shared PHP hosting: ingest, rollups, alarms with hysteresis, OTA firmware, and reports. No Composer, npm, or build step.',
    tech: ['PHP 8', 'Vanilla JS', 'OpenAPI'],
    links: {},
  },
  {
    title: 'Photo Dedup',
    description:
      'A native macOS app that finds duplicate and look-alike photos by how they look. Fully offline, and nothing is ever deleted.',
    tech: ['Swift', 'SwiftUI', 'Vision'],
    links: {},
  },
  {
    title: 'matrix-keypad-freertos',
    description:
      'Reads matrix keypads as a FreeRTOS task, with built-in debouncing and configurable layouts and pin maps. Portable across microcontrollers.',
    tech: ['C', 'FreeRTOS'],
    links: { github: 'https://github.com/moeBabazadeh/matrix-keypad-freertos' },
  },
  {
    title: 'nanostores/persistent: tab sync fix',
    description:
      'Fixed persisted data being wiped when the app was opened in a second tab, in a store used 82k times a week.',
    tech: ['TypeScript'],
    links: { github: 'https://github.com/nanostores/persistent/pull/20' },
  },
  {
    title: 'Learning Kit',
    description: 'The product website for Learning Kit, built for 0&1.',
    tech: ['Next.js', 'AWS Amplify'],
    links: { external: 'https://learningkit.com' },
  },
  {
    title: 'Exam Kit',
    description: 'The product website for Exam Kit, an online exam monitoring system by 0&1.',
    tech: ['Nuxt', 'Tailwind CSS'],
    links: { external: 'https://examkit.com' },
  },
];

export const archive: ArchiveEntry[] = [
  { year: '2026', title: 'react-query-kit: strictVariables', madeAt: 'Open source', tech: ['TypeScript'], links: { github: 'https://github.com/HuolalaTech/react-query-kit/pull/78' } },
  { year: '2026', title: 'SmartClaim', madeAt: 'SmartClaim', tech: ['FastAPI', 'OpenAI', 'pgvector', 'SvelteKit'], links: { external: 'https://smartclaim.uk' } },
  { year: '2026', title: 'Pulse IoT', madeAt: 'Personal', tech: ['PHP', 'Vanilla JS', 'OpenAPI'], links: {} },
  { year: '2026', title: 'Photo Dedup', madeAt: 'Personal', tech: ['Swift', 'SwiftUI', 'Vision'], links: {} },
  { year: '2025', title: 'Forge Viewer types', madeAt: 'DefinitelyTyped', tech: ['TypeScript'], links: { github: 'https://github.com/DefinitelyTyped/DefinitelyTyped/pull/72780' } },
  { year: '2024', title: 'NeuroBuild', madeAt: 'Neuroject', tech: ['Next.js', 'React', 'Laravel', 'AWS'], links: { external: 'https://neuroject.com' } },
  { year: '2024', title: 'Education Guide', madeAt: '0&1', tech: ['Expo', 'React Native'], links: { external: 'https://education.guide', appStore: EDUCATION_GUIDE_APP_STORE, playStore: EDUCATION_GUIDE_PLAY } },
  { year: '2024', title: 'Attendum Canvas LTI app', madeAt: '0&1', tech: ['Preact', 'Vite'], links: {} },
  { year: '2023', title: 'Attendum app', madeAt: '0&1', tech: ['Expo', 'React Native'], links: { appStore: ATTENDUM_APP_STORE, playStore: ATTENDUM_PLAY } },
  { year: '2023', title: 'Attendum card reader firmware', madeAt: '0&1', tech: ['ESP32', 'ESP-IDF', 'BLE', 'NFC'], links: { external: 'https://attendum.com' } },
  { year: '2023', title: 'Attendum BLE beacon', madeAt: '0&1', tech: ['nRF52840', 'Zephyr'], links: {} },
  { year: '2023', title: 'Learning Kit website', madeAt: '0&1', tech: ['Next.js'], links: { external: 'https://learningkit.com' } },
  { year: '2023', title: 'Exam Kit website', madeAt: '0&1', tech: ['Nuxt'], links: { external: 'https://examkit.com' } },
  { year: '2023', title: '0&1 website', madeAt: '0&1', tech: ['Next.js', 'AWS Lambda'], links: { external: 'https://0and1.co.uk' } },
  { year: '2023', title: 'matrix-keypad-freertos', madeAt: 'Personal', tech: ['C', 'FreeRTOS'], links: { github: 'https://github.com/moeBabazadeh/matrix-keypad-freertos' } },
  { year: '2022', title: 'School.how', madeAt: '0&1', tech: ['Next.js', 'MUI', 'VideoSDK'], links: { external: 'https://school.how' } },
  { year: '2022', title: 'UK Flour Millers dashboard', madeAt: '0&1', tech: ['Next.js'], links: { external: 'https://ukflourmillers.active-class.com' } },
  { year: '2022', title: 'Gatsby: insecure uuid removed', madeAt: 'Open source', tech: ['Node.js'], links: { github: 'https://github.com/gatsbyjs/gatsby/pull/35657' } },
  { year: '2022', title: 'nanostores/persistent: tab sync fix', madeAt: 'Open source', tech: ['TypeScript'], links: { github: 'https://github.com/nanostores/persistent/pull/20' } },
  { year: '2021', title: 'Active-Class dashboard', madeAt: '0&1', tech: ['React', 'Redux', 'MUI', 'Firebase'], links: { external: 'https://user.active-class.com' } },
  { year: '2021', title: 'Active-Class Office add-in', madeAt: '0&1', tech: ['Office.js', 'React'], links: {} },
  { year: '2021', title: 'Active-Class website', madeAt: '0&1', tech: ['Gatsby', 'MUI'], links: { external: 'https://active-class.com' } },
  { year: '2021', title: 'gatsby-plugin-react-i18next: Link refs', madeAt: 'Open source', tech: ['React'], links: { github: 'https://github.com/microapps/gatsby-plugin-react-i18next/pull/93' } },
  { year: '2017', title: 'Grid-tie multicell inverter (paper)', madeAt: 'arXiv', tech: ['Power electronics'], links: { external: 'https://arxiv.org/abs/1708.08008' } },
  { year: '2012', title: 'Self-balancing robot with fuzzy control', madeAt: 'University of Tabriz', tech: ['Control systems', 'Embedded'], links: {} },
  { year: '2010', title: 'RoboCup IranOpen Deminer Challenge, 1st place', madeAt: 'University of Tabriz', tech: ['Robotics'], links: {} },
  { year: '2009', title: 'Small Size League soccer robots', madeAt: 'University of Tabriz', tech: ['Robotics', 'Control systems'], links: {} },
  { year: '—', title: 'Logger: GSM weather stations', madeAt: 'In production', tech: ['Hardware', 'Firmware', 'GSM'], links: {} },
  { year: '—', title: 'EPC: pressure and flow controller', madeAt: 'In production', tech: ['Hardware', 'Firmware'], links: {} },
  { year: '—', title: 'Mini PLC', madeAt: 'In production', tech: ['STM', 'Firmware'], links: {} },
  { year: '—', title: 'Pipe inspection robot', madeAt: 'Robotics', tech: ['Robotics'], links: {} },
];
