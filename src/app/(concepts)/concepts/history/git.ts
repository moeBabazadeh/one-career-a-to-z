// Git objects, hashed the way git hashes them. Blobs, trees and commits are serialised in git's
// own format and run through SHA-1, so `git hash-object -t commit` on a raw commit from this page
// prints the same hash. Everything is deterministic, so server and client agree.

const enc = new TextEncoder();

/** SHA-1 of a byte array, as 40 hex characters. */
export function sha1(bytes: Uint8Array): string {
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const f =
        i < 20 ? (b & c) | (~b & d) : i < 40 || i >= 60 ? b ^ c ^ d : (b & c) | (b & d) | (c & d);
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** `<type> <size>\0<body>`, hashed: the id git gives any object. */
const hashObject = (type: 'blob' | 'tree' | 'commit', body: Uint8Array) =>
  sha1(concat([enc.encode(`${type} ${body.length}\0`), body]));

const rawId = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));

export const blobId = (content: string) => hashObject('blob', enc.encode(content));

type Dir = Map<string, string | Dir>;

/**
 * The tree id for a set of files (path → blob id). Entries are sorted the way git sorts them,
 * with directory names compared as if they ended in a slash.
 */
export function treeId(files: Map<string, string>): string {
  const root: Dir = new Map();
  for (const [path, blob] of files) {
    const parts = path.split('/');
    let dir = root;
    for (const name of parts.slice(0, -1)) {
      if (!(dir.get(name) instanceof Map)) dir.set(name, new Map());
      dir = dir.get(name) as Dir;
    }
    dir.set(parts[parts.length - 1], blob);
  }
  const hashDir = (dir: Dir): string => {
    const entries = [...dir].map(([name, v]) =>
      typeof v === 'string'
        ? { name, key: name, mode: '100644', id: v }
        : { name, key: `${name}/`, mode: '40000', id: hashDir(v) },
    );
    entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return hashObject(
      'tree',
      concat(entries.flatMap((e) => [enc.encode(`${e.mode} ${e.name}\0`), rawId(e.id)])),
    );
  };
  return hashDir(root);
}

export interface CommitObject {
  tree: string;
  parents: string[];
  author: string;
  time: number;
  message: string;
}

/** The commit exactly as `git cat-file -p` prints it. */
export function commitText({ tree, parents, author, time, message }: CommitObject): string {
  const who = `${author} ${time} +0000`;
  return [
    `tree ${tree}`,
    ...parents.map((p) => `parent ${p}`),
    `author ${who}`,
    `committer ${who}`,
    '',
    message,
  ].join('\n');
}

export const commitId = (text: string) => hashObject('commit', enc.encode(text));
