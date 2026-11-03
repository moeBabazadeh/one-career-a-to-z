// The phone's state: what's on screen, which apps are open and where each one is navigated to,
// and the settings. One reducer, so every gesture, key and tap goes through the same transitions.

export type Mode = 'home' | 'app' | 'switcher';
export type Overlay = null | 'notifications' | 'control' | 'search';

export interface Toggles {
  airplane: boolean;
  wifi: boolean;
  bluetooth: boolean;
  cellular: boolean;
  /** Do Not Disturb: banners stay quiet. */
  focus: boolean;
  torch: boolean;
  /** The phone's own Reduce Motion, on top of the system's. */
  motion: boolean;
}

export interface Menu {
  app: string;
  /** The icon's box in screen coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OS {
  /** Screen on. Off shows black until woken. */
  power: boolean;
  locked: boolean;
  mode: Mode;
  /** The app in front, or the one last in front. */
  app: string | null;
  /** Open apps, most recent first. */
  recents: string[];
  page: number;
  overlay: Overlay;
  /** Each app's navigation stack; '' is its first screen. */
  stacks: Record<string, string[]>;
  /** Which way each app last moved, for its transition. */
  nav: Record<string, 'push' | 'pop' | 'none'>;
  cleared: string[];
  muted: string[];
  toggles: Toggles;
  brightness: number;
  text: number;
  wallpaper: number;
  banner: { id: string; n: number } | null;
  menu: Menu | null;
  toast: { text: string; n: number } | null;
  /** Unlocked at least once this visit. */
  unlockedOnce: boolean;
}

export type Action =
  | { type: 'power'; on: boolean }
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'open'; app: string; stack?: string[] }
  | { type: 'home' }
  | { type: 'switcher' }
  | { type: 'kill'; app: string }
  | { type: 'page'; page: number }
  | { type: 'overlay'; overlay: Overlay }
  | { type: 'push'; app: string; path: string }
  | { type: 'pop'; app: string }
  | { type: 'reset'; app: string; path?: string }
  | { type: 'clear'; ids: string[] }
  | { type: 'restore' }
  | { type: 'mute'; app: string; on: boolean }
  | { type: 'toggle'; key: keyof Toggles; on?: boolean }
  | { type: 'set'; key: 'brightness' | 'text' | 'wallpaper'; value: number }
  | { type: 'menu'; menu: Menu | null }
  | { type: 'toast'; text: string | null }
  | { type: 'banner'; id: string | null };

export const initialOS = (): OS => ({
  power: true,
  locked: true,
  mode: 'home',
  app: null,
  recents: [],
  page: 0,
  overlay: null,
  stacks: {},
  nav: {},
  cleared: [],
  muted: [],
  toggles: {
    airplane: false,
    wifi: true,
    bluetooth: true,
    cellular: true,
    focus: false,
    torch: false,
    motion: false,
  },
  brightness: 1,
  text: 1,
  wallpaper: 0,
  banner: null,
  menu: null,
  toast: null,
  unlockedOnce: false,
});

const front = (recents: string[], app: string) => [app, ...recents.filter((a) => a !== app)];

export function reduce(os: OS, a: Action): OS {
  switch (a.type) {
    case 'power':
      return a.on
        ? { ...os, power: true }
        : {
            ...os,
            power: false,
            locked: true,
            overlay: null,
            menu: null,
            banner: null,
            mode: os.mode === 'switcher' ? 'home' : os.mode,
          };
    case 'lock':
      return {
        ...os,
        locked: true,
        overlay: null,
        menu: null,
        banner: null,
        mode: os.mode === 'switcher' ? 'home' : os.mode,
      };
    case 'unlock':
      return { ...os, locked: false, power: true, unlockedOnce: true };
    case 'open': {
      const stacks = a.stack
        ? { ...os.stacks, [a.app]: ['', ...a.stack.filter(Boolean)] }
        : os.stacks;
      return {
        ...os,
        mode: 'app',
        app: a.app,
        recents: front(os.recents, a.app),
        overlay: null,
        menu: null,
        stacks,
        nav: { ...os.nav, [a.app]: a.stack ? 'push' : 'none' },
      };
    }
    case 'home':
      return { ...os, mode: 'home', overlay: null, menu: null };
    case 'switcher':
      return { ...os, mode: 'switcher', overlay: null, menu: null };
    case 'kill': {
      const recents = os.recents.filter((r) => r !== a.app);
      const stacks = { ...os.stacks };
      delete stacks[a.app];
      return { ...os, recents, stacks, app: os.app === a.app ? (recents[0] ?? null) : os.app };
    }
    case 'page':
      return { ...os, page: a.page };
    case 'overlay':
      return { ...os, overlay: a.overlay, menu: null };
    case 'push': {
      const stack = os.stacks[a.app] ?? [''];
      return {
        ...os,
        stacks: { ...os.stacks, [a.app]: [...stack, a.path] },
        nav: { ...os.nav, [a.app]: 'push' },
      };
    }
    case 'pop': {
      const stack = os.stacks[a.app] ?? [''];
      if (stack.length < 2) return os;
      return {
        ...os,
        stacks: { ...os.stacks, [a.app]: stack.slice(0, -1) },
        nav: { ...os.nav, [a.app]: 'pop' },
      };
    }
    case 'reset':
      return {
        ...os,
        stacks: { ...os.stacks, [a.app]: [a.path ?? ''] },
        nav: { ...os.nav, [a.app]: 'none' },
      };
    case 'clear':
      return { ...os, cleared: [...new Set([...os.cleared, ...a.ids])] };
    case 'restore':
      return { ...os, cleared: [] };
    case 'mute':
      return {
        ...os,
        muted: a.on ? [...new Set([...os.muted, a.app])] : os.muted.filter((m) => m !== a.app),
      };
    case 'toggle': {
      const on = a.on ?? !os.toggles[a.key];
      const toggles = { ...os.toggles, [a.key]: on };
      // Airplane mode drops the radios, the way phones do; Wi-Fi and Bluetooth can come back on by hand.
      if (a.key === 'airplane')
        Object.assign(toggles, {
          cellular: !on,
          wifi: !on && os.toggles.wifi,
          bluetooth: !on && os.toggles.bluetooth,
        });
      return { ...os, toggles };
    }
    case 'set':
      return { ...os, [a.key]: a.value };
    case 'menu':
      return { ...os, menu: a.menu };
    case 'toast':
      return { ...os, toast: a.text === null ? null : { text: a.text, n: (os.toast?.n ?? 0) + 1 } };
    case 'banner':
      return { ...os, banner: a.id ? { id: a.id, n: (os.banner?.n ?? 0) + 1 } : null };
  }
}

/** The screen an app is on: the top of its stack. */
export const top = (os: OS, app: string) => {
  const stack = os.stacks[app] ?? [''];
  return stack[stack.length - 1];
};
