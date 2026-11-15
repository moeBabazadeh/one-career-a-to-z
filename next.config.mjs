import createMDX from '@next/mdx';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

// Blog posts are MDX files in src/content/blog, imported by the blog's pages. The plugins are
// named as strings, with plain-data options, so Turbopack can load them.
const withMDX = createMDX({
  options: {
    // Tables, strikethrough, task lists and bare links.
    remarkPlugins: ['remark-gfm'],
    // Headings get ids (the post's contents list links to them; posts.ts makes the same ids), and
    // code blocks are highlighted at build time, in a light and a dark theme (see blog.module.scss).
    rehypePlugins: [
      'rehype-slug',
      [
        'rehype-pretty-code',
        {
          theme: { light: 'github-light', dark: 'github-dark' },
          keepBackground: false,
          defaultLang: 'plaintext',
        },
      ],
    ],
  },
});

export default withMDX(nextConfig);
