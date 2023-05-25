import * as React from 'react';
import NextHead from 'next/head';

interface Props {
  children?: React.ReactNode;
  description?: string;
  title?: string;
  keywords?: string;
}

const Head: React.FunctionComponent<Props> = (props: Props) => {
  const {
    children,
    title = 'Mohammad Babazadeh',
    description = "Explore Mohammad Babazadeh's personal website, showcasing his skills as a Frontend Developer experienced in React, Next.js, and embedded design. Learn about his professional journey and get in touch for your next project.",
    keywords = 'Mohammad Babazadeh, personal website, frontend developer, React, Next.js, embedded design, web development, professional experience, portfolio, TypeScript, JavaScript, HTML, SCSS, Gatsby, Tailwind CSS, Material UI, Redux, CI/CD, remote work, IoT',
  } = props;

  return (
    <NextHead>
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {children}
    </NextHead>
  );
};

export default Head;
