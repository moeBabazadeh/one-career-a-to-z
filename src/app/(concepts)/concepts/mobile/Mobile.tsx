'use client';

// M · Mobile. The root: the phone on its stage, or everything on it as one plain page (#read).
// The phone stays mounted while the page is open, so it comes back exactly as it was left.
import { useSyncExternalStore } from 'react';
import { Article } from './Article';
import { Phone } from './Phone';
import s from './mobile.module.scss';

const EVENT = 'mobile-view';

const subscribe = (onChange: () => void) => {
  addEventListener('hashchange', onChange);
  addEventListener('popstate', onChange);
  addEventListener(EVENT, onChange);
  return () => {
    removeEventListener('hashchange', onChange);
    removeEventListener('popstate', onChange);
    removeEventListener(EVENT, onChange);
  };
};
const reading = () => location.hash === '#read';
const never = () => false;

/** Whether this visit pushed #read, so leaving the page can go back instead of stacking entries. */
let pushed = false;

function setReading(on: boolean) {
  scrollTo({ top: 0 });
  if (on) {
    history.pushState(null, '', '#read');
    pushed = true;
  } else if (pushed) {
    pushed = false;
    history.back();
    return;
  } else {
    history.replaceState(null, '', location.pathname + location.search);
  }
  dispatchEvent(new Event(EVENT));
}

export default function Mobile() {
  const read = useSyncExternalStore(subscribe, reading, never);

  return (
    <div className={s.root} data-view={read ? 'page' : 'phone'}>
      <div className={s.phoneView} hidden={read}>
        <Phone active={!read} onRead={() => setReading(true)} />
      </div>
      {read && <Article onBack={() => setReading(false)} />}
    </div>
  );
}
