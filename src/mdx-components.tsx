import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import { Children, isValidElement, type ReactElement } from 'react';
import CopyButton from './app/(concepts)/blog/CopyButton';

// The components every MDX file renders with (Next.js needs this file to use MDX at all). Posts
// are styled by the blog's stylesheet; what changes here is how links open, how images load, and
// the bar on top of a code block.

/** A path to a file (the feed, an image, a PDF), which the router can't open as a page. */
const isFile = (href: string) => /\.\w+$/.test(href.split(/[?#]/)[0]);

const components: MDXComponents = {
  // Pages of the site navigate in place, files on the site open as they are, and links elsewhere
  // open a new tab.
  a: ({ href = '', children, ...rest }) =>
    href.startsWith('#') || (href.startsWith('/') && !isFile(href)) ? (
      <Link href={href} {...rest}>
        {children}
      </Link>
    ) : href.startsWith('/') ? (
      <a href={href} {...rest}>
        {children}
      </a>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" {...rest}>
        {children}
      </a>
    ),

  // Images load as they scroll into view. A title, as in ![alt](/blog/post/photo.png "Caption"),
  // becomes a caption under the image. Markdown puts an image inside a paragraph, so the caption is
  // built from spans, which a paragraph may hold.
  img: ({ title, alt = '', ...rest }) => {
    // eslint-disable-next-line @next/next/no-img-element -- post images have no known size to give next/image
    const image = <img alt={alt} loading="lazy" decoding="async" {...rest} />;
    if (!title) return image;
    return (
      <span data-figure="">
        {image}
        <span data-caption="">{title}</span>
      </span>
    );
  },

  // A highlighted code block (rehype-pretty-code's figure around a pre) gets a bar on top: its
  // file name when it has a title, otherwise its language, and a button that copies the code.
  figure: ({ children, ...rest }) => {
    if (!('data-rehype-pretty-code-figure' in rest)) return <figure {...rest}>{children}</figure>;
    const parts = Children.toArray(children).filter(
      (part): part is ReactElement<Record<string, unknown>> => isValidElement(part),
    );
    const titled = parts.some((part) => 'data-rehype-pretty-code-title' in part.props);
    const language = String(
      parts.find((part) => 'data-language' in part.props)?.props['data-language'] ?? '',
    );
    return (
      <figure {...rest}>
        {!titled && <figcaption>{language === 'plaintext' ? 'text' : language}</figcaption>}
        {children}
        <CopyButton kind="code" />
      </figure>
    );
  },
};

export function useMDXComponents(): MDXComponents {
  return components;
}
