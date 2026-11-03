import { db, fmt } from './data';

export interface Concept {
  slug: string;
  letter: string;
  name: string;
  thesis: string;
  palette: string[];
  /** Outside the A to Z set: an earlier design kept in the Bonus section for anyone curious. */
  bonus?: boolean;
}

// Sorted A to Z, and each name starts with its letter. The main set has one theme per letter;
// bonus themes are earlier designs that stayed on as extras, listed apart and left out of the
// shuffle. Pages and their credits read their letter and name from here (see conceptTitle), so
// a rename happens in one place.
export const concepts: Concept[] = [
  {
    slug: 'api-reference',
    letter: 'A',
    name: 'API Reference',
    thesis:
      'Moe as a well-documented API: a three-column reference with typed responses, code samples in every language and a console that answers.',
    palette: ['#ffffff', '#0f1729', '#5b5bd6', '#12b5cb', '#f5f7fb', '#1f2433'],
  },
  {
    slug: 'blueprint',
    letter: 'B',
    name: 'Blueprint',
    thesis: 'A career drawn as a building, in the language of construction drawings.',
    palette: ['#0f4a80', '#eaf3fc', '#ff6b5e', '#ffd25e'],
  },
  {
    slug: 'bandgap',
    letter: 'B',
    name: 'Bandgap',
    thesis: `A ${db.education.msc.field.split(' ')[0].toLowerCase()} band diagram: electrons gain energy, cross the gap and land in each part of the career. Bias the junction and watch the current flow.`,
    palette: ['#0b1020', '#e8ecff', '#4f7cff', '#ff5d8f', '#ffd24a', '#38e0b0'],
    bonus: true,
  },
  {
    slug: 'circuit-board',
    letter: 'C',
    name: 'Circuit Board',
    thesis:
      'A matte black PCB: Moe is the main chip, and signals run along gold traces to everything he built.',
    palette: ['#101311', '#c69a4a', '#f0cf7a', '#e8ebe4', '#ff4d3a'],
  },
  {
    slug: 'datasheet',
    letter: 'D',
    name: 'Datasheet',
    thesis:
      'Moe as a part on a component datasheet: pinout, electrical characteristics, performance curves and ordering information.',
    palette: ['#ffffff', '#111111', '#cc0000', '#d0d0d0', '#1f5fbf'],
  },
  {
    slug: 'editor',
    letter: 'E',
    name: 'Editor',
    thesis:
      'A code editor with the career as the open repository: every file is printed from the facts, blame dates each line to the role behind it, and the terminal runs the career script.',
    palette: ['#ffffff', '#1f2328', '#2f6fdf', '#8250df', '#0a7d43', '#b35900'],
  },
  {
    slug: 'email',
    letter: 'E',
    name: 'Email',
    thesis:
      'The career as an inbox: a thread for every role, launch notes for every product and the open-source pull requests as mail, searchable with operators and driven from the keyboard. Compose writes to Moe.',
    palette: ['#f2f3f6', '#14161b', '#3157d5', '#e4a11b', '#1b8a57', '#d1453b'],
    bonus: true,
  },
  {
    slug: 'escape-room',
    letter: 'E',
    name: 'Escape Room',
    thesis:
      'A locked study full of puzzle boxes: every combination is a fact from the career, and every drawer you open is a section of the site.',
    palette: ['#16120e', '#efe6d6', '#b08d57', '#3f6b5c', '#8c2f2f'],
    bonus: true,
  },
  {
    slug: 'factory',
    letter: 'F',
    name: 'Factory',
    thesis:
      'A factory that crafts shipped products from raw skills: belts, assemblers and live production stats.',
    palette: ['#1b1a17', '#e8dfcf', '#f1a33c', '#5aa469', '#d9534f', '#4a8fd6'],
  },
  {
    slug: 'g-code',
    letter: 'G',
    name: 'G-code',
    thesis:
      'A CNC toolpath machines your name while the G-code streams beside it. Each operation is a chapter.',
    palette: ['#16181c', '#e6e6e6', '#ff7a1a', '#ffd166', '#3aa0ff'],
  },
  {
    slug: 'history',
    letter: 'H',
    name: 'History',
    thesis: `${fmt.Spell(db.yearsBuilding)} years as a git history: a branch per company, merges, tags, and a diff for every fix shipped upstream.`,
    palette: ['#fbfaf7', '#16181d', '#e5484d', '#3e63dd', '#30a46c', '#f5a524'],
  },
  {
    slug: 'isometric',
    letter: 'I',
    name: 'Isometric',
    thesis:
      "A CAD viewer opened on Moe's hardware: orbit each device, explode it along its assembly axis, cut a hatched section, snap a measurement to its corners and read its bill of materials.",
    palette: ['#eceff3', '#1a1f26', '#2c6bd1', '#e8912d', '#d9480f', '#6a7581'],
  },
  {
    slug: 'inference',
    letter: 'I',
    name: 'Inference',
    thesis: 'The AI side: a neural network runs a forward pass from skills to shipped products.',
    palette: ['#0a0a12', '#e8e8f0', '#7c5cff', '#22d3ee', '#ff6b8a'],
    bonus: true,
  },
  {
    slug: 'journey-planner',
    letter: 'J',
    name: 'Journey Planner',
    thesis:
      'A metro map of the career: lines for hardware, mobile, web, AI and leadership, with trains running between stations.',
    palette: ['#f6f4ee', '#1a1a1a', '#e4002b', '#0072ce', '#00a651', '#ffc20e', '#7d3f98'],
  },
  {
    slug: 'kickoff',
    letter: 'K',
    name: 'Kickoff',
    thesis: `Back to the ${db.awards.robocup.event} win: a Small Size League match plays live, and the career reads like a match report.`,
    palette: ['#0e1410', '#2a8c45', '#ffffff', '#ff8c1a', '#2f6fff', '#ffd400'],
  },
  {
    slug: 'ladder-logic',
    letter: 'L',
    name: 'Ladder Logic',
    thesis:
      'Mini PLC roots: the career as a ladder program. Rungs energize as you scroll, and the inputs are yours to toggle.',
    palette: ['#e9ecef', '#1b2a3a', '#18b85c', '#2463eb', '#f5a524'],
  },
  {
    slug: 'logic-analyzer',
    letter: 'L',
    name: 'Logic Analyzer',
    thesis:
      "A logic analyzer clipped onto Moe's firmware: the career travels as real UART, I²C and SPI traffic and the decoders read it back. Trigger a capture, zoom to the bits and follow the terminal.",
    palette: ['#eef0f3', '#16191e', '#d63a2f', '#e5730a', '#bf9300', '#1f6fe0', '#8446d6'],
    bonus: true,
  },
  {
    slug: 'mobile',
    letter: 'M',
    name: 'Mobile',
    thesis:
      "A working phone in your hand: unlock it, pull down its centres, and open real apps for Moe's contact card, calendar, notes, files, code and hardware, all moving on real springs.",
    palette: ['#e9ebef', '#121318', '#4520e0', '#e4257e', '#2fb350', '#ffffff'],
  },
  {
    slug: 'minefield',
    letter: 'M',
    name: 'Minefield',
    thesis: `A demining robot sim inspired by Moe's ${db.awards.robocup.short} win: it mows the field with a swinging detector while a Bayesian map fills in, pinpoints every alarm, and each mine it marks opens a chapter. Take the stick whenever you like.`,
    palette: ['#ece5d1', '#23241c', '#c0392b', '#e39a16', '#467a45', '#285781'],
    bonus: true,
  },
  {
    slug: 'nimbus',
    letter: 'N',
    name: 'Nimbus',
    thesis:
      'The career as a cloud console: products running in the regions they serve, jobs as IAM roles whose policies allow the real duties, a bill in months and a CloudShell that answers.',
    palette: ['#f3f5f8', '#0e1621', '#2f5bea', '#12a150', '#0c121c', '#f59e0b'],
  },
  {
    slug: 'network-capture',
    letter: 'N',
    name: 'Network Capture',
    thesis:
      'A packet analyser on a live capture of the career: the site, card readers, beacon, loggers and PLC talking. Filter it, dissect any frame to the byte, and follow a stream.',
    palette: ['#fbfbfb', '#1c1c1c', '#e7e6ff', '#e4ffc7', '#daeeff', '#2f6fd0', '#a40000'],
    bonus: true,
  },
  {
    slug: 'node-editor',
    letter: 'N',
    name: 'Node Editor',
    thesis:
      'An IoT flow editor: the career wired as nodes, with messages flowing from sensor to cloud to AI.',
    palette: ['#18191d', '#f1f1f3', '#fdd0a2', '#a6bbcf', '#87a980', '#d8bfd8', '#ff6b4a'],
    bonus: true,
  },
  {
    slug: 'notebook',
    letter: 'N',
    name: 'Notebook',
    thesis:
      'A live notebook with its own small Python kernel: every number and chart is computed by a cell from the facts, and you can edit any cell, break it and read the traceback.',
    palette: ['#ffffff', '#1f2328', '#1f6feb', '#e8590c', '#1a7f37', '#f6f8fa'],
    bonus: true,
  },
  {
    slug: 'oscilloscope',
    letter: 'O',
    name: 'Oscilloscope',
    thesis: 'Sensor, firmware, uplink, cloud, AI: a four-channel oscilloscope traces the chain.',
    palette: ['#1b1f25', '#f2d21b', '#27c4e6', '#e24fd9', '#41d985'],
  },
  {
    slug: 'pull-request',
    letter: 'P',
    name: 'Pull Request',
    thesis:
      'The site as a pull request, "Hire Moe as your CTO": read the diff, watch CI run, leave a review, then merge.',
    palette: ['#fbfbfa', '#17181c', '#22a35a', '#7c5cff', '#e5534b', '#d4a72c'],
  },
  {
    slug: 'query-plan',
    letter: 'Q',
    name: 'Query Plan',
    thesis:
      'The career as a database: write SQL against it and watch EXPLAIN ANALYZE stream rows through the plan.',
    palette: ['#0f1115', '#e4e7ec', '#4f9cf9', '#f59e0b', '#34d399', '#f472b6'],
  },
  {
    slug: 'reverse-engineering',
    letter: 'R',
    name: 'Reverse Engineering',
    thesis:
      "A reverse-engineering suite opened on Moe's firmware: analysis finds every function from the reset vector, main calls each era of the career in order, and every string and struct is a fact. Rename, annotate and follow the calls until it reads clearly.",
    palette: ['#ffffff', '#18202c', '#1849a9', '#a03b0b', '#4c7a4f', '#fff1b3', '#6d2fa3'],
  },
  {
    slug: 'radio',
    letter: 'R',
    name: 'Radio',
    thesis:
      'A software-defined radio tuned to the radios Moe built: tune the waterfall onto a beacon, a weather station, a card reader or a card tap, lock on, and each one decodes into a chapter.',
    palette: ['#e6eaf0', '#111722', '#1745c8', '#d98300', '#0a8a5a', '#c8285f'],
    bonus: true,
  },
  {
    slug: 'rally',
    letter: 'R',
    name: 'Rally',
    thesis:
      'A table tennis rally you can play: every return lands on the next part of the career, and a long rally reads the whole page.',
    palette: ['#0d3b66', '#f4f1de', '#e63946', '#2a9d8f', '#f4a261'],
    bonus: true,
  },
  {
    slug: 'robot-console',
    letter: 'R',
    name: 'Robot Console',
    thesis:
      'A robot visualiser for the career: the competition robots in 3D with live sensor topics, coordinate frames and a planner, and every chapter a recorded run you can play back, scrub and inspect.',
    palette: ['#e9ecef', '#1a1e23', '#2763d8', '#3d8a49', '#e0362c', '#d4a000'],
    bonus: true,
  },
  {
    slug: 'spatial',
    letter: 'S',
    name: 'Spatial',
    thesis:
      'A spatial computer in a calm room: glass windows hold the career around you. Look around, pull a window closer or push it back, and open a space where the hardware floats to be turned over.',
    palette: ['#e7e2db', '#101418', '#f7f8fa', '#3a62e8', '#7d55e6', '#cfb592', '#8db7e4'],
  },
  {
    slug: 'scada',
    letter: 'S',
    name: 'SCADA',
    thesis:
      "An operator's station for the career as a running plant: tank levels are real figures, and you tune the loops, work pumps and valves behind PLC interlocks, acknowledge and shelve alarms, and read the historian.",
    palette: ['#d2d6db', '#1a1e23', '#10335f', '#d7261b', '#ef8800', '#f0c400', '#49515a'],
    bonus: true,
  },
  {
    slug: 'scale',
    letter: 'S',
    name: 'Scale',
    thesis: `Every order of magnitude is a real number from the career: zoom out from one line of code to ${db.devices.logger.records.long} sensor records.`,
    palette: ['#050608', '#f2efe8', '#ff4d2e', '#3d7bff', '#b5ff3d'],
    bonus: true,
  },
  {
    slug: 'spreadsheet',
    letter: 'S',
    name: 'Spreadsheet',
    thesis:
      'The career as a working spreadsheet: every headline figure is a live formula over the data sheets, the charts redraw as you edit, and trace arrows show where each number comes from.',
    palette: ['#ffffff', '#1f1f1f', '#1a73e8', '#188038', '#edf2fa', '#d93025'],
    bonus: true,
  },
  {
    slug: 'swarm',
    letter: 'S',
    name: 'Swarm',
    thesis:
      'A quadcopter swarm flies the career: drones take off, hold formation and regroup to spell each section, in a flight simulation you can command.',
    palette: ['#06121a', '#e6f2f7', '#00d1ff', '#ffb703', '#fb5607', '#8ac926'],
    bonus: true,
  },
  {
    slug: 'teletext',
    letter: 'T',
    name: 'Teletext',
    thesis:
      'A broadcast text service on a CRT: key a page number and watch the header roll while the carousel comes round, then use the four coloured keys to move between pages drawn in block mosaics.',
    palette: ['#ece5d7', '#26221c', '#000000', '#0000ff', '#ffff00', '#00ffff'],
  },
  {
    slug: 'terminal',
    letter: 'T',
    name: 'Terminal',
    thesis: 'The site boots into a tmux session, with a man page underneath.',
    palette: ['#0b0e13', '#6cb6ff', '#e5c07b', '#8ddb8c', '#d2a8ff'],
    bonus: true,
  },
  {
    slug: 'tracker',
    letter: 'T',
    name: 'Tracker',
    thesis:
      'The career filed as an issue tracker: roles are cycles, products are projects and every issue a real piece of work, on a board you can drag, a roadmap over the real years and a command bar for everything.',
    palette: ['#fbfbfc', '#1b1b1f', '#5e6ad2', '#e5a034', '#3ea873', '#f3f3f5'],
    bonus: true,
  },
  {
    slug: 'uptime',
    letter: 'U',
    name: 'Uptime',
    thesis:
      'A distributed system you can break: push traffic through load balancers, caches and databases, then scale it and watch the p99.',
    palette: ['#0b0d12', '#e6e9ef', '#3dd68c', '#f5a524', '#ff5c5c', '#5b8cff'],
  },
  {
    slug: 'vector',
    letter: 'V',
    name: 'Vector',
    thesis:
      'The site as an open design file: frames with real auto layout on an infinite canvas, components whose instances follow every edit, CSS in the inspect tab, and Play turns the frames into the working site.',
    palette: ['#efeff1', '#1d1d21', '#3d7bff', '#9b6bff', '#ff3b6b', '#d9481c'],
  },
  {
    slug: 'vending-machine',
    letter: 'V',
    name: 'Vending Machine',
    thesis:
      'A vending machine stocked with the career: punch in a code, watch the coil turn and the item drop, and the receipt prints its story.',
    palette: ['#d7263d', '#f5f5f5', '#1b1b1e', '#ffd166', '#06aed5'],
    bonus: true,
  },
  {
    slug: 'whiteboard',
    letter: 'W',
    name: 'Whiteboard',
    thesis:
      'The CTO’s natural habitat: a hand-drawn system design that sketches itself on an infinite whiteboard, sticky notes and live cursors included.',
    palette: ['#fdfcf8', '#1e1e1e', '#e03131', '#1971c2', '#2f9e44', '#ffec99'],
  },
  {
    slug: 'x-ray',
    letter: 'X',
    name: 'X-Ray',
    thesis:
      'A deep-zoom die shot of a system-on-chip: cores, caches, radios and IO pads, each a part of the career. Toggle the metal layers.',
    palette: ['#07060a', '#e9e3f5', '#c9a227', '#7b5cff', '#2ec4b6', '#ff5d8f'],
  },
  {
    slug: 'year-of-linux',
    letter: 'Y',
    name: 'Year of Linux',
    thesis:
      'The year of the Linux desktop, at last: an Arch box running GNOME 2 and Compiz, every section a window, and a desktop cube to spin between workspaces.',
    palette: ['#1d2b3a', '#edeceb', '#1793d1', '#86abd9', '#f57900', '#73d216'],
  },
  {
    slug: 'zoom',
    letter: 'Z',
    name: 'Zoom',
    thesis:
      'Full stack, literally: zoom from a single pixel down through the browser, the network, servers, the database and the OS to the silicon.',
    palette: ['#06070a', '#f4f1ea', '#ff5d2e', '#7c4dff', '#00c2a8', '#ffd23f'],
  },
];

/** A concept's entry, by its slug. */
export const concept = (slug: string) => concepts.find((c) => c.slug === slug) as Concept;

/** The A to Z set, one theme per letter. */
export const mainConcepts = concepts.filter((c) => !c.bonus);

/** Earlier designs kept as extras, A to Z. */
export const bonusConcepts = concepts.filter((c) => c.bonus);

/** What marks a theme in lists and chips: its letter, or a star for a bonus theme. */
export const conceptMark = (c: Concept) => (c.bonus ? '★' : c.letter);

/** "H · History" (or "Bonus · Rally"): a concept's mark and name, for its page title and credits. */
export const conceptTitle = (slug: string) => {
  const c = concept(slug);
  return `${c.bonus ? 'Bonus' : c.letter} · ${c.name}`;
};
