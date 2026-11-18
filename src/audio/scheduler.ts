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
  private lastBassFreq: number | null = null;

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

    // Sample & Hold + Envelope Follower decay
    state.envFolLevel *= 0.65;
    if (state.shRate !== 'off') {
      const shDiv = state.shRate === '1/16' ? 1 : state.shRate === '1/8' ? 2 : state.shRate === '1/4' ? 4 : 8;
      if (step % shDiv === 0) {
        state.shValue = Math.random() * 2 - 1;
      }
    }

    // Polyrhythmic step indices per track (1..16)
    const kStep = step % Math.max(1, state.trackLengths.kick);
    const pStep = step % Math.max(1, state.trackLengths.perc);
    const hStep = step % Math.max(1, state.trackLengths.hat);
    const cStep = step % Math.max(1, state.trackLengths.clap);
    const tStep = step % Math.max(1, state.trackLengths.tom);
    const bStep = step % Math.max(1, state.trackLengths.bass);
    const lStep = step % Math.max(1, state.trackLengths.lead);

    // Turing Machine probabilistic mutation
    if (state.turingEnabled && state.turingMutate > 0 && Math.random() < state.turingMutate * 0.35) {
      const mIdx = state.turingTarget === 'bass' ? bStep : lStep;
      state.turingBuffer[mIdx] = Math.floor(Math.random() * 14);
    }

    const getRatchets = (row: 'perc' | 'hat' | 'clap', rowStep: number): number => {
      const fixed = state.ratchetSteps[row][rowStep] ?? 1;
      if (fixed > 1) return fixed;
      if (state.ratchetProb > 0 && Math.random() < state.ratchetProb * 0.45) {
        return Math.random() < 0.35 ? 3 : 2;
      }
      return 1;
    };

    // 1. Kick (editable 16-step pattern) + sidechain pump
    if (!state.mutes.kick && !state.fx.breakdown && activeKick[kStep] && minimal > 0.12) {
      const kickLevel = Math.min(1, minimal * 1.15);
      triggerKick(this.engine, swungTime, kickLevel);
      this.engine.triggerSidechainDuck(swungTime);
      state.kickPulse = 1.0;
      if (state.envFolSource === 'kick') state.envFolLevel = 1.0;
    }

    // 2. Micro-Percussion, Hat, Clap, Tom/Rim & 4-Bar Auto Fill
    const inAutoFill = state.autoFill && this.barCount % 4 === 3 && step >= 12;
    const inTensionRoll = state.tensionAmount > 0.45 && step % 2 === 1 && Math.random() < (state.tensionAmount - 0.45) * 1.4;
    if (inAutoFill && step === 12) {
      triggerElectroSample(this.engine, 3, grooveTime, state.samplePitch); // RISER sweep into bar 1
    }
    if (minimal > 0.08) {
      const ghostPerc = state.ghostProb > 0 && !activePerc.perc[pStep] && Math.random() < state.ghostProb * 0.35;
      if (!state.mutes.perc && (activePerc.perc[pStep] || inAutoFill || ghostPerc)) {
        const accent = !ghostPerc && (pStep % 4 === 2 || pStep === 15 || inAutoFill);
        const rCount = getRatchets('perc', pStep);
        for (let r = 0; r < rCount; r++) {
          triggerMicroPerc(this.engine, grooveTime + (stepDur / rCount) * r, accent && r === 0, state.filterCutoffNorm);
        }
        if (state.envFolSource === 'perc') state.envFolLevel = 1.0;
        if (state.glitchProb > 0 && Math.random() < state.glitchProb * 0.45) {
          triggerMicroPerc(this.engine, grooveTime + stepDur * 0.5, false, state.filterCutoffNorm);
        }
      }
      const ghostHat = state.ghostProb > 0 && !activePerc.hat[hStep] && Math.random() < state.ghostProb * 0.3;
      if (!state.mutes.hat && (activePerc.hat[hStep] || inAutoFill || inTensionRoll || ghostHat)) {
        const rCount = getRatchets('hat', hStep);
        for (let r = 0; r < rCount; r++) {
          triggerHatOrRim(this.engine, grooveTime + (stepDur / rCount) * r, hStep % 4 === 2 && !ghostHat && r === 0);
        }
      }
      if (!state.mutes.clap && activePerc.clap[cStep]) {
        const rCount = getRatchets('clap', cStep);
        for (let r = 0; r < rCount; r++) {
          triggerClapOrSnare(this.engine, grooveTime + (stepDur / rCount) * r);
        }
        if (state.envFolSource === 'clap') state.envFolLevel = 1.0;
      }
      if (!state.mutes.tom && activePerc.tom[tStep]) {
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
            ? bStep % 2 === 0 || bStep % 4 === 3
            : bStep % 4 === 0;

      if (shouldPlay) {
        const noteIdx =
          state.turingEnabled && state.turingTarget === 'bass'
            ? state.turingBuffer[bStep] % 8
            : activeBass[bStep % activeBass.length];
        const octShift = state.bassOctaveOffset - (state.subDrop ? 1 : 0);
        const midi = scaleIndexToMidi(noteIdx, octShift);
        const freq = midiToFreq(midi);
        const accent = state.bassAccents[bStep % 16];
        const slide = state.bassSlides[bStep % 16];
        triggerBassOrPluck(this.engine, swungTime, freq, {
          accent,
          slide,
          prevFreq: this.lastBassFreq,
        });
        this.lastBassFreq = freq;
      }
    }

    // 4. Sketched & Quantized Lead Melody (or Turing Machine Lead)
    const harmony = getHarmonyOffsets(state.harmonyMode);
    const turingLeadIdx =
      state.turingEnabled && state.turingTarget === 'lead' && (lStep % 2 === 0 || state.turingBuffer[lStep] % 3 !== 0)
        ? state.turingBuffer[lStep]
        : null;
    const melodyIdx = turingLeadIdx !== null ? turingLeadIdx : activeLead[lStep];
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
