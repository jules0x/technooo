export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StageLayout {
  radar: Rect;
  perc: Rect;
  melody: Rect;
  bass: Rect;
  sweep: Rect;
}

const TOP_MARGIN = 8;
const BOTTOM_MARGIN = 8;
const PAD = 10;

export function getStageLayout(width: number, height: number): StageLayout {
  const usableW = Math.max(320, width - PAD * 2);
  const usableH = Math.max(240, height - TOP_MARGIN - BOTTOM_MARGIN);

  const leftW = Math.floor(usableW * 0.42) - Math.floor(PAD / 2);
  const rightW = usableW - leftW - PAD;
  const rightX = PAD + leftW + PAD;

  const radarH = Math.floor(usableH * 0.34) - Math.floor(PAD / 2);
  const percH = usableH - radarH - PAD;

  const melodyH = Math.floor(usableH * 0.36) - Math.floor(PAD / 2);
  const bassH = Math.floor(usableH * 0.36) - Math.floor(PAD / 2);
  const sweepH = usableH - melodyH - bassH - PAD * 2;

  return {
    radar: { x: PAD, y: TOP_MARGIN, w: leftW, h: radarH },
    perc: { x: PAD, y: TOP_MARGIN + radarH + PAD, w: leftW, h: percH },
    melody: { x: rightX, y: TOP_MARGIN, w: rightW, h: melodyH },
    bass: { x: rightX, y: TOP_MARGIN + melodyH + PAD, w: rightW, h: bassH },
    sweep: { x: rightX, y: TOP_MARGIN + melodyH + bassH + PAD * 2, w: rightW, h: sweepH },
  };
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export interface PercGridMetrics {
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  rowGap: number;
  rowH: number;
  backX: number;
  fwdX: number;
  navW: number;
}

export function getPercGridMetrics(pr: Rect): PercGridMetrics {
  const gridX = pr.x + 76;
  const gridY = pr.y + 26;
  const gridW = pr.w - 86;
  const gridH = pr.h - 32;
  const rowGap = 3;
  const rowH = (gridH - rowGap * 4) / 5;
  return {
    gridX,
    gridY,
    gridW,
    gridH,
    rowGap,
    rowH,
    backX: pr.x + 44,
    fwdX: pr.x + 59,
    navW: 13,
  };
}

export interface BassGridMetrics {
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  btnY: number;
  btnH: number;
  octRects: { val: -1 | 0 | 1; label: string; rect: Rect }[];
  backRect: Rect;
  fwdRect: Rect;
  rndRect: Rect;
  rstRect: Rect;
}

export function getBassGridMetrics(br: Rect): BassGridMetrics {
  const btnY = br.y + 6;
  const btnH = 16;
  const rstRect = { x: br.x + br.w - 34, y: btnY, w: 26, h: btnH };
  const rndRect = { x: rstRect.x - 30, y: btnY, w: 26, h: btnH };
  const fwdRect = { x: rndRect.x - 20, y: btnY, w: 16, h: btnH };
  const backRect = { x: fwdRect.x - 19, y: btnY, w: 16, h: btnH };
  const octPlus = { x: backRect.x - 24, y: btnY, w: 20, h: btnH };
  const octZero = { x: octPlus.x - 19, y: btnY, w: 17, h: btnH };
  const octMinus = { x: octZero.x - 22, y: btnY, w: 20, h: btnH };
  return {
    gridX: br.x + 38,
    gridY: br.y + 28,
    gridW: br.w - 50,
    gridH: br.h - 36,
    btnY,
    btnH,
    octRects: [
      { val: -1, label: '-1', rect: octMinus },
      { val: 0, label: '0', rect: octZero },
      { val: 1, label: '+1', rect: octPlus },
    ],
    backRect,
    fwdRect,
    rndRect,
    rstRect,
  };
}

export interface MelodyGridMetrics {
  mx0: number;
  my0: number;
  mw: number;
  mh: number;
  backRect: Rect;
  fwdRect: Rect;
  clrRect: Rect;
}

export function getMelodyGridMetrics(mel: Rect): MelodyGridMetrics {
  const btnY = mel.y + 6;
  const btnH = 16;
  const clrRect = { x: mel.x + mel.w - 38, y: btnY, w: 30, h: btnH };
  const fwdRect = { x: clrRect.x - 20, y: btnY, w: 16, h: btnH };
  const backRect = { x: fwdRect.x - 19, y: btnY, w: 16, h: btnH };
  return {
    mx0: mel.x + 38,
    my0: mel.y + 30,
    mw: mel.w - 50,
    mh: mel.h - 42,
    backRect,
    fwdRect,
    clrRect,
  };
}

export interface CircleArea {
  cx: number;
  cy: number;
  r: number;
}

export function getRadarCircles(
  rad: Rect,
  view: 'split' | 'gears' | 'arena'
): { gears: CircleArea | null; arena: CircleArea | null } {
  const topY = rad.y + 26;
  const availH = rad.h - 32;

  if (view === 'gears') {
    return {
      gears: { cx: rad.x + rad.w * 0.5, cy: topY + availH * 0.5, r: Math.min(rad.w, availH) * 0.44 },
      arena: null,
    };
  }
  if (view === 'arena') {
    return {
      gears: null,
      arena: { cx: rad.x + rad.w * 0.5, cy: topY + availH * 0.5, r: Math.min(rad.w, availH) * 0.44 },
    };
  }

  // 'split': side-by-side if wider than tall, stacked if taller
  if (rad.w >= availH) {
    const halfW = rad.w * 0.5;
    const r = Math.min(halfW * 0.86, availH * 0.84) * 0.5;
    return {
      gears: { cx: rad.x + halfW * 0.5, cy: topY + availH * 0.5, r },
      arena: { cx: rad.x + halfW * 1.5, cy: topY + availH * 0.5, r },
    };
  }
  const halfH = availH * 0.5;
  const r = Math.min(rad.w * 0.86, halfH * 0.84) * 0.5;
  return {
    gears: { cx: rad.x + rad.w * 0.5, cy: topY + halfH * 0.5, r },
    arena: { cx: rad.x + rad.w * 0.5, cy: topY + halfH * 1.5, r },
  };
}

