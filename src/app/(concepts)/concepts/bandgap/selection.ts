// Which part of the device is open in the notes, shared by the diagram, the notes and the
// "show in the diagram" buttons in the reading path.
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();

export function select(id: string | null) {
  if (id === current) return;
  current = id;
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useSelection = () =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
