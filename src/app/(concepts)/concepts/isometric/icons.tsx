// Stroke icons for the viewer's toolbar, tree and panels, drawn on a 16-unit grid.
import type { Kind } from './models';

const PATHS = {
  cube: 'M8 1.8 13.6 5v6L8 14.2 2.4 11V5Zm0 0v0M2.4 5 8 8.2 13.6 5M8 8.2v6',
  part: 'M3 4.5 8 2l5 2.5v7L8 14l-5-2.5Zm0 0L8 7l5-2.5M8 7v7',
  fit: 'M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5M5.5 6.5h5v3h-5z',
  home: 'M2.5 7.5 8 3l5.5 4.5M4 6.5V13h3V9.5h2V13h3V6.5',
  views: 'M8 2.2 13 5v6l-5 2.8L3 11V5Zm-5 2.8 5 2.8 5-2.8M8 7.6v6.2',
  persp: 'M5 3.5h6l2.5 9h-11Zm1.2 3h3.6M4.6 9.5h6.8',
  ortho: 'M3 3.5h10v9H3Zm0 3h10M3 9.5h10',
  explode:
    'M6 6h4v4H6zM8 1.5v2.5M8 12v2.5M1.5 8H4M12 8h2.5M3 3l1.8 1.8M13 13l-1.8-1.8M13 3l-1.8 1.8M3 13l1.8-1.8',
  section: 'M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3ZM1.5 9.5l7-4 6 3.5-7 4z',
  measure: 'M2 11.5 11.5 2l2.5 2.5L4.5 14ZM5 8.5l1.3 1.3M7 6.5l1.8 1.8M9 4.5l1.3 1.3',
  shaded: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm-3 4a3.5 3.5 0 0 1 3-2.2',
  edges: 'M3 5 8 2.5 13 5v6l-5 2.5L3 11Zm0 0 5 2.5L13 5M8 7.5v6',
  wire: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 0c-2.2 2.5-2.2 8.5 0 11m0-11c2.2 2.5 2.2 8.5 0 11M2.5 8h11M3.4 5.2h9.2M3.4 10.8h9.2',
  xray: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm-1.5 3.5h3v4h-3z',
  sun: 'M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1',
  moon: 'M13.2 9.8A5.5 5.5 0 0 1 6.2 2.8a5.5 5.5 0 1 0 7 7Z',
  table: 'M2 3h12v10H2Zm0 3h12M2 9.5h12M6 3v10',
  notes: 'M4 1.8h5.5L12.5 5v9.2H4ZM9.5 1.8V5h3M6 8h4.5M6 10.5h4.5',
  page: 'M3.5 2h9v12h-9Zm2 3h5M5.5 7.5h5M5.5 10h3',
  keyboard: 'M1.8 4.5h12.4v7H1.8Zm2 2h1M7.5 6.5h1M11 6.5h1M4 9h8',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Zm6.5-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  eyeOff:
    'M2.5 2.5l11 11M6.6 4C7 3.7 7.5 3.5 8 3.5c4 0 6.5 4.5 6.5 4.5a12 12 0 0 1-1.9 2.4M4.2 5.4A12 12 0 0 0 1.5 8S4 12.5 8 12.5c.9 0 1.7-.2 2.5-.6',
  target:
    'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 1v2M8 13v2M1 8h2M13 8h2',
  chevron: 'M6 4l4 4-4 4',
  close: 'M4 4l8 8M12 4l-8 8',
  play: 'M5 3.2v9.6L12.5 8Z',
  reverse: 'M11 3.2v9.6L3.5 8Z',
  flip: 'M8 1.5v13M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4',
  search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM10.3 10.3 14 14',
  board: 'M2 3.5h12v9H2Zm3 3h3v3H5Zm5.5-.5v1M10.5 9v1M8 8h2.5',
  chip: 'M4.5 4.5h7v7h-7ZM6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14',
  screw: 'M4 3.5h8v2H4Zm2 2h4M7 5.5v8l1 1 1-1v-8M7 8l2-.8M7 10.5l2-.8',
  battery: 'M2 5h11v6H2Zm11 2h1.5v2H13ZM4 7v2M6 7v2',
  antenna: 'M8 6.5v8M5.8 4.3a3 3 0 0 1 4.4 0M3.8 2.4a6 6 0 0 1 8.4 0M8 6.5a.8.8 0 1 0 0-.1',
  plug: 'M5.5 2v3M10.5 2v3M4 5h8v3a4 4 0 0 1-8 0Zm4 7v2.5',
  led: 'M5 9V6a3 3 0 0 1 6 0v3Zm-1.5 0h9M6.5 9v5M9.5 9v4',
  switch: 'M2.5 10.5h3l5-4M10.5 10.5h3M5.5 10.5a.6.6 0 1 0 0-.1M10.5 10.5a.6.6 0 1 0 0-.1',
  fluid: 'M8 2.2S4 6.8 4 9.5a4 4 0 0 0 8 0C12 6.8 8 2.2 8 2.2Z',
  sensor: 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3Zm0 5 2.8-2.2M8 3v1.2M3 8h1.2M13 8h-1.2',
  label: 'M2 3.5h7.5L14 8l-4.5 4.5H2ZM5 8h.1',
  ref: 'M2.5 8h11M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5',
  out: 'M9.5 2.5h4v4M13.5 2.5 8 8M11.5 9.5v4h-9v-9h4',
  download: 'M8 2v8.5M4.5 7 8 10.5 11.5 7M3 13.5h10',
  layers: 'M8 2 14 5 8 8 2 5Zm-6 5.5 6 3 6-3M2 10.5l6 3 6-3',
  hand: 'M8 4.5a2.5 2.5 0 1 0 0 .1M8 7v7M5 10l3-3 3 3',
  dot: 'M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The tree's icon for each kind of part. */
export const KIND_ICON: Record<Kind, IconName> = {
  assembly: 'cube',
  enclosure: 'part',
  fastener: 'screw',
  pcb: 'board',
  ic: 'chip',
  module: 'chip',
  passive: 'dot',
  connector: 'plug',
  power: 'battery',
  rf: 'antenna',
  display: 'page',
  indicator: 'led',
  switch: 'switch',
  mechanical: 'part',
  fluid: 'fluid',
  sensor: 'sensor',
  label: 'label',
  reference: 'ref',
};
