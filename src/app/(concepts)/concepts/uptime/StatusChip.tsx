'use client';

import { useSyncExternalStore } from 'react';
import { INITIAL, getHealth, subscribeHealth } from './store';
import s from './loadtest.module.scss';

const LABEL = {
  operational: 'All systems operational',
  degraded: 'Degraded performance',
  outage: 'Major outage',
};
const SHORT = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage' };

/** The status page summary, fed by the load test below. */
export default function StatusChip() {
  const { status, firing } = useSyncExternalStore(subscribeHealth, getHealth, () => INITIAL);
  return (
    <a href="#console" className={s.status} data-status={status}>
      <span className={s.statusDot} aria-hidden="true" />
      <span className={s.statusText}>{LABEL[status]}</span>
      <span className={s.statusShort}>{SHORT[status]}</span>
      {firing > 0 && <b>{firing} firing</b>}
      <span className={s.simTag}>sim</span>
    </a>
  );
}
