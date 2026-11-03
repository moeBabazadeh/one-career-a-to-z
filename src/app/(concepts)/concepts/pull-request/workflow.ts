// The simulated CI workflow: its jobs, what each one needs and the steps it runs. The Checks tab
// runs it, and Files changed shows it as ci/pipeline.yml, both from this one definition.

import { db, hardware, type Device } from '../_shared/data';
import { CV_FILE } from './model';

export interface StepDef {
  name: string;
  run?: string;
}

export interface JobDef {
  id: string;
  name: string;
  /** Column in the graph: setup, verify, package. */
  stage: 0 | 1 | 2;
  needs: string[];
  /** Typical duration in simulated seconds; each run varies it a little. */
  base: number;
  steps: StepDef[];
  /** Matrix jobs: one per device. */
  device?: Device;
}

const SETUP: StepDef = { name: 'Set up job' };

export const FIRMWARE_DEVICES = hardware.map((d) => d.tag);

// Firmware builds take longer for the boards with more on them.
const { logger, epc, plc, attendumReader, attendumBeacon } = db.devices;
const firmwareBase: Record<string, number> = {
  [logger.tag]: 31,
  [epc.tag]: 24,
  [plc.tag]: 27,
  [attendumReader.tag]: 49,
  [attendumBeacon.tag]: 36,
};

export const JOBS: JobDef[] = [
  {
    id: 'setup',
    name: 'setup',
    stage: 0,
    needs: [],
    base: 12,
    steps: [
      SETUP,
      { name: 'Check out moe/cto', run: 'checkout moe/cto' },
      { name: 'Load career data', run: 'load ./career' },
    ],
  },
  {
    id: 'build',
    name: 'build',
    stage: 1,
    needs: ['setup'],
    base: 44,
    steps: [
      SETUP,
      { name: 'Install', run: 'install --frozen-lockfile' },
      { name: 'Build products', run: 'build --all' },
      { name: 'Upload artifacts', run: `upload-artifact ${CV_FILE}` },
    ],
  },
  {
    id: 'typecheck',
    name: 'typecheck',
    stage: 1,
    needs: ['setup'],
    base: 21,
    steps: [
      SETUP,
      { name: 'Type-check data', run: 'tsc --noEmit -p career' },
      { name: 'Validate links', run: 'check-links --all' },
    ],
  },
  {
    id: 'test',
    name: 'test',
    stage: 1,
    needs: ['setup'],
    base: 33,
    steps: [SETUP, { name: 'Run career.test.ts', run: 'test career.test.ts' }],
  },
  {
    id: 'security',
    name: 'security',
    stage: 1,
    needs: ['setup'],
    base: 38,
    steps: [
      SETUP,
      { name: 'Secret scan', run: 'secret-scan --staged' },
      { name: 'Semgrep', run: 'semgrep scan --error' },
      { name: 'Trivy', run: 'trivy fs --severity HIGH,CRITICAL .' },
    ],
  },
  ...hardware.map<JobDef>((d) => ({
    id: `firmware-${d.tag}`,
    name: `firmware (${d.tag})`,
    stage: 1,
    needs: ['setup'],
    base: firmwareBase[d.tag] ?? 30,
    device: d,
    steps: [
      SETUP,
      { name: 'Build firmware', run: `firmware build --device ${d.tag}` },
      { name: 'Field report', run: `field-report ${d.tag}` },
    ],
  })),
  {
    id: 'ios',
    name: 'ios store build',
    stage: 2,
    needs: ['build', 'typecheck', 'test', 'security'],
    base: 41,
    steps: [
      SETUP,
      { name: 'Build iOS apps', run: 'store build --platform ios' },
      { name: 'Check store listings', run: 'store check --platform ios' },
    ],
  },
  {
    id: 'android',
    name: 'android store build',
    stage: 2,
    needs: ['build', 'typecheck', 'test', 'security'],
    base: 37,
    steps: [
      SETUP,
      { name: 'Build Android apps', run: 'store build --platform android' },
      { name: 'Check store listings', run: 'store check --platform android' },
    ],
  },
  {
    id: 'preview',
    name: 'deploy preview',
    stage: 2,
    needs: ['build'],
    base: 17,
    steps: [SETUP, { name: 'Deploy preview', run: 'deploy --preview' }],
  },
];

export const job = (id: string) => JOBS.find((j) => j.id === id) as JobDef;
export const isFirmware = (j: JobDef) => Boolean(j.device);

/* ------------------------------------------------------------------ as YAML */

const list = (items: string[]) => `[${items.join(', ')}]`;

function jobYaml(j: JobDef, key = j.id): string[] {
  const lines = [`  ${key}:`];
  if (key !== j.name && !j.device) lines.push(`    name: ${j.name}`);
  if (j.needs.length) lines.push(`    needs: ${list(j.needs)}`);
  if (j.device) {
    lines.push('    strategy:', '      matrix:', `        device: ${list(FIRMWARE_DEVICES)}`);
  }
  lines.push('    steps:');
  for (const step of j.steps.slice(1)) {
    lines.push(`      - name: ${step.name}`);
    if (step.run)
      lines.push(
        `        run: ${j.device ? step.run.replace(j.device.tag, '${{ matrix.device }}') : step.run}`,
      );
  }
  return lines;
}

export const PIPELINE_YAML = [
  '# The simulated pipeline behind the Checks tab. Every job runs in',
  "# your browser against this pull request's data; timings are made up.",
  'name: review',
  'on: [pull_request]',
  '',
  'jobs:',
  ...JOBS.filter((j) => !j.device || j.device.tag === FIRMWARE_DEVICES[0]).flatMap((j, i, all) => [
    ...jobYaml(j, j.device ? 'firmware' : j.id),
    ...(i < all.length - 1 ? [''] : []),
  ]),
].join('\n');
