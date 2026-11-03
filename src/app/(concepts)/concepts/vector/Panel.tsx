'use client';

// The right panel. Design edits the selection's real properties (position, size and sizing,
// auto layout that lays the children out again, fills, strokes, effects, type, components);
// Prototype edits its interactions; Inspect shows the CSS for it.

import { useState } from 'react';
import { refs } from './build';
import { ColorField, cx, Icon, IconButton, Num, Section, Select } from './controls';
import { colorsIn, cssFor, cssText } from './css';
import { iconFor } from './Layers';
import {
  componentName,
  FAMILIES,
  inInstance,
  instanceRoot,
  isTop,
  mainOf,
  lineHeight,
  WEIGHT_NAMES,
  type Anim,
  type Dir,
  type Ease,
  type FamilyId,
  type Font,
  type Link,
  type Node,
  type Sizing,
} from './model';
import { rasterize } from './paint';
import {
  addAutoLayout,
  alignTo,
  canEdit,
  createComponent,
  detachInstanceAt,
  goToMain,
  play,
  resetInstance,
  set,
  setColorStyle,
  setFlow,
  setFont,
  setLayout,
  setLink,
  setTextStyle,
  swapVariant,
  update,
  useSlice,
} from './store';
import { instancesOf, variantsOf } from './sync';
import s from './vector.module.scss';

const same = <T,>(vals: T[]): T | null =>
  vals.length && vals.every((v) => v === vals[0]) ? vals[0] : null;

/* ------------------------------------------------------------------ tabs */

export function RightTabs() {
  const tab = useSlice((st) => st.tab);
  return (
    <div className={s.tabs} role="tablist" aria-label="Properties">
      {(['design', 'prototype', 'inspect'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          className={s.tab}
          onClick={() => set({ tab: t })}
        >
          {t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

export function RightPanel() {
  const tab = useSlice((st) => st.tab);
  return (
    <div className={s.panelBody} role="tabpanel">
      {tab === 'design' && <DesignTab />}
      {tab === 'prototype' && <PrototypeTab />}
      {tab === 'inspect' && <InspectTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ design */

function DesignTab() {
  const doc = useSlice((st) => st.doc);
  const sel = useSlice((st) => st.sel);
  const N = doc.nodes;
  const nodes = sel.map((id) => N[id]).filter(Boolean);
  if (!nodes.length) return <NoSelection />;
  const one = nodes.length === 1 ? nodes[0] : null;
  const frozen = nodes.some((n) => inInstance(N, n.id));
  const parentLayout = same(nodes.map((n) => !!N[n.parent]?.layout && !n.abs));
  const allText = nodes.every((n) => n.type === 'text');
  const frames = nodes.filter((n) => n.type === 'frame');
  const num = (k: 'x' | 'y' | 'w' | 'h' | 'rot' | 'radius' | 'opacity') =>
    same(nodes.map((n) => Math.round(n[k] * 100) / 100));
  const typeLabel = one
    ? one.comp
      ? 'Component'
      : one.main
        ? 'Instance'
        : one.set
          ? 'Component set'
          : {
              frame: 'Frame',
              rect: 'Rectangle',
              ellipse: 'Ellipse',
              text: 'Text',
              image: 'Image',
              page: 'Page',
            }[one.type]
    : `${nodes.length} layers`;
  return (
    <>
      <div className={s.selHead}>
        {one && <Icon name={iconFor(one)} size={14} />}
        <span className={s.selName}>{one ? one.name : 'Mixed selection'}</span>
        <span className={s.selType}>{typeLabel}</span>
      </div>
      {one && (one.main || one.comp) && <ComponentSection node={one} />}
      {!one?.comp &&
        frames.length === 1 &&
        !frames[0].main &&
        !frames[0].ref &&
        one &&
        !one.set &&
        !mainOf(N, one.id) && (
          <div className={s.inlineActions}>
            <button
              type="button"
              className={s.textBtn}
              onClick={createComponent}
              title="Create component (⌥⌘K)"
            >
              <Icon name="component" size={13} /> Create component
            </button>
          </div>
        )}
      <Section title="Position">
        <div className={s.alignRow} role="group" aria-label="Align">
          <IconButton
            icon="alignL"
            label="Align left"
            kbd="⌥A"
            onClick={() => alignTo('left')}
            disabled={frozen}
          />
          <IconButton
            icon="alignHC"
            label="Align horizontal centres"
            kbd="⌥H"
            onClick={() => alignTo('hcenter')}
            disabled={frozen}
          />
          <IconButton
            icon="alignR"
            label="Align right"
            kbd="⌥D"
            onClick={() => alignTo('right')}
            disabled={frozen}
          />
          <IconButton
            icon="alignT"
            label="Align top"
            kbd="⌥W"
            onClick={() => alignTo('top')}
            disabled={frozen}
          />
          <IconButton
            icon="alignVC"
            label="Align vertical centres"
            kbd="⌥V"
            onClick={() => alignTo('vcenter')}
            disabled={frozen}
          />
          <IconButton
            icon="alignB"
            label="Align bottom"
            kbd="⌥S"
            onClick={() => alignTo('bottom')}
            disabled={frozen}
          />
        </div>
        <div className={s.grid2}>
          <Num
            label="X"
            title="X position"
            value={num('x')}
            onChange={(v, live) => update({ x: v }, live)}
            disabled={frozen || parentLayout === true}
          />
          <Num
            label="Y"
            title="Y position"
            value={num('y')}
            onChange={(v, live) => update({ y: v }, live)}
            disabled={frozen || parentLayout === true}
          />
          <Num
            label={<Icon name="rotate" size={12} />}
            title="Rotation"
            value={num('rot')}
            suffix="°"
            onChange={(v, live) => update({ rot: ((((v + 180) % 360) + 360) % 360) - 180 }, live)}
            disabled={frozen}
          />
          {one && parentLayout && <span className={s.note}>Position is set by auto layout</span>}
        </div>
      </Section>
      <Section title="Layout">
        <div className={s.grid2}>
          <Num
            label="W"
            title="Width"
            value={num('w')}
            min={1}
            onChange={(v, live) =>
              update(
                (n) => ({ w: v, ...(n.sw !== 'fixed' ? { sw: 'fixed' as Sizing } : {}) }),
                live,
              )
            }
            disabled={frozen}
          />
          <Num
            label="H"
            title="Height"
            value={num('h')}
            min={1}
            onChange={(v, live) =>
              update(
                (n) => ({ h: v, ...(n.sh !== 'fixed' ? { sh: 'fixed' as Sizing } : {}) }),
                live,
              )
            }
            disabled={frozen}
          />
          <SizingSelect nodes={nodes} axis="sw" disabled={frozen} />
          <SizingSelect nodes={nodes} axis="sh" disabled={frozen} />
        </div>
      </Section>
      {frames.length > 0 && frames.length === nodes.length && (
        <AutoLayoutSection nodes={frames} disabled={frozen} />
      )}
      <Section title="Appearance">
        <div className={s.grid2}>
          <Num
            label={<Icon name="eye" size={12} />}
            title="Layer opacity"
            value={num('opacity')}
            percent
            suffix="%"
            min={0}
            max={1}
            step={0.01}
            onChange={(v, live) => update({ opacity: v }, live)}
          />
          {!allText && (
            <Num
              label={<Icon name="radius" size={12} />}
              title="Corner radius"
              value={num('radius')}
              min={0}
              onChange={(v, live) => update({ radius: v }, live)}
              disabled={frozen && !canEdit(nodes[0].id, ['radius'])}
            />
          )}
        </div>
        {frames.length === nodes.length && (
          <label className={s.check}>
            <input
              type="checkbox"
              checked={frames.every((f) => f.clip)}
              disabled={frozen}
              onChange={(e) => update({ clip: e.target.checked })}
            />
            Clip content
          </label>
        )}
      </Section>
      {allText && <TextSection nodes={nodes} />}
      <FillSection nodes={nodes} />
      <StrokeSection nodes={nodes} />
      {!allText && <EffectsSection nodes={nodes} />}
      {one && <ExportSection node={one} />}
    </>
  );
}

function SizingSelect({
  nodes,
  axis,
  disabled,
}: {
  nodes: Node[];
  axis: 'sw' | 'sh';
  disabled?: boolean;
}) {
  const doc = useSlice((st) => st.doc);
  const N = doc.nodes;
  const canHug = nodes.every((n) => (n.type === 'frame' && n.layout) || n.type === 'text');
  const canFill = nodes.every((n) => !!N[n.parent]?.layout && !isTop(N, n.id));
  const options: { value: Sizing; label: string }[] = [
    { value: 'fixed', label: axis === 'sw' ? 'Fixed width' : 'Fixed height' },
  ];
  if (canHug)
    options.push({
      value: 'hug',
      label: nodes.every((n) => n.type === 'text')
        ? axis === 'sw'
          ? 'Auto width'
          : 'Auto height'
        : 'Hug contents',
    });
  if (canFill) options.push({ value: 'fill', label: 'Fill container' });
  const v = same(nodes.map((n) => n[axis]));
  if (options.length < 2) return <span />;
  return (
    <Select
      value={v ?? ''}
      options={options}
      label={axis === 'sw' ? 'Horizontal resizing' : 'Vertical resizing'}
      disabled={disabled}
      onChange={(val) => update({ [axis]: val })}
    />
  );
}

function AutoLayoutSection({ nodes, disabled }: { nodes: Node[]; disabled?: boolean }) {
  const L = nodes[0].layout;
  const all = nodes.every((n) => n.layout);
  const [split, setSplit] = useState(false);
  if (!L || !all) {
    return (
      <Section
        title="Auto layout"
        actions={
          <IconButton
            icon="plus"
            label="Add auto layout"
            kbd="⇧A"
            onClick={addAutoLayout}
            disabled={disabled}
          />
        }
      >
        <p className={s.hint}>
          Stack the children with a gap and padding, and let them resize with their content.
        </p>
      </Section>
    );
  }
  const [pt, pr, pb, pl] = L.pad;
  const rows = ['start', 'center', 'end'] as const;
  return (
    <Section
      title="Auto layout"
      actions={
        <IconButton
          icon="minus"
          label="Remove auto layout"
          kbd="⌥⇧A"
          onClick={() => setLayout(null)}
          disabled={disabled}
        />
      }
    >
      <div className={s.alRow}>
        <div className={s.seg} role="group" aria-label="Direction">
          <IconButton
            icon="alV"
            label="Vertical"
            pressed={L.dir === 'v'}
            onClick={() => setLayout({ dir: 'v', wrap: false })}
            disabled={disabled}
          />
          <IconButton
            icon="alH"
            label="Horizontal"
            pressed={L.dir === 'h' && !L.wrap}
            onClick={() => setLayout({ dir: 'h', wrap: false })}
            disabled={disabled}
          />
          <IconButton
            icon="wrap"
            label="Wrap"
            pressed={L.dir === 'h' && !!L.wrap}
            onClick={() => setLayout({ dir: 'h', wrap: true, rowGap: L.rowGap ?? L.gap })}
            disabled={disabled}
          />
        </div>
      </div>
      <div className={s.alBody}>
        <div className={s.alGrid} role="group" aria-label="Alignment">
          {rows.map((r) =>
            rows.map((c) => {
              // Vertical stacks: columns align, rows justify. Horizontal: the other way round.
              const align = L.dir === 'v' ? c : r;
              const justify = L.dir === 'v' ? r : c;
              const on =
                L.align === align &&
                (L.justify === justify || (L.justify === 'between' && justify === 'start'));
              return (
                <button
                  key={`${r}${c}`}
                  type="button"
                  className={s.alCell}
                  aria-pressed={on}
                  aria-label={`Align ${r} ${c}`}
                  disabled={disabled}
                  onClick={() =>
                    setLayout({ align, justify: L.justify === 'between' ? 'between' : justify })
                  }
                >
                  <span data-dir={L.dir} />
                </button>
              );
            }),
          )}
        </div>
        <div className={s.alNums}>
          <Num
            label={<Icon name={L.dir === 'v' ? 'rows' : 'cols'} size={12} />}
            title="Gap between items"
            value={L.justify === 'between' ? null : L.gap}
            min={0}
            onChange={(v, live) =>
              setLayout({ gap: v, justify: L.justify === 'between' ? 'start' : L.justify }, live)
            }
            disabled={disabled}
          />
          {L.wrap && (
            <Num
              label="↕"
              title="Gap between rows"
              value={L.rowGap ?? L.gap}
              min={0}
              onChange={(v, live) => setLayout({ rowGap: v }, live)}
              disabled={disabled}
            />
          )}
          <label className={s.check}>
            <input
              type="checkbox"
              checked={L.justify === 'between'}
              disabled={disabled}
              onChange={(e) => setLayout({ justify: e.target.checked ? 'between' : 'start' })}
            />
            Space between
          </label>
        </div>
      </div>
      <div className={s.grid2}>
        {split ? (
          <>
            <Num
              label="T"
              title="Padding top"
              value={pt}
              min={0}
              onChange={(v, live) => setLayout({ pad: [v, pr, pb, pl] }, live)}
              disabled={disabled}
            />
            <Num
              label="R"
              title="Padding right"
              value={pr}
              min={0}
              onChange={(v, live) => setLayout({ pad: [pt, v, pb, pl] }, live)}
              disabled={disabled}
            />
            <Num
              label="B"
              title="Padding bottom"
              value={pb}
              min={0}
              onChange={(v, live) => setLayout({ pad: [pt, pr, v, pl] }, live)}
              disabled={disabled}
            />
            <Num
              label="L"
              title="Padding left"
              value={pl}
              min={0}
              onChange={(v, live) => setLayout({ pad: [pt, pr, pb, v] }, live)}
              disabled={disabled}
            />
          </>
        ) : (
          <>
            <Num
              label="↔"
              title="Horizontal padding"
              value={pl === pr ? pl : null}
              min={0}
              onChange={(v, live) => setLayout({ pad: [pt, v, pb, v] }, live)}
              disabled={disabled}
            />
            <Num
              label="↕"
              title="Vertical padding"
              value={pt === pb ? pt : null}
              min={0}
              onChange={(v, live) => setLayout({ pad: [v, pr, v, pl] }, live)}
              disabled={disabled}
            />
          </>
        )}
        <button
          type="button"
          className={cx(s.textBtn, s.span2)}
          aria-pressed={split}
          onClick={() => setSplit(!split)}
        >
          {split ? 'Fewer padding fields' : 'Padding per side'}
        </button>
      </div>
    </Section>
  );
}

function TextSection({ nodes }: { nodes: Node[] }) {
  const doc = useSlice((st) => st.doc);
  const f = nodes[0].font as Font;
  const frozen = nodes.some((n) => !canEdit(n.id, ['font']));
  const style = same(nodes.map((n) => n.font?.style ?? ''));
  const styleObj = style ? doc.texts.find((t) => t.id === style) : null;
  const sizing = same(
    nodes.map((n) => (n.sw === 'hug' ? 'auto' : n.sh === 'hug' ? 'height' : 'fixed')),
  );
  const fam = FAMILIES[f.family];
  return (
    <Section title="Text">
      <div className={s.styleRow}>
        <Select
          value={style === null ? '' : style || 'none'}
          options={[
            { value: 'none', label: 'No text style' },
            ...doc.texts.map((t) => ({ value: t.id, label: t.name })),
          ]}
          label="Text style"
          disabled={frozen}
          onChange={(v) => {
            const t = doc.texts.find((x) => x.id === v);
            if (t) update((n) => ({ font: { ...(n.font as Font), ...t.font, style: t.id } }));
            else update((n) => ({ font: { ...(n.font as Font), style: undefined } }));
          }}
        />
      </div>
      {styleObj && (
        <p className={s.hint}>
          Linked to <b>{styleObj.name}</b>. Changing a property here detaches it; edit the style
          itself with nothing selected.
        </p>
      )}
      <Select
        value={f.family}
        options={(Object.keys(FAMILIES) as FamilyId[]).map((k) => ({
          value: k,
          label: FAMILIES[k].label,
        }))}
        label="Font family"
        disabled={frozen}
        onChange={(v) =>
          setFont({
            family: v,
            weight: (FAMILIES[v].weights as readonly number[]).includes(f.weight) ? f.weight : 400,
          })
        }
      />
      <div className={s.grid2}>
        <Select
          value={String(f.weight)}
          options={fam.weights.map((w) => ({ value: String(w), label: WEIGHT_NAMES[w] }))}
          label="Font weight"
          disabled={frozen}
          onChange={(v) => setFont({ weight: Number(v) })}
        />
        <Num
          label="Aa"
          title="Font size"
          value={same(nodes.map((n) => n.font?.size ?? 0))}
          min={1}
          onChange={(v, live) => setFont({ size: v }, live)}
          disabled={frozen}
        />
        <Num
          label="↕"
          title="Line height (0 is auto)"
          value={same(nodes.map((n) => (n.font ? lineHeight(n.font) : 0)))}
          min={0}
          onChange={(v, live) => setFont({ line: v }, live)}
          disabled={frozen}
        />
        <Num
          label="|A|"
          title="Letter spacing"
          value={same(nodes.map((n) => n.font?.tracking ?? 0))}
          step={0.1}
          onChange={(v, live) => setFont({ tracking: v }, live)}
          disabled={frozen}
        />
      </div>
      <div className={s.alRow}>
        <div className={s.seg} role="group" aria-label="Text alignment">
          <IconButton
            icon="alignLeft"
            label="Align left"
            pressed={f.align === 'left'}
            onClick={() => setFont({ align: 'left' })}
            disabled={frozen}
          />
          <IconButton
            icon="alignCenter"
            label="Align centre"
            pressed={f.align === 'center'}
            onClick={() => setFont({ align: 'center' })}
            disabled={frozen}
          />
          <IconButton
            icon="alignRight"
            label="Align right"
            pressed={f.align === 'right'}
            onClick={() => setFont({ align: 'right' })}
            disabled={frozen}
          />
        </div>
        <div className={s.seg} role="group" aria-label="Resizing">
          <IconButton
            icon="hug"
            label="Auto width"
            pressed={sizing === 'auto'}
            onClick={() => update({ sw: 'hug', sh: 'hug' })}
            disabled={nodes.some((n) => inInstance(doc.nodes, n.id))}
          />
          <IconButton
            icon="alignLeft"
            label="Auto height"
            pressed={sizing === 'height'}
            onClick={() => update((n) => ({ sw: n.sw === 'hug' ? 'fixed' : n.sw, sh: 'hug' }))}
            disabled={nodes.some((n) => inInstance(doc.nodes, n.id))}
          />
          <IconButton
            icon="fixed"
            label="Fixed size"
            pressed={sizing === 'fixed'}
            onClick={() => update((n) => ({ sw: n.sw === 'hug' ? 'fixed' : n.sw, sh: 'fixed' }))}
            disabled={nodes.some((n) => inInstance(doc.nodes, n.id))}
          />
        </div>
        <IconButton
          icon="text"
          label="Uppercase"
          pressed={!!f.upper}
          onClick={() => setFont({ upper: !f.upper })}
          disabled={frozen}
        />
      </div>
    </Section>
  );
}

function FillSection({ nodes }: { nodes: Node[] }) {
  const doc = useSlice((st) => st.doc);
  const fills = nodes.map((n) => n.fill);
  const frozen = nodes.some((n) => !canEdit(n.id, ['fill']));
  const f = fills[0];
  const mixed = !fills.every((x) => (x ? x.color === f?.color && x.opacity === f?.opacity : !f));
  const images = nodes.filter((n) => n.type === 'image');
  return (
    <Section
      title={nodes.every((n) => n.type === 'text') ? 'Text colour' : 'Fill'}
      actions={
        f ? (
          <IconButton
            icon="minus"
            label="Remove fill"
            onClick={() => update({ fill: null })}
            disabled={frozen}
          />
        ) : (
          <IconButton
            icon="plus"
            label="Add fill"
            onClick={() => update({ fill: { color: '#D9D9D9', opacity: 1 } })}
            disabled={frozen}
          />
        )
      }
    >
      {images.length > 0 && images.length === nodes.length && (
        <p className={s.hint}>Image fill, cropped to cover. {images[0].src?.split('/').pop()}</p>
      )}
      {f && !mixed && (
        <ColorField
          label="Fill"
          hex={f.color}
          opacity={f.opacity}
          disabled={frozen}
          styleName={f.style ? doc.colors.find((c) => c.id === f.style)?.name : null}
          styles={doc.colors}
          onStyle={(id) =>
            update({
              fill: { color: doc.colors.find((c) => c.id === id)!.color, opacity: 1, style: id },
            })
          }
          onDetach={() =>
            update((n) => ({
              fill: n.fill ? { color: n.fill.color, opacity: n.fill.opacity } : null,
            }))
          }
          onChange={(hex, opacity, live) => update({ fill: { color: hex, opacity } }, live)}
        />
      )}
      {mixed && <p className={s.hint}>Click + to replace mixed fills.</p>}
    </Section>
  );
}

function StrokeSection({ nodes }: { nodes: Node[] }) {
  const doc = useSlice((st) => st.doc);
  const st = nodes[0].stroke;
  const frozen = nodes.some((n) => !canEdit(n.id, ['stroke']));
  return (
    <Section
      title="Stroke"
      actions={
        st ? (
          <IconButton
            icon="minus"
            label="Remove stroke"
            onClick={() => update({ stroke: null })}
            disabled={frozen}
          />
        ) : (
          <IconButton
            icon="plus"
            label="Add stroke"
            onClick={() => update({ stroke: { color: '#151513', opacity: 1, width: 1 } })}
            disabled={frozen}
          />
        )
      }
    >
      {st && (
        <>
          <ColorField
            label="Stroke"
            hex={st.color}
            opacity={st.opacity}
            disabled={frozen}
            styleName={st.style ? doc.colors.find((c) => c.id === st.style)?.name : null}
            styles={doc.colors}
            onStyle={(id) =>
              update((n) => ({
                stroke: {
                  width: n.stroke?.width ?? 1,
                  color: doc.colors.find((c) => c.id === id)!.color,
                  opacity: 1,
                  style: id,
                },
              }))
            }
            onDetach={() =>
              update((n) =>
                n.stroke
                  ? {
                      stroke: {
                        color: n.stroke.color,
                        opacity: n.stroke.opacity,
                        width: n.stroke.width,
                      },
                    }
                  : {},
              )
            }
            onChange={(hex, opacity, live) =>
              update(
                (n) => ({ stroke: { width: n.stroke?.width ?? 1, color: hex, opacity } }),
                live,
              )
            }
          />
          <div className={s.grid2}>
            <Num
              label="≡"
              title="Stroke width (inside)"
              value={same(nodes.map((n) => n.stroke?.width ?? 0))}
              min={0}
              step={0.5}
              onChange={(v, live) =>
                update((n) => (n.stroke ? { stroke: { ...n.stroke, width: v } } : {}), live)
              }
              disabled={frozen}
            />
            <span className={s.note}>Inside</span>
          </div>
        </>
      )}
    </Section>
  );
}

function EffectsSection({ nodes }: { nodes: Node[] }) {
  const sh = nodes[0].shadow;
  const frozen = nodes.some((n) => !canEdit(n.id, ['shadow']));
  return (
    <Section
      title="Effects"
      actions={
        sh ? (
          <IconButton
            icon="minus"
            label="Remove drop shadow"
            onClick={() => update({ shadow: null })}
            disabled={frozen}
          />
        ) : (
          <IconButton
            icon="plus"
            label="Add drop shadow"
            onClick={() =>
              update({ shadow: { x: 0, y: 4, blur: 16, color: '#000000', opacity: 0.12 } })
            }
            disabled={frozen}
          />
        )
      }
    >
      {sh && (
        <>
          <p className={s.effectName}>
            <Icon name="shadow" size={13} /> Drop shadow
          </p>
          <div className={s.grid2}>
            <Num
              label="X"
              title="Shadow X"
              value={sh.x}
              onChange={(v, live) =>
                update((n) => (n.shadow ? { shadow: { ...n.shadow, x: v } } : {}), live)
              }
              disabled={frozen}
            />
            <Num
              label="Y"
              title="Shadow Y"
              value={sh.y}
              onChange={(v, live) =>
                update((n) => (n.shadow ? { shadow: { ...n.shadow, y: v } } : {}), live)
              }
              disabled={frozen}
            />
            <Num
              label="B"
              title="Shadow blur"
              value={sh.blur}
              min={0}
              onChange={(v, live) =>
                update((n) => (n.shadow ? { shadow: { ...n.shadow, blur: v } } : {}), live)
              }
              disabled={frozen}
            />
            <Num
              label="%"
              title="Shadow opacity"
              value={sh.opacity}
              percent
              suffix="%"
              min={0}
              max={1}
              step={0.01}
              onChange={(v, live) =>
                update((n) => (n.shadow ? { shadow: { ...n.shadow, opacity: v } } : {}), live)
              }
              disabled={frozen}
            />
          </div>
        </>
      )}
    </Section>
  );
}

function ExportSection({ node }: { node: Node }) {
  const doc = useSlice((st) => st.doc);
  const [scale, setScale] = useState('2');
  return (
    <Section title="Export">
      <div className={s.exportRow}>
        <Select
          value={scale}
          options={['0.5', '1', '2', '3', '4'].map((v) => ({ value: v, label: `${v}x` }))}
          label="Export scale"
          onChange={setScale}
        />
        <span className={s.note}>PNG</span>
      </div>
      <button
        type="button"
        className={s.wideBtn}
        onClick={() => {
          const c = rasterize(doc.nodes, node.id, Number(scale));
          const a = document.createElement('a');
          a.href = c.toDataURL('image/png');
          a.download = `${node.name.replace(/[^\w-]+/g, ' ').trim() || 'layer'}@${scale}x.png`;
          a.click();
        }}
      >
        Export {node.name}
      </button>
    </Section>
  );
}

function ComponentSection({ node }: { node: Node }) {
  const doc = useSlice((st) => st.doc);
  const N = doc.nodes;
  if (node.comp) {
    const count = instancesOf(N, node.id).length;
    return (
      <Section title="Main component">
        <p className={s.compLine}>
          <Icon name="component" size={13} /> {componentName(N, node.id)}
          {node.comp.set && (
            <span className={s.selType}>
              {Object.entries(node.comp.props)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')}
            </span>
          )}
        </p>
        <p className={s.hint}>
          {count === 1 ? 'One instance follows' : `${count} instances follow`} this component.
          Change anything here and they update; their own text and links stay.
        </p>
      </Section>
    );
  }
  const root = instanceRoot(N, node.id) ?? node.id;
  const nested = N[N[node.id].parent]?.ref;
  const main = N[node.main as string];
  const variants = main ? variantsOf(N, main.id) : [];
  const props = main?.comp?.props ?? {};
  const keys = [...new Set(variants.flatMap((v) => Object.keys(v.props)))];
  return (
    <Section title="Instance">
      <p className={s.compLine}>
        <Icon name="instance" size={13} /> {componentName(N, node.main)}
      </p>
      {!nested &&
        keys.map((k) => {
          const values = [...new Set(variants.map((v) => v.props[k]).filter(Boolean))];
          return (
            <div className={s.propRow} key={k}>
              <span className={s.propName}>{k}</span>
              <Select
                value={props[k] ?? ''}
                options={values.map((v) => ({ value: v, label: v }))}
                label={k}
                onChange={(v) => {
                  const want = { ...props, [k]: v };
                  const exact = variants.find((x) =>
                    Object.keys(want).every((kk) => x.props[kk] === want[kk]),
                  );
                  const near = exact ?? variants.find((x) => x.props[k] === v);
                  if (near) swapVariant(node.id, near.id);
                }}
              />
            </div>
          );
        })}
      {nested && (
        <p className={s.hint}>
          Part of the instance {N[root]?.name}. Variants are swapped on the main screen.
        </p>
      )}
      <div className={s.inlineActions}>
        <button type="button" className={s.textBtn} onClick={() => goToMain(node.id)}>
          <Icon name="target" size={13} /> Go to main
        </button>
        {!nested && (
          <>
            <button type="button" className={s.textBtn} onClick={() => resetInstance(node.id)}>
              <Icon name="reset" size={13} /> Reset
            </button>
            <button
              type="button"
              className={s.textBtn}
              onClick={() => detachInstanceAt(node.id)}
              title="Detach instance (⌥⌘B)"
            >
              <Icon name="detach" size={13} /> Detach
            </button>
          </>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ nothing selected: the page and its styles */

function NoSelection() {
  const doc = useSlice((st) => st.doc);
  const page = useSlice((st) => st.page);
  const [openText, setOpenText] = useState<string | null>(null);
  return (
    <>
      <Section title="Page">
        <p className={s.hint}>
          {doc.nodes[page].name}: {doc.nodes[page].children.length} top-level{' '}
          {doc.nodes[page].children.length === 1 ? 'layer' : 'layers'}. Click a frame’s name on the
          canvas to select it.
        </p>
      </Section>
      <Section title="Colour styles">
        <p className={s.hint}>Edit a style and every layer linked to it follows.</p>
        {doc.colors.map((c) => (
          <div key={c.id} className={s.styleItem}>
            <ColorField
              label={c.name}
              hex={c.color}
              opacity={1}
              styleName={null}
              onChange={(hex, _o, live) => setColorStyle(c.id, hex, live)}
            />
            <span className={s.styleLabel}>{c.name}</span>
          </div>
        ))}
      </Section>
      <Section title="Text styles">
        {doc.texts.map((t) => (
          <div key={t.id} className={s.textStyle}>
            <button
              type="button"
              className={s.textStyleBtn}
              aria-expanded={openText === t.id}
              onClick={() => setOpenText(openText === t.id ? null : t.id)}
            >
              <span
                className={s.textStyleAg}
                style={{
                  fontFamily: `var(${FAMILIES[t.font.family].css})`,
                  fontWeight: t.font.weight,
                }}
              >
                Ag
              </span>
              <span className={s.styleLabel}>{t.name}</span>
              <span className={s.selType}>
                {t.font.size}/{t.font.line || 'auto'}
              </span>
            </button>
            {openText === t.id && (
              <div className={s.grid2}>
                <Select
                  value={String(t.font.weight)}
                  options={FAMILIES[t.font.family].weights.map((w) => ({
                    value: String(w),
                    label: WEIGHT_NAMES[w],
                  }))}
                  label="Weight"
                  onChange={(v) => setTextStyle(t.id, { weight: Number(v) })}
                />
                <Num
                  label="Aa"
                  title="Size"
                  value={t.font.size}
                  min={1}
                  onChange={(v, live) => setTextStyle(t.id, { size: v }, live)}
                />
                <Num
                  label="↕"
                  title="Line height"
                  value={t.font.line}
                  min={0}
                  onChange={(v, live) => setTextStyle(t.id, { line: v }, live)}
                />
                <Num
                  label="|A|"
                  title="Letter spacing"
                  value={t.font.tracking}
                  step={0.1}
                  onChange={(v, live) => setTextStyle(t.id, { tracking: v }, live)}
                />
              </div>
            )}
          </div>
        ))}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ prototype */

const ANIMS: { value: Anim; label: string }[] = [
  { value: 'instant', label: 'Instant' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'smart', label: 'Smart animate' },
  { value: 'move', label: 'Move in' },
  { value: 'push', label: 'Push' },
  { value: 'slide', label: 'Slide in' },
];

const EASES: { value: Ease; label: string }[] = [
  { value: 'out', label: 'Ease out' },
  { value: 'in-out', label: 'Ease in and out' },
  { value: 'in', label: 'Ease in' },
  { value: 'linear', label: 'Linear' },
];

function PrototypeTab() {
  const doc = useSlice((st) => st.doc);
  const sel = useSlice((st) => st.sel);
  const page = useSlice((st) => st.page);
  const N = doc.nodes;
  const tops = N[page].children.filter((c) => N[c].type === 'frame');
  const flows = Object.values(N).filter((n) => n.flow && N[n.parent]?.type === 'page');
  if (sel.length !== 1 || !N[sel[0]]) {
    return (
      <>
        <Section title="Flows">
          <p className={s.hint}>
            Each flow starts at a frame and follows its connections. Press Play to try it as the
            real site.
          </p>
          <ul className={s.flowList}>
            {flows.map((f) => (
              <li key={f.id}>
                <button type="button" className={s.flowBtn} onClick={() => play(f.id)}>
                  <Icon name="play" size={12} /> {f.flow}
                  <span className={s.selType}>{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
        {page !== refs.pages.prototype && (
          <Section title="This page">
            <p className={s.hint}>
              The wired screens live on the Prototype page, as instances of these frames.
            </p>
          </Section>
        )}
      </>
    );
  }
  const n = N[sel[0]];
  const link = n.link;
  const top = isTop(N, n.id);
  const childOfTop = N[n.parent] && isTop(N, n.parent);
  const change = (p: Partial<Link>) => setLink(n.id, { ...(link as Link), ...p });
  return (
    <>
      <Section
        title="Interactions"
        actions={
          link ? (
            <IconButton
              icon="minus"
              label="Remove interaction"
              onClick={() => setLink(n.id, null)}
            />
          ) : (
            <IconButton
              icon="plus"
              label="Add interaction"
              onClick={() =>
                setLink(n.id, {
                  action: 'navigate',
                  to: tops.find((t) => t !== n.id && !N[n.id].children.includes(t)) ?? tops[0],
                  anim: 'smart',
                  dir: 'left',
                  ms: 400,
                  ease: 'out',
                })
              }
            />
          )
        }
      >
        {!link && (
          <p className={s.hint}>Add an interaction to make {n.name} a hotspot in the prototype.</p>
        )}
        {link && (
          <div className={s.interaction}>
            <p className={s.trigger}>On click</p>
            <Select<Link['action']>
              value={link.action}
              label="Action"
              options={[
                { value: 'navigate', label: 'Navigate to' },
                { value: 'overlay', label: 'Open overlay' },
                { value: 'back', label: 'Back' },
                { value: 'close', label: 'Close overlay' },
                { value: 'url', label: 'Open link' },
              ]}
              onChange={(action) =>
                change({ action, ...(action === 'url' && !link.url ? { url: 'https://' } : {}) })
              }
            />
            {(link.action === 'navigate' || link.action === 'overlay') && (
              <Select
                value={link.to && N[link.to] ? link.to : ''}
                label="Destination"
                options={tops.map((t) => ({ value: t, label: N[t].name }))}
                onChange={(to) => change({ to })}
              />
            )}
            {link.action === 'url' && (
              <UrlField value={link.url ?? ''} onChange={(url) => change({ url })} />
            )}
            {link.action !== 'url' && link.action !== 'back' && (
              <>
                <Select
                  value={link.anim}
                  label="Animation"
                  options={ANIMS}
                  onChange={(anim) => change({ anim })}
                />
                {(link.anim === 'move' || link.anim === 'push' || link.anim === 'slide') && (
                  <div className={s.seg} role="group" aria-label="Direction">
                    {(['left', 'right', 'up', 'down'] as Dir[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={s.iconBtn}
                        aria-pressed={link.dir === d}
                        aria-label={`From the ${d === 'left' ? 'right' : d === 'right' ? 'left' : d === 'up' ? 'bottom' : 'top'}`}
                        onClick={() => change({ dir: d })}
                      >
                        {{ left: '←', right: '→', up: '↑', down: '↓' }[d]}
                      </button>
                    ))}
                  </div>
                )}
                {link.anim !== 'instant' && (
                  <div className={s.grid2}>
                    <Num
                      label="ms"
                      title="Duration"
                      value={link.ms}
                      min={0}
                      max={5000}
                      step={10}
                      onChange={(v, live) => (live ? undefined : change({ ms: v }))}
                    />
                    <Select
                      value={link.ease}
                      label="Easing"
                      options={EASES}
                      onChange={(ease) => change({ ease })}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Section>
      {top && n.type === 'frame' && (
        <Section
          title="Flow starting point"
          actions={
            n.flow ? (
              <IconButton
                icon="minus"
                label="Remove starting point"
                onClick={() => setFlow(n.id, undefined)}
              />
            ) : (
              <IconButton
                icon="plus"
                label="Add starting point"
                onClick={() => setFlow(n.id, `Flow ${flows.length + 1}`)}
              />
            )
          }
        >
          {n.flow ? (
            <div className={s.flowRow}>
              <input
                className={s.textInput}
                defaultValue={n.flow}
                aria-label="Flow name"
                onKeyDown={(e) => e.stopPropagation()}
                onBlur={(e) =>
                  e.currentTarget.value.trim() && setFlow(n.id, e.currentTarget.value.trim())
                }
              />
              <IconButton icon="play" label={`Play ${n.flow}`} onClick={() => play(n.id)} />
            </div>
          ) : (
            <p className={s.hint}>Make this frame the start of a flow.</p>
          )}
        </Section>
      )}
      {childOfTop && (
        <Section title="Scrolling">
          <label className={s.check}>
            <input
              type="checkbox"
              checked={!!n.fixed}
              onChange={(e) => update({ fixed: e.target.checked })}
              disabled={!canEdit(n.id, ['fixed']) && !!n.ref}
            />
            Fix position when scrolling
          </label>
        </Section>
      )}
    </>
  );
}

function UrlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className={s.textInput}
      defaultValue={value}
      key={value}
      aria-label="Link URL"
      onKeyDown={(e) => e.stopPropagation()}
      onBlur={(e) => e.currentTarget.value !== value && onChange(e.currentTarget.value)}
    />
  );
}

/* ------------------------------------------------------------------ inspect */

export function InspectTab() {
  const doc = useSlice((st) => st.doc);
  const sel = useSlice((st) => st.sel);
  const [copied, setCopied] = useState(false);
  const N = doc.nodes;
  const id = sel[sel.length - 1];
  const n = id ? N[id] : null;
  if (!n)
    return <p className={cx(s.hint, s.pad)}>Select a layer to see its CSS, colours and type.</p>;
  const decls = cssFor(doc, n.id);
  const colors = colorsIn(doc, n.id).slice(0, 12);
  const f = n.font;
  return (
    <>
      <Section title={n.name}>
        <p className={s.inspectMeta}>
          <Icon name={iconFor(n)} size={13} /> {Math.round(n.w * 100) / 100} ×{' '}
          {Math.round(n.h * 100) / 100}
          {n.main && <span className={s.selType}>Instance of {componentName(N, n.main)}</span>}
        </p>
      </Section>
      <Section
        title="CSS"
        actions={
          <button
            type="button"
            className={s.textBtn}
            onClick={() => {
              void navigator.clipboard?.writeText(cssText(doc, n.id)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              });
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy'}
          </button>
        }
      >
        <pre className={s.code} tabIndex={0} aria-label="Generated CSS">
          <code>
            <span className={s.codeComment}>{`/* ${n.name} */`}</span>
            {'\n'}
            {decls.map(([k, v]) => (
              <span key={k + v}>
                <span className={s.codeProp}>{k}</span>: <span className={s.codeVal}>{v}</span>;
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      </Section>
      {f && (
        <Section title="Typography">
          <dl className={s.dl}>
            <dt>Font</dt>
            <dd>{FAMILIES[f.family].label}</dd>
            <dt>Weight</dt>
            <dd>
              {WEIGHT_NAMES[f.weight]} {f.weight}
            </dd>
            <dt>Size</dt>
            <dd>{f.size}px</dd>
            <dt>Line height</dt>
            <dd>{f.line ? `${f.line}px` : 'Auto'}</dd>
            {f.style && (
              <>
                <dt>Style</dt>
                <dd>{doc.texts.find((t) => t.id === f.style)?.name}</dd>
              </>
            )}
          </dl>
        </Section>
      )}
      {colors.length > 0 && (
        <Section title="Colours">
          <ul className={s.colorList}>
            {colors.map((c) => (
              <li key={c.hex + c.opacity}>
                <span
                  className={s.dot}
                  style={{ '--c': c.hex, '--a': c.opacity } as React.CSSProperties}
                />
                <span>{c.name ?? c.hex}</span>
                <span className={s.selType}>
                  {c.hex}
                  {c.opacity < 1 ? ` · ${Math.round(c.opacity * 100)}%` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {n.type === 'text' && n.text && (
        <Section title="Content">
          <p className={s.content}>{n.text}</p>
        </Section>
      )}
      {n.link?.action === 'url' && n.link.url && (
        <Section title="Links to">
          <a className={s.link} href={n.link.url} target="_blank" rel="noreferrer">
            {n.link.url.replace(/^mailto:/, '')}
          </a>
        </Section>
      )}
      {n.type === 'image' && n.src && (
        <Section title="Asset">
          <a className={s.link} href={n.src} download>
            Download {n.src.split('/').pop()}
          </a>
        </Section>
      )}
    </>
  );
}
