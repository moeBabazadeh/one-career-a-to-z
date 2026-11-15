import { person } from '@/content/db';
import { patterns, titleSize } from './_card/look';
import { cardLine, topics, type Post } from './posts';
import s from './blog.module.scss';

/**
 * A post's cover: its share image, drawn in HTML so it stays sharp at any size. The large one is
 * the whole card (on the post, and for the newest post in the list); the small one, on the list's
 * cards, keeps the wordmark and the topic. It repeats what the page says, so screen readers skip it.
 */
export function Cover({ post, large = false }: { post: Post; large?: boolean }) {
  return (
    <div className={s.cover} aria-hidden="true">
      <div className={large ? s.coverLarge : s.coverSmall} style={patterns[post.topic]}>
        <p className={s.coverTop}>
          <span className={s.coverMark}>
            {person.first.toLowerCase()}
            <i>.</i>
          </span>
          {large && <span>{person.site}/blog</span>}
        </p>
        {large ? (
          <div>
            {/* The title steps down as the card's does: the size there, over the card's width. */}
            <p
              className={s.coverTitle}
              style={{ fontSize: `max(22px, ${titleSize(post.title) / 12}cqi)` }}
            >
              {post.title}
            </p>
            <p className={s.coverLine}>{cardLine(post)}</p>
          </div>
        ) : (
          <p className={s.coverLine}>{topics[post.topic]}</p>
        )}
      </div>
    </div>
  );
}
