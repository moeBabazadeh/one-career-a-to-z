// A tiny external store, so the top bar can show the status of the simulated system.

import type { Status } from './sim';

export interface Health {
  status: Status;
  firing: number;
}

export const INITIAL: Health = { status: 'operational', firing: 0 };

let health = INITIAL;
const listeners = new Set<() => void>();

export function setHealth(status: Status, firing: number) {
  if (status === health.status && firing === health.firing) return;
  health = { status, firing };
  listeners.forEach((l) => l());
}

export const getHealth = () => health;

export function subscribeHealth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
