// The layers of the descent, top to bottom. `scale` is each layer's characteristic time, a
// textbook ballpark rather than a measurement, shown on the depth gauge. Colours are tokens
// from stack.module.scss, so they follow the scheme.

export interface LayerInfo {
  id: string;
  n: number;
  /** What the layer is, technically. */
  tech: string;
  /** What of Moe's story lives here. */
  topic: string;
  scale: string;
  /** The line drawn across the boundary on the way into this layer. */
  crossing: string;
  /** CSS colours. */
  accent: string;
  bg: string;
}

export const LAYERS: LayerInfo[] = [
  {
    id: 'surface',
    n: 0,
    tech: 'Surface',
    topic: 'Hello',
    scale: '100 ms feels instant',
    crossing: '',
    accent: 'var(--orange-ink)',
    bg: 'var(--paper)',
  },
  {
    id: 'render',
    n: 1,
    tech: 'Render',
    topic: 'Platforms',
    scale: '16.7 ms a frame',
    crossing: 'below the pixel: the rendering engine',
    accent: 'var(--violet-ink)',
    bg: 'var(--render-bg)',
  },
  {
    id: 'loop',
    n: 2,
    tech: 'Event loop',
    topic: 'Now',
    scale: '< 50 ms a task',
    crossing: 'below the frame: the main thread',
    accent: 'var(--yellow-ink)',
    bg: 'var(--loop-bg)',
  },
  {
    id: 'tls',
    n: 3,
    tech: 'HTTP · TLS',
    topic: 'About',
    scale: '1 round trip',
    crossing: 'fetch() hands the request to the network stack',
    accent: 'var(--teal-ink)',
    bg: 'var(--tls-bg)',
  },
  {
    id: 'network',
    n: 4,
    tech: 'Network',
    topic: 'Open source',
    scale: '≈ 30 ms an ocean',
    crossing: 'the bytes leave the machine',
    accent: 'var(--blue-ink)',
    bg: 'var(--network-bg)',
  },
  {
    id: 'servers',
    n: 5,
    tech: 'Servers',
    topic: 'More builds',
    scale: '0.5 ms in the rack',
    crossing: 'arriving at the data centre',
    accent: 'var(--orange-ink)',
    bg: 'var(--servers-bg)',
  },
  {
    id: 'database',
    n: 6,
    tech: 'Database',
    topic: 'Numbers',
    scale: '≈ 100 µs a page read',
    crossing: 'the app server asks the database',
    accent: 'var(--lilac-ink)',
    bg: 'var(--database-bg)',
  },
  {
    id: 'kernel',
    n: 7,
    tech: 'Kernel',
    topic: 'Career',
    scale: '≈ 100 ns a syscall',
    crossing: 'user space → kernel space',
    accent: 'var(--teal-ink)',
    bg: 'var(--kernel-bg)',
  },
  {
    id: 'cpu',
    n: 8,
    tech: 'CPU',
    topic: 'Toolchain',
    scale: '0.3 ns a cycle',
    crossing: 'the scheduler hands a core to the thread',
    accent: 'var(--yellow-ink)',
    bg: 'var(--cpu-bg)',
  },
  {
    id: 'silicon',
    n: 9,
    tech: 'Silicon',
    topic: 'Roots',
    scale: 'picoseconds a switch',
    crossing: 'inside a single gate',
    accent: 'var(--violet-ink)',
    bg: 'var(--silicon-bg)',
  },
];
