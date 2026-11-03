import { CATALOG } from './sql/catalog';
import { lex } from './sql/lexer';
import s from './query.module.scss';

export type Tone = 'kw' | 'fn' | 'tbl' | 'id' | 'str' | 'num' | 'com' | 'op' | 'err';

export interface Span {
  text: string;
  tone?: Tone;
  start: number;
}

/** SQL split into coloured spans. The same lexer drives the parser, so colours never disagree with it. */
export function spans(text: string): Span[] {
  const toks = lex(text);
  const out: Span[] = [];
  toks.forEach((t, i) => {
    let tone: Tone | undefined;
    switch (t.kind) {
      case 'kw':
      case 'meta':
        tone = 'kw';
        break;
      case 'ident': {
        let j = i + 1;
        while (toks[j] && (toks[j].kind === 'ws' || toks[j].kind === 'comment')) j++;
        tone = toks[j]?.text === '(' ? 'fn' : CATALOG.has(t.value) ? 'tbl' : 'id';
        break;
      }
      case 'qident':
        tone = 'id';
        break;
      case 'str':
        tone = 'str';
        break;
      case 'bad':
        tone = 'err';
        break;
      case 'num':
        tone = 'num';
        break;
      case 'comment':
        tone = 'com';
        break;
      case 'op':
      case 'punct':
        tone = 'op';
        break;
    }
    out.push({ text: t.text, tone, start: t.start });
  });
  return out;
}

const TONE: Record<Tone, string> = {
  kw: s.t_kw,
  fn: s.t_fn,
  tbl: s.t_tbl,
  id: s.t_id,
  str: s.t_str,
  num: s.t_num,
  com: s.t_com,
  op: s.t_op,
  err: s.t_err,
};

/** Highlighted SQL. `errorAt` (0-based) puts a squiggle under the token it falls in. */
export default function Sql({ text, errorAt }: { text: string; errorAt?: number | null }) {
  const list = spans(text);
  const at = errorAt ?? -1;
  const hit =
    at >= 0
      ? list.findIndex((sp) => at >= sp.start && at < sp.start + sp.text.length && sp.text.trim())
      : -1;
  // An error at a space (or the end) underlines the next token, or a blank after the text.
  const next = at >= 0 && hit < 0 ? list.findIndex((sp) => sp.start >= at && sp.text.trim()) : -1;
  const mark = hit >= 0 ? hit : next;
  return (
    <>
      {list.map((sp, i) => {
        const cls = [sp.tone ? TONE[sp.tone] : '', i === mark ? s.squiggle : '']
          .filter(Boolean)
          .join(' ');
        return (
          <span key={i} className={cls || undefined}>
            {sp.text}
          </span>
        );
      })}
      {at >= 0 && mark < 0 && <span className={s.squiggle}> </span>}
    </>
  );
}
