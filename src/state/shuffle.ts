import { canvasPosToMidi, euclidean, SCALES } from '../audio/theory';
import { createNode, NodeVoice, state, syncActiveEditToSlots } from './store';

export type PercRowKey = 'kick' | 'perc' | 'hat' | 'clap' | 'tom';

const rowHistory: Record<
  PercRowKey,
  { undo: boolean[][]; redo: boolean[][]; dirty: boolean }
> = {
  kick: { undo: [], redo: [], dirty: false },
  perc: { undo: [], redo: [], dirty: false },
  hat: { undo: [], redo: [], dirty: false },
  clap: { undo: [], redo: [], dirty: false },
  tom: { undo: [], redo: [], dirty: false },
};

function getRowSteps(row: PercRowKey): boolean[] {
  if (row === 'kick') return state.kickSteps;
  if (row === 'perc') return state.percSteps;
  if (row === 'hat') return state.hatSteps;
  if (row === 'clap') return state.clapSteps;
  return state.tomSteps;
}

function setRowSteps(row: PercRowKey, steps: boolean[]): void {
  if (row === 'kick') state.kickSteps = steps;
  else if (row === 'perc') state.percSteps = steps;
  else if (row === 'hat') state.hatSteps = steps;
  else if (row === 'clap') state.clapSteps = steps;
  else state.tomSteps = steps;
  syncActiveEditToSlots();
}

/**
 * Record pre-edit snapshot for a row.
 * When `groupBatch` is true (interactive step clicks/swipes), consecutive edits
 * to the same row are grouped into a single history entry until you click Back,
 * Forward, or switch to another row.
 */
export function pushRowHistory(row: PercRowKey, groupBatch = false): void {
  if (groupBatch) {
    (Object.keys(rowHistory) as PercRowKey[]).forEach((k) => {
      if (k !== row) rowHistory[k].dirty = false;
    });
    if (rowHistory[row].dirty) return;
    rowHistory[row].dirty = true;
  } else {
    rowHistory[row].dirty = false;
  }
  const hist = rowHistory[row];
  hist.undo.push([...getRowSteps(row)]);
  if (hist.undo.length > 30) hist.undo.shift();
  hist.redo = [];
}

export function undoRowHistory(row: PercRowKey): boolean {
  const hist = rowHistory[row];
  const prev = hist.undo.pop();
  if (!prev) return false;
  hist.dirty = false;
  hist.redo.push([...getRowSteps(row)]);
  setRowSteps(row, prev);
  return true;
}

export function redoRowHistory(row: PercRowKey): boolean {
  const hist = rowHistory[row];
  const next = hist.redo.pop();
  if (!next) return false;
  hist.dirty = false;
  hist.undo.push([...getRowSteps(row)]);
  setRowSteps(row, next);
  return true;
}

export function canUndoRow(row: PercRowKey): boolean {
  return rowHistory[row].undo.length > 0;
}

export function canRedoRow(row: PercRowKey): boolean {
  return rowHistory[row].redo.length > 0;
}

const bassHistory: { undo: number[][]; redo: number[][]; dirty: boolean } = {
  undo: [],
  redo: [],
  dirty: false,
};

export function pushBassHistory(groupBatch = false): void {
  if (groupBatch) {
    if (bassHistory.dirty) return;
    bassHistory.dirty = true;
  } else {
    bassHistory.dirty = false;
  }
  bassHistory.undo.push([...state.latchedIndices]);
  if (bassHistory.undo.length > 30) bassHistory.undo.shift();
  bassHistory.redo = [];
}

export function undoBassHistory(): boolean {
  const prev = bassHistory.undo.pop();
  if (!prev) return false;
  bassHistory.dirty = false;
  bassHistory.redo.push([...state.latchedIndices]);
  state.latchedIndices = prev;
  syncActiveEditToSlots();
  return true;
}

export function redoBassHistory(): boolean {
  const next = bassHistory.redo.pop();
  if (!next) return false;
  bassHistory.dirty = false;
  bassHistory.undo.push([...state.latchedIndices]);
  state.latchedIndices = next;
  syncActiveEditToSlots();
  return true;
}

export function canUndoBass(): boolean {
  return bassHistory.undo.length > 0;
}

export function canRedoBass(): boolean {
  return bassHistory.redo.length > 0;
}

const melodyHistory: {
  undo: (number | null)[][];
  redo: (number | null)[][];
  dirty: boolean;
} = {
  undo: [],
  redo: [],
  dirty: false,
};

export function pushMelodyHistory(groupBatch = false): void {
  if (groupBatch) {
    if (melodyHistory.dirty) return;
    melodyHistory.dirty = true;
  } else {
    melodyHistory.dirty = false;
  }
  melodyHistory.undo.push([...state.melody]);
  if (melodyHistory.undo.length > 30) melodyHistory.undo.shift();
  melodyHistory.redo = [];
}

export function undoMelodyHistory(): boolean {
  const prev = melodyHistory.undo.pop();
  if (!prev) return false;
  melodyHistory.dirty = false;
  melodyHistory.redo.push([...state.melody]);
  state.melody = prev;
  state.melodyRawPath = [];
  syncActiveEditToSlots();
  syncActiveEditToSlots();
  return true;
}

export function redoMelodyHistory(): boolean {
  const next = melodyHistory.redo.pop();
  if (!next) return false;
  melodyHistory.dirty = false;
  melodyHistory.undo.push([...state.melody]);
  state.melody = next;
  state.melodyRawPath = [];
  syncActiveEditToSlots();
  syncActiveEditToSlots();
  return true;
}

export function canUndoMelody(): boolean {
  return melodyHistory.undo.length > 0;
}

export function canRedoMelody(): boolean {
  return melodyHistory.redo.length > 0;
}

interface UndoSnapshot {
  kickSteps: boolean[];
  percSteps: boolean[];
  hatSteps: boolean[];
  clapSteps: boolean[];
  tomSteps: boolean[];
  melody: (number | null)[];
  scaleIndex: number;
  driveLevel: number;
  filterCutoffNorm: number;
  spaceNorm: number;
  resonanceNorm: number;
}

const undoStack: UndoSnapshot[] = [];

export function pushUndo(): void {
  undoStack.push({
    kickSteps: [...state.kickSteps],
    percSteps: [...state.percSteps],
    hatSteps: [...state.hatSteps],
    clapSteps: [...state.clapSteps],
    tomSteps: [...state.tomSteps],
    melody: [...state.melody],
    scaleIndex: state.scaleIndex,
    driveLevel: state.driveLevel,
    filterCutoffNorm: state.filterCutoffNorm,
    spaceNorm: state.spaceNorm,
    resonanceNorm: state.resonanceNorm,
  });
  if (undoStack.length > 25) undoStack.shift();
}

export function popUndo(): boolean {
  const snap = undoStack.pop();
  if (!snap) return false;
  state.kickSteps = snap.kickSteps;
  state.percSteps = snap.percSteps;
  state.hatSteps = snap.hatSteps;
  state.clapSteps = snap.clapSteps;
  state.tomSteps = snap.tomSteps;
  state.melody = snap.melody;
  state.scaleIndex = snap.scaleIndex;
  state.driveLevel = snap.driveLevel;
  state.filterCutoffNorm = snap.filterCutoffNorm;
  state.spaceNorm = snap.spaceNorm;
  state.resonanceNorm = snap.resonanceNorm;
  state.melodyRawPath = [];
  syncActiveEditToSlots();
  syncActiveEditToSlots();
  return true;
}

/** Musical randomizer that generates a cohesive minimal/dark ambient groove */
export function shuffleAll(): void {
  pushUndo();
  pushRowHistory('kick');
  pushRowHistory('perc');
  pushRowHistory('hat');
  pushRowHistory('tom');
  pushBassHistory();
  pushMelodyHistory();

  state.scaleIndex = Math.floor(Math.random() * SCALES.length);
  state.driveLevel = Math.random() < 0.35 ? 2 : 1;
  state.filterCutoffNorm = 0.28 + Math.random() * 0.48;
  state.spaceNorm = 0.2 + Math.random() * 0.6;
  state.resonanceNorm = 0.18 + Math.random() * 0.45;

  // Keep a solid minimal kick anchor with occasional ghost kick
  state.kickSteps = Array.from({ length: 16 }, (_, i) => {
    if (i % 4 === 0) return true;
    if (i === 14 && Math.random() < 0.35) return true;
    return false;
  });

  // Fresh Euclidean percussion & off-beat hat
  state.percDensity = 4 + Math.floor(Math.random() * 7);
  state.percRotation = Math.floor(Math.random() * 16);
  state.percSteps = euclidean(state.percDensity, 16, state.percRotation);
  state.hatSteps = Array.from({ length: 16 }, (_, i) =>
    i % 4 === 2 ? true : i % 2 === 1 && Math.random() < 0.3
  );
  state.tomSteps = Array.from({ length: 16 }, (_, i) =>
    (i === 3 || i === 11 || i === 14) && Math.random() < 0.55
  );

  // Smooth contoured 16-step melody
  let cursor = 3 + Math.floor(Math.random() * 6);
  state.melody = Array.from({ length: 16 }, (_, s) => {
    if (s % 2 === 0 || Math.random() < 0.38) {
      cursor = Math.max(0, Math.min(13, cursor + Math.floor(Math.random() * 5) - 2));
      return cursor;
    }
    return null;
  });
  state.melodyRawPath = [];
  syncActiveEditToSlots();

  // 3 to 5 harmonic radar nodes
  const voices: NodeVoice[] = ['pluck', 'fm', 'sub'];
  const count = 3 + Math.floor(Math.random() * 3);
  state.nodes = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 0.18 + Math.random() * 0.25;
    const nx = 0.5 + Math.cos(angle) * dist;
    const ny = 0.5 + Math.sin(angle) * dist;
    const voice = voices[i % voices.length];
    state.nodes.push(createNode(nx, ny, canvasPosToMidi(nx, ny), voice));
  }
}

