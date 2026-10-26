import React, { useRef, useState } from 'react';
import { KEY_CODES } from '@/configs/constants';
import { jobs } from '@/content/jobs';
import { useReveal } from '@/hooks';

const Jobs = () => {
  const [activeTabId, setActiveTabId] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const revealContainer = useReveal<HTMLElement>();

  // Arrow keys move between tabs and wrap around at either end.
  const selectTab = (id: number) => {
    const next = (id + jobs.length) % jobs.length;
    setActiveTabId(next);
    tabs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case KEY_CODES.ARROW_UP:
      case KEY_CODES.ARROW_LEFT:
        e.preventDefault();
        selectTab(activeTabId - 1);
        break;
      case KEY_CODES.ARROW_DOWN:
      case KEY_CODES.ARROW_RIGHT:
        e.preventDefault();
        selectTab(activeTabId + 1);
        break;
    }
  };

  return (
    <section id="jobs" className="jobs-section reveal" ref={revealContainer}>
      <h2 className="numbered-heading">Where I’ve Worked</h2>

      <div className="inner">
        <div className="jobs-tab-list" role="tablist" aria-label="Job tabs" onKeyDown={onKeyDown}>
          {jobs.map(({ company }, i) => (
            <button
              key={company}
              id={`tab-${i}`}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              className={`jobs-tab-button ${activeTabId === i ? 'active' : ''}`}
              onClick={() => setActiveTabId(i)}
              role="tab"
              tabIndex={activeTabId === i ? 0 : -1}
              aria-selected={activeTabId === i}
              aria-controls={`panel-${i}`}
            >
              <span>{company}</span>
            </button>
          ))}
          <div
            className="jobs-highlight"
            style={{ '--active-tab': activeTabId } as React.CSSProperties}
          />
        </div>

        <div className="jobs-tab-panels">
          {jobs.map(({ company, title, url, range, duties }, i) => (
            <div
              key={company}
              id={`panel-${i}`}
              className="jobs-tab-panel"
              role="tabpanel"
              tabIndex={activeTabId === i ? 0 : -1}
              aria-labelledby={`tab-${i}`}
              hidden={activeTabId !== i}
            >
              <h3>
                <span>{title}</span>
                <span className="company">
                  &nbsp;@&nbsp;
                  {url ? (
                    <a href={url} className="inline-link" target="_blank" rel="noreferrer">
                      {company}
                    </a>
                  ) : (
                    company
                  )}
                </span>
              </h3>

              <p className="range">{range}</p>

              <ul>
                {duties.map((duty) => (
                  <li key={duty}>{duty}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Jobs;
