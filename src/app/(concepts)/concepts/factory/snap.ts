// Plain-data snapshots of the factory for the React panels, taken a few times a second.

import { ALL, ITEMS, perMin, type ItemId, type Recipe } from './items';
import {
  BELT_MAX,
  MINE_TIME,
  modeLabel,
  type Bottleneck,
  type Factory,
  type LogEntry,
  type Mode,
  type Ref,
} from './sim';
import type { DockId } from './world';

export interface Row {
  id: ItemId;
  made: number;
  used: number;
}

export interface Fix {
  label: string;
  action: 'build' | 'rotate' | 'toggle';
  ref: Ref;
}

interface Common {
  ref: Ref;
  root: boolean;
  fix?: Fix;
}

export type Sel =
  | (Common & {
      kind: 'machine';
      recipe: Recipe;
      status: string;
      tone: Tone;
      built: number;
      building: boolean;
      rate: number;
      max: number;
      work: number;
      buf: { id: ItemId; have: number; need: number }[];
      out: number;
    })
  | (Common & {
      kind: 'drill';
      res: ItemId;
      status: string;
      tone: Tone;
      built: number;
      building: boolean;
      rate: number;
      max: number;
      work: number;
    })
  | (Common & {
      kind: 'belt';
      item: ItemId;
      on: boolean;
      rate: number;
      count: number;
      len: number;
      max: number;
      under: number;
    })
  | (Common & {
      kind: 'splitter';
      item: ItemId;
      mode: Mode;
      label: string;
      names: [string, string];
      rates: [number, number];
    })
  | (Common & {
      kind: 'dock';
      id: DockId;
      name: string;
      total: number;
      rate: number;
      got: { id: ItemId; n: number }[];
    });

export type Tone = 'ok' | 'warn' | 'err' | 'idle' | 'ghost';

export interface Snap {
  tick: number;
  t: number;
  rows: Row[];
  bottlenecks: Bottleneck[];
  log: LogEntry[];
  shipped: number;
  fix?: Fix;
  sel: Sel | null;
}

/** What would ease a bottleneck, if anything in this factory can. */
export function fixFor(f: Factory, b: Bottleneck | undefined): Fix | undefined {
  if (!b) return undefined;
  const kind = b.ref[0],
    i = Number(b.ref.slice(1));
  if (kind === 'm') {
    const recipe = f.machines[i].recipe;
    const g = f.machines.findIndex((m) => m.built === 0 && !m.building && m.recipe === recipe);
    if (g >= 0)
      return {
        label: `Build a second ${ITEMS[recipe.out].name.toLowerCase()} assembler`,
        action: 'build',
        ref: `m${g}`,
      };
    // no room for another: the splitter after it decides who gets the output
    const sp = f.splitters.findIndex((sp) =>
      f.belts[sp.input].feeders.some((fd) => fd.kind === 'machine' && fd.i === i),
    );
    if (sp >= 0) return { label: 'Rotate its splitter', action: 'rotate', ref: `s${sp}` };
  }
  if (kind === 'd') {
    const res = f.drills[i].res;
    const g = f.drills.findIndex((d) => d.built === 0 && !d.building && d.res === res);
    if (g >= 0)
      return { label: `Build a second drill on ${ITEMS[res].name}`, action: 'build', ref: `d${g}` };
  }
  if (kind === 's')
    return { label: 'Rotate the splitter back to balanced', action: 'rotate', ref: b.ref };
  if (kind === 'b') return { label: 'Enable the belt', action: 'toggle', ref: b.ref };
  return undefined;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function select(f: Factory, ref: Ref | null): Sel | null {
  if (!ref) return null;
  const kind = ref[0],
    i = Number(ref.slice(1));
  const root = f.bottlenecks.find((b) => b.group.includes(ref));
  const common = { ref, root: !!root, fix: fixFor(f, root) };
  if (kind === 'm') {
    const m = f.machines[i];
    const missing = m.recipe.inputs.find(([id, n]) => (m.buf[id] ?? 0) < n);
    const [status, tone]: [string, Tone] =
      m.built < 1
        ? [m.building ? 'Under construction' : 'Ghost: not built yet', 'ghost']
        : m.crafting
          ? ['Working', 'ok']
          : m.out >= 2
            ? ['Output full: making more than its line can use', 'idle']
            : [`Waiting for ${missing ? ITEMS[missing[0]].name : 'ingredients'}`, 'warn'];
    return {
      ...common,
      kind: 'machine',
      recipe: m.recipe,
      status,
      tone,
      built: m.built,
      building: m.building,
      rate: f.rate(m.ring),
      max: perMin(m.recipe),
      work: m.work,
      buf: m.recipe.inputs.map(([id, n]) => ({ id, have: m.buf[id] ?? 0, need: n })),
      out: m.out,
    };
  }
  if (kind === 'd') {
    const d = f.drills[i];
    const [status, tone]: [string, Tone] =
      d.built < 1
        ? [d.building ? 'Under construction' : 'Ghost: not built yet', 'ghost']
        : d.holding
          ? ['Output blocked: the belt is full', 'warn']
          : ['Mining', 'ok'];
    return {
      ...common,
      kind: 'drill',
      res: d.res,
      status,
      tone,
      built: d.built,
      building: d.building,
      rate: f.rate(d.ring),
      max: 60 / MINE_TIME,
      work: d.work,
    };
  }
  if (kind === 'b') {
    const b = f.belts[i];
    return {
      ...common,
      kind: 'belt',
      item: b.item,
      on: b.on,
      rate: f.rate(b.flow),
      count: b.items.length,
      len: b.len,
      max: BELT_MAX,
      under: b.tiles.filter((t) => t.ug === 1).length,
    };
  }
  if (kind === 's') {
    const s = f.splitters[i];
    const rates = s.outs.map((o) => f.rate(f.belts[o].flow)) as [number, number];
    return {
      ...common,
      kind: 'splitter',
      item: f.belts[s.input].item,
      mode: s.mode,
      label: modeLabel(s),
      names: s.names,
      rates,
    };
  }
  if (kind === 'k') {
    const d = f.docks[i];
    const got = (Object.entries(d.got) as [ItemId, number][])
      .map(([id, n]) => ({ id, n }))
      .sort((a, b) => b.n - a.n);
    return {
      ...common,
      kind: 'dock',
      id: d.id,
      name: d.name,
      total: d.total,
      rate: f.rate(d.ring),
      got,
    };
  }
  return null;
}

export function snapshot(f: Factory, ref: Ref | null): Snap {
  return {
    tick: f.tick,
    t: f.t,
    rows: ALL.map((id) => ({ id, made: f.made(id), used: f.used(id) })),
    bottlenecks: f.bottlenecks.map((b) => ({
      ...b,
      products: [...b.products],
      group: [...b.group],
    })),
    log: f.log.slice(0, 6),
    shipped: f.shippedPerMin(),
    fix: fixFor(f, f.bottlenecks[0]),
    sel: select(f, ref),
  };
}

/** A name for anything on the map. */
export function nameOf(f: Factory, ref: Ref): string {
  const kind = ref[0],
    i = Number(ref.slice(1));
  if (kind === 'm') return `${ITEMS[f.machines[i].recipe.out].name} assembler`;
  if (kind === 'd') return `Drill on ${ITEMS[f.drills[i].res].name}`;
  if (kind === 'b') return `${ITEMS[f.belts[i].item].name} belt`;
  if (kind === 's') return `${ITEMS[f.belts[f.splitters[i].input].item].name} splitter`;
  if (kind === 'k') return `${f.docks[i].name} dock`;
  return ref;
}

export { plural };
