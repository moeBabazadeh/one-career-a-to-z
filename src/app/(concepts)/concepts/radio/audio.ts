// What the speaker plays, off until asked for. Static through a filter shaped like the mode's
// audio passband; FM quietens it when a strong carrier sits in the passband, AM and SSB leave it.
// A GSM burst comes through an analogue demodulator as the 217 Hz TDMA buzz, and each decoded
// frame ticks. Built on the first click, since browsers only start audio from a gesture.
import { stationById, type Proto } from './stations';
import type { Lock, Rx } from './rx';

export class RadioAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private noise: GainNode;
  private shape: BiquadFilterNode;
  private buzz: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];

  constructor() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 0x2402;
    for (let i = 0; i < d.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      d[i] = seed / 2147483648 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.shape = ctx.createBiquadFilter();
    this.shape.type = 'bandpass';
    this.shape.frequency.value = 1400;
    this.shape.Q.value = 0.6;
    this.noise = ctx.createGain();
    this.noise.gain.value = 0;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    src.connect(this.shape).connect(this.noise).connect(this.master).connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 216.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    this.buzz = ctx.createGain();
    this.buzz.gain.value = 0;
    osc.connect(lp).connect(this.buzz).connect(this.master);
    src.start();
    osc.start();
    this.nodes.push(src, osc);
  }

  resume() {
    return this.ctx.resume();
  }

  /** Follows the receiver: called about ten times a second. */
  update(rx: Rx, lock: Lock, chan: number, overload: boolean) {
    const now = this.ctx.currentTime;
    const open = rx.running && rx.audio && !(rx.sql && lock.level < rx.sqlLevel);
    let noise = 0;
    let buzz = 0;
    if (open) {
      const strong = !!lock.station && lock.snr > 8;
      const burst = strong && chan > lock.level - 8;
      if (rx.mode === 'DIG') noise = 0.015;
      else if (rx.mode === 'NFM' || rx.mode === 'WFM') noise = strong ? 0.04 : 0.32;
      else noise = 0.2;
      if (overload) noise = 0.5;
      if (burst && lock.station && stationById[lock.station].proto === 'gsm' && rx.mode !== 'DIG')
        buzz = 0.16;
    }
    const wide = rx.mode === 'WFM';
    const ssb = rx.mode === 'USB' || rx.mode === 'LSB';
    this.shape.frequency.setTargetAtTime(wide ? 3000 : ssb ? 1500 : 1300, now, 0.05);
    this.shape.Q.setTargetAtTime(wide ? 0.3 : ssb ? 1.1 : 0.7, now, 0.05);
    this.master.gain.setTargetAtTime(open ? rx.volume * 0.5 : 0, now, 0.04);
    this.noise.gain.setTargetAtTime(noise, now, 0.03);
    this.buzz.gain.setTargetAtTime(buzz, now, 0.015);
  }

  /** Silence while the receiver isn't drawing (off screen, hidden or stopped). */
  mute() {
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
  }

  /** A tick for a decoded frame, voiced by the radio it came from. */
  blip(proto: Proto) {
    if (this.master.gain.value < 0.001) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const [type, f, len]: [OscillatorType, number, number] =
      proto === 'ble'
        ? ['sine', 2400, 0.018]
        : proto === 'gsm'
          ? ['square', 433, 0.03]
          : proto === 'wifi'
            ? ['triangle', 1800, 0.012]
            : ['sine', 847, 0.022];
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + len + 0.01);
  }

  close() {
    this.nodes.forEach((n) => n.stop());
    void this.ctx.close();
  }
}
