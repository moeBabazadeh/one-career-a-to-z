import React from 'react';
import { email } from '@/configs/socialMedia';
import { useReveal } from '@/hooks';

const Contact = () => {
  const revealContainer = useReveal<HTMLElement>();

  return (
    <section id="contact" className="contact-section reveal" ref={revealContainer}>
      <h2 className="numbered-heading overline">What’s Next?</h2>

      <h2 className="title">Get In Touch</h2>

      <p>
        Whether you’re building something ambitious, need a hand with a tricky platform or a piece of
        hardware, or just want to say hi, my inbox is always open. I’ll do my best to get back to
        you!
      </p>

      <a className="email-link" href={`mailto:${email}`}>
        Say Hello
      </a>
    </section>
  );
};

export default Contact;
