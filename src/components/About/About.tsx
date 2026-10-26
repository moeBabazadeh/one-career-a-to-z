import React from 'react';
import Image from 'next/image';
import { aboutParagraphs, skills } from '@/content/About';
import { useReveal } from '@/hooks';

const About = () => {
  const revealContainer = useReveal<HTMLElement>();

  return (
    <section id="about" className="about-section reveal" ref={revealContainer}>
      <h2 className="numbered-heading">About Me</h2>

      <div className="inner">
        <div className="about-text">
          <div>{aboutParagraphs}</div>

          <ul className="skills-list">
            {skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </div>

        <div className="about-pic">
          <div className="wrapper">
            <Image
              className="img"
              src="/assets/images/me.jpg"
              width={600}
              height={600}
              alt="Mohammad Babazadeh"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
