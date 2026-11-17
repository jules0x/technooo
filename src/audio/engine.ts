import { state } from '../state/store';

function makeSaturationCurve(amount = 18): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const buffer = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
  const curve = new Float32Array(buffer);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function makeBitcrushCurve(amount: number): Float32Array<ArrayBuffer> | null {
  if (amount <= 0.02) return null;
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
  const curve = new Float32Array(buffer);
  // Quantize amplitude steps from 32 down to 3 steps as amount goes 0 -> 1
  const steps = Math.max(3, Math.round(32 - amount * 29));
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

function createDarkImpulseResponse(ctx: AudioContext, seconds = 4.6, decay = 2.8): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      const white = Math.random() * 2 - 1;
      // One-pole low-pass so the reverb tail stays dark and cavernous
      lp = lp * 0.84 + white * 0.16;
      data[i] = lp * env;
    }
  }
  return impulse;
}

export class AudioEngine {
  public ctx!: AudioContext;
  public dryBus!: GainNode;
  public percBus!: GainNode;
  public sidechainBus!: GainNode;
  public reverbSend!: GainNode;
  public delaySend!: GainNode;
  public masterFilter!: BiquadFilterNode;
  public breakdownFilter!: BiquadFilterNode;
  private leadPanner!: StereoPannerNode;
  private ringGain!: GainNode;
  private ringDepth!: GainNode;
  private crusher!: WaveShaperNode;
  private lastCrushStep = -1;
  private saturator!: WaveShaperNode;
  private delayNode!: DelayNode;
  private delayFeedback!: GainNode;
  private reverbNode!: ConvolverNode;
  private lfoOsc!: OscillatorNode;
  private lfoFilterGain!: GainNode;
  private lfoPanGain!: GainNode;
  public masterGain!: GainNode;

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // Buses
    this.dryBus = ctx.createGain();
    this.percBus = ctx.createGain();
    this.sidechainBus = ctx.createGain();
    this.reverbSend = ctx.createGain();
    this.delaySend = ctx.createGain();

    // Master low-pass filter controlled by Mouse X
    this.masterFilter = ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 3200;
    this.masterFilter.Q.value = 2.2;

    // Breakdown high-pass filter controlled by Spacebar
    this.breakdownFilter = ctx.createBiquadFilter();
    this.breakdownFilter.type = 'highpass';
    this.breakdownFilter.frequency.value = 20;
    this.breakdownFilter.Q.value = 1.4;

    // Bitcrusher / Lo-Fi quantizer
    this.crusher = ctx.createWaveShaper();
    this.crusher.curve = null;

    // Warm analog saturation
    this.saturator = ctx.createWaveShaper();
    this.saturator.curve = makeSaturationCurve(14);
    this.saturator.oversample = '2x';

    // Dark procedural reverb
    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = createDarkImpulseResponse(ctx, 4.6, 2.7);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.65;

    // Dotted-8th style dark delay
    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = (60 / state.bpm) * 0.75;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.36;
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1800;

    // Master limiter (strict ceiling so extreme sweeps never clip speakers)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 4;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.62;

    // Routing
    this.leadPanner = ctx.createStereoPanner();
    this.ringGain = ctx.createGain();
    this.ringGain.gain.value = 1;
    const ringOsc = ctx.createOscillator();
    ringOsc.type = 'sine';
    ringOsc.frequency.value = 135;
    this.ringDepth = ctx.createGain();
    this.ringDepth.gain.value = 0;
    ringOsc.connect(this.ringDepth);
    this.ringDepth.connect(this.ringGain.gain);
    ringOsc.start();

    this.sidechainBus.connect(this.leadPanner);
    this.leadPanner.connect(this.ringGain);

    // Hardware-style continuous LFO for smooth Filter & Pan modulation
    this.lfoOsc = ctx.createOscillator();
    this.lfoOsc.type = 'sine';
    this.lfoOsc.frequency.value = 1.4;
    this.lfoFilterGain = ctx.createGain();
    this.lfoFilterGain.gain.value = 0;
    this.lfoPanGain = ctx.createGain();
    this.lfoPanGain.gain.value = 0;
    this.lfoOsc.connect(this.lfoFilterGain);
    this.lfoOsc.connect(this.lfoPanGain);
    this.lfoFilterGain.connect(this.masterFilter.frequency);
    this.lfoPanGain.connect(this.leadPanner.pan);
    this.lfoOsc.start();
    this.ringGain.connect(this.masterFilter);
    this.dryBus.connect(this.breakdownFilter);
    this.masterFilter.connect(this.breakdownFilter);

    // Effects sends
    this.reverbSend.connect(this.reverbNode);
    this.reverbNode.connect(reverbReturn);
    reverbReturn.connect(this.breakdownFilter);

    this.delaySend.connect(this.delayNode);
    this.delayNode.connect(delayFilter);
    delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    delayFilter.connect(this.breakdownFilter);

    // Master chain (percBus bypasses kick saturation/limiter so kick never squashes clap/hats)
    this.breakdownFilter.connect(this.crusher);
    this.crusher.connect(this.saturator);
    this.saturator.connect(limiter);
    limiter.connect(this.masterGain);
    this.percBus.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.syncParameters();
  }

  /** Duck the sidechain bus on kick triggers for that minimal techno pump */
  public triggerSidechainDuck(time: number): void {
    if (!this.ctx) return;
    const minGain = 1 - state.sidechainDepth * state.minimalAmount;
    const g = this.sidechainBus.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(1.0, time);
    g.linearRampToValueAtTime(Math.max(0.05, minGain), time + 0.012);
    g.exponentialRampToValueAtTime(1.0, time + 0.19);
  }

  /** Smoothly update timbre & FX from directional sweeps, Minimal<->Drift, and momentary holds */
  public syncParameters(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const effFilter = state.filterCutoffNorm;
    const effSpace = state.spaceNorm;
    const rateHz =
      state.lfoRate === 'slow' ? 0.45 : state.lfoRate === 'med' ? 1.8 : state.lfoRate === 'fast' ? 5.2 : 0;

    // Filter cutoff (exponential 140Hz .. 8500Hz) + safe resonance from directional sweeps
    const cutoff = 140 * Math.pow(60, effFilter);
    const driftDarkness = 0.45 + 0.55 * state.minimalAmount;
    const baseFilterHz = cutoff * driftDarkness;
    this.masterFilter.frequency.setTargetAtTime(baseFilterHz, now, 0.04);
    this.masterFilter.Q.setTargetAtTime(0.7 + state.resonanceNorm * 4.5, now, 0.05);

    if (rateHz > 0) {
      this.lfoOsc.frequency.setTargetAtTime(rateHz, now, 0.03);
    }
    this.lfoFilterGain.gain.setTargetAtTime(
      rateHz > 0 && state.lfoDest === 'filter' ? baseFilterHz * 0.72 * state.lfoDepth : 0,
      now,
      0.04
    );
    this.lfoPanGain.gain.setTargetAtTime(
      rateHz > 0 && state.lfoDest === 'pan' ? 0.9 * state.lfoDepth : 0,
      now,
      0.04
    );

    // Space / Reverb & Delay from directional sweeps + Drift + Space Mode
    const space = effSpace;
    const driftSpace = (1 - state.minimalAmount) * 0.25;
    const tension = state.tensionAmount;
    const breakdownBoost = state.fx.breakdown ? 0.28 : 0;
    const modeRevBoost =
      state.spaceMode === 'cavern' ? 0.22 : state.spaceMode === 'freeze' ? 0.36 : 0;
    const modeFbBoost =
      state.spaceMode === 'cavern' ? 0.16 : state.spaceMode === 'freeze' ? 0.42 : 0;

    this.reverbSend.gain.setTargetAtTime(
      Math.min(0.85, 0.06 + space * 0.36 + driftSpace + breakdownBoost + modeRevBoost + tension * 0.3),
      now,
      0.06
    );
    this.delaySend.gain.setTargetAtTime(
      Math.min(0.65, 0.04 + space * 0.28 + driftSpace * 0.3 + modeRevBoost * 0.4 + tension * 0.2),
      now,
      0.06
    );
    this.delayFeedback.gain.setTargetAtTime(
      Math.min(0.86, state.delayFeedback * 0.72 + space * 0.18 + modeFbBoost + tension * 0.14),
      now,
      0.06
    );

    // Breakdown & Tension HPF sweep
    const hpFreq = state.fx.breakdown ? 720 : 22 + tension * 620;
    this.breakdownFilter.frequency.setTargetAtTime(hpFreq, now, 0.08);

    // Bitcrusher curve update (quantized to 20 steps to avoid reallocating every frame)
    const crushStep = Math.round(state.crushAmount * 20);
    if (crushStep !== this.lastCrushStep) {
      this.lastCrushStep = crushStep;
      this.crusher.curve = makeBitcrushCurve(state.crushAmount);
    }

    // Sync delay time to BPM & Delay Sync mode
    const beatSec = 60 / state.bpm;
    const delaySec =
      state.delaySync === '1/8'
        ? beatSec * 0.5
        : state.delaySync === '1/4'
          ? beatSec
          : state.delaySync === 'slap'
            ? 0.045
            : beatSec * 0.75;
    this.delayNode.delayTime.setTargetAtTime(delaySec, now, 0.06);

    const driveCurveAmt = 2 + state.driveAmount * 52;
    this.saturator.curve = makeSaturationCurve(driveCurveAmt);

    // Experimental Ring Modulator
    this.ringGain.gain.setTargetAtTime(1 - state.ringMod * 0.45, now, 0.04);
    this.ringDepth.gain.setTargetAtTime(state.ringMod * 0.95, now, 0.04);
  }
}

