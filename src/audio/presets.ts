import { state } from '../state/store';
import { midiToFreq } from './theory';

function computePeaks(buffer: AudioBuffer, numPeaks = 48): number[] {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const blockSize = Math.max(1, Math.floor(buffer.length / numPeaks));
  const peaks: number[] = [];
  for (let p = 0; p < numPeaks; p++) {
    let max = 0;
    const start = p * blockSize;
    const end = Math.min(buffer.length, start + blockSize);
    for (let i = start; i < end; i += 8) {
      const v = Math.max(Math.abs(ch0[i]), Math.abs(ch1[i]));
      if (v > max) max = v;
    }
    peaks.push(Math.min(1, max));
  }
  return peaks;
}

async function renderOneBar(
  sampleRate: number,
  bpm: number,
  build: (ctx: OfflineAudioContext, stepDur: number) => void
): Promise<AudioBuffer> {
  const stepDur = 60 / bpm / 4;
  const length = Math.floor(stepDur * 16 * sampleRate);
  const off = new OfflineAudioContext(2, length, sampleRate);
  build(off, stepDur);
  return off.startRendering();
}

export async function prepopulateMemoryBank(
  sampleRate: number,
  bpm: number,
  onDone: () => void
): Promise<void> {
  // 1. MINIMAL 4x4 (Kick + offbeat sub)
  const buf0 = await renderOneBar(sampleRate, bpm, (ctx, stepDur) => {
    for (let s = 0; s < 16; s += 4) {
      const t = s * stepDur;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(145, t);
      osc.frequency.exponentialRampToValueAtTime(36, t + 0.25);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.75, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  });

  // 2. GLITCH PERC (FM clicks + hats)
  const buf1 = await renderOneBar(sampleRate, bpm, (ctx, stepDur) => {
    const hits = [0, 2, 3, 6, 7, 9, 11, 14, 15];
    hits.forEach((s, idx) => {
      const t = s * stepDur;
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const mg = ctx.createGain();
      const g = ctx.createGain();
      const f = idx % 2 === 0 ? 1100 : 1850;
      car.frequency.setValueAtTime(f, t);
      mod.frequency.setValueAtTime(f * 2.7, t);
      mg.gain.setValueAtTime(f * 1.8, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      mod.connect(mg);
      mg.connect(car.frequency);
      car.connect(g);
      g.connect(ctx.destination);
      car.start(t);
      mod.start(t);
      car.stop(t + 0.07);
      mod.stop(t + 0.07);
    });
  });

  // 3. LORN DRONE (Detuned dark Reese pad)
  const buf2 = await renderOneBar(sampleRate, bpm, (ctx, stepDur) => {
    const dur = stepDur * 16;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, 0);
    filter.frequency.linearRampToValueAtTime(620, dur * 0.5);
    filter.frequency.linearRampToValueAtTime(220, dur);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.01, 0);
    master.gain.linearRampToValueAtTime(0.25, dur * 0.25);
    master.gain.linearRampToValueAtTime(0.01, dur - 0.02);
    filter.connect(master);
    master.connect(ctx.destination);

    [1, 1.005, 0.995, 1.498].forEach((r) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(36) * r;
      osc.connect(filter);
      osc.start(0);
      osc.stop(dur);
    });
  });

  // 4. ACID PLUCK (C Phrygian 16th arp)
  const buf3 = await renderOneBar(sampleRate, bpm, (ctx, stepDur) => {
    const notes = [48, 49, 55, 48, 51, 55, 56, 55];
    for (let s = 0; s < 16; s += 2) {
      const t = s * stepDur;
      const osc = ctx.createOscillator();
      const flt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(midiToFreq(notes[(s / 2) % notes.length]), t);
      flt.type = 'lowpass';
      flt.Q.value = 8;
      flt.frequency.setValueAtTime(2600, t);
      flt.frequency.exponentialRampToValueAtTime(220, t + 0.16);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.26, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(flt);
      flt.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  });

  // 5. INDUST CLAP (Heavy 2 & 4 snare/clap)
  const buf4 = await renderOneBar(sampleRate, bpm, (ctx, stepDur) => {
    [4, 12].forEach((s) => {
      const t = s * stepDur;
      const len = Math.floor(sampleRate * 0.18);
      const nb = ctx.createBuffer(1, len, sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = nb;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1450;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.42, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start(t);
    });
  });

  // 6. SUB PULSE (Rolling offbeat sub bass)
  const buf5 = await renderOneBar(sampleRate, bpm, (ctx, stepDur) => {
    [2, 6, 10, 14, 15].forEach((s) => {
      const t = s * stepDur;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(s === 15 ? 37 : 36), t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  });

  const presets: { name: string; buffer: AudioBuffer }[] = [
    { name: 'MINIMAL 4x4', buffer: buf0 },
    { name: 'GLITCH PERC', buffer: buf1 },
    { name: 'LORN DRONE', buffer: buf2 },
    { name: 'ACID PLUCK', buffer: buf3 },
    { name: 'INDUST CLAP', buffer: buf4 },
    { name: 'SUB PULSE', buffer: buf5 },
  ];

  presets.forEach((p, i) => {
    const slot = state.memorySlots[i];
    if (slot && !slot.buffer) {
      slot.name = p.name;
      slot.buffer = p.buffer;
      slot.bars = 1;
      slot.peaks = computePeaks(p.buffer);
    }
  });

  onDone();
}

