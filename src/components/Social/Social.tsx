import React from 'react';
import Side from '@/components/Side';
import { socialMedia } from '@/configs/socialMedia';

const Social = () => (
  <Side orientation="left">
    <ul className="social-list">
      {socialMedia &&
        socialMedia.map(({ url, name, icon }, i) => (
          <li key={i}>
            <a href={url} aria-label={name} target="_blank" rel="noreferrer">
              {icon}
            </a>
          </li>
        ))}
    </ul>
  </Side>
);

export default Social;
