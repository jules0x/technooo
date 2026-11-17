import { state } from '../state/store';

export interface ScaleDef {
  name: string;
  rootMidi: number;
  intervals: number[];
}

export const SCALES: ScaleDef[] = [
  { name: 'C PHRYGIAN', rootMidi: 36, intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'F MINOR', rootMidi: 41, intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'D DORIAN', rootMidi: 38, intervals: [0, 2, 3, 5, 7, 9, 10] },
];

export function getActiveScale(): ScaleDef {
  return SCALES[state.scaleIndex % SCALES.length];
}

export function scaleIndexToMidi(index: number, octaveOffset = 0): number {
  const scale = getActiveScale();
  const len = scale.intervals.length;
  const wrapped = ((index % len) + len) % len;
  const oct = Math.floor(index / len) + octaveOffset;
  return scale.rootMidi + state.rootOffset + scale.intervals[wrapped] + oct * 12;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Map normalized radar coordinates (0..1) to a scale-locked MIDI note */
export function canvasPosToMidi(x: number, y: number): number {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const dist = Math.min(1, Math.hypot(dx, dy) * 2);
  const index = Math.round(dist * 14);
  return scaleIndexToMidi(index, 1);
}

/** Continuous normalized angle (0..1) clockwise from 12 o'clock within the radar */
export function canvasPosToAngleNorm(x: number, y: number): number {
  const angle = Math.atan2(y - 0.5, x - 0.5);
  return (((angle + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
}

/** Approximate a hand-drawn 0..1 curve into a quantized 16-step scale-locked melody */
export function quantizeMelodyPath(
  path: { x: number; y: number }[],
  quantize: 1 | 2 | 4
): (number | null)[] {
  const result: (number | null)[] = new Array(16).fill(null);
  if (path.length === 0) return result;

  const buckets: number[][] = Array.from({ length: 16 }, () => []);
  for (const pt of path) {
    const rawStep = Math.max(0, Math.min(15, Math.floor(pt.x * 16)));
    const snappedStep = rawStep - (rawStep % quantize);
    // y=0 is top (index 13), y=1 is bottom (index 0)
    const noteIdx = Math.max(0, Math.min(13, Math.round((1 - pt.y) * 13)));
    buckets[snappedStep].push(noteIdx);
  }

  for (let s = 0; s < 16; s++) {
    if (buckets[s].length > 0) {
      const avg = buckets[s].reduce((a, b) => a + b, 0) / buckets[s].length;
      result[s] = Math.round(avg);
    }
  }
  return result;
}

export function canvasPosToStep(x: number, y: number): number {
  return Math.floor(canvasPosToAngleNorm(x, y) * 16) % 16;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** Generate a Euclidean rhythm boolean array of length `steps` with `pulses` hits */
export function euclidean(pulses: number, steps: number, rotation = 0): boolean[] {
  const clampedPulses = Math.max(0, Math.min(steps, pulses));
  const pattern: boolean[] = new Array(steps).fill(false);
  if (clampedPulses === 0) return pattern;

  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += clampedPulses;
    if (bucket >= steps) {
      bucket -= steps;
      pattern[(i + rotation) % steps] = true;
    }
  }
  return pattern;
}
