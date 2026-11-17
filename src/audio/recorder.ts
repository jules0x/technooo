import { AudioEngine } from './engine';
import { state } from '../state/store';

export class LoopRecorder {
  private engine: AudioEngine;
  private processor: ScriptProcessorNode | null = null;
  private silentSink: GainNode | null = null;
  private activeSources = new Map<number, AudioBufferSourceNode>();
  private recLeft: Float32Array[] = [];
  private recRight: Float32Array[] = [];
  private recSamples = 0;
  private targetSamples = 0;
  private onSlotsChanged: () => void;

  constructor(engine: AudioEngine, onSlotsChanged: () => void) {
    this.engine = engine;
    this.onSlotsChanged = onSlotsChanged;
  }

  public initTap(): void {
    if (this.processor || !this.engine.ctx) return;
    const ctx = this.engine.ctx;
    this.processor = ctx.createScriptProcessor(2048, 2, 2);
    this.silentSink = ctx.createGain();
    this.silentSink.gain.value = 0;

    this.processor.onaudioprocess = (ev) => {
      if (!state.capture.recording) return;
      const inL = ev.inputBuffer.getChannelData(0);
      const inR = ev.inputBuffer.getChannelData(1);
      this.recLeft.push(new Float32Array(inL));
      this.recRight.push(new Float32Array(inR));
      this.recSamples += inL.length;

      if (this.recSamples >= this.targetSamples) {
        this.finalizeCapture();
      }
    };

    this.engine.masterGain.connect(this.processor);
    this.processor.connect(this.silentSink);
    this.silentSink.connect(ctx.destination);
  }

  public armCapture(slotIndex: number, bars: 1 | 2): void {
    this.initTap();
    state.capture.armed = true;
    state.capture.recording = false;
    state.capture.targetSlot = slotIndex;
    state.capture.bars = bars;
    this.onSlotsChanged();
  }

  /** Called by Scheduler on step === 0 (exact bar downbeat) */
  public onBarDownbeat(stepDur: number): void {
    if (state.capture.armed && !state.capture.recording) {
      state.capture.armed = false;
      state.capture.recording = true;
      this.recLeft = [];
      this.recRight = [];
      this.recSamples = 0;
      const barSec = stepDur * 16 * state.capture.bars;
      this.targetSamples = Math.floor(barSec * this.engine.ctx.sampleRate);
      this.onSlotsChanged();
    }
  }

  private finalizeCapture(): void {
    state.capture.recording = false;
    const ctx = this.engine.ctx;
    const len = Math.max(1, this.targetSamples);
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    const outL = buffer.getChannelData(0);
    const outR = buffer.getChannelData(1);

    let offset = 0;
    for (let i = 0; i < this.recLeft.length && offset < len; i++) {
      const chunkL = this.recLeft[i];
      const chunkR = this.recRight[i];
      const copyLen = Math.min(chunkL.length, len - offset);
      outL.set(chunkL.subarray(0, copyLen), offset);
      outR.set(chunkR.subarray(0, copyLen), offset);
      offset += copyLen;
    }

    // Compute 48-bar waveform peaks for UI
    const numPeaks = 48;
    const blockSize = Math.max(1, Math.floor(len / numPeaks));
    const peaks: number[] = [];
    for (let p = 0; p < numPeaks; p++) {
      let max = 0;
      const start = p * blockSize;
      const end = Math.min(len, start + blockSize);
      for (let i = start; i < end; i += 8) {
        const v = Math.max(Math.abs(outL[i]), Math.abs(outR[i]));
        if (v > max) max = v;
      }
      peaks.push(Math.min(1, max));
    }

    const slot = state.memorySlots[state.capture.targetSlot];
    if (slot) {
      slot.buffer = buffer;
      slot.bars = state.capture.bars;
      slot.peaks = peaks;
    }
    this.recLeft = [];
    this.recRight = [];
    this.onSlotsChanged();
  }

  public toggleSlotPlay(slotIndex: number): void {
    const slot = state.memorySlots[slotIndex];
    if (!slot || !slot.buffer) return;

    if (slot.playing) {
      this.stopSlot(slotIndex);
    } else {
      this.startSlot(slotIndex, this.engine.ctx.currentTime + 0.02, true);
    }
    this.onSlotsChanged();
  }

  public startSlot(slotIndex: number, when: number, loop = true): void {
    const slot = state.memorySlots[slotIndex];
    if (!slot || !slot.buffer) return;
    this.stopSlot(slotIndex);

    const src = this.engine.ctx.createBufferSource();
    src.buffer = slot.buffer;
    src.loop = loop;
    src.connect(this.engine.masterGain);
    src.start(when);
    src.onended = () => {
      if (this.activeSources.get(slotIndex) === src) {
        this.activeSources.delete(slotIndex);
        slot.playing = false;
        this.onSlotsChanged();
      }
    };
    this.activeSources.set(slotIndex, src);
    slot.playing = true;
  }

  public stopSlot(slotIndex: number): void {
    const existing = this.activeSources.get(slotIndex);
    if (existing) {
      try {
        existing.stop();
      } catch {
        // ignore already stopped
      }
      this.activeSources.delete(slotIndex);
    }
    const slot = state.memorySlots[slotIndex];
    if (slot) slot.playing = false;
  }

  public stopAllSlots(): void {
    for (let i = 0; i < state.memorySlots.length; i++) {
      this.stopSlot(i);
    }
    this.onSlotsChanged();
  }

  /** Called on each bar downbeat when Arranger is enabled */
  public syncArrangerBar(barIndex: number, when: number): void {
    if (!state.arranger.enabled) return;
    for (let s = 0; s < 8; s++) {
      const shouldPlay = state.arranger.grid[s][barIndex];
      const slot = state.memorySlots[s];
      if (!slot || !slot.buffer) continue;
      if (shouldPlay && !slot.playing) {
        this.startSlot(s, when, true);
      } else if (!shouldPlay && slot.playing) {
        this.stopSlot(s);
      }
    }
    this.onSlotsChanged();
  }

  public exportSlotWav(slotIndex: number): void {
    const slot = state.memorySlots[slotIndex];
    if (!slot || !slot.buffer) return;
    const wavBlob = audioBufferToWav(slot.buffer);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drift-slot-${slotIndex + 1}-${state.bpm}bpm.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataSize = length * numChannels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;
  let pos = 44;
  for (let i = 0; i < length; i++) {
    const l = Math.max(-1, Math.min(1, ch0[i]));
    const r = Math.max(-1, Math.min(1, ch1[i]));
    view.setInt16(pos, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    pos += 2;
    if (numChannels > 1) {
      view.setInt16(pos, r < 0 ? r * 0x8000 : r * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

