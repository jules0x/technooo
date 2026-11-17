import { AudioEngine } from './engine';

export interface SampleDef {
  id: string;
  label: string;
  color: string;
}

export const ELECTRO_SAMPLES: SampleDef[] = [
  { id: 'radio', label: 'RADIO', color: '#10b981' },
  { id: 'telemetry', label: 'TELEMETRY', color: '#38bdf8' },
  { id: 'vinyl', label: 'VINYL', color: '#f59e0b' },
  { id: 'riser', label: 'RISER', color: '#a855f7' },
  { id: 'subboom', label: 'SUB BOOM', color: '#6366f1' },
  { id: 'sonar', label: 'SONAR', color: '#ec4899' },
];

const buffers: AudioBuffer[] = [];

function buildRadioStaticBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 0.45;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  let bp = 0;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.01) * Math.pow(1 - i / len, 1.3);
    const white = Math.random() * 2 - 1;
    lp = lp * 0.75 + white * 0.25;
    bp = bp * 0.85 + (white - lp) * 0.15;
    const beep = t < 0.14 || (t > 0.22 && t < 0.34) ? Math.sin(2 * Math.PI * 1080 * t) * 0.32 : 0;
    d[i] = Math.tanh((bp * 1.8 + beep) * 1.5) * env * 0.55;
  }
  return buf;
}

function buildTelemetryBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 0.42;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const gate = t < 0.11 || (t > 0.15 && t < 0.24) || (t > 0.28 && t < 0.39) ? 1 : 0.08;
    const env = Math.min(1, t / 0.008) * Math.pow(1 - i / len, 0.8);
    // Vintage dual-tone line pulse + telephone bandpass hiss
    const fA = t > 0.2 ? 941 : 697;
    const fB = t > 0.2 ? 1477 : 1209;
    const tone = (Math.sin(2 * Math.PI * fA * t) + Math.sin(2 * Math.PI * fB * t)) * 0.26;
    const hiss = (Math.random() * 2 - 1) * 0.15;
    lp = lp * 0.72 + (tone * gate + hiss) * 0.28;
    d[i] = Math.tanh(lp * 1.8) * env * 0.6;
  }
  return buf;
}

function buildVinylBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 0.55;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.pow(1 - i / len, 1.1);
    const thump = Math.sin(2 * Math.PI * (65 * Math.exp(-t * 14) + 32) * t) * Math.exp(-t * 18) * 0.65;
    const pop = Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.85 : 0;
    const dust = (Math.random() * 2 - 1) * 0.08;
    lp = lp * 0.65 + (dust + pop) * 0.35;
    d[i] = Math.tanh((thump + lp) * 1.4) * env * 0.7;
  }
  return buf;
}

function buildRiserBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 0.75;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  let lp = 0;
  let bp = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len;
    const env = Math.pow(p, 1.9) * (p > 0.94 ? (1 - p) / 0.06 : 1);
    const white = Math.random() * 2 - 1;
    const coef = 0.94 - p * 0.35;
    lp = lp * coef + white * (1 - coef);
    bp = bp * 0.8 + (white - lp) * 0.2;
    d[i] = bp * env * 0.85;
  }
  return buf;
}

function buildSubBoomBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 0.85;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.006) * Math.exp(-t * 3.8);
    const freq = 29 + 52 * Math.exp(-t * 12);
    phase += freq / sr;
    d[i] = Math.tanh(Math.sin(phase * Math.PI * 2) * 1.35) * env * 0.8;
  }
  return buf;
}

function buildSonarBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 0.72;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 4.5);
    const tone =
      Math.sin(2 * Math.PI * 880 * t) * 0.65 + Math.sin(2 * Math.PI * 1320 * t) * 0.22;
    d[i] = tone * env * 0.45;
  }
  return buf;
}

export function initElectroSamples(ctx: AudioContext): void {
  if (buffers.length > 0) return;
  buffers.push(
    buildRadioStaticBuffer(ctx),
    buildTelemetryBuffer(ctx),
    buildVinylBuffer(ctx),
    buildRiserBuffer(ctx),
    buildSubBoomBuffer(ctx),
    buildSonarBuffer(ctx)
  );
}

export function triggerElectroSample(
  engine: AudioEngine,
  index: number,
  time: number,
  playbackRate = 1.0
): void {
  if (!engine.ctx) return;
  initElectroSamples(engine.ctx);
  const buf = buffers[index % buffers.length];
  if (!buf) return;

  const src = engine.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(Math.max(0.4, Math.min(2.2, playbackRate)), time);

  const gain = engine.ctx.createGain();
  gain.gain.setValueAtTime(0.55, time);

  src.connect(gain);
  gain.connect(engine.masterFilter);
  gain.connect(engine.delaySend);
  gain.connect(engine.reverbSend);
  src.start(time);
}

/** Procedural electro/IDM blips & bleeps */
export function triggerElectroBleep(engine: AudioEngine, time: number): void {
  if (!engine.ctx) return;
  const ctx = engine.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const bleepPool = [520, 780, 1040, 1480, 1960, 2400];
  const f0 = bleepPool[Math.floor(Math.random() * bleepPool.length)];
  const sweepUp = Math.random() > 0.5;
  const dur = 0.045 + Math.random() * 0.075;

  osc.type = Math.random() > 0.4 ? 'sine' : 'triangle';
  osc.frequency.setValueAtTime(f0, time);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(120, sweepUp ? f0 * 1.85 : f0 * 0.45),
    time + dur
  );

  gain.gain.setValueAtTime(0.001, time);
  gain.gain.linearRampToValueAtTime(0.14, time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

  osc.connect(gain);
  gain.connect(engine.masterFilter);
  gain.connect(engine.delaySend);
  gain.connect(engine.reverbSend);

  osc.start(time);
  osc.stop(time + dur + 0.02);
}
