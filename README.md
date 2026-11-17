# DRIFT

A 100% local, zero-dependency Web Audio live instrument for **minimal techno** and **dark cinematic ambient**, built with **TypeScript**, **Vite**, **HTML5 Canvas**, and the **Native Web Audio API**.

All sounds, reverb impulse responses, and starter loops are synthesized in real time—no external audio libraries, plugins, or sample packs required.

---

## Tech Stack

* **Language & Build:** TypeScript (`5.7`), Vite (`6.0`)
* **Audio Engine:** Native **Web Audio API** (zero runtime dependencies)
* **UI & Visuals:** **HTML5 Canvas 2D** + `ResizeObserver` in a responsive flex layout

---

## Audio & DSP Architecture

* **Lookahead Clock Scheduler (`src/audio/scheduler.ts`):** Uses a `25ms` JS interval scheduling `100ms` ahead against `AudioContext.currentTime` for jitter-free timing, supporting 16th-note swing, triplets (`1/12T`), and multi-bar orbit cycles (`1B` / `2B` / `4B`).
* **Parallel Master & Sidechain Routing (`src/audio/engine.ts`):**
  * **`sidechainBus`:** Automatically ducks bass, leads, and pads on every kick trigger.
  * **`percBus`:** Clean parallel bus for claps, hats, and micro-percussion that bypasses the kick's saturator and limiter so drums never squash each other.
  * **`WaveShaperNode` & `DynamicsCompressorNode`:** Analog-style saturation (`Clean` / `Warm` / `Heavy`) and a master limiter.
  * **Procedural Space:** A 4.6-second dark `ConvolverNode` impulse response generated in-memory (filtered noise decay) paired with a BPM-synced low-pass `DelayNode`.
* **100% Synthesized Voices (`src/audio/voices.ts`):**
  * Pitch-swept sub-kick (`Tight` / `Sub` / `Punch`)
  * FM micro-percussion, filtered noise hats, and dual-transient claps (`Minimal` / `Industrial` / `Wood` / `Glitch` kits)
  * Resonant rolling bass, portamento-capable lead (`Pluck` / `Acid` / `Bell` / `Pad`), and a continuous detuned Reese/pad `DroneBed` with tape-wobble LFO
* **Memory Bank, Loop Capture & WAV Export (`src/audio/presets.ts`, `src/audio/recorder.ts`):**
  * **Prepopulated Bank:** `OfflineAudioContext` renders 6 starter 1-bar stereo loops on startup with waveform peak previews.
  * **Live Capture:** `ScriptProcessorNode` tap records quantized 1-bar or 2-bar loops into in-memory `AudioBuffer` slots and encodes 16-bit PCM `.wav` downloads.

---

## Project Structure

```text
src/
├── audio/
│   ├── engine.ts       # Web Audio buses, filters, saturation, reverb, delay, limiter
│   ├── presets.ts      # OfflineAudioContext starter loop generator
│   ├── recorder.ts     # Bar-quantized loop capture, playback, and WAV export
│   ├── scheduler.ts    # Lookahead clock, orbits, geometry cycler, and arpeggiator
│   ├── theory.ts       # Scales, Euclidean rhythms, and melody path quantization
│   └── voices.ts       # Synthesized kick, perc, hat, clap, bass, lead, and drone
├── input/
│   └── controls.ts     # Mouse, directional swipe, and keyboard shortcut bindings
├── state/
│   ├── shuffle.ts      # Musical randomizer and undo stack
│   └── store.ts        # Central application state
├── ui/
│   ├── arranger.ts     # 8-slot Memory Bank and 16-bar Timeline Arranger UI
│   ├── canvas.ts       # 60fps 4-panel Canvas renderer
│   └── layout.ts       # Responsive panel and radar circle geometry
├── main.ts             # Entry point and HUD synchronization
└── style.css           # Dark UI and flex layout styles
```

---

## Running Locally

```bash
npm install
npm run dev
```

To type-check and build for production:

```bash
npm run build
```

