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
    description = "Explore Mohammad Babazadeh's personal website — CTO at Neuroject, building scalable, AI-driven platforms, web and mobile products, and embedded hardware since 2007 with TypeScript, Python, React, Next.js, and Laravel. Learn about his professional journey and get in touch for your next project.",
    keywords = 'Mohammad Babazadeh, personal website, CTO, chief technology officer, chief full stack engineer, full stack developer, construction tech, BIM, IoT, embedded systems, AI engineering, LLM integration, RAG, React, Next.js, Laravel, TypeScript, Python, Node.js, AWS, cloud, DevOps, software architecture, professional experience, portfolio, remote work',
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
