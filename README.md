# babazadeh.dev

The personal site of **Moe Babazadeh**, CTO at Neuroject: one career, told through 26 themes. Each theme is the whole site, built as a different working tool: an API reference, an oscilloscope, a pull request, a Linux desktop with a desktop cube, a RoboCup simulator, a reverse-engineering suite, and more.

**[babazadeh.dev](https://babazadeh.dev)** opens on [Circuit Board](https://babazadeh.dev/concepts/circuit-board), the theme that reads most like a plain page. Use the switcher in the bottom-right corner to move between themes, or browse them all in the **[gallery](https://babazadeh.dev/concepts)**.

![The 26 themes, A to Z](.github/readme/themes.jpg)

## The themes

|                                                                   |                                                                               |                                                                   |                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| A · [API Reference](https://babazadeh.dev/concepts/api-reference) | B · [Blueprint](https://babazadeh.dev/concepts/blueprint)                     | C · [Circuit Board](https://babazadeh.dev/concepts/circuit-board) | D · [Datasheet](https://babazadeh.dev/concepts/datasheet)       |
| E · [Editor](https://babazadeh.dev/concepts/editor)               | F · [Factory](https://babazadeh.dev/concepts/factory)                         | G · [G-code](https://babazadeh.dev/concepts/g-code)               | H · [History](https://babazadeh.dev/concepts/history)           |
| I · [Isometric](https://babazadeh.dev/concepts/isometric)         | J · [Journey Planner](https://babazadeh.dev/concepts/journey-planner)         | K · [Kickoff](https://babazadeh.dev/concepts/kickoff)             | L · [Ladder Logic](https://babazadeh.dev/concepts/ladder-logic) |
| M · [Mobile](https://babazadeh.dev/concepts/mobile)               | N · [Nimbus](https://babazadeh.dev/concepts/nimbus)                           | O · [Oscilloscope](https://babazadeh.dev/concepts/oscilloscope)   | P · [Pull Request](https://babazadeh.dev/concepts/pull-request) |
| Q · [Query Plan](https://babazadeh.dev/concepts/query-plan)       | R · [Reverse Engineering](https://babazadeh.dev/concepts/reverse-engineering) | S · [Spatial](https://babazadeh.dev/concepts/spatial)             | T · [Teletext](https://babazadeh.dev/concepts/teletext)         |
| U · [Uptime](https://babazadeh.dev/concepts/uptime)               | V · [Vector](https://babazadeh.dev/concepts/vector)                           | W · [Whiteboard](https://babazadeh.dev/concepts/whiteboard)       | X · [X-Ray](https://babazadeh.dev/concepts/x-ray)               |
| Y · [Year of Linux](https://babazadeh.dev/concepts/year-of-linux) | Z · [Zoom](https://babazadeh.dev/concepts/zoom)                               |                                                                   |                                                                 |

Nineteen earlier designs live on in the gallery's **Bonus** section. The original single-page site is still at [/classic](https://babazadeh.dev/classic).

## How it works

- **One source of facts.** Every date, figure, role and link lives in [`src/content/db.ts`](src/content/db.ts). Each theme reads from it, so a change made there shows up everywhere. An ESLint rule fails the build if a fact is typed straight into a theme.
- **Real tools, not mock-ups.** The themes run on real mechanisms: a formula engine with dependency tracking, a small Python interpreter, a Thumb-2 assembler and disassembler, packet and protocol decoders, a PID-controlled plant, robot and physics simulations.
- **One registry.** [`_shared/concepts.ts`](<src/app/(concepts)/concepts/_shared/concepts.ts>) lists every theme. It drives the switcher, the gallery, the shuffle and the bonus section.
- **Light and dark everywhere.** The scheme follows the system unless the visitor picks one, and it's applied before the first paint, so pages don't flash.
- **Shareable.** Every theme has its own address, title, description and share image.

## Writing a post

The [blog](https://babazadeh.dev/blog) is a folder of MDX files, in one layout outside the themes: the newest post large, the rest as cards. To add a post, create `src/content/blog/<address>.mdx`. The file name becomes its address under `/blog/`, and the post describes itself at the top:

````mdx
export const metadata = {
  title: 'Post title',
  description: 'A sentence or two for the list, search results, the feed and share cards.',
  date: '2026-11-15',
  topic: 'side-projects', // or 'platforms', 'hardware', 'notes'
  draft: true,
};

The first paragraph. The title above is shown for you, so start with text or a `##` heading.

```ts title="example.ts" {2}
const posts = await getPosts();
const newest = posts[0]; // this line is highlighted
```
````

Markdown, tables, footnotes, task lists, highlighted code blocks and imported React components all work. Images go in `public/blog/<address>/` and in the post as `![What it shows](/blog/<address>/photo.png "An optional caption")`. A post with `draft: true` shows on the dev server only; delete that line to publish it.

The rest is worked out from the file. The reading time comes from its word count. A post with three `##` sections or more gets a contents list beside it on wide screens, and every code block gets a copy button. The topic picks the pattern on the post's cover and share image and lists it under `/blog/topic/<topic>`; the topics are in `src/app/(concepts)/blog/posts.ts`. Each published post gets its own page and share image, links to the posts either side of it, an entry in the [RSS feed](https://babazadeh.dev/blog/rss.xml) and a line in the sitemap, and the site links to the blog once the first one is out.

## Built with

[Next.js 16](https://nextjs.org) (App Router, with the Pages Router for the classic site) · React 19 · TypeScript · Sass modules · [MDX](https://mdxjs.com) for the blog · [three.js](https://threejs.org) for the 3D themes · fonts from Google Fonts, self-hosted by `next/font` · hosted on [Vercel](https://vercel.com).

## Running it locally

You need Node.js 24 (see [`.nvmrc`](.nvmrc)) and pnpm (the version is pinned in `package.json`).

```sh
pnpm install
pnpm dev        # http://localhost:3100
```

| Command          | What it does                                |
| ---------------- | ------------------------------------------- |
| `pnpm dev`       | Start the development server                |
| `pnpm lint`      | ESLint, including the facts rule            |
| `pnpm typecheck` | Generate Next.js types, then run TypeScript |
| `pnpm build`     | Production build                            |

No environment variables are required. [`.env.example`](.env.example) lists the one optional setting.

## Project structure

```text
src/
├── app/
│   ├── (concepts)/
│   │   ├── route.ts            / → the default theme, or the visitor's pinned one
│   │   ├── layout.tsx          fonts, light and dark, the switcher
│   │   ├── concepts/
│   │   │   ├── page.tsx        the gallery (/concepts)
│   │   │   ├── _shared/        registry, switcher, facts, hooks, metadata
│   │   │   └── <theme>/        one folder per theme
│   │   └── blog/               the blog: list, post page, RSS feed, share cards
│   ├── sitemap.ts
│   └── robots.ts
├── content/
│   ├── db.ts                   every fact, in one place
│   ├── format.ts               dates, figures and lists
│   └── blog/                   one MDX file per post
├── mdx-components.tsx          how MDX renders links
└── pages/                      the classic site (/classic, /archive)
public/
├── og/                         a share image for every theme
└── resume.pdf
```

## Credits

The classic site at `/classic` and `/archive` is based on [Brittany Chiang's v4](https://github.com/bchiang7/v4) design ([brittanychiang.com](https://brittanychiang.com)). The credit for that design is hers.

## Licence

© Moe Babazadeh. All rights reserved. You're welcome to read the code, learn from it, and fork it to see how it works. If you reuse any part of it, credit me with a visible link to [babazadeh.dev](https://babazadeh.dev) and this repository. Please don't republish the site, its design or its personal content as your own. The full terms are in [LICENSE](LICENSE).
