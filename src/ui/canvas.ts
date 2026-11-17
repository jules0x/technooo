import { midiToNoteName, scaleIndexToMidi } from '../audio/theory';
import { canRedoBass, canRedoMelody, canRedoRow, canUndoBass, canUndoMelody, canUndoRow } from '../state/shuffle';
import { state } from '../state/store';
import {
  getBassGridMetrics,
  getMelodyGridMetrics,
  getPercGridMetrics,
  getRadarCircles,
  getStageLayout,
  Rect,
} from './layout';

function drawPanelFrame(ctx: CanvasRenderingContext2D, r: Rect, title: string, subtitle: string): void {
  ctx.fillStyle = 'rgba(13, 16, 23, 0.86)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.fillText(title, r.x + 12, r.y + 18);

  ctx.fillStyle = 'rgba(100, 116, 139, 0.85)';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(subtitle, r.x + r.w - 12, r.y + 18);
  ctx.textAlign = 'left';
}

export function startCanvasRenderer(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(320, canvas.clientWidth);
    const ch = Math.max(240, canvas.clientHeight);
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);

  const render = () => {
    const w = Math.max(320, canvas.clientWidth);
    const h = Math.max(240, canvas.clientHeight);
    const layout = getStageLayout(w, h);

    ctx.fillStyle = '#07080b';
    ctx.fillRect(0, 0, w, h);

    // =========================================================
    // 1. PATTERN GEOMETRY CYCLER (Top-Left)
    // =========================================================
    const rad = layout.radar;
    drawPanelFrame(
      ctx,
      rad,
      '01 // GEO SHAPE CYCLER',
      'CLICK=CYCLE SHAPE [9] · R-CLK=OFF'
    );

    state.kickPulse *= 0.88;
    const circles = getRadarCircles(rad, 'arena');
    const voiceColors = {
      pluck: '56, 189, 248',
      fm: '244, 114, 182',
      sub: '167, 139, 250',
    };

    // --- A: IN-TIME ORBIT RINGS (1, 2, or 4 bars, quantized incl. triplets) ---
    if (circles.gears) {
      const { cx, cy, r } = circles.gears;

      // Orbit Ring quantization grid spokes
      const totalGrid = state.gearQuantize;
      for (let i = 0; i < totalGrid; i++) {
        const a = (i / totalGrid) * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle =
          i % (totalGrid / 4) === 0 ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255, 255, 255, 0.075)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r * 0.25), cy + Math.sin(a) * (r * 0.25));
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
      }

      // Rotating radar playhead hand
      const playAngle = state.gearProgress * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.72)';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(playAngle) * (r * 0.2), cy + Math.sin(playAngle) * (r * 0.2));
      ctx.lineTo(cx + Math.cos(playAngle) * (r + 5), cy + Math.sin(playAngle) * (r + 5));
      ctx.stroke();

      state.gears.forEach((gear, idx) => {
        gear.pulse *= 0.9;
        const ringR = r * (0.38 + idx * 0.28);
        const rgb = voiceColors[gear.voice];

        ctx.strokeStyle = `rgba(${rgb}, ${0.26 + gear.pulse * 0.55})`;
        ctx.lineWidth = 1.5 + gear.pulse * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();

        // Ring label at top-left of ring
        ctx.fillStyle = `rgba(${rgb}, 0.75)`;
        ctx.font = '700 8px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(gear.label, cx, cy - ringR - 4);
        ctx.textAlign = 'left';

        // Stationary quantized dots on the clock face
        for (const pos of gear.positions) {
          const a = pos * Math.PI * 2 - Math.PI / 2;
          const nx = cx + Math.cos(a) * ringR;
          const ny = cy + Math.sin(a) * ringR;
          const isTriggered = gear.pulse > 0.35 && Math.abs(((pos - state.gearProgress + 1.5) % 1) - 0.5) < 0.08;
          ctx.fillStyle = isTriggered ? '#ffffff' : `rgb(${rgb})`;
          ctx.beginPath();
          ctx.arc(nx, ny, 4.5 + gear.pulse * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      const qLabel = state.gearQuantize === 12 ? '1/12T' : `1/${state.gearQuantize}`;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${state.gearBars} BAR [7] · ${qLabel} [8] · R-CLK CLEAR`,
        cx,
        cy + r + 13
      );
      ctx.textAlign = 'left';
    }

    // --- B: GEOMETRIC PATTERN CYCLER (renders all active targets) ---
    if (circles.arena) {
      const { cx, cy, r } = circles.arena;
      const wallPulse = state.kickPulse * 3;

      ctx.strokeStyle = `rgba(56, 189, 248, ${0.22 + state.kickPulse * 0.35})`;
      ctx.lineWidth = 1.5 + wallPulse * 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      const allTargets = [
        { key: 'bass' as const, rgb: '56, 189, 248', scale: 0.86 },
        { key: 'arp' as const, rgb: '245, 158, 11', scale: 0.72 },
        { key: 'pad' as const, rgb: '168, 85, 247', scale: 0.58 },
        { key: 'filter' as const, rgb: '16, 185, 129', scale: 0.44 },
      ];

      const activeSummaries: string[] = [];
      allTargets.forEach(({ key, rgb, scale }) => {
        const mode = state.geomShapes[key];
        if (mode === 'off') return;
        const isSelected = key === state.geomTarget;
        const activeVert = state.geomVertices[key];
        const sides = mode === 'triangle' ? 3 : mode === 'square' ? 4 : 5;
        const polyR = r * scale;
        const verts: { x: number; y: number }[] = [];
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
          verts.push({ x: cx + Math.cos(a) * polyR, y: cy + Math.sin(a) * polyR });
        }

        ctx.strokeStyle = `rgba(${rgb}, ${isSelected ? 0.75 : 0.42})`;
        ctx.lineWidth = isSelected ? 2 : 1.25;
        ctx.beginPath();
        verts.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
        ctx.closePath();
        ctx.stroke();

        verts.forEach((v, i) => {
          const isActive = i === activeVert % sides;
          ctx.fillStyle = isActive ? '#ffffff' : `rgba(${rgb}, 0.78)`;
          ctx.beginPath();
          ctx.arc(v.x, v.y, isActive ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fill();
        });

        const v0 = verts[activeVert % sides];
        const v1 = verts[(activeVert + 1) % sides];
        const t = state.geometryEdgeProgress;
        const ox = v0.x + (v1.x - v0.x) * t;
        const oy = v0.y + (v1.y - v0.y) * t;
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.beginPath();
        ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
        ctx.fill();

        const shortShape = mode === 'triangle' ? 'TRI' : mode === 'square' ? 'SQR' : 'PENT';
        activeSummaries.push(`${key.toUpperCase()}:${shortShape}`);
      });

      const modeDesc = activeSummaries.length === 0 ? 'ALL OFF [9]' : `${activeSummaries.join(' · ')} [9]`;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(modeDesc, cx, cy + r + 13);
      ctx.textAlign = 'left';
    }

    // =========================================================
    // 2. PERCUSSION STEP GRID (Bottom-Left) — 5 rows: KICK, PERC, HAT, CLAP, TOM
    // =========================================================
    const pr = layout.perc;
    drawPanelFrame(ctx, pr, '02 // PERCUSSION', 'LBL=MUTE · ‹/›=ROW HIST · SWIPE STEPS');

    const { gridX, gridY, gridW, rowGap, rowH, backX, fwdX, navW } = getPercGridMetrics(pr);
    const cellW = gridW / 16;

    const rows = [
      { key: 'kick' as const, label: 'KICK', steps: state.kickSteps, color: '56, 189, 248' },
      { key: 'perc' as const, label: 'PERC', steps: state.percSteps, color: '244, 114, 182' },
      { key: 'hat' as const, label: 'HAT', steps: state.hatSteps, color: '167, 139, 250' },
      { key: 'clap' as const, label: 'CLAP', steps: state.clapSteps, color: '251, 191, 36' },
      { key: 'tom' as const, label: 'TOM', steps: state.tomSteps, color: '52, 211, 153' },
    ];

    rows.forEach((row, rIdx) => {
      const ry = gridY + rIdx * (rowH + rowGap);
      const isMuted = state.mutes[row.key];
      ctx.fillStyle = isMuted ? 'rgba(239, 68, 68, 0.75)' : 'rgba(148, 163, 184, 0.85)';
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.fillText(isMuted ? `${row.label}×` : row.label, pr.x + 8, ry + rowH * 0.68);

      // Per-row Back (<) and Forward (>) history buttons
      const navH = Math.min(rowH - 2, 16);
      const navY = ry + (rowH - navH) / 2;
      const hasBack = canUndoRow(row.key);
      const hasFwd = canRedoRow(row.key);

      const drawNavBtn = (bx: number, glyph: string, enabled: boolean) => {
        ctx.fillStyle = enabled ? 'rgba(56, 189, 248, 0.14)' : 'rgba(255, 255, 255, 0.025)';
        ctx.strokeStyle = enabled ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, navY, navW, navH, 2.5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = enabled ? '#bae6fd' : 'rgba(148, 163, 184, 0.28)';
        ctx.font = '700 10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(glyph, bx + navW / 2, navY + navH * 0.74);
        ctx.textAlign = 'left';
      };

      drawNavBtn(backX, '‹', hasBack);
      drawNavBtn(fwdX, '›', hasFwd);

      for (let s = 0; s < 16; s++) {
        const cxCell = gridX + s * cellW + 2;
        const cw = cellW - 4;
        const active = row.steps[s];
        const isPlayhead = state.playing && s === state.currentStep;

        const alpha = isMuted ? 0.18 : isPlayhead ? 0.95 : 0.65;
        ctx.fillStyle = active
          ? `rgba(${row.color}, ${alpha})`
          : isPlayhead
            ? 'rgba(255, 255, 255, 0.14)'
            : s % 4 === 0
              ? 'rgba(255, 255, 255, 0.06)'
              : 'rgba(255, 255, 255, 0.025)';
        ctx.strokeStyle = isPlayhead ? '#ffffff' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cxCell, ry, cw, rowH, 3);
        ctx.fill();
        ctx.stroke();
      }
    });

    // =========================================================
    // 3. MELODY SKETCHPAD (Top-Right — Draw & Quantize)
    // =========================================================
    const mel = layout.melody;
    const quantLabel =
      state.melodyQuantize === 1 ? '1/16 SNAP' : state.melodyQuantize === 2 ? '1/8 SNAP' : '1/4 SNAP';
    drawPanelFrame(ctx, mel, `03 // MELODY (${quantLabel})`, '');
    const mm = getMelodyGridMetrics(mel);

    const drawMelPill = (r: Rect, label: string, enabled = true) => {
      ctx.fillStyle = enabled ? 'rgba(56, 189, 248, 0.14)' : 'rgba(255, 255, 255, 0.025)';
      ctx.strokeStyle = enabled ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = enabled ? '#e0f2fe' : 'rgba(148, 163, 184, 0.32)';
      ctx.font = '700 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h * 0.72);
      ctx.textAlign = 'left';
    };
    drawMelPill(mm.backRect, '‹', canUndoMelody());
    drawMelPill(mm.fwdRect, '›', canRedoMelody());
    drawMelPill(mm.clrRect, 'CLR', state.melody.some((n) => n !== null));

    const { mx0, my0, mw, mh } = mm;
    const mStepW = mw / 16;
    const numRows = 14;
    const mRowH = mh / numRows;

    // Pitch rows + scale labels
    for (let r = 0; r < numRows; r++) {
      const noteIdx = numRows - 1 - r;
      const ry = my0 + r * mRowH;
      const isRoot = noteIdx % 7 === 0;
      ctx.fillStyle = isRoot ? 'rgba(56, 189, 248, 0.05)' : 'rgba(255, 255, 255, 0.015)';
      ctx.fillRect(mx0, ry, mw, mRowH - 1);

      if (r % 2 === 0 || isRoot) {
        const midi = scaleIndexToMidi(noteIdx, state.bassOctaveOffset + 1);
        ctx.fillStyle = isRoot ? 'rgba(56, 189, 248, 0.85)' : 'rgba(100, 116, 139, 0.75)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(midiToNoteName(midi), mel.x + 10, ry + mRowH * 0.72);
      }
    }

    // Beat columns
    for (let s = 0; s < 16; s++) {
      const sx = mx0 + s * mStepW;
      const isPlayhead = state.playing && s === state.currentStep;
      if (isPlayhead) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
        ctx.fillRect(sx, my0, mStepW, mh);
      }
      ctx.strokeStyle = s % 4 === 0 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.moveTo(sx, my0);
      ctx.lineTo(sx, my0 + mh);
      ctx.stroke();
    }

    // Faint raw hand-drawn ink curve
    if (state.melodyRawPath.length > 1) {
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      state.melodyRawPath.forEach((pt, idx) => {
        const px = mx0 + pt.x * mw;
        const py = my0 + pt.y * mh;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // Quantized melody blocks
    for (let s = 0; s < 16; s++) {
      const noteIdx = state.melody[s];
      if (noteIdx === null || noteIdx === undefined) continue;
      const r = numRows - 1 - Math.max(0, Math.min(numRows - 1, noteIdx));
      const bx = mx0 + s * mStepW + 2;
      const by = my0 + r * mRowH + 1;
      const bw = mStepW * state.melodyQuantize - 4;
      const isPlayhead = state.playing && s === state.currentStep;

      ctx.fillStyle = isPlayhead ? '#ffffff' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, Math.max(4, mRowH - 2), 3);
      ctx.fill();
    }

    // =========================================================
    // 4. BASS SEQUENCER (Middle-Right — 8-Step Interactive Bars)
    // =========================================================
    const br = layout.bass;
    drawPanelFrame(ctx, br, '04 // BASS SEQUENCER', '');
    const bm = getBassGridMetrics(br);

    // Header action pills: OCT (-1, 0, +1), ‹, ›, RND, RST
    const drawBassPill = (r: Rect, label: string, enabled = true, active = false) => {
      ctx.fillStyle = active
        ? 'rgba(56, 189, 248, 0.34)'
        : enabled
          ? 'rgba(56, 189, 248, 0.12)'
          : 'rgba(255, 255, 255, 0.025)';
      ctx.strokeStyle = active
        ? '#38bdf8'
        : enabled
          ? 'rgba(56, 189, 248, 0.45)'
          : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? '#ffffff' : enabled ? '#e0f2fe' : 'rgba(148, 163, 184, 0.32)';
      ctx.font = '700 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h * 0.72);
      ctx.textAlign = 'left';
    };
    bm.octRects.forEach((o) => drawBassPill(o.rect, o.label, true, state.bassOctaveOffset === o.val));
    drawBassPill(bm.backRect, '‹', canUndoBass());
    drawBassPill(bm.fwdRect, '›', canRedoBass());
    drawBassPill(bm.rndRect, 'RND', true);
    drawBassPill(bm.rstRect, 'RST', true);

    // 8 pitch degree guide lines (0..7)
    const bassRowH = bm.gridH / 8;
    for (let deg = 0; deg < 8; deg++) {
      const yLine = bm.gridY + (7 - deg) * bassRowH;
      const isRoot = deg === 0;
      ctx.fillStyle = isRoot ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(bm.gridX, yLine, bm.gridW, bassRowH - 1);
      if (deg === 0 || deg === 3 || deg === 5 || deg === 7) {
        const noteName = midiToNoteName(scaleIndexToMidi(deg, state.bassOctaveOffset));
        ctx.fillStyle = isRoot ? 'rgba(192, 132, 252, 0.9)' : 'rgba(100, 116, 139, 0.75)';
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText(noteName, br.x + 8, yLine + bassRowH * 0.75);
      }
    }

    // 8 interactive bass step bars
    const bStepW = bm.gridW / 8;
    const activeBassStep = state.currentStep % Math.max(1, state.latchedIndices.length);
    const bassMuted = state.mutes.bass;

    state.latchedIndices.forEach((noteIdx, s) => {
      const bx = bm.gridX + s * bStepW + 3;
      const bw = bStepW - 6;
      const isPlayhead = state.playing && s === activeBassStep;
      const isRoot = noteIdx === 0;
      const degClamped = Math.max(0, Math.min(7, noteIdx));
      const barH = Math.max(6, ((degClamped + 1) / 8) * bm.gridH);
      const by = bm.gridY + bm.gridH - barH;

      // Column track
      ctx.fillStyle = isPlayhead ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)';
      ctx.beginPath();
      ctx.roundRect(bx, bm.gridY, bw, bm.gridH, 3);
      ctx.fill();

      // Bar fill
      const fillAlpha = bassMuted ? 0.2 : isPlayhead ? 0.95 : 0.72;
      ctx.fillStyle = isPlayhead
        ? '#f8fafc'
        : isRoot
          ? `rgba(168, 85, 247, ${fillAlpha})`
          : `rgba(56, 189, 248, ${fillAlpha})`;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, barH, 3);
      ctx.fill();

      // Note label inside/above bar
      const name = midiToNoteName(scaleIndexToMidi(degClamped, state.bassOctaveOffset));
      ctx.fillStyle = isPlayhead ? '#0f172a' : '#e2e8f0';
      ctx.font = '700 8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(name, bx + bw / 2, Math.min(bm.gridY + bm.gridH - 4, by + 11));
      ctx.textAlign = 'left';
    });

    // =========================================================
    // 5. DIRECTIONAL SWEEP & SPACE PAD (Bottom-Right)
    // =========================================================
    const sw = layout.sweep;
    drawPanelFrame(
      ctx,
      sw,
      '05 // DIRECTIONAL SWEEPS & SPACE',
      'DRAG: FILTER/SPACE · ALT+DRAG: RESO/PUMP · R-DRAG ANYWHERE'
    );

    const sx0 = sw.x + 14;
    const sy0 = sw.y + 30;
    const swW = sw.w - 28;
    const swH = sw.h - 42;

    // Crosshair for locked Filter (X) and Space (Y)
    const dotX = sx0 + state.filterCutoffNorm * swW;
    const dotY = sy0 + (1 - state.spaceNorm) * swH;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dotX, sy0);
    ctx.lineTo(dotX, sy0 + swH);
    ctx.moveTo(sx0, dotY);
    ctx.lineTo(sx0 + swW, dotY);
    ctx.stroke();

    // Locked timbre aura
    const aura = ctx.createRadialGradient(dotX, dotY, 2, dotX, dotY, 46);
    aura.addColorStop(0, 'rgba(56, 189, 248, 0.38)');
    aura.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 46, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(
      `FILTER ${Math.round(state.filterCutoffNorm * 100)}%  ·  SPACE ${Math.round(state.spaceNorm * 100)}%  ·  RESO ${Math.round(state.resonanceNorm * 100)}%  ·  PUMP ${Math.round(state.sidechainDepth * 100)}%`,
      sx0 + 6,
      sy0 + swH - 6
    );

    // Directional swipe trail (fades out smoothly)
    if (state.swipeTrail.length > 1) {
      for (let i = 1; i < state.swipeTrail.length; i++) {
        const p0 = state.swipeTrail[i - 1];
        const p1 = state.swipeTrail[i];
        p0.alpha *= 0.9;
        ctx.strokeStyle = `rgba(244, 114, 182, ${p1.alpha})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      state.swipeTrail = state.swipeTrail.filter((p) => p.alpha > 0.05);
    }

    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
}
