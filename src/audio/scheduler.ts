import { AudioEngine } from './engine';
import { LoopRecorder } from './recorder';
import { ELECTRO_SAMPLES, triggerElectroBleep, triggerElectroSample } from './samples';
import { HarmonyMode, state } from '../state/store';
import { midiToFreq, scaleIndexToMidi } from './theory';
import {
  DroneBed,
  triggerBassOrPluck,
  triggerChordStab,
  triggerClapOrSnare,
  triggerHatOrRim,
  triggerKick,
  triggerLeadNote,
  triggerMicroPerc,
  triggerNodeVoice,
  triggerTomOrRim,
} from './voices';

function getHarmonyOffsets(mode: HarmonyMode): number[] {
  switch (mode) {
    case 'third':
      return [0, 2];
    case 'fifth':
      return [0, 4];
    case 'oct':
      return [0, 7];
    case 'triad':
      return [0, 2, 4];
    default:
      return [0];
  }
}

export class Scheduler {
  private engine: AudioEngine;
  private drone: DroneBed;
  private recorder: LoopRecorder;
  private timerId: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private barCount = 0;
  private arpStep = 0;
  private stutterStep = 0;
  private lastLeadFreq: number | null = null;

  private readonly lookaheadMs = 25;
  private readonly scheduleAheadSec = 0.1;

  constructor(engine: AudioEngine, drone: DroneBed, recorder: LoopRecorder) {
    this.engine = engine;
    this.drone = drone;
    this.recorder = recorder;
  }

  public start(): void {
    if (this.timerId !== null) return;
    this.nextStepTime = this.engine.ctx.currentTime + 0.05;
    this.timerId = window.setInterval(() => this.tick(), this.lookaheadMs);
  }

  public stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private getStepDurationSec(): number {
    const tapeSlowdown = state.fx.tapeSag ? 1.55 : 1.0;
    const stutterSpeed = state.fx.stutter ? 0.5 : 1.0;
    return (60 / state.bpm / 4) * tapeSlowdown * stutterSpeed;
  }

  private tick(): void {
    if (!state.playing) return;
    const ctx = this.engine.ctx;

    while (this.nextStepTime < ctx.currentTime + this.scheduleAheadSec) {
      const stepDur = this.getStepDurationSec();
      const activeStep = state.fx.stutter ? this.stutterStep : this.step;

      if (activeStep === 0 && !state.fx.stutter) {
        this.recorder.onBarDownbeat(stepDur);
        if (state.arranger.enabled) {
          this.recorder.syncArrangerBar(state.arranger.currentBar, this.nextStepTime);
          state.arranger.currentBar = (state.arranger.currentBar + 1) % 16;
        }
      }

      this.scheduleStep(activeStep, this.nextStepTime, stepDur);

      if (!state.fx.stutter) {
        this.stutterStep = this.step;
        this.step = (this.step + 1) % 16;
        if (this.step === 0) {
          this.barCount++;
        }
      }
      this.nextStepTime += stepDur;
    }

    this.drone.update(this.engine);
    this.engine.syncParameters();
  }

  private scheduleStep(step: number, time: number, stepDur: number): void {
    state.currentStep = step;
    state.currentBar = this.barCount;
    if (state.muteLiveSynth) return;

    const kCfg = state.patterns.kick;
    const kickSlotId = kCfg.seq[this.barCount % kCfg.length];
    const activeKick = kCfg.slots[kickSlotId] ?? state.kickSteps;

    const pCfg = state.patterns.perc;
    const percSlotId = pCfg.seq[this.barCount % pCfg.length];
    const activePerc = pCfg.slots[percSlotId] ?? {
      perc: state.percSteps,
      hat: state.hatSteps,
      clap: state.clapSteps,
      tom: state.tomSteps,
    };

    const bCfg = state.patterns.bass;
    const bassSlotId = bCfg.seq[this.barCount % bCfg.length];
    const activeBass = bCfg.slots[bassSlotId] ?? state.latchedIndices;

    const lCfg = state.patterns.lead;
    const leadSlotId = lCfg.seq[this.barCount % lCfg.length];
    const activeLead = lCfg.slots[leadSlotId] ?? state.melody;

    const minimal = state.minimalAmount;
    const swungTime = time + (step % 2 === 1 ? stepDur * state.swingAmount : 0);
    const jitter = state.humanize > 0 ? (Math.random() - 0.5) * 0.018 * state.humanize : 0;
    const grooveTime = Math.max(time, swungTime + jitter);

    // 1. Kick (editable 16-step pattern) + sidechain pump
    if (!state.mutes.kick && !state.fx.breakdown && activeKick[step] && minimal > 0.12) {
      const kickLevel = Math.min(1, minimal * 1.15);
      triggerKick(this.engine, swungTime, kickLevel);
      this.engine.triggerSidechainDuck(swungTime);
      state.kickPulse = 1.0;
    }

    // 2. Micro-Percussion, Hat, Clap, Tom/Rim & 4-Bar Auto Fill
    const inAutoFill = state.autoFill && this.barCount % 4 === 3 && step >= 12;
    const inTensionRoll = state.tensionAmount > 0.45 && step % 2 === 1 && Math.random() < (state.tensionAmount - 0.45) * 1.4;
    if (inAutoFill && step === 12) {
      triggerElectroSample(this.engine, 3, grooveTime, state.samplePitch); // RISER sweep into bar 1
    }
    if (minimal > 0.08) {
      const ghostPerc = state.ghostProb > 0 && !activePerc.perc[step] && Math.random() < state.ghostProb * 0.35;
      if (!state.mutes.perc && (activePerc.perc[step] || inAutoFill || ghostPerc)) {
        const accent = !ghostPerc && (step % 4 === 2 || step === 15 || inAutoFill);
        triggerMicroPerc(this.engine, grooveTime, accent, state.filterCutoffNorm);
        if (state.glitchProb > 0 && Math.random() < state.glitchProb * 0.45) {
          triggerMicroPerc(this.engine, grooveTime + stepDur * 0.5, false, state.filterCutoffNorm);
        }
      }
      const ghostHat = state.ghostProb > 0 && !activePerc.hat[step] && Math.random() < state.ghostProb * 0.3;
      if (!state.mutes.hat && (activePerc.hat[step] || inAutoFill || inTensionRoll || ghostHat)) {
        triggerHatOrRim(this.engine, grooveTime, step % 4 === 2 && !ghostHat);
      }
      if (!state.mutes.clap && activePerc.clap[step]) {
        triggerClapOrSnare(this.engine, grooveTime);
      }
      if (!state.mutes.tom && activePerc.tom[step]) {
        triggerTomOrRim(this.engine, grooveTime);
      }
      if (!state.mutes.stab && state.stabSteps[step]) {
        triggerChordStab(this.engine, grooveTime);
      }
    }

    // 3. Rolling Minimal Bass / Latched Notes (independent from Arp speed)
    if (!state.mutes.bass && activeBass.length > 0) {
      const shouldPlay =
        state.bassSpeed === 2
          ? true
          : state.bassSpeed === 1
            ? step % 2 === 0 || step % 4 === 3
            : step % 4 === 0;

      if (shouldPlay) {
        const noteIdx = activeBass[step % activeBass.length];
        const octShift = state.bassOctaveOffset - (state.subDrop ? 1 : 0);
        const midi = scaleIndexToMidi(noteIdx, octShift);
        const accent = step % 4 === 2;
        triggerBassOrPluck(this.engine, swungTime, midiToFreq(midi), { accent });
      }
    }

    // 4. Sketched & Quantized Lead Melody (with Harmony & Glide)
    const harmony = getHarmonyOffsets(state.harmonyMode);
    const melodyIdx = activeLead[step];
    if (!state.mutes.lead && melodyIdx !== null && melodyIdx !== undefined) {
      harmony.forEach((offset, hIdx) => {
        const midi = scaleIndexToMidi(melodyIdx + offset, state.bassOctaveOffset + 1);
        const freq = midiToFreq(midi);
        triggerLeadNote(
          this.engine,
          swungTime,
          freq,
          state.leadVoice,
          hIdx === 0 ? this.lastLeadFreq : null
        );
        if (hIdx === 0) this.lastLeadFreq = freq;
      });
    }

    // 4b. Arpeggiator (with Harmony, Rhythm Gate, Octave Shift & Probability)
    if (!state.mutes.lead && state.arpMode !== 'off' && state.minimalAmount > 0.08) {
      const arpInterval =
        state.arpMultiplier === 2
          ? 1
          : state.arpMultiplier === 1.5
            ? 3
            : state.arpMultiplier === 1
              ? 2
              : 4;
      if (step % arpInterval === 0) {
        const rhythmStep = this.arpStep % 8;
        const rhythmPass =
          state.arpRhythm === 'all'
            ? true
            : state.arpRhythm === 'sync'
              ? [true, true, false, true, true, false, true, false][rhythmStep]
              : state.arpRhythm === 'poly'
                ? [true, false, true, true, false, true, false, true][rhythmStep]
                : [true, false, false, true, false, true, false, false][rhythmStep];

        const rawSketched = activeLead.filter(
          (n): n is number => n !== null && n !== undefined
        );
        const baseSource = rawSketched.length >= 1 ? rawSketched : state.arpSeedIndices;
        const basePool =
          state.arpMode === 'order'
            ? baseSource
            : Array.from(new Set(baseSource)).sort((a, b) => a - b);

        const pool: number[] = [];
        for (let oct = 0; oct < state.arpOctaves; oct++) {
          for (const n of basePool) pool.push(n + oct * 7);
        }

        if (pool.length > 0) {
          let idx = 0;
          if (state.arpMode === 'up' || state.arpMode === 'order') {
            idx = this.arpStep % pool.length;
          } else if (state.arpMode === 'down') {
            idx = pool.length - 1 - (this.arpStep % pool.length);
          } else if (state.arpMode === 'updown') {
            const span = Math.max(1, pool.length * 2 - 2);
            const pos = this.arpStep % span;
            idx = pos < pool.length ? pos : span - pos;
          } else if (state.arpMode === 'downup') {
            const span = Math.max(1, pool.length * 2 - 2);
            const pos = this.arpStep % span;
            const upDownIdx = pos < pool.length ? pos : span - pos;
            idx = pool.length - 1 - upDownIdx;
          } else {
            idx = Math.floor(Math.random() * pool.length);
          }
          this.arpStep++;

          if (rhythmPass && Math.random() <= state.arpProb) {
            const glitchOct =
              state.glitchProb > 0 && Math.random() < state.glitchProb * 0.4 ? 1 : 0;
            harmony.forEach((offset, hIdx) => {
              const midi = scaleIndexToMidi(
                pool[idx] + offset,
                state.bassOctaveOffset + 1 + state.arpOctaveShift + glitchOct
              );
              const freq = midiToFreq(midi);
              triggerLeadNote(
                this.engine,
                swungTime,
                freq,
                state.leadVoice,
                hIdx === 0 ? this.lastLeadFreq : null
              );
              if (hIdx === 0) this.lastLeadFreq = freq;
            });
          }
        }
      }
    }

    // 5. Old-Fashioned Electro Samples & Procedural Blips/Bleeps
    if (state.bleepProb > 0 && Math.random() < state.bleepProb * 0.42) {
      triggerElectroBleep(this.engine, swungTime);
    }
    if (state.sampleAutoMode === 'bar' && step === 0 && this.barCount % 2 === 0) {
      const sIdx = Math.floor(Math.random() * ELECTRO_SAMPLES.length);
      triggerElectroSample(this.engine, sIdx, swungTime, state.samplePitch);
    } else if (
      state.sampleAutoMode === 'groove' &&
      (step === 6 || step === 14) &&
      Math.random() < 0.65
    ) {
      const sIdx = Math.floor(Math.random() * ELECTRO_SAMPLES.length);
      triggerElectroSample(this.engine, sIdx, swungTime, state.samplePitch);
    }

    // 6. Per-Target Geometric Pattern Cycler (Bass / Arp / Pad / Filter) — advances every beat
    state.geometryEdgeProgress = (step % 4) / 4;
    if (step % 4 === 0 && !state.fx.stutter) {
      const targets = ['bass', 'arp', 'pad', 'filter'] as const;
      for (const t of targets) {
        const shape = state.geomShapes[t];
        if (shape === 'off') continue;
        const sides = shape === 'triangle' ? 3 : shape === 'square' ? 4 : 5;
        state.geomVertices[t] = (state.geomVertices[t] + 1) % sides;
        const v = state.geomVertices[t];

        if (t === 'bass') {
          const octs = [0, 1, -1, 0, -1];
          state.bassOctaveOffset = octs[v % sides];
        } else if (t === 'arp') {
          const arps = [1, 2, 0.5, 1, 2];
          state.arpMultiplier = arps[v % sides];
        } else if (t === 'pad') {
          const chords = ['minor', 'sus2', 'shimmer', 'drone', 'minor'] as const;
          state.padChord = chords[v % sides];
        } else {
          const filters = [0.35, 0.62, 0.82, 0.48, 0.25];
          state.filterCutoffNorm = filters[v % sides];
        }
      }
    }
  }
}
