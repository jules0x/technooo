import { AudioEngine } from '../audio/engine';
import { LoopRecorder } from '../audio/recorder';
import { triggerElectroSample } from '../audio/samples';
import { Scheduler } from '../audio/scheduler';
import {
  euclidean,
  midiToFreq,
  quantizeMelodyPath,
  SCALES,
  scaleIndexToMidi,
} from '../audio/theory';
import { DroneBed, triggerBassOrPluck, triggerNodeVoice } from '../audio/voices';
import {
  PercRowKey,
  popUndo,
  pushBassHistory,
  pushMelodyHistory,
  pushRowHistory,
  pushUndo,
  redoBassHistory,
  redoMelodyHistory,
  redoRowHistory,
  shuffleAll,
  undoBassHistory,
  undoMelodyHistory,
  undoRowHistory,
} from '../state/shuffle';
import {
  applySceneXfade,
  ArpMode,
  ArpRhythm,
  BassTone,
  captureScene,
  DubChannel,
  DelaySync,
  EnvFolDest,
  EnvFolSource,
  GearQuantize,
  GeometryMode,
  GeomTarget,
  HarmonyMode,
  KickCharacter,
  LeadVoice,
  Lfo2Dest,
  Lfo2Shape,
  LfoDest,
  LfoRate,
  MuteChannel,
  NodeDecay,
  NodeVoice,
  PadChord,
  PadTexture,
  PadWash,
  PatternInst,
  PatternSlotId,
  PercKit,
  PercTone,
  RadarViewMode,
  SampleAutoMode,
  selectPatternEditSlot,
  ShDest,
  ShRate,
  SpaceMode,
  state,
  SynthDetune,
  SynthEnv,
} from '../state/store';
import { renderBankAndArranger } from '../ui/arranger';
import {
  getBassGridMetrics,
  getMelodyGridMetrics,
  getPercGridMetrics,
  getRadarCircles,
  getStageLayout,
  pointInRect,
} from '../ui/layout';

const NOTE_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const NODE_VOICES: NodeVoice[] = ['pluck', 'fm', 'sub'];
const NODE_DECAYS: NodeDecay[] = ['short', 'med', 'long'];
const KICK_CHARS: KickCharacter[] = ['tight', 'sub', 'punch'];
const PERC_KITS: PercKit[] = ['minimal', 'indust', 'wood', 'glitch', '909', 'dub'];
const SWING_LEVELS: number[] = [0, 0.2, 0.4, 0.55];
const LEAD_VOICES: LeadVoice[] = ['pluck', 'acid', 'fm', 'reese'];
const LFO_RATES: LfoRate[] = ['off', 'slow', 'med', 'fast'];
const RADAR_VIEWS: RadarViewMode[] = ['split', 'gears', 'arena'];
const GEAR_BARS: (1 | 2 | 4)[] = [1, 2, 4];
const GEAR_QUANTS: GearQuantize[] = [16, 12, 8, 4];
const GEOMETRY_MODES: GeometryMode[] = ['off', 'triangle', 'square', 'pentagon'];
const ARP_MODES: ArpMode[] = ['off', 'up', 'down', 'updown', 'downup', 'order', 'random'];
const ARP_SPEEDS: number[] = [0.5, 1, 1.5, 2];
const PERC_MUTES: MuteChannel[] = ['kick', 'perc', 'hat', 'clap', 'tom'];

type DragMode =
  | { type: 'none' }
  | { type: 'perc'; paintValue: boolean; lastKey: string; paintedRows: Set<number> }
  | {
      type: 'melody';
      moved: boolean;
      eraseMode: boolean;
      startX: number;
      startY: number;
      baseMelody: (number | null)[];
    }
  | { type: 'bassCanvas'; lastKey: string }
  | { type: 'sweep'; lastX: number; lastY: number; alt: boolean };

export function setupControls(
  canvas: HTMLCanvasElement,
  engine: AudioEngine,
  drone: DroneBed,
  _recorder: LoopRecorder,
  scheduler: Scheduler,
  onHudUpdate: () => void
): void {
  const startOverlay = document.getElementById('start-overlay')!;
  const helpOverlay = document.getElementById('help-overlay')!;
  const helpBtn = document.getElementById('help-btn')!;

  const ensureStarted = () => {
    if (!state.initialized) {
      engine.init();
      drone.start(engine);
      state.initialized = true;
      state.playing = true;
      scheduler.start();
      startOverlay.classList.add('hidden');
      onHudUpdate();
    } else if (engine.ctx.state === 'suspended') {
      void engine.ctx.resume();
    }
  };

  const doShuffle = () => {
    shuffleAll();
    engine.syncParameters();
    drone.update(engine);
    onHudUpdate();
  };

  const doUndo = () => {
    if (popUndo()) {
      engine.syncParameters();
      drone.update(engine);
      onHudUpdate();
    }
  };

  const cycleNodeVoice = () => {
    const idx = NODE_VOICES.indexOf(state.activeNodeVoice);
    state.activeNodeVoice = NODE_VOICES[(idx + 1) % NODE_VOICES.length];
    onHudUpdate();
  };

  const cycleNodeDecay = () => {
    const idx = NODE_DECAYS.indexOf(state.nodeDecay);
    state.nodeDecay = NODE_DECAYS[(idx + 1) % NODE_DECAYS.length];
    onHudUpdate();
  };

  const cycleKickChar = () => {
    const idx = KICK_CHARS.indexOf(state.kickCharacter);
    state.kickCharacter = KICK_CHARS[(idx + 1) % KICK_CHARS.length];
    onHudUpdate();
  };

  const cyclePercKit = () => {
    const idx = PERC_KITS.indexOf(state.percKit);
    state.percKit = PERC_KITS[(idx + 1) % PERC_KITS.length];
    onHudUpdate();
  };

  const cycleSwing = () => {
    const idx = SWING_LEVELS.indexOf(state.swingAmount);
    state.swingAmount = SWING_LEVELS[(idx + 1) % SWING_LEVELS.length];
    onHudUpdate();
  };

  const cycleLeadVoice = () => {
    const idx = LEAD_VOICES.indexOf(state.leadVoice);
    state.leadVoice = LEAD_VOICES[(idx + 1) % LEAD_VOICES.length];
    onHudUpdate();
  };

  const toggleLeadGlide = () => {
    state.leadGlide = !state.leadGlide;
    onHudUpdate();
  };

  const cycleDrive = () => {
    state.driveLevel = (state.driveLevel + 1) % 3;
    state.driveAmount = [0, 0.45, 0.95][state.driveLevel] ?? 0.45;
    engine.syncParameters();
    onHudUpdate();
  };

  const cycleScale = () => {
    state.scaleIndex = (state.scaleIndex + 1) % SCALES.length;
    drone.update(engine);
    onHudUpdate();
  };

  const toggleAutoLfo = () => {
    const idx = LFO_RATES.indexOf(state.lfoRate);
    state.lfoRate = LFO_RATES[(idx + 1) % LFO_RATES.length];
    onHudUpdate();
  };

  const mutatePerc = () => {
    pushUndo();
    pushRowHistory('perc');
    pushRowHistory('hat');
    pushRowHistory('tom');
    state.percDensity = 3 + ((state.percDensity + 2) % 11);
    state.percRotation = (state.percRotation + 1) % 16;
    state.percSteps = euclidean(state.percDensity, 16, state.percRotation);
    const hatDensity = 4 + ((state.percDensity + 3) % 7);
    state.hatSteps = euclidean(hatDensity, 16, (state.percRotation + 2) % 16);
    const tomDensity = 2 + (state.percRotation % 4);
    state.tomSteps = euclidean(tomDensity, 16, (state.percRotation * 3) % 16);
    onHudUpdate();
  };

  const shiftOctave = () => {
    state.bassOctaveOffset = state.bassOctaveOffset === 1 ? -1 : state.bassOctaveOffset + 1;
    drone.update(engine);
    onHudUpdate();
  };

  const cycleArp = () => {
    const idx = ARP_SPEEDS.indexOf(state.arpMultiplier);
    state.arpMultiplier = ARP_SPEEDS[(idx + 1) % ARP_SPEEDS.length];
    onHudUpdate();
  };

  const cycleArpMode = () => {
    const idx = ARP_MODES.indexOf(state.arpMode);
    state.arpMode = ARP_MODES[(idx + 1) % ARP_MODES.length];
    onHudUpdate();
  };

  const changeBpm = (delta: number) => {
    state.bpm = Math.max(70, Math.min(175, state.bpm + delta));
    engine.syncParameters();
    onHudUpdate();
  };

  const clearNodes = () => {
    pushUndo();
    state.gears.forEach((g) => (g.positions = []));
    onHudUpdate();
  };

  const cycleRadarView = () => {
    const idx = RADAR_VIEWS.indexOf(state.radarView);
    state.radarView = RADAR_VIEWS[(idx + 1) % RADAR_VIEWS.length];
    onHudUpdate();
  };

  const cycleGearBars = () => {
    const idx = GEAR_BARS.indexOf(state.gearBars);
    state.gearBars = GEAR_BARS[(idx + 1) % GEAR_BARS.length];
    onHudUpdate();
  };

  const cycleGearQuantize = () => {
    const idx = GEAR_QUANTS.indexOf(state.gearQuantize);
    state.gearQuantize = GEAR_QUANTS[(idx + 1) % GEAR_QUANTS.length];
    onHudUpdate();
  };

  const cycleGeometryMode = () => {
    const t = state.geomTarget;
    const idx = GEOMETRY_MODES.indexOf(state.geomShapes[t]);
    state.geomShapes[t] = GEOMETRY_MODES[(idx + 1) % GEOMETRY_MODES.length];
    state.geomVertices[t] = 0;
    onHudUpdate();
  };

  const clearMelody = () => {
    pushUndo();
    const hasNotes = state.melody.some((n) => n !== null && n !== undefined);
    if (hasNotes) {
      pushMelodyHistory();
      state.melody = new Array(16).fill(null);
      state.melodyRawPath = [];
    } else if (state.arpMode !== 'off') {
      state.arpMode = 'off';
    }
    onHudUpdate();
  };

  const cycleMelodyQuantize = () => {
    state.melodyQuantize =
      state.melodyQuantize === 1 ? 2 : state.melodyQuantize === 2 ? 4 : 1;
    if (state.melodyRawPath.length > 0) {
      state.melody = quantizeMelodyPath(state.melodyRawPath, state.melodyQuantize);
    }
    onHudUpdate();
  };

  startOverlay.addEventListener('pointerdown', ensureStarted);

  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    helpOverlay.classList.toggle('hidden');
  });

  // Top Transport & Control Panel bindings
  const togglePlayStop = () => {
    if (!state.initialized) {
      ensureStarted();
      return;
    }
    state.playing = !state.playing;
    if (state.playing) {
      void engine.ctx.resume();
      scheduler.start();
    } else {
      scheduler.stop();
    }
    onHudUpdate();
  };

  document.getElementById('btn-play-stop')!.addEventListener('click', togglePlayStop);
  document.getElementById('btn-shuffle')!.addEventListener('click', () => {
    ensureStarted();
    doShuffle();
  });
  document.getElementById('btn-undo')!.addEventListener('click', () => {
    ensureStarted();
    doUndo();
  });

  // Direct segmented option groups
  const bindSegGroup = (selector: string, handler: (val: string) => void) => {
    document.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureStarted();
        const key = Object.keys(btn.dataset)[0];
        if (key && btn.dataset[key] !== undefined) {
          handler(btn.dataset[key]!);
          onHudUpdate();
        }
      });
    });
  };

  bindSegGroup('#grp-scale .seg-btn', (v) => {
    state.scaleIndex = Number(v);
    drone.update(engine);
  });
  bindSegGroup('#grp-node-voice .seg-btn', (v) => {
    state.activeNodeVoice = v as NodeVoice;
  });
  bindSegGroup('#grp-node-decay .seg-btn', (v) => {
    state.nodeDecay = v as NodeDecay;
  });
  bindSegGroup('#grp-gear-bars .seg-btn', (v) => {
    state.gearBars = Number(v) as 1 | 2 | 4;
  });
  bindSegGroup('#grp-gear-quant .seg-btn', (v) => {
    state.gearQuantize = Number(v) as GearQuantize;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-geom-for][data-geom-shape]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureStarted();
      const target = btn.dataset.geomFor as GeomTarget | undefined;
      const shape = btn.dataset.geomShape as GeometryMode | undefined;
      if (!target || !shape) return;
      state.geomTarget = target;
      state.geomShapes[target] = shape;
      state.geomVertices[target] = 0;
      onHudUpdate();
    });
  });
  document.querySelectorAll<HTMLElement>('[data-geom-select]').forEach((lbl) => {
    lbl.addEventListener('click', () => {
      const target = lbl.dataset.geomSelect as GeomTarget | undefined;
      if (!target) return;
      state.geomTarget = target;
      onHudUpdate();
    });
  });
  document.getElementById('btn-geom-clear')?.addEventListener('click', () => {
    ensureStarted();
    (['bass', 'arp', 'pad', 'filter'] as const).forEach((t) => {
      state.geomShapes[t] = 'off';
      state.geomVertices[t] = 0;
    });
    onHudUpdate();
  });
  bindSegGroup('#grp-kick-char .seg-btn', (v) => {
    state.kickCharacter = v as KickCharacter;
  });
  bindSegGroup('#grp-perc-kit .seg-btn', (v) => {
    state.percKit = v as PercKit;
  });
  bindSegGroup('#grp-perc-tone .seg-btn', (v) => {
    state.percTone = v as PercTone;
  });
  bindSegGroup('#grp-lead-voice .seg-btn', (v) => {
    state.leadVoice = v as LeadVoice;
  });
  bindSegGroup('#grp-harmony .seg-btn', (v) => {
    state.harmonyMode = v as HarmonyMode;
  });
  bindSegGroup('#grp-env .seg-btn', (v) => {
    state.synthEnv = v as SynthEnv;
  });
  bindSegGroup('#grp-detune .seg-btn', (v) => {
    state.synthDetune = v as SynthDetune;
  });
  bindSegGroup('#grp-lfo-rate .seg-btn', (v) => {
    state.lfoRate = v as LfoRate;
  });
  bindSegGroup('#grp-lfo-dest .seg-btn', (v) => {
    state.lfoDest = v as LfoDest;
  });
  bindSegGroup('#grp-arp-mode .seg-btn', (v) => {
    state.arpMode = v as ArpMode;
  });
  bindSegGroup('#grp-arp-spd .seg-btn', (v) => {
    state.arpMultiplier = Number(v);
  });
  bindSegGroup('#grp-arp-oct .seg-btn', (v) => {
    state.arpOctaves = Number(v) as 1 | 2;
  });
  bindSegGroup('#grp-arp-shift .seg-btn', (v) => {
    state.arpOctaveShift = Number(v) as -1 | 0 | 1;
  });
  bindSegGroup('#grp-arp-rhythm .seg-btn', (v) => {
    state.arpRhythm = v as ArpRhythm;
  });
  bindSegGroup('#grp-mel-quant .seg-btn', (v) => {
    state.melodyQuantize = Number(v) as 1 | 2 | 4;
    if (state.melodyRawPath.length > 0) {
      state.melody = quantizeMelodyPath(state.melodyRawPath, state.melodyQuantize);
    }
  });
  bindSegGroup('#grp-bass-oct .seg-btn', (v) => {
    state.bassOctaveOffset = Number(v);
  });
  bindSegGroup('#grp-pad-chord .seg-btn', (v) => {
    state.padChord = v as PadChord;
    if (state.mutes.drone) state.mutes.drone = false;
    drone.update(engine);
  });
  bindSegGroup('#grp-delay-sync .seg-btn', (v) => {
    state.delaySync = v as DelaySync;
    engine.syncParameters();
  });
  bindSegGroup('#grp-space-mode .seg-btn', (v) => {
    state.spaceMode = v as SpaceMode;
    engine.syncParameters();
  });

  // Rotary Hardware Knobs (drag up/down, double-click to reset)
  const bindKnob = (
    id: string,
    getVal: () => number,
    setVal: (v: number) => void,
    defaultVal: number
  ) => {
    const el = document.getElementById(id);
    if (!el) return;
    let dragging = false;
    let startY = 0;
    let startVal = 0;
    el.addEventListener('pointerdown', (e) => {
      ensureStarted();
      dragging = true;
      startY = e.clientY;
      startVal = getVal();
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = startY - e.clientY;
      const next = Math.max(0, Math.min(1, startVal + dy / 120));
      setVal(next);
      engine.syncParameters();
      drone.update(engine);
      onHudUpdate();
    });
    const endDrag = () => {
      dragging = false;
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('dblclick', () => {
      ensureStarted();
      setVal(defaultVal);
      engine.syncParameters();
      drone.update(engine);
      onHudUpdate();
    });
  };

  bindKnob('knob-cutoff', () => state.filterCutoffNorm, (v) => (state.filterCutoffNorm = v), 0.56);
  bindKnob('knob-reso', () => state.resonanceNorm, (v) => (state.resonanceNorm = v), 0.2);
  bindKnob('knob-drive', () => state.driveAmount, (v) => (state.driveAmount = v), 0.45);
  bindKnob('knob-minimal', () => state.minimalAmount, (v) => (state.minimalAmount = v), 1.0);
  bindKnob('knob-lfo-depth', () => state.lfoDepth, (v) => (state.lfoDepth = v), 0.65);
  bindKnob('knob-chorus', () => state.chorusSpread, (v) => (state.chorusSpread = v), 0.35);
  bindKnob('knob-arp-gate', () => state.arpGate, (v) => (state.arpGate = v), 0.75);
  bindKnob('knob-arp-prob', () => state.arpProb, (v) => (state.arpProb = v), 1.0);
  bindKnob('knob-swing', () => state.swingAmount / 0.6, (v) => (state.swingAmount = v * 0.6), 0);
  bindKnob('knob-pad-lvl', () => state.padLevel, (v) => (state.padLevel = v), 0.75);
  bindKnob('knob-space', () => state.spaceNorm, (v) => (state.spaceNorm = v), 0.35);
  bindKnob('knob-pump', () => state.sidechainDepth, (v) => (state.sidechainDepth = v), 0.68);
  bindKnob('knob-delay-fb', () => state.delayFeedback / 0.85, (v) => (state.delayFeedback = v * 0.85), 0.36 / 0.85);
  bindKnob('knob-bass-cutoff', () => state.bassCutoff, (v) => (state.bassCutoff = v), 0.45);
  bindKnob('knob-bass-decay', () => state.bassDecay, (v) => (state.bassDecay = v), 0.45);
  bindKnob('knob-dj-filter', () => state.djFilter, (v) => (state.djFilter = v), 0.5);
  bindKnob('knob-eq-low', () => state.eqLow, (v) => (state.eqLow = v), 0.75);
  bindKnob('knob-eq-mid', () => state.eqMid, (v) => (state.eqMid = v), 0.75);
  bindKnob('knob-eq-high', () => state.eqHigh, (v) => (state.eqHigh = v), 0.75);

  (['low', 'mid', 'high'] as const).forEach((band) => {
    document.getElementById(`btn-kill-${band}`)?.addEventListener('click', () => {
      ensureStarted();
      state.eqKill[band] = !state.eqKill[band];
      engine.syncParameters();
      onHudUpdate();
    });
  });

  document.getElementById('btn-cap-a')?.addEventListener('click', () => {
    captureScene('A');
    onHudUpdate();
  });
  document.getElementById('btn-cap-b')?.addEventListener('click', () => {
    captureScene('B');
    onHudUpdate();
  });
  const sceneXfader = document.getElementById('scene-xfader') as HTMLInputElement | null;
  sceneXfader?.addEventListener('input', () => {
    ensureStarted();
    applySceneXfade(Number(sceneXfader.value) / 100);
    engine.syncParameters();
    drone.update(engine);
    onHudUpdate();
  });

  bindKnob('knob-comb-mix', () => state.combMix, (v) => (state.combMix = v), 0);
  bindKnob('knob-comb-tune', () => state.combTune, (v) => (state.combTune = v), 0.42);
  bindKnob('knob-comb-fb', () => state.combFeedback, (v) => (state.combFeedback = v), 0.55);
  bindKnob('knob-gate-mix', () => state.gatedReverbMix, (v) => (state.gatedReverbMix = v), 0);
  bindKnob('knob-gate-time', () => state.gatedReverbTime, (v) => (state.gatedReverbTime = v), 0.35);

  document.getElementById('btn-ping-pong')?.addEventListener('click', () => {
    ensureStarted();
    state.pingPong = !state.pingPong;
    engine.syncParameters();
    onHudUpdate();
  });

  document.querySelectorAll<HTMLInputElement>('[data-dub-delay]').forEach((inp) => {
    inp.addEventListener('input', () => {
      ensureStarted();
      const ch = inp.dataset.dubDelay as DubChannel;
      state.dubDelaySend[ch] = Number(inp.value) / 100;
      engine.syncParameters();
    });
  });

  document.querySelectorAll<HTMLInputElement>('[data-dub-reverb]').forEach((inp) => {
    inp.addEventListener('input', () => {
      ensureStarted();
      const ch = inp.dataset.dubReverb as DubChannel;
      state.dubReverbSend[ch] = Number(inp.value) / 100;
      engine.syncParameters();
    });
  });

  bindKnob('knob-lfo2-rate', () => state.lfo2Rate, (v) => (state.lfo2Rate = v), 0.25);
  bindKnob('knob-lfo2-depth', () => state.lfo2Depth, (v) => (state.lfo2Depth = v), 0);
  bindKnob('knob-sh-depth', () => state.shDepth, (v) => (state.shDepth = v), 0);
  bindKnob('knob-env-fol', () => state.envFolAmount, (v) => (state.envFolAmount = v), 0.5);
  bindKnob('knob-bass-envmod', () => state.bassEnvMod, (v) => (state.bassEnvMod = v), 0.45);
  bindKnob('knob-bass-envdec', () => state.bassEnvDecay, (v) => (state.bassEnvDecay = v), 0.35);
  bindKnob('knob-bass-fold', () => state.bassWavefold, (v) => (state.bassWavefold = v), 0);
  bindKnob('knob-kick-sweep', () => state.kickPitchDecay, (v) => (state.kickPitchDecay = v), 0.45);
  bindKnob('knob-kick-punch', () => state.kickPunch, (v) => (state.kickPunch = v), 0.5);
  bindKnob('knob-hat-decay', () => state.hatDecay, (v) => (state.hatDecay = v), 0.4);
  bindKnob('knob-clap-snap', () => state.clapSnap, (v) => (state.clapSnap = v), 0.5);
  bindKnob('knob-perc-fm', () => state.percFmIndex, (v) => (state.percFmIndex = v), 0.5);
  bindKnob('knob-turing-mutate', () => state.turingMutate, (v) => (state.turingMutate = v), 0.15);
  bindKnob('knob-ratchet-prob', () => state.ratchetProb, (v) => (state.ratchetProb = v), 0);

  document.getElementById('btn-turing-toggle')?.addEventListener('click', () => {
    ensureStarted();
    state.turingEnabled = !state.turingEnabled;
    onHudUpdate();
  });
  document.getElementById('btn-turing-seed')?.addEventListener('click', () => {
    ensureStarted();
    state.turingBuffer = Array.from({ length: 16 }, () => Math.floor(Math.random() * 14));
    onHudUpdate();
  });
  bindSegGroup('#grp-turing-target .seg-btn', (v) => {
    state.turingTarget = v as 'lead' | 'bass';
  });

  document.querySelectorAll<HTMLButtonElement>('[data-poly-dec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureStarted();
      const k = btn.dataset.polyDec as keyof typeof state.trackLengths;
      state.trackLengths[k] = Math.max(1, state.trackLengths[k] - 1);
      onHudUpdate();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-poly-inc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureStarted();
      const k = btn.dataset.polyInc as keyof typeof state.trackLengths;
      state.trackLengths[k] = Math.min(16, state.trackLengths[k] + 1);
      onHudUpdate();
    });
  });
  document.getElementById('btn-poly-reset')?.addEventListener('click', () => {
    ensureStarted();
    (Object.keys(state.trackLengths) as (keyof typeof state.trackLengths)[]).forEach((k) => {
      state.trackLengths[k] = 16;
    });
    onHudUpdate();
  });

  bindSegGroup('#grp-lfo2-shape .seg-btn', (v) => {
    state.lfo2Shape = v as Lfo2Shape;
  });
  bindSegGroup('#grp-lfo2-dest .seg-btn', (v) => {
    state.lfo2Dest = v as Lfo2Dest;
  });
  bindSegGroup('#grp-sh-rate .seg-btn', (v) => {
    state.shRate = v as ShRate;
  });
  bindSegGroup('#grp-sh-dest .seg-btn', (v) => {
    state.shDest = v as ShDest;
  });
  bindSegGroup('#grp-envfol-src .seg-btn', (v) => {
    state.envFolSource = v as EnvFolSource;
  });
  bindSegGroup('#grp-envfol-dst .seg-btn', (v) => {
    state.envFolDest = v as EnvFolDest;
  });

  bindSegGroup('#grp-bass-tone .seg-btn', (v) => {
    state.bassTone = v as BassTone;
  });
  bindSegGroup('#grp-stab-rhythm .seg-btn', (v) => {
    state.stabSteps =
      v === '5'
        ? euclidean(5, 16, 1)
        : v === 'off'
          ? Array.from({ length: 16 }, (_, i) => i % 4 === 2)
          : euclidean(3, 16, 2);
  });
  document.getElementById('btn-root-down')?.addEventListener('click', () => {
    ensureStarted();
    state.rootOffset = (state.rootOffset + 11) % 12;
    drone.update(engine);
    onHudUpdate();
  });
  document.getElementById('btn-root-up')?.addEventListener('click', () => {
    ensureStarted();
    state.rootOffset = (state.rootOffset + 1) % 12;
    drone.update(engine);
    onHudUpdate();
  });

  // Experimental Modifier Faders & Sub Drop
  const bindFader = (id: string, setVal: (v: number) => void) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.addEventListener('input', () => {
      ensureStarted();
      setVal(Number(el.value) / 100);
      engine.syncParameters();
      onHudUpdate();
    });
  };
  bindFader('fader-ring-mod', (v) => (state.ringMod = v));
  bindFader('fader-tape-wow', (v) => (state.tapeWow = v));
  bindFader('fader-glitch', (v) => (state.glitchProb = v));
  bindFader('fader-humanize', (v) => (state.humanize = v));
  bindFader('fader-bleeps', (v) => (state.bleepProb = v));
  bindFader('fader-crush', (v) => (state.crushAmount = v));
  bindFader('fader-tension', (v) => (state.tensionAmount = v));
  bindFader('fader-ghost', (v) => (state.ghostProb = v));

  document.getElementById('btn-auto-fill')?.addEventListener('click', () => {
    ensureStarted();
    state.autoFill = !state.autoFill;
    onHudUpdate();
  });

  document.getElementById('fader-sample-pitch')?.addEventListener('input', (e) => {
    ensureStarted();
    state.samplePitch = Number((e.target as HTMLInputElement).value) / 100;
    onHudUpdate();
  });

  bindSegGroup('#grp-sample-auto .seg-btn', (v) => {
    state.sampleAutoMode = v as SampleAutoMode;
  });

  document.querySelectorAll<HTMLButtonElement>('#sample-pad-grid .sample-pad').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureStarted();
      const idx = Number(btn.dataset.sample);
      triggerElectroSample(engine, idx, engine.ctx.currentTime, state.samplePitch);
      btn.classList.add('hit');
      setTimeout(() => btn.classList.remove('hit'), 140);
    });
  });

  document.getElementById('btn-sub-drop')?.addEventListener('click', () => {
    ensureStarted();
    state.subDrop = !state.subDrop;
    onHudUpdate();
  });

  document.getElementById('btn-euclid')!.addEventListener('click', () => {
    ensureStarted();
    mutatePerc();
  });
  document.getElementById('btn-lead-glide')!.addEventListener('click', () => {
    ensureStarted();
    toggleLeadGlide();
  });
  document.getElementById('btn-clear-melody')!.addEventListener('click', () => {
    ensureStarted();
    clearMelody();
  });
  document.getElementById('btn-bpm-down')!.addEventListener('click', () => {
    ensureStarted();
    changeBpm(-5);
  });
  document.getElementById('btn-bpm-up')!.addEventListener('click', () => {
    ensureStarted();
    changeBpm(5);
  });

  // Momentary FX buttons
  const bindHoldButton = (id: string, fxKey: keyof typeof state.fx) => {
    const el = document.getElementById(id)!;
    const setFx = (active: boolean) => {
      ensureStarted();
      state.fx[fxKey] = active;
      engine.syncParameters();
      onHudUpdate();
    };
    el.addEventListener('pointerdown', () => setFx(true));
    el.addEventListener('pointerup', () => setFx(false));
    el.addEventListener('pointerleave', () => {
      if (state.fx[fxKey]) setFx(false);
    });
  };
  bindHoldButton('btn-fx-drop', 'breakdown');
  bindHoldButton('btn-fx-tape', 'tapeSag');
  bindHoldButton('btn-fx-stutter', 'stutter');

  // Mixer channel mute buttons (Ctrl/Cmd+Click on any percussion mute toggles all percussion)
  document.querySelectorAll<HTMLButtonElement>('#mixer-mutes .mute-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      ensureStarted();
      const ch = btn.dataset.mute as MuteChannel | undefined;
      if (!ch) return;
      if ((e.ctrlKey || e.metaKey) && PERC_MUTES.includes(ch)) {
        const shouldMuteAll = PERC_MUTES.some((k) => !state.mutes[k]);
        PERC_MUTES.forEach((k) => {
          state.mutes[k] = shouldMuteAll;
        });
      } else {
        state.mutes[ch] = !state.mutes[ch];
      }
      onHudUpdate();
    });
  });

  // Mixer channel level faders
  document.querySelectorAll<HTMLInputElement>('#mixer-mutes .mixer-fader').forEach((slider) => {
    slider.addEventListener('input', () => {
      ensureStarted();
      const ch = slider.dataset.level as MuteChannel | undefined;
      if (!ch) return;
      state.levels[ch] = Number(slider.value) / 100;
      drone.update(engine);
      onHudUpdate();
    });
  });

  document.getElementById('btn-unmute-all')?.addEventListener('click', () => {
    ensureStarted();
    for (const k of Object.keys(state.mutes) as (keyof typeof state.mutes)[]) {
      state.mutes[k] = false;
    }
    onHudUpdate();
  });

  // Component Stack & Component Board navigation / visibility
  const focusModule = (modId: string) => {
    state.activeModule = modId;
    document
      .querySelectorAll('#component-board .rack-card.focused')
      .forEach((el) => el.classList.remove('focused'));
    const card = document.querySelector<HTMLElement>(
      `#component-board .rack-card[data-module="${modId}"]`
    );
    if (card) {
      card.classList.remove('hidden');
      document
        .querySelector(`.picker-chip[data-toggle-module="${modId}"]`)
        ?.classList.add('active');
      card.classList.add('focused');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    onHudUpdate();
  };

  document.querySelectorAll<HTMLElement>('#component-board .rack-card[data-module]').forEach((card) => {
    card.addEventListener('pointerdown', () => {
      const modId = card.dataset.module;
      if (!modId || state.activeModule === modId) return;
      state.activeModule = modId;
      document
        .querySelectorAll('#component-board .rack-card.focused')
        .forEach((el) => el.classList.remove('focused'));
      card.classList.add('focused');
      onHudUpdate();
    });
  });

  document.getElementById('btn-stack-add')?.addEventListener('click', () => {
    document.getElementById('module-picker')?.classList.toggle('hidden');
  });

  document.querySelectorAll<HTMLButtonElement>('.picker-chip[data-toggle-module]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const modId = chip.dataset.toggleModule;
      if (!modId) return;
      const card = document.querySelector<HTMLElement>(
        `#component-board .rack-card[data-module="${modId}"]`
      );
      if (!card) return;
      const willShow = card.classList.contains('hidden');
      card.classList.toggle('hidden', !willShow);
      chip.classList.toggle('active', willShow);
      if (willShow) focusModule(modId);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.mod-hide-btn[data-hide-module]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modId = btn.dataset.hideModule;
      if (!modId) return;
      document
        .querySelector(`#component-board .rack-card[data-module="${modId}"]`)
        ?.classList.add('hidden');
      document
        .querySelector(`.picker-chip[data-toggle-module="${modId}"]`)
        ?.classList.remove('active');
    });
  });

  document.getElementById('btn-show-all-mods')?.addEventListener('click', () => {
    document
      .querySelectorAll('#component-board .rack-card[data-module]')
      .forEach((card) => card.classList.remove('hidden'));
    document
      .querySelectorAll('.picker-chip[data-toggle-module]')
      .forEach((chip) => chip.classList.add('active'));
  });

  document.querySelectorAll<HTMLButtonElement>('#grp-orbit-vibe .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureStarted();
      const vibe = btn.dataset.orbitVibe;
      if (vibe === 'sparse') {
        state.gears[0].positions = [0];
        state.gears[1].positions = [0.375, 0.75];
        state.gears[2].positions = [0.625];
      } else if (vibe === 'pulse') {
        state.gears[0].positions = [0, 0.5];
        state.gears[1].positions = [0.125, 0.375, 0.625, 0.875];
        state.gears[2].positions = [0.25, 0.75];
      } else if (vibe === 'poly') {
        state.gears[0].positions = [0, 0.3333, 0.6667];
        state.gears[1].positions = [0, 0.25, 0.5, 0.75];
        state.gears[2].positions = [0.1, 0.3, 0.5, 0.7, 0.9];
      } else if (vibe === 'clear') {
        state.gears.forEach((g) => (g.positions = []));
      }
      onHudUpdate();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-focus-module]').forEach((el) => {
    el.addEventListener('click', () => {
      const modId = el.dataset.focusModule;
      if (modId) focusModule(modId);
    });
  });

  // Pattern Loop (A/B/C/D) bindings for Perc, Bass & Lead
  const PAT_SLOTS: PatternSlotId[] = ['A', 'B', 'C', 'D'];
  document.querySelectorAll<HTMLButtonElement>('[data-pat-edit] [data-pat-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureStarted();
      const inst = btn.closest<HTMLElement>('[data-pat-edit]')?.dataset.patEdit as PatternInst | undefined;
      const slot = btn.dataset.patSlot as PatternSlotId | undefined;
      if (!inst || !slot) return;
      selectPatternEditSlot(inst, slot);
      onHudUpdate();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-pat-len] [data-len]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureStarted();
      const inst = btn.closest<HTMLElement>('[data-pat-len]')?.dataset.patLen as PatternInst | undefined;
      const len = Number(btn.dataset.len) as 1 | 2 | 3 | 4;
      if (!inst || !len) return;
      state.patterns[inst].length = len;
      onHudUpdate();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-pat-seq] .pat-seq-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureStarted();
      const inst = btn.closest<HTMLElement>('[data-pat-seq]')?.dataset.patSeq as PatternInst | undefined;
      const idx = Number(btn.dataset.seqIdx);
      if (!inst || Number.isNaN(idx)) return;
      const cfg = state.patterns[inst];
      // Clicking an inactive bar extends loop length to include it; clicking an active bar cycles A-D
      if (idx >= cfg.length) {
        cfg.length = (idx + 1) as 1 | 2 | 3 | 4;
      } else {
        const nextSlot = PAT_SLOTS[(PAT_SLOTS.indexOf(cfg.seq[idx]) + 1) % PAT_SLOTS.length];
        cfg.seq[idx] = nextSlot;
      }
      const activeSlot = cfg.seq[idx];
      if (!cfg.slots[activeSlot]) {
        const prevEdit = cfg.editSlot;
        selectPatternEditSlot(inst, activeSlot);
        selectPatternEditSlot(inst, prevEdit);
      }
      onHudUpdate();
    });
  });

  let drag: DragMode = { type: 'none' };

  const getClientPos = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    ensureStarted();
    const { x, y } = getClientPos(e);
    const layout = getStageLayout(canvas.clientWidth, canvas.clientHeight);

    // 1. IN-TIME ORBIT RINGS & PATTERN GEOMETRY (Panel 01)
    if (pointInRect(x, y, layout.radar)) {
      state.activeModule = 'geom';
      onHudUpdate();
      const circles = getRadarCircles(layout.radar, 'arena');

      // Check Orbits circle: click anywhere on a ring to add/remove a quantized hit in the bar
      if (circles.gears) {
        const g = circles.gears;
        const dist = Math.hypot(x - g.cx, y - g.cy);
        if (dist <= g.r * 1.12) {
          const normR = dist / g.r;
          const ringIndex = normR < 0.52 ? 0 : normR < 0.8 ? 1 : 2;
          const ring = state.gears[ringIndex];

          if (e.button === 2) {
            ring.positions = [];
            return;
          }

          // Where you clicked clockwise from 12 o'clock (0..1) on the stationary beat clock
          const angle = Math.atan2(y - g.cy, x - g.cx);
          const clickNorm = (((angle + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
          // Quantize to active grid (16, 12 triplets, 8, or 4) * gearBars
          const totalDivs = state.gearQuantize * state.gearBars;
          const snapped = (Math.round(clickNorm * totalDivs) % totalDivs) / totalDivs;

          const tol = 0.45 / totalDivs;
          const existingIdx = ring.positions.findIndex(
            (p) => Math.abs(p - snapped) < tol || Math.abs(Math.abs(p - snapped) - 1) < tol
          );
          if (existingIdx >= 0) {
            ring.positions.splice(existingIdx, 1);
          } else {
            ring.positions.push(snapped);
            ring.positions.sort((a, b) => a - b);
          }
          return;
        }
      }

      // Check Geometry circle: click to cycle OFF -> TRIANGLE -> SQUARE -> PENTAGON
      if (circles.arena) {
        const a = circles.arena;
        const dist = Math.hypot(x - a.cx, y - a.cy);
        if (dist <= a.r * 1.1) {
          if (e.button === 2) {
            state.geomShapes[state.geomTarget] = 'off';
            onHudUpdate();
          } else {
            cycleGeometryMode();
          }
          return;
        }
      }

      if (e.button === 2) {
        drag = { type: 'sweep', lastX: x, lastY: y, alt: e.altKey };
      }
      return;
    }

    // Right-click anywhere else starts a directional sweep
    if (e.button === 2) {
      drag = { type: 'sweep', lastX: x, lastY: y, alt: e.altKey };
      return;
    }

    // 2. PERCUSSION STEP GRID (5 rows: KICK, PERC, HAT, CLAP, TOM)
    if (pointInRect(x, y, layout.perc)) {
      state.activeModule = 'perc';
      onHudUpdate();
      const pr = layout.perc;
      const { gridX, gridY, gridW, gridH, backX, fwdX, navW } = getPercGridMetrics(pr);
      const row = Math.min(4, Math.max(0, Math.floor(((y - gridY) / gridH) * 5)));
      const muteKeys: PercRowKey[] = ['kick', 'perc', 'hat', 'clap', 'tom'];
      const ch = muteKeys[row];

      if (y >= gridY && y <= gridY + gridH) {
        // Per-row Back (<) and Forward (>) history buttons
        if (x >= backX && x <= backX + navW) {
          if (undoRowHistory(ch)) onHudUpdate();
          return;
        }
        if (x >= fwdX && x <= fwdX + navW) {
          if (redoRowHistory(ch)) onHudUpdate();
          return;
        }
        // Clicking row label on the left toggles mute for that drum voice (Ctrl/Cmd+Click toggles all perc)
        if (x < backX) {
          if (e.ctrlKey || e.metaKey) {
            const shouldMuteAll = PERC_MUTES.some((k) => !state.mutes[k]);
            PERC_MUTES.forEach((k) => {
              state.mutes[k] = shouldMuteAll;
            });
          } else {
            state.mutes[ch] = !state.mutes[ch];
          }
          onHudUpdate();
          return;
        }
      }

      if (x >= gridX && x <= gridX + gridW && y >= gridY && y <= gridY + gridH) {
        pushUndo();
        pushRowHistory(ch, true);
        const step = Math.max(0, Math.min(15, Math.floor(((x - gridX) / gridW) * 16)));
        const stepArrays = [
          state.kickSteps,
          state.percSteps,
          state.hatSteps,
          state.clapSteps,
          state.tomSteps,
        ];
        const arr = stepArrays[row];
        if (e.shiftKey && (row === 1 || row === 2 || row === 3)) {
          const rKey = row === 1 ? 'perc' : row === 2 ? 'hat' : 'clap';
          const cur = state.ratchetSteps[rKey][step] ?? 1;
          state.ratchetSteps[rKey][step] = cur >= 4 ? 1 : cur + 1;
          onHudUpdate();
          return;
        }
        const paintValue = !arr[step];
        arr[step] = paintValue;
        drag = { type: 'perc', paintValue, lastKey: `${row}:${step}`, paintedRows: new Set([row]) };
      }
      return;
    }

    // 3. MELODY SKETCHPAD
    if (pointInRect(x, y, layout.melody)) {
      state.activeModule = 'lead';
      const mm = getMelodyGridMetrics(layout.melody);
      if (pointInRect(x, y, mm.backRect)) {
        if (undoMelodyHistory()) onHudUpdate();
        return;
      }
      if (pointInRect(x, y, mm.fwdRect)) {
        if (redoMelodyHistory()) onHudUpdate();
        return;
      }
      if (pointInRect(x, y, mm.clrRect)) {
        clearMelody();
        return;
      }

      pushUndo();
      pushMelodyHistory(true);
      const { mx0, my0, mw, mh } = mm;
      const nx = Math.max(0, Math.min(1, (x - mx0) / mw));
      const ny = Math.max(0, Math.min(1, (y - my0) / mh));
      const startStep = Math.max(0, Math.min(15, Math.floor(nx * 16)));
      const startNote = Math.max(0, Math.min(13, Math.round((1 - ny) * 13)));
      const eraseMode = state.melody[startStep] === startNote;
      const baseMelody = [...state.melody];
      if (eraseMode) {
        state.melody[startStep] = null;
        state.melodyRawPath = [];
      } else {
        state.melodyRawPath = [{ x: nx, y: ny }];
      }
      drag = {
        type: 'melody',
        moved: false,
        eraseMode,
        startX: x,
        startY: y,
        baseMelody,
      };
      onHudUpdate();
      return;
    }

    // 4. BASS SEQUENCER (Middle-Right — Interactive 8-Step Bars)
    if (pointInRect(x, y, layout.bass)) {
      state.activeModule = 'bass';
      onHudUpdate();
      const bm = getBassGridMetrics(layout.bass);
      for (const o of bm.octRects) {
        if (pointInRect(x, y, o.rect)) {
          state.bassOctaveOffset = o.val;
          drone.update(engine);
          onHudUpdate();
          return;
        }
      }
      if (pointInRect(x, y, bm.backRect)) {
        if (undoBassHistory()) onHudUpdate();
        return;
      }
      if (pointInRect(x, y, bm.fwdRect)) {
        if (redoBassHistory()) onHudUpdate();
        return;
      }
      if (pointInRect(x, y, bm.rndRect)) {
        pushUndo();
        pushBassHistory();
        const choices = [0, 0, 0, 1, 2, 3, 4, 5, 7];
        state.latchedIndices = Array.from({ length: 8 }, (_, i) =>
          i === 0 ? 0 : choices[Math.floor(Math.random() * choices.length)]
        );
        onHudUpdate();
        return;
      }
      if (pointInRect(x, y, bm.rstRect)) {
        pushUndo();
        pushBassHistory();
        state.latchedIndices = [0, 0, 3, 0, 4, 0, 1, 0];
        onHudUpdate();
        return;
      }

      if (x >= bm.gridX && x <= bm.gridX + bm.gridW && y >= bm.gridY && y <= bm.gridY + bm.gridH) {
        if (e.button === 2) {
          const step = Math.max(0, Math.min(7, Math.floor(((x - bm.gridX) / bm.gridW) * 8)));
          if (state.latchedIndices[step] !== 0) {
            pushUndo();
            pushBassHistory(true);
            state.latchedIndices[step] = 0;
            onHudUpdate();
          }
          return;
        }
        pushUndo();
        const step = Math.max(0, Math.min(7, Math.floor(((x - bm.gridX) / bm.gridW) * 8)));
        if (e.shiftKey) {
          state.bassAccents[step] = !state.bassAccents[step];
          state.bassAccents[step + 8] = state.bassAccents[step];
          onHudUpdate();
          return;
        }
        if (e.altKey) {
          state.bassSlides[step] = !state.bassSlides[step];
          state.bassSlides[step + 8] = state.bassSlides[step];
          onHudUpdate();
          return;
        }
        const normY = 1 - Math.max(0, Math.min(1, (y - bm.gridY) / bm.gridH));
        const deg = Math.max(0, Math.min(7, Math.round(normY * 7)));
        if (state.latchedIndices[step] !== deg) {
          pushBassHistory(true);
          state.latchedIndices[step] = deg;
          onHudUpdate();
        }
        drag = { type: 'bassCanvas', lastKey: `${step}:${deg}` };
      }
      return;
    }

    // 5. DIRECTIONAL SWEEP PAD
    if (pointInRect(x, y, layout.sweep)) {
      state.activeModule = 'filter';
      onHudUpdate();
      drag = { type: 'sweep', lastX: x, lastY: y, alt: e.altKey };
    }
  });

  window.addEventListener('pointermove', (e) => {
    const { x, y } = getClientPos(e);
    state.pointerX = x;
    state.pointerY = y;
    const layout = getStageLayout(canvas.clientWidth, canvas.clientHeight);

    if (drag.type === 'perc') {
      const pr = layout.perc;
      const { gridX, gridY, gridW, gridH } = getPercGridMetrics(pr);
      if (x >= gridX && x <= gridX + gridW && y >= gridY && y <= gridY + gridH) {
        const step = Math.max(0, Math.min(15, Math.floor(((x - gridX) / gridW) * 16)));
        const row = Math.min(4, Math.floor(((y - gridY) / gridH) * 5));
        const key = `${row}:${step}`;
        if (key !== drag.lastKey) {
          drag.lastKey = key;
          const muteKeys: PercRowKey[] = ['kick', 'perc', 'hat', 'clap', 'tom'];
          if (!drag.paintedRows.has(row)) {
            drag.paintedRows.add(row);
            pushRowHistory(muteKeys[row], true);
          }
          const stepArrays = [
            state.kickSteps,
            state.percSteps,
            state.hatSteps,
            state.clapSteps,
            state.tomSteps,
          ];
          stepArrays[row][step] = drag.paintValue;
        }
      }
      return;
    }

    if (drag.type === 'melody') {
      if (Math.hypot(x - drag.startX, y - drag.startY) > 6) {
        drag.moved = true;
      }
      const { mx0, my0, mw, mh } = getMelodyGridMetrics(layout.melody);
      const nx = Math.max(0, Math.min(1, (x - mx0) / mw));
      const ny = Math.max(0, Math.min(1, (y - my0) / mh));
      if (drag.eraseMode) {
        const step = Math.max(0, Math.min(15, Math.floor(nx * 16)));
        const noteIdx = Math.max(0, Math.min(13, Math.round((1 - ny) * 13)));
        const cur = state.melody[step];
        if (cur !== null && cur !== undefined && Math.abs(cur - noteIdx) <= 1) {
          state.melody[step] = null;
        }
      } else {
        state.melodyRawPath.push({ x: nx, y: ny });
        const stroke = quantizeMelodyPath(state.melodyRawPath, state.melodyQuantize);
        state.melody = drag.baseMelody.map((prev, i) => (stroke[i] !== null ? stroke[i] : prev));
      }
      return;
    }

    if (drag.type === 'bassCanvas') {
      const bm = getBassGridMetrics(layout.bass);
      if (x >= bm.gridX && x <= bm.gridX + bm.gridW) {
        const step = Math.max(0, Math.min(7, Math.floor(((x - bm.gridX) / bm.gridW) * 8)));
        const normY = 1 - Math.max(0, Math.min(1, (y - bm.gridY) / Math.max(1, bm.gridH)));
        const deg = Math.max(0, Math.min(7, Math.round(normY * 7)));
        const key = `${step}:${deg}`;
        if (key !== drag.lastKey) {
          drag.lastKey = key;
          if (state.latchedIndices[step] !== deg) {
            pushBassHistory(true);
            state.latchedIndices[step] = deg;
            onHudUpdate();
          }
        }
      }
      return;
    }

    if (drag.type === 'sweep') {
      const dx = (x - drag.lastX) / Math.max(220, layout.sweep.w * 0.65);
      const dy = (y - drag.lastY) / Math.max(140, layout.sweep.h * 0.75);
      drag.lastX = x;
      drag.lastY = y;

      if (drag.alt || e.altKey) {
        state.resonanceNorm = Math.max(0, Math.min(1, state.resonanceNorm + dx));
        state.sidechainDepth = Math.max(0, Math.min(1, state.sidechainDepth - dy));
      } else {
        state.filterCutoffNorm = Math.max(0, Math.min(1, state.filterCutoffNorm + dx));
        state.spaceNorm = Math.max(0, Math.min(1, state.spaceNorm - dy));
      }

      state.swipeTrail.push({ x, y, alpha: 0.9 });
      if (state.swipeTrail.length > 24) state.swipeTrail.shift();

      if (state.initialized) {
        engine.syncParameters();
      }
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (drag.type === 'melody' && !drag.moved && !drag.eraseMode) {
      const { x, y } = getClientPos(e);
      const { mx0, my0, mw, mh } = getMelodyGridMetrics(
        getStageLayout(canvas.clientWidth, canvas.clientHeight).melody
      );
      const step = Math.max(0, Math.min(15, Math.floor(((x - mx0) / mw) * 16)));
      const noteIdx = Math.max(0, Math.min(13, Math.round((1 - (y - my0) / mh) * 13)));
      state.melody[step] = state.melody[step] === noteIdx ? null : noteIdx;
      state.melodyRawPath = [];
    }
    drag = { type: 'none' };
  });

  // Scroll wheel on canvas: nudge bass step if over Bass Sequencer
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!state.initialized || state.viewMode === 'arrange') return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const layout = getStageLayout(canvas.clientWidth, canvas.clientHeight);
      if (pointInRect(x, y, layout.bass)) {
        const bm = getBassGridMetrics(layout.bass);
        if (x >= bm.gridX && x <= bm.gridX + bm.gridW) {
          e.preventDefault();
          e.stopPropagation();
          const step = Math.max(0, Math.min(7, Math.floor(((x - bm.gridX) / bm.gridW) * 8)));
          const dir = e.deltaY < 0 ? 1 : -1;
          const next = Math.max(0, Math.min(7, state.latchedIndices[step] + dir));
          if (state.latchedIndices[step] !== next) {
            pushUndo();
            pushBassHistory(true);
            state.latchedIndices[step] = next;
            onHudUpdate();
          }
        }
      }
    },
    { passive: false }
  );

  // Scroll wheel morphs Minimal <-> Drift (only when not scrolling sidebars)
  window.addEventListener(
    'wheel',
    (e) => {
      if (!state.initialized || state.viewMode === 'arrange') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('#component-board, #stack-rack')) return;
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      state.minimalAmount = Math.max(0, Math.min(1, state.minimalAmount + delta));
      engine.syncParameters();
      drone.update(engine);
      onHudUpdate();
    },
    { passive: true }
  );

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();

    if ((e.metaKey || e.ctrlKey) && key === 'z') {
      e.preventDefault();
      doUndo();
      return;
    }

    if (key === 'escape') {
      helpOverlay.classList.add('hidden');
      return;
    }

    if (key === 'enter') {
      e.preventDefault();
      togglePlayStop();
      return;
    }

    if (!state.initialized) return;

    // 1-9 quick mutes for all Audio Channels
    const channelKeys: Record<string, MuteChannel> = {
      '1': 'kick',
      '2': 'perc',
      '3': 'hat',
      '4': 'clap',
      '5': 'tom',
      '6': 'bass',
      '7': 'lead',
      '8': 'drone',
      '9': 'stab',
    };
    if (channelKeys[key]) {
      const ch = channelKeys[key];
      state.mutes[ch] = !state.mutes[ch];
      if (ch === 'drone') drone.update(engine);
      onHudUpdate();
      return;
    }

    // Global left-hand actions
    if (key === 'c') {
      doShuffle();
      return;
    } else if (key === 'v') {
      doUndo();
      return;
    } else if (key === 'g') {
      clearMelody();
      return;
    } else if (key === '9') {
      cycleGeometryMode();
      return;
    } else if (key === '0') {
      cycleArpMode();
      return;
    } else if (key === '[') {
      changeBpm(-5);
      return;
    } else if (key === ']') {
      changeBpm(5);
      return;
    }

    // Momentary hold FX (left thumb / bottom-left)
    if (e.code === 'Space') {
      e.preventDefault();
      state.fx.breakdown = true;
      engine.syncParameters();
      onHudUpdate();
      return;
    } else if (key === 'z') {
      state.fx.tapeSag = true;
      onHudUpdate();
      return;
    } else if (key === 'x') {
      state.fx.stutter = true;
      onHudUpdate();
      return;
    }

    // Context-sensitive Left-Hand WASD + QERF controls based on activeModule
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const mod = state.activeModule;

    if (mod === 'perc') {
      if (key === 'q') { cycleKickChar(); return; }
      if (key === 'e') {
        const tones: PercTone[] = ['low', 'mid', 'high'];
        state.percTone = tones[(tones.indexOf(state.percTone) + 1) % tones.length];
        onHudUpdate(); return;
      }
      if (key === 'r') { mutatePerc(); return; }
      if (key === 'f') { cyclePercKit(); return; }
      if (key === 'w') { state.swingAmount = Math.min(0.6, state.swingAmount + 0.08); onHudUpdate(); return; }
      if (key === 's') { state.swingAmount = Math.max(0, state.swingAmount - 0.08); onHudUpdate(); return; }
      if (key === 'a') { state.minimalAmount = clamp01(state.minimalAmount - 0.1); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'd') { state.minimalAmount = clamp01(state.minimalAmount + 0.1); engine.syncParameters(); onHudUpdate(); return; }
    } else if (mod === 'lead' || mod === 'arp' || mod === 'synth') {
      if (key === 'q') { cycleArpMode(); return; }
      if (key === 'e') { cycleArp(); return; }
      if (key === 'r') { clearMelody(); return; }
      if (key === 'f') { cycleLeadVoice(); return; }
      if (key === 'w') { state.arpGate = clamp01(state.arpGate + 0.1); onHudUpdate(); return; }
      if (key === 's') { state.arpGate = clamp01(state.arpGate - 0.1); onHudUpdate(); return; }
      if (key === 'a') { state.arpOctaveShift = state.arpOctaveShift === -1 ? -1 : ((state.arpOctaveShift - 1) as -1 | 0 | 1); onHudUpdate(); return; }
      if (key === 'd') { state.arpOctaveShift = state.arpOctaveShift === 1 ? 1 : ((state.arpOctaveShift + 1) as -1 | 0 | 1); onHudUpdate(); return; }
    } else if (mod === 'bass') {
      if (key === 'q') { if (undoBassHistory()) onHudUpdate(); return; }
      if (key === 'e') { if (redoBassHistory()) onHudUpdate(); return; }
      if (key === 'r') {
        pushUndo(); pushBassHistory();
        const choices = [0, 0, 0, 1, 2, 3, 4, 5, 7];
        state.latchedIndices = Array.from({ length: 8 }, (_, i) => i === 0 ? 0 : choices[Math.floor(Math.random() * choices.length)]);
        onHudUpdate(); return;
      }
      if (key === 'f') {
        pushUndo(); pushBassHistory();
        state.latchedIndices = [0, 0, 3, 0, 4, 0, 1, 0];
        onHudUpdate(); return;
      }
      if (key === 'w') { state.bassOctaveOffset = Math.min(1, state.bassOctaveOffset + 1); drone.update(engine); onHudUpdate(); return; }
      if (key === 's') { state.bassOctaveOffset = Math.max(-1, state.bassOctaveOffset - 1); drone.update(engine); onHudUpdate(); return; }
    } else if (mod === 'geom') {
      const targets: GeomTarget[] = ['bass', 'arp', 'pad', 'filter'];
      if (key === 'w') { state.geomTarget = targets[(targets.indexOf(state.geomTarget) + 3) % 4]; onHudUpdate(); return; }
      if (key === 's') { state.geomTarget = targets[(targets.indexOf(state.geomTarget) + 1) % 4]; onHudUpdate(); return; }
      if (key === 'd') { cycleGeometryMode(); return; }
      if (key === 'a') {
        const idx = GEOMETRY_MODES.indexOf(state.geomShapes[state.geomTarget]);
        state.geomShapes[state.geomTarget] = GEOMETRY_MODES[(idx + GEOMETRY_MODES.length - 1) % GEOMETRY_MODES.length];
        onHudUpdate(); return;
      }
      if (key === 'r') {
        (['bass', 'arp', 'pad', 'filter'] as const).forEach((t) => { state.geomShapes[t] = 'off'; state.geomVertices[t] = 0; });
        onHudUpdate(); return;
      }
    } else if (mod === 'filter') {
      if (key === 'a') { state.filterCutoffNorm = clamp01(state.filterCutoffNorm - 0.08); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'd') { state.filterCutoffNorm = clamp01(state.filterCutoffNorm + 0.08); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'w') { state.resonanceNorm = clamp01(state.resonanceNorm + 0.08); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 's') { state.resonanceNorm = clamp01(state.resonanceNorm - 0.08); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'q') { state.driveAmount = clamp01(state.driveAmount - 0.1); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'e') { state.driveAmount = clamp01(state.driveAmount + 0.1); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'r') { cycleScale(); return; }
    } else if (mod === 'lfo') {
      if (key === 'q') { toggleAutoLfo(); return; }
      if (key === 'e') {
        const dests: LfoDest[] = ['filter', 'pan'];
        state.lfoDest = dests[(dests.indexOf(state.lfoDest) + 1) % dests.length];
        onHudUpdate(); return;
      }
      if (key === 'w') { state.lfoDepth = clamp01(state.lfoDepth + 0.1); onHudUpdate(); return; }
      if (key === 's') { state.lfoDepth = clamp01(state.lfoDepth - 0.1); onHudUpdate(); return; }
      if (key === 'a') { state.chorusSpread = clamp01(state.chorusSpread - 0.1); onHudUpdate(); return; }
      if (key === 'd') { state.chorusSpread = clamp01(state.chorusSpread + 0.1); onHudUpdate(); return; }
    } else if (mod === 'pad' || mod === 'space') {
      if (key === 'q') {
        const chords: PadChord[] = ['drone', 'minor', 'sus2', 'shimmer'];
        state.padChord = chords[(chords.indexOf(state.padChord) + 1) % chords.length];
        drone.update(engine); onHudUpdate(); return;
      }
      if (key === 'e') {
        const syncs: DelaySync[] = ['1/8', '3/16', '1/4', 'slap'];
        state.delaySync = syncs[(syncs.indexOf(state.delaySync) + 1) % syncs.length];
        engine.syncParameters(); onHudUpdate(); return;
      }
      if (key === 'f') {
        const modes: SpaceMode[] = ['dark', 'cavern', 'freeze'];
        state.spaceMode = modes[(modes.indexOf(state.spaceMode) + 1) % modes.length];
        engine.syncParameters(); onHudUpdate(); return;
      }
      if (key === 'w') { state.spaceNorm = clamp01(state.spaceNorm + 0.08); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 's') { state.spaceNorm = clamp01(state.spaceNorm - 0.08); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'a') { state.sidechainDepth = clamp01(state.sidechainDepth - 0.08); onHudUpdate(); return; }
      if (key === 'd') { state.sidechainDepth = clamp01(state.sidechainDepth + 0.08); onHudUpdate(); return; }
    } else if (mod === 'bassTone') {
      if (key === 'q') {
        const tones: BassTone[] = ['saw', 'sqr', 'acid', 'sub'];
        state.bassTone = tones[(tones.indexOf(state.bassTone) + 1) % tones.length];
        onHudUpdate(); return;
      }
      if (key === 'w') { state.bassCutoff = clamp01(state.bassCutoff + 0.1); onHudUpdate(); return; }
      if (key === 's') { state.bassCutoff = clamp01(state.bassCutoff - 0.1); onHudUpdate(); return; }
      if (key === 'a') { state.bassDecay = clamp01(state.bassDecay - 0.1); onHudUpdate(); return; }
      if (key === 'd') { state.bassDecay = clamp01(state.bassDecay + 0.1); onHudUpdate(); return; }
    } else if (mod === 'modifiers') {
      if (key === 'w') { state.tapeWow = clamp01(state.tapeWow + 0.1); onHudUpdate(); return; }
      if (key === 's') { state.tapeWow = clamp01(state.tapeWow - 0.1); onHudUpdate(); return; }
      if (key === 'a') { state.ringMod = clamp01(state.ringMod - 0.1); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'd') { state.ringMod = clamp01(state.ringMod + 0.1); engine.syncParameters(); onHudUpdate(); return; }
      if (key === 'q') { state.bleepProb = clamp01(state.bleepProb - 0.1); onHudUpdate(); return; }
      if (key === 'e') { state.bleepProb = clamp01(state.bleepProb + 0.1); onHudUpdate(); return; }
      if (key === 'f') { state.subDrop = !state.subDrop; onHudUpdate(); return; }
      if (key === 'r') { state.autoFill = !state.autoFill; onHudUpdate(); return; }
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (e.code === 'Space') {
      state.fx.breakdown = false;
      engine.syncParameters();
      onHudUpdate();
    } else if (key === 'z') {
      state.fx.tapeSag = false;
      onHudUpdate();
    } else if (key === 'x') {
      state.fx.stutter = false;
      onHudUpdate();
    }
  });
}
