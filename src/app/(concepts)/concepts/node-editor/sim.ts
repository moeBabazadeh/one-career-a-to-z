// The runtime behind the Flow Editor's canvas. Source nodes fire on their own clocks, messages
// travel the wires, nodes hold them for a moment (or for a career), switches route them, joins
// collect them, and debug nodes report them. Pure TypeScript: the page draws whatever is in flight.

import {
  FLOWS,
  outputsOf,
  type Flow,
  type FlowNode,
  type Json,
  type Msg,
  type Wire,
} from './flows';
import { nodeOf } from './geometry';

export interface Transit {
  flow: string;
  wire: Wire;
  t0: number;
  dur: number;
  msg: Msg;
}

export type SimEvent =
  | { type: 'busy'; flow: string; node: string; hold: number }
  | { type: 'debug'; flow: string; node: string; msg: Msg };

export type Duration = (flow: Flow, wire: Wire) => number;

interface Held {
  flow: Flow;
  node: FlowNode;
  until: number;
  msg: Msg;
}

const copy = (msg: Msg): Msg => ({ ...msg, payload: structuredClone(msg.payload) });

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sim {
  time = 0;
  transits: Transit[] = [];
  private held: Held[] = [];
  private timers = new Map<FlowNode, { flow: Flow; at: number }>();
  private counts = new Map<FlowNode, number>();
  private parts = new Map<FlowNode, Json[]>();
  private rand = mulberry32(2007);
  private flows = new Map(FLOWS.map((f) => [f.id, f]));

  /** Clears everything in flight and arms every source node: a full deploy. */
  start() {
    this.stop();
    for (const flow of FLOWS)
      for (const node of flow.nodes)
        if (node.every) this.timers.set(node, { flow, at: this.time + (node.first ?? 0.5) });
  }

  stop() {
    this.transits = [];
    this.held = [];
    this.timers.clear();
    this.parts.clear();
  }

  /** Fires a source by hand. With `instant`, the message runs to the end of the flow at once. */
  inject(
    flowId: string,
    nodeId: string,
    duration: Duration,
    opts: { instant?: boolean; payload?: Json } = {},
  ) {
    const out: SimEvent[] = [];
    this.fire(
      this.flows.get(flowId)!,
      nodeOf(flowId, nodeId),
      out,
      duration,
      opts.instant ?? false,
      opts.payload,
    );
    return out;
  }

  /** Every source fires once and runs to the end at once: the picture after one full cycle. */
  snapshot(duration: Duration) {
    const out: SimEvent[] = [];
    for (const flow of FLOWS)
      for (const node of flow.nodes) if (node.emit) this.fire(flow, node, out, duration, true);
    return out;
  }

  step(dt: number, duration: Duration) {
    const out: SimEvent[] = [];
    this.time += dt;
    const now = this.time;

    for (const [node, timer] of this.timers) {
      if (now < timer.at) continue;
      timer.at = Math.max(timer.at + node.every!, now);
      this.fire(timer.flow, node, out, duration, false);
    }

    const due = this.held.filter((h) => now >= h.until);
    if (due.length) {
      this.held = this.held.filter((h) => now < h.until);
      for (const h of due) this.release(h.flow, h.node, h.msg, out, duration, false);
    }

    const arrived = this.transits.filter((t) => now >= t.t0 + t.dur);
    if (arrived.length) {
      this.transits = this.transits.filter((t) => now < t.t0 + t.dur);
      for (const t of arrived)
        if (t.wire.kind !== 'feedback')
          this.enter(
            this.flows.get(t.flow)!,
            nodeOf(t.flow, t.wire.to),
            t.msg,
            out,
            duration,
            false,
          );
    }
    if (this.transits.length > 240) this.transits = this.transits.slice(-240);
    return out;
  }

  private id() {
    const hex = () =>
      Math.floor(this.rand() * 0x100000000)
        .toString(16)
        .padStart(8, '0');
    return hex() + hex();
  }

  private fire(
    flow: Flow,
    node: FlowNode,
    out: SimEvent[],
    duration: Duration,
    instant: boolean,
    payload?: Json,
  ) {
    const seq = this.counts.get(node) ?? 0;
    this.counts.set(node, seq + 1);
    const list = node.emit ?? [null];
    const msg: Msg = {
      _msgid: this.id(),
      topic: node.topic ?? flow.id,
      payload: structuredClone(payload ?? list[seq % list.length]),
      seq,
    };
    this.enter(flow, node, msg, out, duration, instant);
  }

  private enter(
    flow: Flow,
    node: FlowNode,
    msg: Msg,
    out: SimEvent[],
    duration: Duration,
    instant: boolean,
  ) {
    if (node.kind === 'debug') {
      out.push(
        { type: 'busy', flow: flow.id, node: node.id, hold: 0 },
        { type: 'debug', flow: flow.id, node: node.id, msg },
      );
      return;
    }
    const hold = instant ? 0 : (node.hold ?? (node.every ? 0.08 : 0.14));
    out.push({ type: 'busy', flow: flow.id, node: node.id, hold });
    if (hold > 0) this.held.push({ flow, node, msg, until: this.time + hold });
    else this.release(flow, node, msg, out, duration, instant);
  }

  private release(
    flow: Flow,
    node: FlowNode,
    msg: Msg,
    out: SimEvent[],
    duration: Duration,
    instant: boolean,
  ) {
    if (node.set) msg.payload = node.set(msg.payload);
    if (node.join) {
      const parts = [...(this.parts.get(node) ?? []), msg.payload];
      if (parts.length < node.join) {
        this.parts.set(node, parts);
        return;
      }
      this.parts.delete(node);
      msg.payload = parts;
    }
    const port = node.route && outputsOf(node) > 1 ? node.route(msg) : 0;
    for (const wire of flow.wires) {
      if (wire.from !== node.id || (!wire.kind && wire.port !== port)) continue;
      if (!instant)
        this.transits.push({
          flow: flow.id,
          wire,
          t0: this.time,
          dur: duration(flow, wire),
          msg: copy(msg),
        });
      else if (wire.kind !== 'feedback')
        this.enter(flow, nodeOf(flow.id, wire.to), copy(msg), out, duration, true);
    }
  }
}
