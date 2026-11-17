import { AudioEngine } from './engine';
import { LeadVoice, NodeVoice, state } from '../state/store';
import { getActiveScale, midiToFreq } from './theory';

/** Punchy minimal techno sub-kick with selectable character (tight / sub / punch) */
export function triggerKick(engine: AudioEngine, time: number, level = 1.0): void {
  const ctx = engine.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const char = state.kickCharacter;
  const startFreq = char === 'punch' ? 185 : char === 'sub' ? 115 : 145;
  const endFreq = char === 'sub' ? 28 : 34;
  const dur = char === 'sub' ? 0.52 : char === 'punch' ? 0.34 : 0.36;

  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.045);
  osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur - 0.04);

  const lvl = level * state.levels.kick;
  if (lvl <= 0.001) return;
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.linearRampToValueAtTime((char === 'punch' ? 1.05 : 0.95) * lvl, time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

  osc.connect(gain);
  gain.connect(engine.dryBus);

  osc.start(time);
  osc.stop(time + dur + 0.02);
}

function getToneScale(): number {
  return state.percTone === 'low' ? 0.72 : state.percTone === 'high' ? 1.45 : 1.0;
}

/** Crisp off-beat hi-hat / industrial rimshot shaped by percKit & percTone */
export function triggerHatOrRim(engine: AudioEngine, time: number, accent: boolean): void {
  const ctx = engine.ctx;
  const kit = state.percKit;
  const tone = getToneScale();
  const dur =
    kit === '909'
      ? accent ? 0.16 : 0.05
      : kit === 'dub'
        ? 0.08
        : kit === 'indust'
          ? 0.12
          : kit === 'wood'
            ? 0.035
            : accent
              ? 0.09
              : 0.04;
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = kit === 'wood' || kit === 'dub' ? 'bandpass' : 'highpass';
  filter.frequency.setValueAtTime(
    (kit === 'wood' ? 2400 : kit === 'dub' ? 3200 : kit === 'indust' ? 3800 : accent ? 5200 : 7400) *
      tone,
    time
  );
  if (kit === 'wood' || kit === 'dub') filter.Q.setValueAtTime(5, time);

  const hatLvl = state.levels.hat;
  if (hatLvl <= 0.001) return;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.001, time);
  env.gain.linearRampToValueAtTime((accent ? 0.19 : 0.11) * hatLvl, time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);

  noise.connect(filter);
  filter.connect(env);
  env.connect(engine.percBus);
  env.connect(engine.reverbSend);
  if (kit === 'dub') env.connect(engine.delaySend);

  noise.start(time);
  noise.stop(time + dur + 0.01);
}

/** Pitched minimal tom / dub rimshot (5th percussion row) */
export function triggerTomOrRim(engine: AudioEngine, time: number): void {
  const ctx = engine.ctx;
  const kit = state.percKit;
  const tone = getToneScale();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  const startF = (kit === 'wood' ? 310 : kit === '909' ? 240 : 190) * tone;
  const endF = (kit === 'wood' ? 160 : 88) * tone;
  const dur = kit === 'dub' ? 0.24 : 0.16;

  osc.type = kit === 'indust' || kit === 'glitch' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(startF, time);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, endF), time + dur * 0.75);

  const tomLvl = state.levels.tom;
  if (tomLvl <= 0.001) return;
  env.gain.setValueAtTime(0.001, time);
  env.gain.linearRampToValueAtTime(0.28 * tomLvl, time + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);

  osc.connect(env);
  env.connect(engine.percBus);
  if (kit === 'dub' || kit === '909') env.connect(engine.delaySend);
  env.connect(engine.reverbSend);

  osc.start(time);
  osc.stop(time + dur + 0.02);
}

/** Snappy minimal clap / industrial snare */
export function triggerClapOrSnare(engine: AudioEngine, time: number): void {
  const clapLvl = state.levels.clap;
  if (clapLvl <= 0.001) return;
  const ctx = engine.ctx;
  const kit = state.percKit;
  const tone = getToneScale();
  const dur = kit === 'indust' ? 0.22 : kit === 'wood' ? 0.11 : 0.15;
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    // Double-transient clap envelope for minimal/glitch kits
    const t = i / ctx.sampleRate;
    const flam = (t < 0.012 || (t > 0.016 && t < 0.028)) && kit !== 'indust' ? 1.0 : 0.65;
    data[i] = (Math.random() * 2 - 1) * flam;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime((kit === 'indust' ? 1350 : kit === 'wood' ? 950 : 1850) * tone, time);
  bp.Q.setValueAtTime(kit === 'wood' ? 3.5 : 1.4, time);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.001, time);
  env.gain.linearRampToValueAtTime((kit === 'indust' ? 0.34 : 0.24) * clapLvl, time + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);

  noise.connect(bp);
  bp.connect(env);
  env.connect(engine.percBus);
  env.connect(engine.reverbSend);
  if (kit === 'glitch') env.connect(engine.delaySend);

  noise.start(time);
  noise.stop(time + dur + 0.01);

  // Subtle body thump for snare punch
  const body = ctx.createOscillator();
  const bodyEnv = ctx.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime((kit === 'wood' ? 280 : 195) * tone, time);
  body.frequency.exponentialRampToValueAtTime(Math.max(55, 95 * tone), time + 0.06);
  bodyEnv.gain.setValueAtTime(0.001, time);
  bodyEnv.gain.linearRampToValueAtTime(0.18 * clapLvl, time + 0.002);
  bodyEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.075);
  body.connect(bodyEnv);
  bodyEnv.connect(engine.percBus);
  body.start(time);
  body.stop(time + 0.085);
}

/** Crisp FM micro-percussion / glitch tick for high-tech minimal */
export function triggerMicroPerc(
  engine: AudioEngine,
  time: number,
  accent: boolean,
  brightness: number
): void {
  const percLvl = state.levels.perc;
  if (percLvl <= 0.001) return;
  const ctx = engine.ctx;
  const kit = state.percKit;
  const tone = getToneScale();

  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const env = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  const glitchJump = kit === 'glitch' ? 0.5 + Math.random() * 1.8 : 1.0;
  const baseFreq =
    (kit === 'wood'
      ? 260 + brightness * 380
      : kit === 'indust'
        ? 340 + brightness * 650
        : accent
          ? 480 + brightness * 900
          : 880 + brightness * 1400) *
    glitchJump *
    tone;

  carrier.type = kit === 'wood' ? 'sine' : 'triangle';
  carrier.frequency.setValueAtTime(baseFreq, time);

  mod.type = kit === 'indust' ? 'sawtooth' : 'sine';
  mod.frequency.setValueAtTime(baseFreq * (kit === 'wood' ? 1.5 : 2.73), time);
  modGain.gain.setValueAtTime(baseFreq * (kit === 'wood' ? 0.8 : 1.9), time);
  modGain.gain.exponentialRampToValueAtTime(1, time + 0.035);

  filter.type = kit === 'wood' ? 'bandpass' : 'highpass';
  filter.frequency.setValueAtTime(kit === 'wood' ? baseFreq * 1.4 : (900 + brightness * 2000) * tone, time);

  const decay = kit === 'wood' ? 0.08 : accent ? 0.095 : 0.045;
  const peak = (accent ? 0.24 : 0.13) * percLvl;
  env.gain.setValueAtTime(0.001, time);
  env.gain.linearRampToValueAtTime(peak, time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, time + decay);

  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(filter);
  filter.connect(env);
  env.connect(engine.percBus);
  env.connect(engine.reverbSend);
  env.connect(engine.delaySend);

  carrier.start(time);
  mod.start(time);
  carrier.stop(time + decay + 0.02);
  mod.stop(time + decay + 0.02);
}

function attachFmWarp(
  ctx: AudioContext,
  targetOsc: OscillatorNode,
  baseFreq: number,
  time: number,
  dur: number
): void {
  if (state.fmWarp <= 0.01) return;
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(baseFreq * 1.5, time);
  const peak = baseFreq * state.fmWarp * 2.2;
  modGain.gain.setValueAtTime(Math.max(1, peak), time);
  modGain.gain.exponentialRampToValueAtTime(0.5, time + Math.min(dur, 0.22));
  mod.connect(modGain);
  modGain.connect(targetOsc.frequency);
  mod.start(time);
  mod.stop(time + dur + 0.03);
}

/** Resonant rolling minimal bass / Lorn-style stretched pluck */
export function triggerBassOrPluck(
  engine: AudioEngine,
  time: number,
  freq: number,
  options: { accent?: boolean; isNode?: boolean } = {}
): void {
  const ctx = engine.ctx;
  const drift = 1 - state.minimalAmount;
  const pitchFactor = state.fx.tapeSag ? 0.72 : 1.0;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();

  const tone = state.bassTone;
  osc1.type =
    !options.isNode && tone === 'sub'
      ? 'sine'
      : !options.isNode && tone === 'sqr'
        ? 'square'
        : 'sawtooth';
  osc2.type = options.isNode
    ? 'triangle'
    : tone === 'sub'
      ? 'triangle'
      : tone === 'acid'
        ? 'sawtooth'
        : 'square';

  osc1.frequency.setValueAtTime(freq * pitchFactor, time);
  osc2.frequency.setValueAtTime(freq * (options.isNode ? 1.004 : 0.5) * pitchFactor, time);
  attachFmWarp(ctx, osc1, freq * pitchFactor, time, 0.25);

  // Subtle detune grows with drift
  osc1.detune.setValueAtTime(-5 - drift * 18, time);
  osc2.detune.setValueAtTime(5 + drift * 18, time);

  const decayScale = options.isNode
    ? state.nodeDecay === 'short'
      ? 0.5
      : state.nodeDecay === 'long'
        ? 2.1
        : 1.0
    : 0.45 + state.bassDecay * 1.35;
  const attack = 0.004 + drift * 0.18;
  const release = ((options.isNode ? 0.35 : 0.18) + drift * 1.1) * decayScale;
  const totalDur = attack + release;

  // Filter envelope
  const cutoffNorm = options.isNode ? state.filterCutoffNorm : state.bassCutoff;
  const baseCutoff = (tone === 'sub' && !options.isNode ? 95 : 140) + cutoffNorm * 1400;
  const envBoost =
    !options.isNode && tone === 'acid' ? 3400 : options.accent ? 2600 : 1400;
  const peakCutoff = baseCutoff + envBoost * (0.35 + cutoffNorm * 0.75);
  filter.type = 'lowpass';
  filter.Q.setValueAtTime(
    !options.isNode && tone === 'acid' ? 8.5 + cutoffNorm * 5 : 3.2 + cutoffNorm * 4.5,
    time
  );
  filter.frequency.setValueAtTime(baseCutoff, time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, peakCutoff), time + attack + 0.015);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, baseCutoff), time + totalDur);

  const chLvl = options.isNode ? state.levels.orbits : state.levels.bass;
  if (chLvl <= 0.001) return;
  const peakGain = (options.isNode ? 0.16 : options.accent ? 0.28 : 0.2) * chLvl;
  env.gain.setValueAtTime(0.0008, time);
  env.gain.linearRampToValueAtTime(peakGain, time + attack);
  env.gain.exponentialRampToValueAtTime(0.0008, time + totalDur);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(env);
  env.connect(engine.sidechainBus);
  env.connect(engine.delaySend);
  if (options.isNode || drift > 0.25) {
    env.connect(engine.reverbSend);
  }

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + totalDur + 0.03);
  osc2.stop(time + totalDur + 0.03);
}

/** Trigger one of the 3 radar node synth voices: pluck, fm chime, or sub pulse */
export function triggerNodeVoice(
  engine: AudioEngine,
  time: number,
  freq: number,
  voice: NodeVoice
): void {
  if (voice === 'pluck') {
    triggerBassOrPluck(engine, time, freq, { accent: true, isNode: true });
    return;
  }

  const ctx = engine.ctx;
  const drift = 1 - state.minimalAmount;
  const pitchFactor = state.fx.tapeSag ? 0.72 : 1.0;

  if (voice === 'fm') {
    // Warm, harmonic glassy Rhodes/bell chime (pleasant outer ring)
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const env = ctx.createGain();

    const f = freq * pitchFactor;
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(f, time);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(f * 2.0, time);
    modGain.gain.setValueAtTime(f * (0.28 + state.filterCutoffNorm * 0.42), time);
    modGain.gain.exponentialRampToValueAtTime(1, time + 0.22 + drift * 0.35);

    const orbLvl = state.levels.orbits;
    if (orbLvl <= 0.001) return;
    const dur = (0.34 + drift * 0.85) * (state.nodeDecay === 'short' ? 0.5 : state.nodeDecay === 'long' ? 2.1 : 1.0);
    env.gain.setValueAtTime(0.0008, time);
    env.gain.linearRampToValueAtTime(0.14 * orbLvl, time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);
    env.connect(engine.sidechainBus);
    env.connect(engine.delaySend);
    env.connect(engine.reverbSend);

    carrier.start(time);
    mod.start(time);
    carrier.stop(time + dur + 0.03);
    mod.stop(time + dur + 0.03);
    return;
  }

  // 'sub': Warm audible sub-bass pulse (fundamental + soft 2nd harmonic through lowpass)
  const osc = ctx.createOscillator();
  const harm = ctx.createOscillator();
  const harmGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();

  const subF = freq * pitchFactor;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(subF, time);
  harm.type = 'triangle';
  harm.frequency.setValueAtTime(subF * 2, time);
  harmGain.gain.value = 0.28;

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(240 + state.filterCutoffNorm * 420, time);
  filter.Q.value = 1.4;

  const orbLvl = state.levels.orbits;
  if (orbLvl <= 0.001) return;
  const dur = (0.42 + drift * 0.9) * (state.nodeDecay === 'short' ? 0.5 : state.nodeDecay === 'long' ? 2.1 : 1.0);
  env.gain.setValueAtTime(0.001, time);
  env.gain.linearRampToValueAtTime(0.36 * orbLvl, time + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);

  osc.connect(filter);
  harm.connect(harmGain);
  harmGain.connect(filter);
  filter.connect(env);
  env.connect(engine.sidechainBus);
  env.connect(engine.reverbSend);

  osc.start(time);
  harm.start(time);
  osc.stop(time + dur + 0.03);
  harm.stop(time + dur + 0.03);
}

/** Trigger Sketched Melody Lead with selectable timbre, envelope, detune, LFO pitch, & glide */
export function triggerLeadNote(
  engine: AudioEngine,
  time: number,
  freq: number,
  voice: LeadVoice,
  glideFromFreq: number | null
): void {
  const ctx = engine.ctx;
  const drift = 1 - state.minimalAmount;
  const pitchFactor = state.fx.tapeSag ? 0.72 : 1.0;
  const targetFreq = freq * pitchFactor;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();

  osc1.type =
    voice === 'acid' || voice === 'reese'
      ? 'sawtooth'
      : voice === 'fm'
        ? 'sine'
        : 'triangle';
  osc2.type = voice === 'reese' ? 'sawtooth' : voice === 'fm' ? 'sine' : 'square';

  const baseDetune =
    state.synthDetune === 'clean' ? 0 : state.synthDetune === 'warm' ? 8 : 22;
  const detuneCents =
    (voice === 'reese' ? Math.max(16, baseDetune * 1.4) : baseDetune) *
    (1 + state.chorusSpread * 1.6);
  osc1.detune.setValueAtTime(-detuneCents, time);
  osc2.detune.setValueAtTime(detuneCents, time);

  if (glideFromFreq && state.leadGlide) {
    const startF = glideFromFreq * pitchFactor;
    osc1.frequency.setValueAtTime(startF, time);
    osc1.frequency.exponentialRampToValueAtTime(targetFreq, time + 0.085);
    osc2.frequency.setValueAtTime(startF * 1.004, time);
    osc2.frequency.exponentialRampToValueAtTime(targetFreq * 1.004, time + 0.085);
  } else {
    osc1.frequency.setValueAtTime(targetFreq, time);
    osc2.frequency.setValueAtTime(
      targetFreq * (voice === 'reese' ? 1.007 : voice === 'fm' ? 2.0 : 0.5),
      time
    );
  }

  // Dedicated FM operator for 'fm' lead voice
  let fmOp: OscillatorNode | null = null;
  if (voice === 'fm') {
    fmOp = ctx.createOscillator();
    const fmGain = ctx.createGain();
    fmOp.type = 'sine';
    fmOp.frequency.setValueAtTime(targetFreq * 2.0, time);
    fmGain.gain.setValueAtTime(targetFreq * 2.6, time);
    fmGain.gain.exponentialRampToValueAtTime(4, time + 0.22);
    fmOp.connect(fmGain);
    fmGain.connect(osc1.frequency);
    fmOp.start(time);
  }

  // Subtle Tape Wow pitch drift
  let vibLfo: OscillatorNode | null = null;
  if (state.tapeWow > 0.02) {
    vibLfo = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vibLfo.frequency.value = 0.65;
    vibGain.gain.value = state.tapeWow * 22;
    vibLfo.connect(vibGain);
    vibGain.connect(osc1.detune);
    vibGain.connect(osc2.detune);
    vibLfo.start(time);
  }

  // Synth Envelope (SNAP / PLUCK / SWELL) scaled by Arp Gate
  const envAttack =
    state.synthEnv === 'snap' ? 0.003 : state.synthEnv === 'swell' ? 0.14 : 0.005;
  const envRelease =
    state.synthEnv === 'snap' ? 0.11 : state.synthEnv === 'swell' ? 0.72 : 0.24;
  const gateScale = 0.35 + state.arpGate * 0.95;
  const attack = envAttack + drift * 0.2;
  const release = (envRelease + drift * 0.55) * gateScale;
  const totalDur = attack + release;
  if (fmOp) fmOp.stop(time + totalDur + 0.03);
  attachFmWarp(ctx, osc1, targetFreq, time, totalDur);

  const baseCutoff = 220 + state.filterCutoffNorm * 1800;
  const peakCutoff = baseCutoff + (voice === 'acid' ? 3800 : 1900) * (0.4 + state.filterCutoffNorm);
  filter.type = 'lowpass';
  filter.Q.setValueAtTime(
    voice === 'acid' ? 6.5 + state.resonanceNorm * 5 : 2.2 + state.resonanceNorm * 4,
    time
  );
  filter.frequency.setValueAtTime(baseCutoff, time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(90, peakCutoff), time + attack + 0.02);
  filter.frequency.exponentialRampToValueAtTime(Math.max(90, baseCutoff), time + totalDur);

  const leadLvl = state.levels.lead;
  if (leadLvl <= 0.001) return;
  env.gain.setValueAtTime(0.0008, time);
  env.gain.linearRampToValueAtTime(0.16 * leadLvl, time + attack);
  env.gain.exponentialRampToValueAtTime(0.0008, time + totalDur);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(env);
  env.connect(engine.sidechainBus);
  env.connect(engine.delaySend);
  env.connect(engine.reverbSend);

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + totalDur + 0.03);
  osc2.stop(time + totalDur + 0.03);
  if (vibLfo) vibLfo.stop(time + totalDur + 0.03);
}

/** Rhythmic Dub-Techno Chord Stab (Channel 9) */
export function triggerChordStab(engine: AudioEngine, time: number): void {
  const stabLvl = state.levels.stab;
  if (stabLvl <= 0.001) return;
  const ctx = engine.ctx;
  const pitchFactor = state.fx.tapeSag ? 0.72 : 1.0;
  const rootMidi = getActiveScale().rootMidi + state.rootOffset + 12;
  const intervals = [0, 3, 7];

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const baseCut = 260 + state.filterCutoffNorm * 900;
  filter.frequency.setValueAtTime(baseCut + 2200, time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(120, baseCut), time + 0.18);
  filter.Q.setValueAtTime(3.6 + state.resonanceNorm * 3.5, time);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0008, time);
  env.gain.linearRampToValueAtTime(0.11 * stabLvl, time + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0008, time + 0.24);

  filter.connect(env);
  env.connect(engine.sidechainBus);
  env.connect(engine.delaySend);
  env.connect(engine.reverbSend);

  intervals.forEach((semi, idx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(rootMidi + semi) * pitchFactor, time);
    osc.detune.setValueAtTime((idx - 1) * 9, time);
    osc.connect(filter);
    osc.start(time);
    osc.stop(time + 0.27);
  });
}

/** Continuous Lorn-style dark detuned Reese/Pad & Soundscape bed */
export class DroneBed {
  private oscs: OscillatorNode[] = [];
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private filter!: BiquadFilterNode;
  private gain!: GainNode;
  private padReverbSend!: GainNode;
  private textureFilter!: BiquadFilterNode;
  private textureGain!: GainNode;
  private subOsc!: OscillatorNode;
  private subGain!: GainNode;
  private started = false;

  public start(engine: AudioEngine): void {
    if (this.started) return;
    const ctx = engine.ctx;
    this.started = true;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 320;
    this.filter.Q.value = 1.8;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;

    this.padReverbSend = ctx.createGain();
    this.padReverbSend.gain.value = 0.32;

    // Slow tape wobble LFO
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.35;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 12;
    this.lfo.connect(this.lfoGain);
    this.lfo.start();

    const baseFreq = midiToFreq(getActiveScale().rootMidi);
    const ratios = [1, 1.1892, 1.498, 1.7818, 2.004];

    for (const ratio of ratios) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = baseFreq * ratio;
      this.lfoGain.connect(osc.detune);
      osc.connect(this.filter);
      osc.start();
      this.oscs.push(osc);
    }

    // Atmospheric texture noise buffer (wind / vinyl crackle)
    const texLen = Math.floor(ctx.sampleRate * 3);
    const texBuf = ctx.createBuffer(1, texLen, ctx.sampleRate);
    const data = texBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < texLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      const crackle = Math.random() < 0.0014 ? (Math.random() * 2 - 1) * 0.85 : 0;
      data[i] = Math.max(-1, Math.min(1, b0 + b1 + crackle * 0.45));
    }
    const texSrc = ctx.createBufferSource();
    texSrc.buffer = texBuf;
    texSrc.loop = true;

    this.textureFilter = ctx.createBiquadFilter();
    this.textureFilter.type = 'bandpass';
    this.textureFilter.frequency.value = 650;
    this.textureFilter.Q.value = 1.6;

    this.textureGain = ctx.createGain();
    this.textureGain.gain.value = 0.0001;

    texSrc.connect(this.textureFilter);
    this.textureFilter.connect(this.textureGain);
    this.textureGain.connect(engine.sidechainBus);
    this.textureGain.connect(engine.reverbSend);
    texSrc.start();

    // Sub-harmonic pad foundation
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = baseFreq * 0.5;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.0001;
    this.subOsc.connect(this.subGain);
    this.subGain.connect(engine.sidechainBus);
    this.subOsc.start();

    this.filter.connect(this.gain);
    this.gain.connect(engine.sidechainBus);
    this.gain.connect(this.padReverbSend);
    this.padReverbSend.connect(engine.reverbSend);
  }

  public update(engine: AudioEngine): void {
    if (!this.started) return;
    const now = engine.ctx.currentTime;
    const drift = 1 - state.minimalAmount;
    const active = !state.muteLiveSynth && (!state.mutes.drone || drift > 0.05);

    const washDryScale = state.padWash === 'wash' ? 0.72 : state.padWash === 'lush' ? 1.0 : 1.05;
    const washRevSend = state.padWash === 'wash' ? 0.68 : state.padWash === 'lush' ? 0.34 : 0.08;

    const droneLvl = state.levels.drone;
    // Active if Drone is unmuted OR if Drift is dialed in (unless live synth is muted)
    const targetLevel = state.muteLiveSynth
      ? 0.0001
      : (!state.mutes.drone
          ? (0.14 + drift * 0.1) * washDryScale * state.padLevel
          : drift * 0.12 * washDryScale * state.padLevel) * droneLvl;
    this.gain.gain.setTargetAtTime(Math.max(0.0001, targetLevel), now, 0.15);
    this.padReverbSend.gain.setTargetAtTime(washRevSend, now, 0.12);

    const pitchFactor = state.fx.tapeSag ? 0.72 : 1.0;
    const baseFreq =
      midiToFreq(
        getActiveScale().rootMidi + state.rootOffset + state.bassOctaveOffset * 12
      ) * pitchFactor;

    const detuneSpread = drift * 0.008;
    const ratios =
      state.padChord === 'minor'
        ? [1, 1.1892 + detuneSpread, 1.498, 1.7818, 2.004 - detuneSpread]
        : state.padChord === 'sus2'
          ? [1, 1.1225 + detuneSpread, 1.498, 2.0, 2.2449 - detuneSpread]
          : state.padChord === 'shimmer'
            ? [1, 1.498 + detuneSpread, 2.0, 2.996, 4.008 - detuneSpread]
            : [1, 1.004 + detuneSpread, 0.996 - detuneSpread, 1.498, 2.0];

    this.oscs.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(baseFreq * ratios[i], now, 0.08);
    });

    // Texture layer (Wind / Vinyl / Sub)
    if (!active || state.padTexture === 'off') {
      this.textureGain.gain.setTargetAtTime(0.0001, now, 0.12);
      this.subGain.gain.setTargetAtTime(0.0001, now, 0.12);
    } else if (state.padTexture === 'wind') {
      this.textureFilter.type = 'bandpass';
      const windSweep = 340 + (Math.sin(now * 0.35) * 0.5 + 0.5) * 1100;
      this.textureFilter.frequency.setTargetAtTime(windSweep, now, 0.12);
      this.textureFilter.Q.setTargetAtTime(2.4, now, 0.12);
      this.textureGain.gain.setTargetAtTime((0.14 + drift * 0.08) * droneLvl, now, 0.15);
      this.subGain.gain.setTargetAtTime(0.0001, now, 0.12);
    } else if (state.padTexture === 'vinyl') {
      this.textureFilter.type = 'highpass';
      this.textureFilter.frequency.setTargetAtTime(1600, now, 0.1);
      this.textureFilter.Q.setTargetAtTime(0.8, now, 0.1);
      this.textureGain.gain.setTargetAtTime(0.11 * droneLvl, now, 0.12);
      this.subGain.gain.setTargetAtTime(0.0001, now, 0.12);
    } else {
      // 'sub'
      this.textureGain.gain.setTargetAtTime(0.0001, now, 0.12);
      this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.08);
      this.subGain.gain.setTargetAtTime(0.16 * droneLvl, now, 0.15);
    }

    this.lfoGain.gain.setTargetAtTime(4 + state.tapeWow * 42 + drift * 22, now, 0.1);
    const padBright = state.padChord === 'shimmer' ? 1450 : 950;
    this.filter.frequency.setTargetAtTime(180 + state.filterCutoffNorm * padBright, now, 0.08);
  }
}

