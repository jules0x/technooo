import { DubChannel, state } from '../state/store';

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

function createBrightGateImpulse(ctx: AudioContext, seconds = 0.7): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, 1.15);
      data[i] = (Math.random() * 2 - 1) * env;
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
  private delayNodeR!: DelayNode;
  private delayFeedback!: GainNode;
  private delayFeedbackCross!: GainNode;
  private delayPanL!: StereoPannerNode;
  private delayPanR!: StereoPannerNode;
  private reverbNode!: ConvolverNode;
  private gatedReverbNode!: ConvolverNode;
  private gatedReverbGate!: GainNode;
  private gatedReverbInput!: GainNode;
  public combInput!: GainNode;
  private combDelay!: DelayNode;
  private combFeedback!: GainNode;
  private combWetGain!: GainNode;
  public channelSends!: Record<DubChannel, { delay: GainNode; reverb: GainNode }>;
  private lfoOsc!: OscillatorNode;
  private lfoFilterGain!: GainNode;
  private lfoPanGain!: GainNode;
  private lfo2Osc!: OscillatorNode;
  private lfo2CutoffGain!: GainNode;
  private lfo2ResoGain!: GainNode;
  private lfo2PanGain!: GainNode;
  private lfo2CombGain!: GainNode;
  private eqLowGain!: GainNode;
  private eqMidGain!: GainNode;
  private eqHighGain!: GainNode;
  private djFilterNode!: BiquadFilterNode;
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

    // Dotted-8th style dark stereo ping-pong delay with soft-clip feedback
    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = (60 / state.bpm) * 0.75;
    this.delayNodeR = ctx.createDelay(2.0);
    this.delayNodeR.delayTime.value = (60 / state.bpm) * 0.75;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.36;
    this.delayFeedbackCross = ctx.createGain();
    this.delayFeedbackCross.gain.value = 0.36;
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1800;
    const delayFilterR = ctx.createBiquadFilter();
    delayFilterR.type = 'lowpass';
    delayFilterR.frequency.value = 1750;
    const delayClip = ctx.createWaveShaper();
    delayClip.curve = makeSaturationCurve(8);
    this.delayPanL = ctx.createStereoPanner();
    this.delayPanL.pan.value = -0.75;
    this.delayPanR = ctx.createStereoPanner();
    this.delayPanR.pan.value = 0.75;

    // Comb Filter / Resonator for metallic minimal textures
    this.combInput = ctx.createGain();
    this.combDelay = ctx.createDelay(0.1);
    this.combDelay.delayTime.value = 0.012;
    const combDamp = ctx.createBiquadFilter();
    combDamp.type = 'lowpass';
    combDamp.frequency.value = 4200;
    this.combFeedback = ctx.createGain();
    this.combFeedback.gain.value = 0.55;
    this.combWetGain = ctx.createGain();
    this.combWetGain.gain.value = 0;

    // Gated Reverb for 80s electro claps/toms
    this.gatedReverbInput = ctx.createGain();
    this.gatedReverbNode = ctx.createConvolver();
    this.gatedReverbNode.buffer = createBrightGateImpulse(ctx, 0.7);
    this.gatedReverbGate = ctx.createGain();
    this.gatedReverbGate.gain.value = 0;

    // Per-Channel Dub Sends
    const dubChannels: DubChannel[] = ['kick', 'perc', 'hat', 'clap', 'bass', 'lead', 'stab'];
    this.channelSends = {} as Record<DubChannel, { delay: GainNode; reverb: GainNode }>;
    for (const ch of dubChannels) {
      const d = ctx.createGain();
      const r = ctx.createGain();
      d.gain.value = state.dubDelaySend[ch];
      r.gain.value = state.dubReverbSend[ch];
      d.connect(this.delaySend);
      d.connect(this.combInput);
      r.connect(this.reverbSend);
      this.channelSends[ch] = { delay: d, reverb: r };
    }

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

    // LFO 2 (Multi-wave, continuous rate, multi-destination)
    this.lfo2Osc = ctx.createOscillator();
    this.lfo2Osc.type = state.lfo2Shape;
    this.lfo2Osc.frequency.value = 1.0;
    this.lfo2CutoffGain = ctx.createGain();
    this.lfo2ResoGain = ctx.createGain();
    this.lfo2PanGain = ctx.createGain();
    this.lfo2CombGain = ctx.createGain();
    this.lfo2Osc.connect(this.lfo2CutoffGain);
    this.lfo2Osc.connect(this.lfo2ResoGain);
    this.lfo2Osc.connect(this.lfo2PanGain);
    this.lfo2Osc.connect(this.lfo2CombGain);
    this.lfo2CutoffGain.connect(this.masterFilter.frequency);
    this.lfo2ResoGain.connect(this.masterFilter.Q);
    this.lfo2PanGain.connect(this.leadPanner.pan);
    this.lfo2CombGain.connect(this.combDelay.delayTime);
    this.lfo2Osc.start();
    this.ringGain.connect(this.masterFilter);
    this.dryBus.connect(this.breakdownFilter);
    this.masterFilter.connect(this.breakdownFilter);

    // Effects sends
    this.reverbSend.connect(this.reverbNode);
    this.reverbNode.connect(reverbReturn);
    reverbReturn.connect(this.breakdownFilter);

    this.delaySend.connect(this.delayNode);
    this.delayNode.connect(delayFilter);
    delayFilter.connect(delayClip);
    delayClip.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNodeR);
    this.delayNodeR.connect(delayFilterR);
    delayFilterR.connect(this.delayFeedbackCross);
    this.delayFeedbackCross.connect(this.delayNode);

    delayFilter.connect(this.delayPanL);
    delayFilterR.connect(this.delayPanR);
    this.delayPanL.connect(this.breakdownFilter);
    this.delayPanR.connect(this.breakdownFilter);

    // Comb Filter routing
    this.combInput.connect(this.combDelay);
    this.combDelay.connect(combDamp);
    combDamp.connect(this.combFeedback);
    this.combFeedback.connect(this.combDelay);
    combDamp.connect(this.combWetGain);
    this.combWetGain.connect(this.breakdownFilter);

    // Gated Reverb routing
    this.gatedReverbInput.connect(this.gatedReverbNode);
    this.gatedReverbNode.connect(this.gatedReverbGate);
    this.gatedReverbGate.connect(this.percBus);

    // Master chain (percBus bypasses kick saturation/limiter so kick never squashes clap/hats)
    this.breakdownFilter.connect(this.crusher);
    this.crusher.connect(this.saturator);
    this.saturator.connect(limiter);

    // 3-Band DJ Isolator EQ (parallel 220Hz / 2.8kHz crossover) -> Bipolar DJ Filter -> Master Gain
    const eqInput = ctx.createGain();
    limiter.connect(eqInput);
    this.percBus.connect(eqInput);

    const lowLp = ctx.createBiquadFilter();
    lowLp.type = 'lowpass';
    lowLp.frequency.value = 220;
    lowLp.Q.value = 0.707;
    this.eqLowGain = ctx.createGain();
    this.eqLowGain.gain.value = 1;

    const midHp = ctx.createBiquadFilter();
    midHp.type = 'highpass';
    midHp.frequency.value = 220;
    midHp.Q.value = 0.707;
    const midLp = ctx.createBiquadFilter();
    midLp.type = 'lowpass';
    midLp.frequency.value = 2800;
    midLp.Q.value = 0.707;
    this.eqMidGain = ctx.createGain();
    this.eqMidGain.gain.value = 1;

    const highHp = ctx.createBiquadFilter();
    highHp.type = 'highpass';
    highHp.frequency.value = 2800;
    highHp.Q.value = 0.707;
    this.eqHighGain = ctx.createGain();
    this.eqHighGain.gain.value = 1;

    this.djFilterNode = ctx.createBiquadFilter();
    this.djFilterNode.type = 'lowpass';
    this.djFilterNode.frequency.value = 20000;
    this.djFilterNode.Q.value = 0.707;

    eqInput.connect(lowLp);
    lowLp.connect(this.eqLowGain);
    this.eqLowGain.connect(this.djFilterNode);

    eqInput.connect(midHp);
    midHp.connect(midLp);
    midLp.connect(this.eqMidGain);
    this.eqMidGain.connect(this.djFilterNode);

    eqInput.connect(highHp);
    highHp.connect(this.eqHighGain);
    this.eqHighGain.connect(this.djFilterNode);

    this.djFilterNode.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.syncParameters();
  }

  /** Connect a voice output to per-channel Delay & Reverb Dub Matrix sends */
  public connectDubSends(node: AudioNode, channel: DubChannel): void {
    const ch = this.channelSends?.[channel];
    if (!ch) return;
    node.connect(ch.delay);
    node.connect(ch.reverb);
  }

  /** Trigger 80s-style Gated Reverb burst on clap/tom hits */
  public triggerGatedReverb(node: AudioNode, time: number): void {
    if (!this.ctx || state.gatedReverbMix <= 0.01) return;
    node.connect(this.gatedReverbInput);
    const g = this.gatedReverbGate.gain;
    const holdSec = 0.04 + state.gatedReverbTime * 0.26;
    g.cancelScheduledValues(time);
    g.setValueAtTime(state.gatedReverbMix * 0.9, time);
    g.setValueAtTime(state.gatedReverbMix * 0.9, time + holdSec);
    g.linearRampToValueAtTime(0.0001, time + holdSec + 0.025);
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

    // Filter cutoff (exponential 140Hz .. 8500Hz) + S&H / EnvFol modulation
    const cutoff = 140 * Math.pow(60, effFilter);
    const driftDarkness = 0.45 + 0.55 * state.minimalAmount;
    const shCutMul =
      state.shRate !== 'off' && state.shDest === 'cutoff'
        ? Math.pow(2, state.shValue * state.shDepth * 1.6)
        : 1;
    const envCutMul =
      state.envFolSource !== 'off' && state.envFolDest === 'cutoff'
        ? 1 + state.envFolLevel * state.envFolAmount * 2.2
        : 1;
    const baseFilterHz = Math.max(80, Math.min(16000, cutoff * driftDarkness * shCutMul * envCutMul));
    this.masterFilter.frequency.setTargetAtTime(baseFilterHz, now, 0.04);
    this.masterFilter.Q.setTargetAtTime(0.7 + state.resonanceNorm * 4.5, now, 0.05);

    // LFO 2 sync
    if (this.lfo2Osc.type !== state.lfo2Shape) this.lfo2Osc.type = state.lfo2Shape;
    const lfo2Hz = 0.1 * Math.pow(120, state.lfo2Rate);
    this.lfo2Osc.frequency.setTargetAtTime(lfo2Hz, now, 0.03);
    const lfo2D = state.lfo2Depth;
    this.lfo2CutoffGain.gain.setTargetAtTime(
      state.lfo2Dest === 'cutoff' ? baseFilterHz * 0.65 * lfo2D : 0,
      now,
      0.04
    );
    this.lfo2ResoGain.gain.setTargetAtTime(
      state.lfo2Dest === 'reso' ? 4.5 * lfo2D : 0,
      now,
      0.04
    );
    this.lfo2PanGain.gain.setTargetAtTime(
      state.lfo2Dest === 'pan' ? 0.9 * lfo2D : 0,
      now,
      0.04
    );
    this.lfo2CombGain.gain.setTargetAtTime(
      state.lfo2Dest === 'comb' ? 0.008 * lfo2D : 0,
      now,
      0.04
    );

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
    const envFbBoost =
      state.envFolSource !== 'off' && state.envFolDest === 'delayFb'
        ? state.envFolLevel * state.envFolAmount * 0.35
        : 0;
    const fbVal = Math.min(0.92, state.delayFeedback * 0.78 + space * 0.16 + modeFbBoost + tension * 0.14 + envFbBoost);
    this.delayFeedback.gain.setTargetAtTime(fbVal, now, 0.06);
    this.delayFeedbackCross.gain.setTargetAtTime(state.pingPong ? fbVal : fbVal * 0.5, now, 0.06);
    this.delayPanL.pan.setTargetAtTime(state.pingPong ? -0.78 : -0.1, now, 0.05);
    this.delayPanR.pan.setTargetAtTime(state.pingPong ? 0.78 : 0.1, now, 0.05);

    // Per-channel Dub Matrix sends
    for (const ch of Object.keys(this.channelSends) as DubChannel[]) {
      const bus = this.channelSends[ch];
      bus.delay.gain.setTargetAtTime(state.dubDelaySend[ch], now, 0.03);
      bus.reverb.gain.setTargetAtTime(state.dubReverbSend[ch], now, 0.03);
    }

    // Comb Filter / Resonator
    const combSec = 0.001 + state.combTune * 0.029;
    this.combDelay.delayTime.setTargetAtTime(combSec, now, 0.03);
    this.combFeedback.gain.setTargetAtTime(Math.min(0.92, state.combFeedback * 0.92), now, 0.03);
    this.combWetGain.gain.setTargetAtTime(state.combMix * 0.65, now, 0.03);

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
    this.delayNodeR.delayTime.setTargetAtTime(delaySec, now, 0.06);

    const driveCurveAmt = 2 + state.driveAmount * 52;
    this.saturator.curve = makeSaturationCurve(driveCurveAmt);

    // Experimental Ring Modulator
    this.ringGain.gain.setTargetAtTime(1 - state.ringMod * 0.45, now, 0.04);
    this.ringDepth.gain.setTargetAtTime(state.ringMod * 0.95, now, 0.04);

    // 3-Band DJ Isolator EQ (0.75 = unity 0dB, 1.0 = +5dB, 0 = cut, Kill = 0)
    const mapEqGain = (val: number, killed: boolean): number => {
      if (killed) return 0;
      if (val <= 0.75) return Math.pow(Math.max(0, val) / 0.75, 1.8);
      return 1 + ((val - 0.75) / 0.25) * 0.8;
    };
    this.eqLowGain.gain.setTargetAtTime(mapEqGain(state.eqLow, state.eqKill.low), now, 0.02);
    this.eqMidGain.gain.setTargetAtTime(mapEqGain(state.eqMid, state.eqKill.mid), now, 0.02);
    this.eqHighGain.gain.setTargetAtTime(mapEqGain(state.eqHigh, state.eqKill.high), now, 0.02);

    // Bipolar DJ Master Filter (center 0.5 = bypass, <0.5 = resonant LPF, >0.5 = resonant HPF)
    const dj = state.djFilter;
    if (Math.abs(dj - 0.5) < 0.02) {
      if (this.djFilterNode.type !== 'lowpass') this.djFilterNode.type = 'lowpass';
      this.djFilterNode.frequency.setTargetAtTime(20000, now, 0.03);
      this.djFilterNode.Q.setTargetAtTime(0.707, now, 0.03);
    } else if (dj < 0.5) {
      if (this.djFilterNode.type !== 'lowpass') this.djFilterNode.type = 'lowpass';
      const t = dj / 0.48;
      const freq = 120 * Math.pow(150, Math.max(0, Math.min(1, t)));
      this.djFilterNode.frequency.setTargetAtTime(freq, now, 0.025);
      this.djFilterNode.Q.setTargetAtTime(2.4, now, 0.03);
    } else {
      if (this.djFilterNode.type !== 'highpass') this.djFilterNode.type = 'highpass';
      const t = (dj - 0.52) / 0.48;
      const freq = 25 * Math.pow(240, Math.max(0, Math.min(1, t)));
      this.djFilterNode.frequency.setTargetAtTime(freq, now, 0.025);
      this.djFilterNode.Q.setTargetAtTime(2.4, now, 0.03);
    }
  }
}

