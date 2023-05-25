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
          <a href="https://github.com/admir4l/my-personal-website">
            Rebuilt by Mohammad Babazadeh using Next.js
          </a>
          <br />
          <a href="https://github.com/bchiang7/v4">
            code forked from Brittany Chiang&apos;s repository
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
