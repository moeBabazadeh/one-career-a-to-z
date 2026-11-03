// Mail as text: the plain-text part of a message, the "On … wrote:" quote a reply carries, a
// forwarded message, the mailto: link that hands a draft to the visitor's own mail app
// (RFC 6068), and "Show original": the message as RFC 5322 source, with RFC 2047 encoded
// headers, quoted-printable text (RFC 2045) and the References chain that threads it.
import { db, profile } from '../_shared/data';
import { fullDate, shortDate } from './dates';
import { blockText, labelById, MOE, type Message, type Thread } from './mailbox';

/** Wraps text at `width`, keeping words whole, the way plain-text mail is written. */
export function wrap(text: string, width = 72): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para.length <= width) {
      out.push(para);
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

const SIGNATURE = [
  '-- ',
  profile.name,
  `${profile.role}, ${profile.company}`,
  `${profile.email} · ${db.person.url}`,
  `LinkedIn <${profile.linkedin}>`,
  `GitHub <${profile.github}>`,
].join('\n');

/** The message's text/plain part. */
export function plainText(m: Message, width = 72) {
  const body = m.blocks.map((bl) => wrap(blockText(bl, true), width).join('\n')).join('\n\n');
  const atts = m.attachments.length
    ? `\n\n${m.attachments.map((x) => `[Attachment: ${x.name} <${db.person.url}${x.href}>]`).join('\n')}`
    : '';
  const sig =
    m.from.id === 'moe'
      ? `\n\n${SIGNATURE}`
      : `\n\n-- \nSent by ${db.person.site} on behalf of ${profile.name}.`;
  return `${body}${atts}${sig}`;
}

const who = (m: Message) => `${m.from.name} <${m.from.address}>`;

/** The reply's quote: "On September 2026, Moe Babazadeh <…> wrote:" and the text behind "> ". */
export function quoteFor(m: Message, maxLines = 24) {
  // Quote the words, not the signature: clients trim everything after "-- ".
  const lines = m.blocks.flatMap((bl) => [...wrap(blockText(bl, true), 70), '']).slice(0, -1);
  const cut = lines.length > maxLines;
  const kept = (cut ? lines.slice(0, maxLines) : lines).map((l) => (l ? `> ${l}` : '>'));
  const when = m.date ? `${m.date.d ? 'On' : 'In'} ${fullDate(m.date)}` : 'Undated';
  return [`${when}, ${who(m)} wrote:`, ...kept, ...(cut ? ['> […]'] : [])].join('\n');
}

/** A forwarded message, in the header block mail clients use. */
export function forwardFor(t: Thread, m: Message, link: string, maxLines = 30) {
  const lines = m.blocks.flatMap((bl) => [...wrap(blockText(bl, true)), '']).slice(0, -1);
  const cut = lines.length > maxLines;
  return [
    '---------- Forwarded message ---------',
    `From: ${who(m)}`,
    `Date: ${fullDate(m.date)}`,
    `Subject: ${t.subject}`,
    'To: me',
    '',
    ...(cut ? lines.slice(0, maxLines) : lines),
    ...(cut ? ['[…]'] : []),
    '',
    `The whole thread: ${link}`,
  ].join('\n');
}

/** A mailto: link (RFC 6068): line breaks as CRLF, everything else percent-encoded. */
export function mailtoHref(to: string, subject: string, body: string) {
  const addr = to
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((x) => encodeURI(x))
    .join(',');
  const q = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`,
  ]
    .filter(Boolean)
    .join('&');
  return `mailto:${addr}${q ? `?${q}` : ''}`;
}

/* ------------------------------------------------------------------ show original */

const utf8 = (s: string) => new TextEncoder().encode(s);
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** An RFC 2047 encoded word, for header text that isn't plain ASCII. */
function encodeWord(s: string) {
  if (ascii(s)) return s;
  let bin = '';
  utf8(s).forEach((byte) => (bin += String.fromCharCode(byte)));
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

/** Quoted-printable (RFC 2045): non-ASCII bytes as =XX, soft breaks to keep lines under 76. */
export function quotedPrintable(text: string) {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    let enc = '';
    const bytes = utf8(line);
    bytes.forEach((byte, i) => {
      const last = i === bytes.length - 1;
      const ch = String.fromCharCode(byte);
      const plain = (byte >= 33 && byte <= 126 && byte !== 61) || (byte === 32 && !last);
      enc += plain ? ch : `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    });
    // Soft line breaks: "=" at the end of a line that continues, never splitting an =XX.
    let rest = enc;
    while (rest.length > 75) {
      let at = 75;
      const eq = rest.lastIndexOf('=', at - 1);
      if (eq > at - 3) at = eq;
      out.push(`${rest.slice(0, at)}=`);
      rest = rest.slice(at);
    }
    out.push(rest);
  }
  return out.join('\r\n');
}

/** A short, stable hex hash, for the MIME boundary. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const msgId = (m: Message) => `<${m.id}@${db.person.site}>`;

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
  png: 'image/png',
};

/** The whole message as it would travel: headers, then a multipart body. */
export function rawSource(t: Thread, m: Message) {
  const i = t.messages.indexOf(m);
  const before = t.messages.slice(0, i);
  const labels = t.labels.map((id) => labelById.get(id)?.name ?? id);
  const boundary = `=_part_${hash(m.id)}`;
  const date = m.date
    ? `${shortDate(m.date)} (${m.date.d ? 'no time' : m.date.m ? 'no day or time' : 'only the year'} on record)`
    : '(no date on record)';
  const headers = [
    `Return-Path: <${MOE.address}>`,
    `Message-ID: ${msgId(m)}`,
    ...(before.length
      ? [
          `In-Reply-To: ${msgId(before[before.length - 1])}`,
          `References: ${before.map(msgId).join(' ')}`,
        ]
      : []),
    `Date: ${date}`,
    // The site writes from Moe's own address, on his behalf, so a reply always reaches him.
    `From: ${encodeWord(m.from.name)} <${MOE.address}>`,
    ...(m.from.id === 'site' ? [`Reply-To: ${encodeWord(MOE.name)} <${MOE.address}>`] : []),
    'To: you',
    `Subject: ${encodeWord(i ? `Re: ${t.subject}` : t.subject)}`,
    ...(labels.length ? [`X-Labels: ${labels.join(', ')}`] : []),
    'MIME-Version: 1.0',
  ];
  const text = [
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    quotedPrintable(plainText(m, 64)),
  ].join('\r\n');
  if (!m.attachments.length) return [...headers, text].join('\r\n');
  const parts = m.attachments.map((x) => {
    const ext = x.name.split('.').pop() ?? '';
    return [
      `Content-Type: ${MIME[ext] ?? 'application/octet-stream'}; name="${x.name}"`,
      `Content-Disposition: attachment; filename="${x.name}"`,
      `Content-Location: ${db.person.url}${x.href}`,
      '',
      '(the file itself is served from the address above)',
    ].join('\r\n');
  });
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    'This is a multi-part message in MIME format.',
    '',
    `--${boundary}`,
    text,
    ...parts.flatMap((p) => [`--${boundary}`, p]),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
