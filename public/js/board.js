// あみだくじの盤面（SVG）
import { s, truncate } from './ui.js';

export const GEO = {
  colGap: 64,
  rowGap: 34,
  padX: 40,
  topH: 116,
  bottomH: 136,
};

/**
 * @typedef {{ text: string, className?: string, title?: string }} Label
 * @typedef {{ x: number, y: number, w: number, h: number }} ViewBox
 */

/**
 * @param {{
 *   cols: number,
 *   rows: number,
 *   top: (Label | null)[],
 *   bottom: (Label | null)[],
 *   mode?: 'contain' | 'scroll',
 *   maxLabel?: number,
 * }} opts
 */
export function createBoard({ cols, rows, top, bottom, mode = 'contain', maxLabel = 7 }) {
  const W = GEO.padX * 2 + (cols - 1) * GEO.colGap;
  const lineTop = GEO.topH;
  const lineBottom = GEO.topH + rows * GEO.rowGap;
  const H = lineBottom + GEO.bottomH;
  const x = (col) => GEO.padX + col * GEO.colGap;
  const y = (row) => lineTop + (row + 0.5) * GEO.rowGap;

  const svg = /** @type {SVGSVGElement} */ (
    s('svg', {
      class: 'board',
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': 'あみだくじ',
    })
  );
  const layer = (name) => {
    const g = s('g', { class: `layer-${name}` });
    svg.append(g);
    return g;
  };
  const layers = {
    labels: layer('labels'),
    verticals: layer('verticals'),
    rungs: layer('rungs'),
    preview: layer('preview'),
    trace: layer('trace'),
    marker: layer('marker'),
    hit: layer('hit'),
  };

  for (let c = 0; c < cols; c++) {
    layers.verticals.append(
      s('line', { class: 'vertical', x1: x(c), y1: lineTop, x2: x(c), y2: lineBottom }),
    );
  }

  /** @type {SVGTextElement[]} */
  const topEls = [];
  /** @type {SVGTextElement[]} */
  const bottomEls = [];
  const makeLabel = (which, col, label) => {
    const isTop = which === 'top';
    const text = /** @type {SVGTextElement} */ (
      s('text', {
        class: `label label-${which} ${label?.className ?? ''}`,
        x: x(col),
        y: isTop ? lineTop - 14 : lineBottom + 14,
        'text-anchor': isTop ? 'end' : 'start',
        'writing-mode': 'vertical-rl',
      })
    );
    text.textContent = truncate(label?.text ?? '', maxLabel);
    const full = label?.title ?? label?.text;
    if (full) text.append(s('title', {}, full));
    return text;
  };
  for (let c = 0; c < cols; c++) {
    const t = makeLabel('top', c, top[c]);
    const b = makeLabel('bottom', c, bottom[c]);
    topEls.push(t);
    bottomEls.push(b);
    layers.labels.append(
      t,
      b,
      s('circle', { class: 'cap', cx: x(c), cy: lineTop, r: 4.5 }),
      s('circle', { class: 'cap', cx: x(c), cy: lineBottom, r: 4.5 }),
    );
  }

  /** 横線を 1 本描く */
  const rung = (row, col, className = 'rung') =>
    s('line', { class: className, x1: x(col), y1: y(row), x2: x(col + 1), y2: y(row) });

  // ---------------------------------------------------------- サイズとカメラ
  /** @type {ViewBox} */
  let view = { x: 0, y: 0, w: W, h: H };
  const setView = (v) => {
    view = v;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  };

  const fit = () => {
    const parent = svg.parentElement;
    if (!parent) return;
    const cw = parent.clientWidth;
    const vh = window.innerHeight;
    let scale;
    if (mode === 'scroll') {
      scale = Math.max(40 / GEO.colGap, Math.min(cw / W, (0.82 * vh) / H));
    } else {
      scale = Math.min(cw / W, (0.62 * vh) / H);
    }
    svg.setAttribute('width', String(Math.round(W * scale)));
    svg.setAttribute('height', String(Math.round(H * scale)));
  };

  /**
   * (cx, cy) を中心に zoom 倍に寄った表示範囲
   * @returns {ViewBox}
   */
  const boxAt = (cx, cy, zoom) => {
    const w = W / zoom;
    const h = H / zoom;
    const clamp = (v, size, total) => Math.min(Math.max(v, 0), Math.max(0, total - size));
    return { x: clamp(cx - w / 2, w, W), y: clamp(cy - h / 2, h, H), w, h };
  };
  const full = () => ({ x: 0, y: 0, w: W, h: H });

  /**
   * 表示範囲をなめらかに動かす
   * @param {ViewBox} target
   * @param {number} ms
   * @param {{ skipped: boolean }} [ctl]
   */
  const moveView = (target, ms, ctl) => {
    const from = view;
    if (ms <= 0 || ctl?.skipped) {
      setView(target);
      return Promise.resolve();
    }
    return animate(ms, ctl, (t) => {
      const e = easeInOut(t);
      setView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      });
    });
  };

  return {
    svg,
    layers,
    cols,
    rows,
    W,
    H,
    x,
    y,
    lineTop,
    lineBottom,
    topEls,
    bottomEls,
    rung,
    fit,
    boxAt,
    full,
    setView,
    moveView,
    get view() {
      return view;
    },
  };
}

/** @typedef {ReturnType<typeof createBoard>} Board */

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * requestAnimationFrame で ms ミリ秒かけて step(0..1) を呼ぶ。ctl.skipped で即終了
 * @param {number} ms
 * @param {{ skipped: boolean } | undefined} ctl
 * @param {(t: number) => void} step
 */
export function animate(ms, ctl, step) {
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const t = ctl?.skipped ? 1 : Math.min(1, (now - start) / ms);
      step(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve(undefined);
    };
    requestAnimationFrame(frame);
  });
}

/** 盤面を入れる箱（大きいときは横スクロール） */
export function boardFrame(board) {
  const frame = document.createElement('div');
  frame.className = 'board-frame';
  frame.append(board.svg);
  let lastWidth = -1;
  new ResizeObserver(() => {
    if (frame.clientWidth === lastWidth) return;
    lastWidth = frame.clientWidth;
    board.fit();
    frame.classList.toggle('scrollable', board.svg.clientWidth > frame.clientWidth + 1);
  }).observe(frame);
  return frame;
}
