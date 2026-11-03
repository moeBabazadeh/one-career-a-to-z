// Code for the Inspect tab: the CSS a developer would write for a layer, read from its real
// properties. Auto layout becomes flexbox, sizing becomes flex and stretch, styles become custom
// properties with their value as the fallback.

import { FAMILIES, hexOf, lineHeight, rgba, type Doc, type Node, type Paint } from './model';

export type Decl = [string, string];

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** "Surface/Card" → "--surface-card". */
export const varName = (name: string) =>
  `--${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

function color(doc: Doc, p: Paint) {
  const value = p.opacity < 1 ? rgba(p.color, p.opacity) : hexOf(p.color);
  const style = p.style ? doc.colors.find((c) => c.id === p.style) : null;
  return style ? `var(${varName(style.name)}, ${value})` : value;
}

const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end' };

export function cssFor(doc: Doc, id: string): Decl[] {
  const N = doc.nodes;
  const n = N[id];
  if (!n || n.type === 'page') return [];
  const p = N[n.parent];
  const out: Decl[] = [];
  const inFlow = !!p?.layout && !n.abs;
  if (!inFlow && p?.type !== 'page') {
    out.push(['position', 'absolute'], ['left', px(n.x)], ['top', px(n.y)]);
  }
  // Size: fixed is a length; fill stretches along the parent's flow; hug is left to the content.
  const horizontalParent = p?.layout?.dir === 'h';
  if (n.sw === 'fixed' || !inFlow) out.push(['width', px(n.w)]);
  else if (n.sw === 'fill')
    out.push(horizontalParent ? ['flex', '1 0 0'] : ['align-self', 'stretch']);
  if (n.type !== 'text' || n.sh === 'fixed') {
    if (n.sh === 'fixed' || (!inFlow && n.sh !== 'hug')) out.push(['height', px(n.h)]);
    else if (n.sh === 'fill')
      out.push(horizontalParent ? ['align-self', 'stretch'] : ['flex', '1 0 0']);
  }
  if (n.layout) {
    const L = n.layout;
    out.push(['display', 'flex'], ['flex-direction', L.dir === 'h' ? 'row' : 'column']);
    if (L.wrap) out.push(['flex-wrap', 'wrap']);
    out.push(['justify-content', JUSTIFY[L.justify]], ['align-items', ALIGN[L.align]]);
    if (L.justify !== 'between')
      out.push([
        'gap',
        L.wrap && (L.rowGap ?? L.gap) !== L.gap
          ? `${px(L.rowGap ?? L.gap)} ${px(L.gap)}`
          : px(L.gap),
      ]);
    const [t, r, b, l] = L.pad;
    if (t || r || b || l)
      out.push([
        'padding',
        t === b && l === r
          ? t === l
            ? px(t)
            : `${px(t)} ${px(r)}`
          : `${px(t)} ${px(r)} ${px(b)} ${px(l)}`,
      ]);
  }
  if (n.type === 'text' && n.font) {
    const f = n.font;
    if (n.fill) out.push(['color', color(doc, n.fill)]);
    out.push(
      ['font-family', `"${FAMILIES[f.family].label}"`],
      ['font-size', px(f.size)],
      ['font-style', 'normal'],
      ['font-weight', String(f.weight)],
      [
        'line-height',
        f.line
          ? `${px(lineHeight(f))} /* ${Math.round((lineHeight(f) / f.size) * 1000) / 10}% */`
          : 'normal',
      ],
    );
    if (f.tracking) out.push(['letter-spacing', px(f.tracking)]);
    if (f.align !== 'left') out.push(['text-align', f.align]);
    if (f.upper) out.push(['text-transform', 'uppercase']);
  } else if (n.type === 'image' && n.src) {
    out.push(['background', `url(${n.src}) center / cover no-repeat`]);
  } else if (n.fill) out.push(['background', color(doc, n.fill)]);
  if (n.stroke && n.stroke.width)
    out.push(['border', `${px(n.stroke.width)} solid ${color(doc, n.stroke)}`]);
  if (n.type === 'ellipse') out.push(['border-radius', '50%']);
  else if (n.radius) out.push(['border-radius', px(n.radius)]);
  if (n.shadow)
    out.push([
      'box-shadow',
      `${px(n.shadow.x)} ${px(n.shadow.y)} ${px(n.shadow.blur)} 0 ${rgba(n.shadow.color, n.shadow.opacity)}`,
    ]);
  if (n.clip && n.type === 'frame') out.push(['overflow', 'hidden']);
  if (n.opacity < 1) out.push(['opacity', String(Math.round(n.opacity * 100) / 100)]);
  if (n.rot) out.push(['transform', `rotate(${Math.round(n.rot * 100) / 100}deg)`]);
  return out;
}

/** The whole block as text, for the copy button. */
export function cssText(doc: Doc, id: string) {
  const n = doc.nodes[id];
  return `/* ${n?.name ?? ''} */\n${cssFor(doc, id)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n')}`;
}

/** Colour styles used anywhere inside a layer. */
export function colorsIn(doc: Doc, id: string) {
  const seen = new Map<string, { hex: string; name: string | null; opacity: number }>();
  const add = (p: Paint | null) => {
    if (!p) return;
    const style = p.style ? doc.colors.find((c) => c.id === p.style) : null;
    const key = `${p.color}|${p.opacity}`;
    if (!seen.has(key))
      seen.set(key, { hex: hexOf(p.color), name: style?.name ?? null, opacity: p.opacity });
  };
  const walk = (nid: string) => {
    const n: Node = doc.nodes[nid];
    if (!n || !n.visible) return;
    add(n.fill);
    add(n.stroke);
    n.children.forEach(walk);
  };
  walk(id);
  return [...seen.values()];
}
