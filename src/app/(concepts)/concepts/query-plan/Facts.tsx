'use client';

import { stats } from '../_shared/data';
import Sql from './Sql';
import { loadSaved, revealWorkbench, runVerify } from './store';
import s from './query.module.scss';

// The headline numbers that the database can prove, and the query that proves each.
const CHECKS: Record<string, () => void> = {
  'devices in production': () => loadSaved('hardware'),
  'sensor records logged': () => runVerify('records'),
  'apps on App Store and Google Play': () => loadSaved('stores'),
  'weekly downloads of packages I patched': () => runVerify('downloads'),
};

export default function Facts() {
  return (
    <figure className={s.facts}>
      <figcaption>
        <code>
          <Sql text="SELECT value, label FROM facts;" />
        </code>
        <span>{stats.length} rows</span>
      </figcaption>
      <table>
        <thead>
          <tr>
            <th scope="col">value</th>
            <th scope="col">label</th>
            <th scope="col">
              <span className={s.sr}>Check</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.map((m) => {
            const check = CHECKS[m.label];
            return (
              <tr key={m.label}>
                <td className={s.factValue}>{m.value}</td>
                <td>{m.label}</td>
                <td>
                  {check ? (
                    <button
                      type="button"
                      className={s.verify}
                      onClick={() => {
                        check();
                        revealWorkbench();
                      }}
                      aria-label={`Prove it: run the query behind ${m.value} ${m.label}`}
                    >
                      prove it
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M5 3.5v9l7-4.5z" />
                      </svg>
                    </button>
                  ) : (
                    <span className={s.asStated}>as stated</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}
