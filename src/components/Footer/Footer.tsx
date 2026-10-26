import React from 'react';
import { socialMedia } from '@/configs/socialMedia';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="social-links" style={{ maxWidth: socialMedia.length * 50 }}>
        <ul>
          {socialMedia &&
            socialMedia.map(({ name, url, icon }, i) => (
              <li key={i}>
                <a href={url} aria-label={name}>
                  {icon}
                </a>
              </li>
            ))}
        </ul>
      </div>

      <div className="credit" tabIndex={-1}>
        <div>
          <a href="https://brittanychiang.com" target="_blank" rel="noreferrer">
            Designed by Brittany Chiang
          </a>
          <br />
          <a href="https://github.com/bchiang7/v4" target="_blank" rel="noreferrer">
            Rebuilt by Mohammad Babazadeh with Next.js from her v4 source
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
