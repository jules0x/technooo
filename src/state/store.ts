import { euclidean } from '../audio/theory';

export type NodeVoice = 'pluck' | 'fm' | 'sub';
export type LeadVoice = 'pluck' | 'acid' | 'fm' | 'reese';
export type KickCharacter = 'tight' | 'sub' | 'punch';
export type PercKit = 'minimal' | 'indust' | 'wood' | 'glitch' | '909' | 'dub';
export type PercTone = 'low' | 'mid' | 'high';
export type NodeDecay = 'short' | 'med' | 'long';
export type RadarViewMode = 'split' | 'gears' | 'arena';
export type GeometryMode = 'off' | 'triangle' | 'square' | 'pentagon';
export type GeomTarget = 'bass' | 'arp' | 'pad' | 'filter';
export type GearQuantize = 16 | 12 | 8 | 4;
export type ArpMode = 'off' | 'up' | 'down' | 'updown' | 'downup' | 'order' | 'random';
export type ArpRhythm = 'all' | 'sync' | 'poly' | 'stab';
export type HarmonyMode = 'off' | 'third' | 'fifth' | 'oct' | 'triad';
export type SynthEnv = 'snap' | 'pluck' | 'swell';
export type SynthDetune = 'clean' | 'warm' | 'wide';
export type LfoRate = 'off' | 'slow' | 'med' | 'fast';
export type LfoDest = 'filter' | 'pan';
export type PadChord = 'drone' | 'minor' | 'sus2' | 'shimmer';
export type PadTexture = 'off' | 'wind' | 'vinyl' | 'sub';
export type PadWash = 'dry' | 'lush' | 'wash';
export type DelaySync = '1/8' | '3/16' | '1/4' | 'slap';
export type SpaceMode = 'dark' | 'cavern' | 'freeze';
export type SampleAutoMode = 'off' | 'bar' | 'groove';
export type BassTone = 'saw' | 'sqr' | 'acid' | 'sub';
export type PatternSlotId = 'A' | 'B' | 'C' | 'D';
export type PatternInst = 'kick' | 'perc' | 'bass' | 'lead';

export interface PercPattern {
  perc: boolean[];
  hat: boolean[];
  clap: boolean[];
  tom: boolean[];
}

export type MuteChannel =
  | 'kick'
  | 'perc'
  | 'hat'
  | 'clap'
  | 'tom'
  | 'bass'
  | 'lead'
  | 'drone'
  | 'stab'
  | 'orbits';

export interface GearRing {
  label: string;
  voice: NodeVoice;
  /** Quantized positions (0..1) within the gearBars loop */
  positions: number[];
  pulse: number;
}

export interface HarmonicNode {
  id: number;
  x: number;
  y: number;
  midi: number;
  voice: NodeVoice;
  pulse: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface MemorySlot {
  id: number;
  name: string;
  buffer: AudioBuffer | null;
  bars: 1 | 2;
  playing: boolean;
  peaks: number[];
}

export interface AppState {
  initialized: boolean;
  playing: boolean;
  muteLiveSynth: boolean;
  viewMode: 'perform' | 'arrange';
  activeModule: string;
  bpm: number;
  minimalAmount: number;
  /** Locked timbre parameters controlled by directional swipes */
  filterCutoffNorm: number;
  spaceNorm: number;
  resonanceNorm: number;
  sidechainDepth: number;
  /** Modulator (LFO) */
  lfoRate: LfoRate;
  lfoDest: LfoDest;
  /** Live pointer coordinates */
  pointerX: number;
  pointerY: number;
  /** Per-item mutes (true = muted) & channel levels (0..1.2) */
  mutes: Record<MuteChannel, boolean>;
  levels: Record<MuteChannel, number>;
  /** 0 = C Phrygian, 1 = F Minor, 2 = D Dorian, plus semitone rootOffset 0..11 */
  scaleIndex: number;
  rootOffset: number;
  /** 0 = Clean, 1 = Warm, 2 = Heavy */
  driveLevel: number;
  driveAmount: number;
  /** Radar / In-Time Orbits & Geometric Pattern Cycler */
  radarView: RadarViewMode;
  gears: GearRing[];
  gearBars: 1 | 2 | 4;
  gearQuantize: GearQuantize;
  gearProgress: number;
  geomTarget: GeomTarget;
  geomShapes: Record<GeomTarget, GeometryMode>;
  geomVertices: Record<GeomTarget, number>;
  geometryEdgeProgress: number;
  activeNodeVoice: NodeVoice;
  nodeDecay: NodeDecay;
  /** Percussion controls (5 rows) */
  kickSteps: boolean[];
  percSteps: boolean[];
  hatSteps: boolean[];
  clapSteps: boolean[];
  tomSteps: boolean[];
  kickCharacter: KickCharacter;
  percKit: PercKit;
  percTone: PercTone;
  swingAmount: number;
  percDensity: number;
  percRotation: number;
  /** Synth / Lead / Harmony / Arp controls */
  bassOctaveOffset: number;
  bassSpeed: 0.5 | 1 | 2;
  bassTone: BassTone;
  bassCutoff: number;
  bassDecay: number;
  stabSteps: boolean[];
  arpMultiplier: number;
  arpSeedIndices: number[];
  arpMode: ArpMode;
  arpOctaves: 1 | 2;
  arpOctaveShift: -1 | 0 | 1;
  arpRhythm: ArpRhythm;
  arpProb: number;
  arpGate: number;
  harmonyMode: HarmonyMode;
  synthEnv: SynthEnv;
  synthDetune: SynthDetune;
  lfoDepth: number;
  latchedIndices: number[];
  leadVoice: LeadVoice;
  leadGlide: boolean;
  /** Quantized 16-step sketched melody (scale index 0..13, or null for rest) */
  melody: (number | null)[];
  melodyRawPath: Point2D[];
  melodyQuantize: 1 | 2 | 4;
  nodes: HarmonicNode[];
  /** Soundscape / Pad & Sound Twist FX */
  padChord: PadChord;
  padTexture: PadTexture;
  padWash: PadWash;
  padLevel: number;
  delaySync: DelaySync;
  delayFeedback: number;
  spaceMode: SpaceMode;
  /** Experimental Techno Modifiers & Master Shaping */
  fmWarp: number;
  ringMod: number;
  crushAmount: number;
  tensionAmount: number;
  ghostProb: number;
  glitchProb: number;
  subDrop: boolean;
  /** Old-fashioned electro samples & procedural blips */
  bleepProb: number;
  sampleAutoMode: SampleAutoMode;
  samplePitch: number;
  /** Producer groove details */
  autoFill: boolean;
  humanize: number;
  tapeWow: number;
  chorusSpread: number;
  /** Momentary performance FX */
  fx: {
    breakdown: boolean;
    tapeSag: boolean;
    stutter: boolean;
  };
  currentStep: number;
  currentBar: number;
  kickPulse: number;
  patterns: {
    kick: {
      editSlot: PatternSlotId;
      length: 1 | 2 | 3 | 4;
      seq: [PatternSlotId, PatternSlotId, PatternSlotId, PatternSlotId];
      slots: Record<PatternSlotId, boolean[] | null>;
    };
    perc: {
      editSlot: PatternSlotId;
      length: 1 | 2 | 3 | 4;
      seq: [PatternSlotId, PatternSlotId, PatternSlotId, PatternSlotId];
      slots: Record<PatternSlotId, PercPattern | null>;
    };
    bass: {
      editSlot: PatternSlotId;
      length: 1 | 2 | 3 | 4;
      seq: [PatternSlotId, PatternSlotId, PatternSlotId, PatternSlotId];
      slots: Record<PatternSlotId, number[] | null>;
    };
    lead: {
      editSlot: PatternSlotId;
      length: 1 | 2 | 3 | 4;
      seq: [PatternSlotId, PatternSlotId, PatternSlotId, PatternSlotId];
      slots: Record<PatternSlotId, (number | null)[] | null>;
    };
  };
  swipeTrail: { x: number; y: number; alpha: number }[];
  memorySlots: MemorySlot[];
  capture: {
    armed: boolean;
    recording: boolean;
    targetSlot: number;
    bars: 1 | 2;
  };
  arranger: {
    enabled: boolean;
    currentBar: number;
    grid: boolean[][];
  };
}

export const state: AppState = {
  initialized: false,
  playing: false,
  muteLiveSynth: false,
  viewMode: 'perform',
  activeModule: 'perc',
  bpm: 125,
  minimalAmount: 1.0,
  filterCutoffNorm: 0.45,
  spaceNorm: 0.35,
  resonanceNorm: 0.35,
  sidechainDepth: 0.82,
  lfoRate: 'off',
  lfoDest: 'filter',
  pointerX: 0.5,
  pointerY: 0.5,
  mutes: {
    kick: false,
    perc: false,
    hat: false,
    clap: false,
    tom: false,
    bass: false,
    lead: false,
    drone: true,
    stab: false,
    orbits: false,
  },
  levels: {
    kick: 0.8,
    perc: 0.8,
    hat: 0.8,
    clap: 0.8,
    tom: 0.8,
    bass: 0.8,
    lead: 0.8,
    drone: 0.8,
    stab: 0.8,
    orbits: 0.8,
  },
  scaleIndex: 0,
  rootOffset: 0,
  driveLevel: 1,
  driveAmount: 0.45,
  radarView: 'arena',
  gears: [
    { label: 'SUB', voice: 'sub', positions: [0], pulse: 0 },
    { label: 'PLK', voice: 'pluck', positions: [0, 0.5], pulse: 0 },
    { label: 'FM', voice: 'fm', positions: [], pulse: 0 },
  ],
  gearBars: 1,
  gearQuantize: 16,
  gearProgress: 0,
  geomTarget: 'bass',
  geomShapes: {
    bass: 'off',
    arp: 'off',
    pad: 'off',
    filter: 'off',
  },
  geomVertices: {
    bass: 0,
    arp: 0,
    pad: 0,
    filter: 0,
  },
  geometryEdgeProgress: 0,
  activeNodeVoice: 'pluck',
  nodeDecay: 'med',
  kickSteps: Array.from({ length: 16 }, (_, i) => i % 4 === 0),
  percSteps: euclidean(7, 16, 0),
  hatSteps: Array.from({ length: 16 }, (_, i) => i % 4 === 2),
  clapSteps: Array.from({ length: 16 }, (_, i) => i === 4 || i === 12),
  tomSteps: Array.from({ length: 16 }, (_, i) => i === 3 || i === 13),
  kickCharacter: 'tight',
  percKit: 'minimal',
  percTone: 'mid',
  swingAmount: 0,
  percDensity: 7,
  percRotation: 0,
  bassOctaveOffset: 0,
  bassSpeed: 1,
  bassTone: 'saw',
  bassCutoff: 0.45,
  bassDecay: 0.45,
  stabSteps: euclidean(3, 16, 2),
  arpMultiplier: 1,
  arpSeedIndices: [0, 2, 4, 7],
  arpMode: 'up',
  arpOctaves: 1,
  arpOctaveShift: 0,
  arpRhythm: 'all',
  arpProb: 1,
  arpGate: 0.75,
  harmonyMode: 'off',
  synthEnv: 'pluck',
  synthDetune: 'warm',
  lfoDepth: 0.65,
  latchedIndices: [0, 0, 3, 0, 4, 0, 1, 0],
  leadVoice: 'pluck',
  leadGlide: false,
  melody: new Array(16).fill(null),
  melodyRawPath: [],
  melodyQuantize: 1,
  nodes: [],
  padChord: 'minor',
  padTexture: 'off',
  padWash: 'lush',
  padLevel: 0.75,
  delaySync: '3/16',
  delayFeedback: 0.36,
  spaceMode: 'dark',
  fmWarp: 0,
  ringMod: 0,
  crushAmount: 0,
  tensionAmount: 0,
  ghostProb: 0,
  glitchProb: 0,
  subDrop: false,
  bleepProb: 0,
  sampleAutoMode: 'off',
  samplePitch: 1.0,
  autoFill: false,
  humanize: 0.15,
  tapeWow: 0.15,
  chorusSpread: 0.35,
  fx: {
    breakdown: false,
    tapeSag: false,
    stutter: false,
  },
  currentStep: 0,
  currentBar: 0,
  kickPulse: 0,
  patterns: {
    kick: {
      editSlot: 'A',
      length: 1,
      seq: ['A', 'A', 'A', 'B'],
      slots: { A: null, B: null, C: null, D: null },
    },
    perc: {
      editSlot: 'A',
      length: 1,
      seq: ['A', 'A', 'A', 'B'],
      slots: { A: null, B: null, C: null, D: null },
    },
    bass: {
      editSlot: 'A',
      length: 1,
      seq: ['A', 'A', 'A', 'B'],
      slots: { A: null, B: null, C: null, D: null },
    },
    lead: {
      editSlot: 'A',
      length: 1,
      seq: ['A', 'A', 'A', 'B'],
      slots: { A: null, B: null, C: null, D: null },
    },
  },
  swipeTrail: [],
  memorySlots: Array.from({ length: 8 }, (_, i) => ({
    id: i,
    name: `SLOT ${i + 1}`,
    buffer: null,
    bars: 1,
    playing: false,
    peaks: [],
  })),
  capture: {
    armed: false,
    recording: false,
    targetSlot: 0,
    bars: 1,
  },
  arranger: {
    enabled: false,
    currentBar: 0,
    grid: [
      [false, false, true, true, true, true, true, true, false, false, true, true, true, true, true, true],
      [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      [true, true, true, true, false, false, false, false, true, true, false, false, false, false, false, false],
      [false, false, false, false, true, true, true, true, false, false, true, true, true, true, true, true],
      [false, false, false, false, false, false, true, true, false, false, false, false, true, true, true, true],
      [false, false, true, true, true, true, true, true, false, false, false, false, true, true, true, true],
      new Array(16).fill(false),
      new Array(16).fill(false),
    ],
  },
};

export function syncActiveEditToSlots(): void {
  state.patterns.kick.slots[state.patterns.kick.editSlot] = state.kickSteps;
  state.patterns.perc.slots[state.patterns.perc.editSlot] = {
    perc: state.percSteps,
    hat: state.hatSteps,
    clap: state.clapSteps,
    tom: state.tomSteps,
  };
  state.patterns.bass.slots[state.patterns.bass.editSlot] = state.latchedIndices;
  state.patterns.lead.slots[state.patterns.lead.editSlot] = state.melody;
}

export function selectPatternEditSlot(inst: PatternInst, slot: PatternSlotId): void {
  syncActiveEditToSlots();
  if (inst === 'kick') {
    const k = state.patterns.kick;
    if (!k.slots[slot]) {
      const src = k.slots[k.editSlot] ?? k.slots.A!;
      k.slots[slot] = [...src];
    }
    k.editSlot = slot;
    state.kickSteps = k.slots[slot]!;
  } else if (inst === 'perc') {
    const p = state.patterns.perc;
    if (!p.slots[slot]) {
      const src = p.slots[p.editSlot] ?? p.slots.A!;
      p.slots[slot] = {
        perc: [...src.perc],
        hat: [...src.hat],
        clap: [...src.clap],
        tom: [...src.tom],
      };
    }
    p.editSlot = slot;
    const target = p.slots[slot]!;
    state.percSteps = target.perc;
    state.hatSteps = target.hat;
    state.clapSteps = target.clap;
    state.tomSteps = target.tom;
  } else if (inst === 'bass') {
    const b = state.patterns.bass;
    if (!b.slots[slot]) {
      const src = b.slots[b.editSlot] ?? b.slots.A!;
      b.slots[slot] = [...src];
    }
    b.editSlot = slot;
    state.latchedIndices = b.slots[slot]!;
  } else {
    const l = state.patterns.lead;
    if (!l.slots[slot]) {
      const src = l.slots[l.editSlot] ?? l.slots.A!;
      l.slots[slot] = [...src];
    }
    l.editSlot = slot;
    state.melody = l.slots[slot]!;
    state.melodyRawPath = [];
  }
}

syncActiveEditToSlots();

let nextNodeId = 1;

export function createNode(
  x: number,
  y: number,
  midi: number,
  voice: NodeVoice = state.activeNodeVoice
): HarmonicNode {
  return {
    id: nextNodeId++,
    x: Math.max(0.05, Math.min(0.95, x)),
    y: Math.max(0.05, Math.min(0.95, y)),
    midi,
    voice,
    pulse: 1.0,
  };
}
