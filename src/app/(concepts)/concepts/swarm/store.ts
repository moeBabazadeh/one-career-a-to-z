// A tiny command bus, so a "Fly it" button anywhere on the page can task the swarm.

const listeners = new Set<(i: number) => void>();

/** Asks the ground station to fly waypoint `i`. */
export function flyTo(i: number) {
  listeners.forEach((l) => l(i));
}

export function onFly(listener: (i: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
