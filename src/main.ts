import './style.css';
import { AudioEngine } from './audio/engine';
import { LoopRecorder } from './audio/recorder';
import { Scheduler } from './audio/scheduler';
import { midiToNoteName, scaleIndexToMidi } from './audio/theory';
import { canRedoBass, canUndoBass } from './state/shuffle';
import { DroneBed } from './audio/voices';
import { setupControls } from './input/controls';
import { DubChannel, MuteChannel, PatternInst, state } from './state/store';
import { startCanvasRenderer } from './ui/canvas';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const statusDot = document.getElementById('status-dot')!;
const statusText = document.getElementById('status-text')!;
const modeDisplay = document.getElementById('mode-display')!;
const fxDisplay = document.getElementById('fx-display');

const btnPlayStop = document.getElementById('btn-play-stop')!;
const valPlayStop = document.getElementById('val-play-stop')!;
const valLeadGlide = document.getElementById('val-lead-glide')!;
const bpmDisplay = document.getElementById('bpm-display')!;

const btnFxDrop = document.getElementById('btn-fx-drop')!;
const btnFxTape = document.getElementById('btn-fx-tape')!;
const btnFxStutter = document.getElementById('btn-fx-stutter')!;

const engine = new AudioEngine();
const drone = new DroneBed();

let updateHudRef: () => void = () => {};

const recorder = new LoopRecorder(engine, () => {
  updateHudRef();
});

const scheduler = new Scheduler(engine, drone, recorder);

function syncSegGroup(selector: string, dataKey: string, value: string | number): void {
  const strVal = String(value);
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset[dataKey] === strVal);
  });
}

function syncKnob(id: string, valId: string, norm: number, text: string): void {
  const el = document.getElementById(id);
  const valEl = document.getElementById(valId);
  if (valEl) valEl.textContent = text;
  if (!el) return;
  const clamped = Math.max(0, Math.min(1, norm));
  const arc = el.querySelector<SVGCircleElement>('.knob-arc');
  const ptr = el.querySelector<SVGLineElement>('.knob-ptr');
  if (arc) {
    arc.style.strokeDasharray = `${(clamped * 75.4).toFixed(1)} 100`;
  }
  if (ptr) {
    const deg = -135 + clamped * 270;
    ptr.style.transform = `rotate(${deg.toFixed(1)}deg)`;
  }
}

function updateHud(): void {
  statusDot.classList.toggle('playing', state.playing);
  statusText.textContent = state.playing ? 'LIVE' : 'PAUSED';
  btnPlayStop.classList.toggle('playing', state.playing);
  valPlayStop.textContent = state.playing ? '■ STOP' : '▶ PLAY';

  const minPct = Math.round(state.minimalAmount * 100);
  modeDisplay.textContent =
    minPct >= 50 ? `MINIMAL ${minPct}%` : `DRIFT ${100 - minPct}%`;

  bpmDisplay.textContent = `${state.bpm} BPM`;

  valLeadGlide.textContent = state.leadGlide ? 'ON' : 'OFF';
  document.getElementById('btn-lead-glide')?.classList.toggle('playing', state.leadGlide);

  syncSegGroup('#grp-scale .seg-btn', 'scale', state.scaleIndex);
  syncSegGroup('#grp-bass-tone .seg-btn', 'bassTone', state.bassTone);
  const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rootEl = document.getElementById('val-root-note');
  if (rootEl) rootEl.textContent = ROOT_NAMES[(state.rootOffset + 12) % 12];
  document.querySelectorAll<HTMLButtonElement>('[data-geom-for][data-geom-shape]').forEach((btn) => {
    const target = btn.dataset.geomFor as keyof typeof state.geomShapes | undefined;
    const shape = btn.dataset.geomShape;
    if (target && shape) {
      btn.classList.toggle('active', state.geomShapes[target] === shape);
    }
  });
  document.querySelectorAll<HTMLElement>('[data-geom-select]').forEach((lbl) => {
    lbl.classList.toggle('active', lbl.dataset.geomSelect === state.geomTarget);
  });
  syncSegGroup('#grp-kick-char .seg-btn', 'kickChar', state.kickCharacter);
  syncSegGroup('#grp-perc-kit .seg-btn', 'percKit', state.percKit);
  syncSegGroup('#grp-perc-tone .seg-btn', 'percTone', state.percTone);
  syncSegGroup('#grp-lead-voice .seg-btn', 'leadVoice', state.leadVoice);
  syncSegGroup('#grp-harmony .seg-btn', 'harmony', state.harmonyMode);
  syncSegGroup('#grp-env .seg-btn', 'env', state.synthEnv);
  syncSegGroup('#grp-detune .seg-btn', 'detune', state.synthDetune);
  syncSegGroup('#grp-lfo-rate .seg-btn', 'lfoRate', state.lfoRate);
  syncSegGroup('#grp-lfo-dest .seg-btn', 'lfoDest', state.lfoDest);
  syncSegGroup('#grp-arp-mode .seg-btn', 'arpMode', state.arpMode);
  syncSegGroup('#grp-arp-spd .seg-btn', 'arpSpd', state.arpMultiplier);
  syncSegGroup('#grp-arp-oct .seg-btn', 'arpOct', state.arpOctaves);
  syncSegGroup('#grp-arp-shift .seg-btn', 'arpShift', state.arpOctaveShift);
  syncSegGroup('#grp-arp-rhythm .seg-btn', 'arpRhythm', state.arpRhythm);
  syncSegGroup('#grp-mel-quant .seg-btn', 'melQuant', state.melodyQuantize);
  syncSegGroup('#grp-bass-oct .seg-btn', 'bassOct', state.bassOctaveOffset);
  syncSegGroup('#grp-pad-chord .seg-btn', 'padChord', state.padChord);
  syncSegGroup('#grp-delay-sync .seg-btn', 'delaySync', state.delaySync);
  syncSegGroup('#grp-space-mode .seg-btn', 'spaceMode', state.spaceMode);
  syncSegGroup('#grp-sample-auto .seg-btn', 'sampleAuto', state.sampleAutoMode);

  const cutoffHz = Math.round(140 * Math.pow(60, state.filterCutoffNorm));
  const cutoffStr = cutoffHz >= 1000 ? `${(cutoffHz / 1000).toFixed(1)}k` : `${cutoffHz}Hz`;
  syncKnob('knob-cutoff', 'val-knob-cutoff', state.filterCutoffNorm, cutoffStr);
  syncKnob('knob-reso', 'val-knob-reso', state.resonanceNorm, (0.7 + state.resonanceNorm * 4.5).toFixed(1));
  syncKnob('knob-drive', 'val-knob-drive', state.driveAmount, `${Math.round(state.driveAmount * 100)}%`);
  syncKnob('knob-minimal', 'val-knob-minimal', state.minimalAmount, `${Math.round(state.minimalAmount * 100)}%`);
  syncKnob('knob-lfo-depth', 'val-knob-lfo-depth', state.lfoDepth, `${Math.round(state.lfoDepth * 100)}%`);
  syncKnob('knob-chorus', 'val-knob-chorus', state.chorusSpread, `${Math.round(state.chorusSpread * 100)}%`);
  syncKnob('knob-arp-gate', 'val-knob-arp-gate', state.arpGate, `${Math.round(state.arpGate * 100)}%`);
  syncKnob('knob-arp-prob', 'val-knob-arp-prob', state.arpProb, `${Math.round(state.arpProb * 100)}%`);
  syncKnob('knob-swing', 'val-knob-swing', state.swingAmount / 0.6, `${Math.round(state.swingAmount * 100)}%`);
  syncKnob('knob-pad-lvl', 'val-knob-pad-lvl', state.padLevel, `${Math.round(state.padLevel * 100)}%`);
  syncKnob('knob-space', 'val-knob-space', state.spaceNorm, `${Math.round(state.spaceNorm * 100)}%`);
  syncKnob('knob-pump', 'val-knob-pump', state.sidechainDepth, `${Math.round(state.sidechainDepth * 100)}%`);
  syncKnob('knob-delay-fb', 'val-knob-delay-fb', state.delayFeedback / 0.85, `${Math.round(state.delayFeedback * 100)}%`);
  syncKnob('knob-bass-cutoff', 'val-knob-bass-cutoff', state.bassCutoff, `${Math.round(state.bassCutoff * 100)}%`);
  syncKnob('knob-bass-decay', 'val-knob-bass-decay', state.bassDecay, `${Math.round(state.bassDecay * 100)}%`);

  const djLabel =
    Math.abs(state.djFilter - 0.5) < 0.02
      ? 'BYP'
      : state.djFilter < 0.5
        ? `LP ${Math.round((0.5 - state.djFilter) * 200)}%`
        : `HP ${Math.round((state.djFilter - 0.5) * 200)}%`;
  syncKnob('knob-dj-filter', 'val-knob-dj-filter', state.djFilter, djLabel);

  const fmtEqDb = (val: number, killed: boolean): string => {
    if (killed) return 'KILL';
    if (val <= 0.02) return '-∞';
    if (val <= 0.75) {
      const db = Math.round(((val - 0.75) / 0.75) * 24);
      return `${db}dB`;
    }
    const db = Math.round(((val - 0.75) / 0.25) * 5);
    return db > 0 ? `+${db}dB` : '0dB';
  };
  syncKnob('knob-eq-low', 'val-knob-eq-low', state.eqLow, fmtEqDb(state.eqLow, state.eqKill.low));
  syncKnob('knob-eq-mid', 'val-knob-eq-mid', state.eqMid, fmtEqDb(state.eqMid, state.eqKill.mid));
  syncKnob('knob-eq-high', 'val-knob-eq-high', state.eqHigh, fmtEqDb(state.eqHigh, state.eqKill.high));

  (['low', 'mid', 'high'] as const).forEach((band) => {
    document.getElementById(`btn-kill-${band}`)?.classList.toggle('killed', state.eqKill[band]);
  });

  const sceneXfader = document.getElementById('scene-xfader') as HTMLInputElement | null;
  if (sceneXfader) sceneXfader.value = String(Math.round(state.sceneXfade * 100));
  const oledDj = document.getElementById('oled-dj');
  if (oledDj) {
    oledDj.textContent = `DJ FLT ${djLabel} · EQ ${fmtEqDb(state.eqLow, state.eqKill.low)}/${fmtEqDb(state.eqMid, state.eqKill.mid)}/${fmtEqDb(state.eqHigh, state.eqKill.high)}`;
  }
  const oledScene = document.getElementById('oled-scene');
  if (oledScene) {
    oledScene.textContent = `SCENE A ◄── ${Math.round(state.sceneXfade * 100)}% ──► B`;
  }

  syncKnob('knob-comb-mix', 'val-knob-comb-mix', state.combMix, `${Math.round(state.combMix * 100)}%`);
  syncKnob('knob-comb-tune', 'val-knob-comb-tune', state.combTune, `${Math.round(1 + state.combTune * 29)}ms`);
  syncKnob('knob-comb-fb', 'val-knob-comb-fb', state.combFeedback, `${Math.round(state.combFeedback * 100)}%`);
  syncKnob('knob-gate-mix', 'val-knob-gate-mix', state.gatedReverbMix, `${Math.round(state.gatedReverbMix * 100)}%`);
  syncKnob('knob-gate-time', 'val-knob-gate-time', state.gatedReverbTime, `${Math.round(40 + state.gatedReverbTime * 260)}ms`);

  const ppBtn = document.getElementById('btn-ping-pong');
  if (ppBtn) {
    ppBtn.classList.toggle('playing', state.pingPong);
    ppBtn.textContent = `PING-PONG: ${state.pingPong ? 'ON' : 'OFF'}`;
  }

  document.querySelectorAll<HTMLInputElement>('[data-dub-delay]').forEach((inp) => {
    const ch = inp.dataset.dubDelay as DubChannel;
    inp.value = String(Math.round(state.dubDelaySend[ch] * 100));
  });
  document.querySelectorAll<HTMLInputElement>('[data-dub-reverb]').forEach((inp) => {
    const ch = inp.dataset.dubReverb as DubChannel;
    inp.value = String(Math.round(state.dubReverbSend[ch] * 100));
  });

  syncSegGroup('#grp-lfo2-shape .seg-btn', 'lfo2Shape', state.lfo2Shape);
  syncSegGroup('#grp-lfo2-dest .seg-btn', 'lfo2Dest', state.lfo2Dest);
  syncSegGroup('#grp-sh-rate .seg-btn', 'shRate', state.shRate);
  syncSegGroup('#grp-sh-dest .seg-btn', 'shDest', state.shDest);
  syncSegGroup('#grp-envfol-src .seg-btn', 'envfolSrc', state.envFolSource);
  syncSegGroup('#grp-envfol-dst .seg-btn', 'envfolDst', state.envFolDest);

  const lfo2Hz = 0.1 * Math.pow(120, state.lfo2Rate);
  syncKnob('knob-lfo2-rate', 'val-knob-lfo2-rate', state.lfo2Rate, `${lfo2Hz.toFixed(1)}Hz`);
  syncKnob('knob-lfo2-depth', 'val-knob-lfo2-depth', state.lfo2Depth, `${Math.round(state.lfo2Depth * 100)}%`);
  syncKnob('knob-sh-depth', 'val-knob-sh-depth', state.shDepth, `${Math.round(state.shDepth * 100)}%`);
  syncKnob('knob-env-fol', 'val-knob-env-fol', state.envFolAmount, `${Math.round(state.envFolAmount * 100)}%`);
  const oledMod2 = document.getElementById('oled-mod2');
  if (oledMod2) {
    oledMod2.textContent = `LFO2 ${state.lfo2Shape.slice(0, 3).toUpperCase()} ${lfo2Hz.toFixed(1)}Hz → ${state.lfo2Dest.toUpperCase()} ${Math.round(state.lfo2Depth * 100)}%`;
  }

  syncKnob('knob-bass-envmod', 'val-knob-bass-envmod', state.bassEnvMod, `${Math.round(state.bassEnvMod * 100)}%`);
  syncKnob('knob-bass-envdec', 'val-knob-bass-envdec', state.bassEnvDecay, `${Math.round(state.bassEnvDecay * 100)}%`);
  syncKnob('knob-bass-fold', 'val-knob-bass-fold', state.bassWavefold, `${Math.round(state.bassWavefold * 100)}%`);
  syncKnob('knob-kick-sweep', 'val-knob-kick-sweep', state.kickPitchDecay, `${Math.round(state.kickPitchDecay * 100)}%`);
  syncKnob('knob-kick-punch', 'val-knob-kick-punch', state.kickPunch, `${Math.round(state.kickPunch * 100)}%`);
  syncKnob('knob-hat-decay', 'val-knob-hat-decay', state.hatDecay, `${Math.round(state.hatDecay * 100)}%`);
  syncKnob('knob-clap-snap', 'val-knob-clap-snap', state.clapSnap, `${Math.round(state.clapSnap * 100)}%`);
  syncKnob('knob-perc-fm', 'val-knob-perc-fm', state.percFmIndex, `${Math.round(state.percFmIndex * 100)}%`);
  syncKnob('knob-turing-mutate', 'val-knob-turing-mutate', state.turingMutate, `${Math.round(state.turingMutate * 100)}%`);
  syncKnob('knob-ratchet-prob', 'val-knob-ratchet-prob', state.ratchetProb, `${Math.round(state.ratchetProb * 100)}%`);

  const turingBtn = document.getElementById('btn-turing-toggle');
  if (turingBtn) {
    turingBtn.classList.toggle('playing', state.turingEnabled);
    turingBtn.textContent = `TURING: ${state.turingEnabled ? 'ON' : 'OFF'}`;
  }
  syncSegGroup('#grp-turing-target .seg-btn', 'turingTarget', state.turingTarget);
  const oledTuring = document.getElementById('oled-turing');
  if (oledTuring) {
    oledTuring.textContent = `TURING ${state.turingEnabled ? 'ON' : 'OFF'} · MUTATE ${Math.round(state.turingMutate * 100)}% → ${state.turingTarget.toUpperCase()}`;
  }
  (Object.keys(state.trackLengths) as (keyof typeof state.trackLengths)[]).forEach((k) => {
    const el = document.getElementById(`val-poly-${k}`);
    if (el) el.textContent = String(state.trackLengths[k]);
  });

  const syncFader = (id: string, valId: string, norm: number) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    const valEl = document.getElementById(valId);
    const pct = Math.round(norm * 100);
    if (el) el.value = String(pct);
    if (valEl) valEl.textContent = `${pct}%`;
  };
  syncFader('fader-ring-mod', 'val-ring-mod', state.ringMod);
  syncFader('fader-tape-wow', 'val-tape-wow', state.tapeWow);
  syncFader('fader-glitch', 'val-glitch', state.glitchProb);
  syncFader('fader-humanize', 'val-humanize', state.humanize);
  syncFader('fader-bleeps', 'val-bleeps', state.bleepProb);
  syncFader('fader-crush', 'val-crush', state.crushAmount);
  syncFader('fader-tension', 'val-tension', state.tensionAmount);
  syncFader('fader-ghost', 'val-ghost', state.ghostProb);

  // Mini OLED Screens
  const oledSynth = document.getElementById('oled-synth');
  if (oledSynth) {
    oledSynth.textContent = `${state.leadVoice.toUpperCase()} · HARM:${state.harmonyMode.toUpperCase()} · ${state.synthEnv.toUpperCase()} · ${state.synthDetune.toUpperCase()}`;
  }
  const oledMod = document.getElementById('oled-mod');
  if (oledMod) {
    oledMod.textContent = `LFO ${state.lfoRate.toUpperCase()} → ${state.lfoDest.toUpperCase()} ${Math.round(state.lfoDepth * 100)}% · CHS ${Math.round(state.chorusSpread * 100)}%`;
  }
  const oledBass = document.getElementById('oled-bass');
  if (oledBass) {
    const scaleNames = ['C PHRYGIAN', 'F MINOR', 'D DORIAN'];
    const octStr = state.bassOctaveOffset > 0 ? `+${state.bassOctaveOffset}` : `${state.bassOctaveOffset}`;
    oledBass.textContent = `${scaleNames[state.scaleIndex] ?? 'C PHR'} · OCT ${octStr}${state.subDrop ? ' (SUB -1)' : ''}`;
  }
  const oledSpace = document.getElementById('oled-space');
  if (oledSpace) {
    oledSpace.textContent = `${state.padChord.toUpperCase()} · ${state.delaySync} ${state.spaceMode.toUpperCase()}`;
  }

  const btnAutoFill = document.getElementById('btn-auto-fill');
  const valAutoFill = document.getElementById('val-auto-fill');
  if (btnAutoFill) btnAutoFill.classList.toggle('playing', state.autoFill);
  if (valAutoFill) valAutoFill.textContent = state.autoFill ? 'ON' : 'OFF';

  const pitchEl = document.getElementById('fader-sample-pitch') as HTMLInputElement | null;
  const pitchValEl = document.getElementById('val-sample-pitch');
  if (pitchEl) pitchEl.value = String(Math.round(state.samplePitch * 100));
  if (pitchValEl) pitchValEl.textContent = `${state.samplePitch.toFixed(1)}x`;

  const btnSubDrop = document.getElementById('btn-sub-drop');
  const valSubDrop = document.getElementById('val-sub-drop');
  if (btnSubDrop) btnSubDrop.classList.toggle('playing', state.subDrop);
  if (valSubDrop) valSubDrop.textContent = state.subDrop ? 'ON' : 'OFF';

  btnFxDrop.classList.toggle('active', state.fx.breakdown);
  btnFxTape.classList.toggle('active', state.fx.tapeSag);
  btnFxStutter.classList.toggle('active', state.fx.stutter);

  document.querySelectorAll<HTMLButtonElement>('#mixer-mutes .mute-btn').forEach((btn) => {
    const ch = btn.dataset.mute as MuteChannel | undefined;
    if (ch) btn.classList.toggle('muted', state.mutes[ch]);
  });

  document.querySelectorAll<HTMLInputElement>('#mixer-mutes .mixer-fader').forEach((slider) => {
    const ch = slider.dataset.level as MuteChannel | undefined;
    if (!ch) return;
    const pct = Math.round(state.levels[ch] * 100);
    slider.value = String(pct);
    const valEl = document.querySelector<HTMLElement>(`[data-level-val="${ch}"]`);
    if (valEl) valEl.textContent = `${pct}%`;
  });

  const activeFx: string[] = [];
  if (state.fx.breakdown) activeFx.push('BREAKDOWN');
  if (state.fx.tapeSag) activeFx.push('TAPE SAG');
  if (state.fx.stutter) activeFx.push('STUTTER');
  if (fxDisplay) fxDisplay.textContent = activeFx.join(' · ');

  // Component Stack live relation readouts
  const relGeom = document.getElementById('rel-geom');
  if (relGeom) {
    const activeShapes = (['bass', 'arp', 'pad', 'filter'] as const)
      .filter((t) => state.geomShapes[t] !== 'off')
      .map((t) => `${t.toUpperCase()}:${state.geomShapes[t].slice(0, 3).toUpperCase()}`);
    relGeom.textContent = activeShapes.length > 0 ? activeShapes.join(' · ') : 'OFF';
  }
  const relFilter = document.getElementById('rel-filter');
  if (relFilter) {
    relFilter.textContent = `${cutoffStr} · ${state.lfoRate.toUpperCase()}→${state.lfoDest.toUpperCase()}`;
  }
  const relSpace = document.getElementById('rel-space');
  if (relSpace) {
    relSpace.textContent = `${state.delaySync} ${state.spaceMode.toUpperCase()}`;
  }
  const relSamples = document.getElementById('rel-samples');
  if (relSamples) {
    relSamples.textContent = `${Math.round(state.bleepProb * 100)}%`;
  }
  const relMods = document.getElementById('rel-mods');
  if (relMods) {
    const activeMods: string[] = [];
    if (state.ringMod > 0.02) activeMods.push('RING');
    if (state.crushAmount > 0.02) activeMods.push('CRSH');
    if (state.tensionAmount > 0.02) activeMods.push('TENS');
    if (state.ghostProb > 0.02) activeMods.push('GHST');
    if (state.glitchProb > 0.02) activeMods.push('GLT');
    if (state.bleepProb > 0.02) activeMods.push('BLP');
    if (state.subDrop) activeMods.push('SUB');
    if (state.autoFill) activeMods.push('FILL');
    relMods.textContent = activeMods.length > 0 ? activeMods.join('/') : 'CLEAN';
  }

  const relPatterns = document.getElementById('rel-patterns');
  if (relPatterns) {
    relPatterns.textContent = `${state.patterns.kick.length}B / ${state.patterns.perc.length}B / ${state.patterns.bass.length}B / ${state.patterns.lead.length}B`;
  }

  (['kick', 'perc', 'bass', 'lead'] as PatternInst[]).forEach((inst) => {
    const cfg = state.patterns[inst];
    document
      .querySelectorAll<HTMLButtonElement>(`[data-pat-edit="${inst}"] [data-pat-slot]`)
      .forEach((btn) => btn.classList.toggle('active', btn.dataset.patSlot === cfg.editSlot));
    document
      .querySelectorAll<HTMLButtonElement>(`[data-pat-len="${inst}"] [data-len]`)
      .forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.len) === cfg.length));
    const playingBarIdx = state.currentBar % cfg.length;
    document
      .querySelectorAll<HTMLButtonElement>(`[data-pat-seq="${inst}"] .pat-seq-btn`)
      .forEach((btn) => {
        const idx = Number(btn.dataset.seqIdx);
        const active = idx < cfg.length;
        btn.textContent = active ? cfg.seq[idx] : '—';
        btn.classList.toggle('dim', !active);
        btn.classList.toggle('playing', state.playing && idx === playingBarIdx && active);
      });
  });

  // Context-sensitive Left-Hand WASD Keybar
  const ctxMap: Record<string, { name: string; keys: string }> = {
    perc: { name: 'PERC // DRUMS', keys: 'W/S: SWING · A/D: MINIMAL · Q: KICK · E: TONE · R: EUCLID · F: KIT' },
    patterns: { name: 'PATTERN LOOP', keys: 'CLICK A–D TO EDIT · 1B–4B LENGTH · CLICK SEQ CELLS TO CYCLE A–D' },
    bassTone: { name: 'BASS & STAB TONE', keys: 'W/S: CUTOFF · A/D: DECAY · Q: BASS WAVE' },
    lead: { name: 'LEAD // SYNTH & ARP', keys: 'W/S: GATE · A/D: SHIFT · Q: MODE · E: SPD · R: CLR · F: VOICE' },
    arp: { name: 'LEAD // SYNTH & ARP', keys: 'W/S: GATE · A/D: SHIFT · Q: MODE · E: SPD · R: CLR · F: VOICE' },
    synth: { name: 'LEAD // SYNTH & ARP', keys: 'W/S: GATE · A/D: SHIFT · Q: MODE · E: SPD · R: CLR · F: VOICE' },
    bass: { name: 'BASS SEQUENCER', keys: 'W/S: OCT · Q/E: ‹/› · R: RND · F: RST' },
    geom: { name: 'GEO SHAPE', keys: 'W/S: TARGET · A/D: SHAPE · R: ALL OFF' },
    filter: { name: 'FILTER, DRIVE & LFO', keys: 'W/S: RESO · A/D: CUTOFF · Q/E: DRIVE · R: SCALE' },
    lfo: { name: 'FILTER, DRIVE & LFO', keys: 'W/S: DEPTH · A/D: CHORUS · Q: RATE · E: DEST' },
    pad: { name: 'DRONE & SPACE FX', keys: 'W/S: SPACE · A/D: PUMP · Q: CHORD · E: DELAY · F: MODE' },
    space: { name: 'DRONE & SPACE FX', keys: 'W/S: SPACE · A/D: PUMP · Q: CHORD · E: DELAY · F: MODE' },
    modifiers: { name: 'MODIFIERS & BLEEPS', keys: 'W/S: WOW · A/D: RING · Q/E: BLEEPS · F: SUB · R: FILL' },
  };
  const ctxInfo = ctxMap[state.activeModule] ?? ctxMap.perc;
  const ctxModEl = document.getElementById('ctx-mod-name');
  const ctxKeysEl = document.getElementById('ctx-mod-keys');
  if (ctxModEl) ctxModEl.textContent = ctxInfo.name;
  if (ctxKeysEl) ctxKeysEl.textContent = ctxInfo.keys;
}

updateHudRef = updateHud;
setupControls(canvas, engine, drone, recorder, scheduler, updateHud);
startCanvasRenderer(canvas);
updateHud();
