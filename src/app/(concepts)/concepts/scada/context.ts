'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AlarmView, Plant, Prio, Result, Snapshot } from './sim';
import type { Route } from './ui';

export interface Confirm {
  title: string;
  body: ReactNode;
  verb: string;
  run: () => void;
}

export interface Hmi {
  plant: Plant;
  snap: Snapshot;
  route: Route;
  /** Opens a faceplate over the current display. */
  open: (tag: string) => void;
  nav: (r: Route) => void;
  /** Two-step operation: every command that moves equipment asks first. */
  confirm: (c: Confirm) => void;
  /** Shows a command's result on the operator message line. */
  say: (r: Result) => void;
}

export const HmiContext = createContext<Hmi | null>(null);

export const useHmi = () => useContext(HmiContext) as Hmi;

export interface Mark {
  prio: Prio;
  blink: boolean;
  rtn: boolean;
}

/** The most urgent alarm among those that match, as a mark, or null when they're all normal. */
export function markOf(alarms: AlarmView[], match: (a: AlarmView) => boolean): Mark | null {
  let best: AlarmView | null = null;
  for (const a of alarms) {
    if (a.shelvedUntil !== null || a.state === 'NORM' || !match(a)) continue;
    if (
      !best ||
      a.prio < best.prio ||
      (a.prio === best.prio && a.state === 'UNACK' && best.state !== 'UNACK')
    )
      best = a;
  }
  return best ? { prio: best.prio, blink: best.state === 'UNACK', rtn: !best.active } : null;
}

/** Alarms that belong to a tag: a loop's own, or a line's flow alarm. */
export const forTag = (tag: string) => (a: AlarmView) => a.id.startsWith(`${tag}.`);
export const forUnit = (unitTag: string) => (a: AlarmView) => a.unit === unitTag;
