import { LoopRecorder } from '../audio/recorder';
import { state } from '../state/store';

export function renderBankAndArranger(
  recorder: LoopRecorder,
  ensureStarted: () => void,
  onHudUpdate: () => void
): void {
  const slotsContainer = document.getElementById('memory-slots-grid')!;
  const arrangerContainer = document.getElementById('arranger-grid')!;
  const captureBadge = document.getElementById('capture-status')!;
  const valArranger = document.getElementById('val-arranger')!;
  const valMuteLive = document.getElementById('val-mute-live')!;
  const btnMuteLive = document.getElementById('btn-mute-live')!;

  valArranger.textContent = state.arranger.enabled ? 'ON' : 'OFF';
  valMuteLive.textContent = state.muteLiveSynth ? 'MUTED' : 'ON';
  btnMuteLive.classList.toggle('active', state.muteLiveSynth);
  captureBadge.className = 'capture-badge';
  if (state.capture.recording) {
    captureBadge.classList.add('recording');
    captureBadge.textContent = `REC SLOT ${state.capture.targetSlot + 1}...`;
  } else if (state.capture.armed) {
    captureBadge.classList.add('armed');
    captureBadge.textContent = `ARMED (SLOT ${state.capture.targetSlot + 1})`;
  } else {
    captureBadge.textContent = 'READY';
  }

  // Render 8 Memory Slots
  slotsContainer.innerHTML = '';
  state.memorySlots.forEach((slot, idx) => {
    const card = document.createElement('div');
    card.className = `slot-card${slot.playing ? ' playing' : ''}`;

    const top = document.createElement('div');
    top.className = 'slot-top';
    top.innerHTML = `<span>${slot.name}</span><span>${
      slot.buffer ? `${slot.bars} BAR` : 'EMPTY'
    }</span>`;
    card.appendChild(top);

    const wave = document.createElement('canvas');
    wave.className = 'slot-wave';
    wave.width = 192;
    wave.height = 36;
    const wctx = wave.getContext('2d')!;
    wctx.fillStyle = 'rgba(0,0,0,0.3)';
    wctx.fillRect(0, 0, wave.width, wave.height);
    if (slot.peaks.length > 0) {
      wctx.fillStyle = slot.playing ? '#38bdf8' : '#64748b';
      const barW = wave.width / slot.peaks.length;
      slot.peaks.forEach((p, i) => {
        const h = Math.max(2, p * (wave.height - 6));
        wctx.fillRect(i * barW, (wave.height - h) / 2, Math.max(1.5, barW - 1), h);
      });
    }
    card.appendChild(wave);

    const btns = document.createElement('div');
    btns.className = 'slot-btns';

    const rec1 = document.createElement('button');
    rec1.className = 'ctrl-btn';
    rec1.textContent = '● 1B';
    rec1.onclick = () => {
      ensureStarted();
      recorder.armCapture(idx, 1);
    };

    const rec2 = document.createElement('button');
    rec2.className = 'ctrl-btn';
    rec2.textContent = '● 2B';
    rec2.onclick = () => {
      ensureStarted();
      recorder.armCapture(idx, 2);
    };

    const playBtn = document.createElement('button');
    playBtn.className = `ctrl-btn${slot.playing ? ' active' : ''}`;
    playBtn.textContent = slot.playing ? '■ STOP' : '▶ PLAY';
    playBtn.disabled = !slot.buffer;
    playBtn.onclick = () => {
      ensureStarted();
      recorder.toggleSlotPlay(idx);
    };

    const wavBtn = document.createElement('button');
    wavBtn.className = 'ctrl-btn';
    wavBtn.textContent = '↓ WAV';
    wavBtn.disabled = !slot.buffer;
    wavBtn.onclick = () => recorder.exportSlotWav(idx);

    btns.append(rec1, rec2, playBtn, wavBtn);
    card.appendChild(btns);
    slotsContainer.appendChild(card);
  });

  // Render 16-Bar Timeline Arranger
  arrangerContainer.innerHTML = '';
  for (let s = 0; s < 8; s++) {
    const row = document.createElement('div');
    row.className = 'arr-row';

    const label = document.createElement('div');
    label.className = 'arr-label';
    label.textContent = state.memorySlots[s].buffer ? `SLOT ${s + 1} ●` : `SLOT ${s + 1}`;
    row.appendChild(label);

    for (let b = 0; b < 16; b++) {
      const cell = document.createElement('div');
      const active = state.arranger.grid[s][b];
      const isPlayhead = state.arranger.enabled && state.playing && state.arranger.currentBar === b;
      cell.className = `arr-cell${active ? ' active' : ''}${isPlayhead ? ' playhead' : ''}`;
      cell.onclick = () => {
        state.arranger.grid[s][b] = !state.arranger.grid[s][b];
        renderBankAndArranger(recorder, ensureStarted, onHudUpdate);
      };
      row.appendChild(cell);
    }
    arrangerContainer.appendChild(row);
  }
}

