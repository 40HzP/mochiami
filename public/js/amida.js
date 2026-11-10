// もちあみ — あみだくじのルール（サーバーとブラウザで共有）
//
// 用語
//   cols  : 縦線の本数（= 選択肢の数）
//   rows  : 段の数（横線を引ける高さ）
//   cell  : { row, col } … row 段目の「col 番目と col+1 番目の縦線の間」
//   count : そのマスに引かれた線の本数（最初からある線も 1 本と数える）
//           奇数 → 黒線（横に渡る） / 偶数 → 赤線（往復して戻る＝線が無いのと同じ）

/** 段の数（初期値） */
export const DEFAULT_ROWS = 15;
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 30;

/** @typedef {{ row: number, col: number }} Cell */
/** @typedef {'black' | 'red'} LineColor */

export const cellKey = (row, col) => `${row}:${col}`;

/** @param {number} count */
export const colorOf = (count) => (count % 2 === 1 ? 'black' : 'red');

/** 最初からある線のおおよその本数 */
export function initialLineCount(cols) {
  return Math.max(1, Math.round((cols - 1) * 1.6));
}

/**
 * 最初からある線を作る。同じ高さで隣り合う線は作らない。
 * まず全ての隙間に 1 本ずつ置き（全員がきちんと混ざるように）、残りをランダムに置く。
 * @param {number} cols
 * @param {number} rows
 * @param {() => number} [rand]
 * @returns {Cell[]}
 */
export function generateInitialLines(cols, rows, rand = Math.random) {
  const taken = new Set();
  const has = (r, c) => taken.has(cellKey(r, c));
  const fits = (r, c) => !has(r, c) && !has(r, c - 1) && !has(r, c + 1);
  const pick = (n) => Math.floor(rand() * n);
  /** @type {Cell[]} */
  const lines = [];
  const place = (row, col) => {
    taken.add(cellKey(row, col));
    lines.push({ row, col });
  };

  for (let col = 0; col < cols - 1; col++) {
    for (let tries = 0; tries < 50; tries++) {
      const row = pick(rows);
      if (fits(row, col)) {
        place(row, col);
        break;
      }
    }
  }
  const target = initialLineCount(cols);
  for (let tries = 0; lines.length < target && tries < 2000; tries++) {
    const row = pick(rows);
    const col = pick(cols - 1);
    if (fits(row, col)) place(row, col);
  }
  return lines.sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * 線を追加する人が選べるマスかどうか。
 * 最初からある線と同じ高さで隣り合うマスは選べない（線そのものに被せるのは OK）。
 * @param {number} cols
 * @param {number} rows
 * @param {Cell[]} initialLines
 * @param {number} row
 * @param {number} col
 */
export function isSelectableCell(cols, rows, initialLines, row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
  if (row < 0 || row >= rows || col < 0 || col >= cols - 1) return false;
  return !initialLines.some((l) => l.row === row && Math.abs(l.col - col) === 1);
}

/**
 * @template {Cell} T
 * @typedef {T & { count: number, color: LineColor }} PlacedLine
 */

/**
 * 追加の線を送られた順に置いていき、最終的なあみだくじを決める。
 *
 * - 既に線があるマス（最初からある線を含む）に置いた → 「被り」。count が増え、色が黒⇄赤で切り替わる
 * - 空いているマスだが、同じ高さの隣に線がある → 1 段下にずらす。ずらした先も埋まっていれば
 *   （マスに線がある or 隣に線がある）さらに下へ。段が足りなければ下に段を増やす
 *
 * @template {Cell} T
 * @param {number} cols
 * @param {number} rows
 * @param {Cell[]} initialLines
 * @param {T[]} added 送られた順
 * @returns {{
 *   rows: number,
 *   added: PlacedLine<T>[],
 *   rungs: { row: number, col: number, count: number, color: LineColor, initial: boolean }[],
 * }}
 */
export function resolveLines(cols, rows, initialLines, added) {
  /** @type {Map<string, { row: number, col: number, count: number, initial: boolean }>} */
  const cells = new Map();
  const countAt = (r, c) => cells.get(cellKey(r, c))?.count ?? 0;
  for (const l of initialLines) {
    cells.set(cellKey(l.row, l.col), { row: l.row, col: l.col, count: 1, initial: true });
  }

  let finalRows = rows;
  const placed = added.map((line) => {
    let row = line.row;
    const col = line.col;
    if (countAt(row, col) === 0) {
      while (countAt(row, col) > 0 || countAt(row, col - 1) > 0 || countAt(row, col + 1) > 0) {
        row++;
      }
    }
    const key = cellKey(row, col);
    const cell = cells.get(key) ?? { row, col, count: 0, initial: false };
    cell.count++;
    cells.set(key, cell);
    finalRows = Math.max(finalRows, row + 1);
    return { ...line, row, col, count: cell.count, color: colorOf(cell.count) };
  });

  const rungs = [...cells.values()]
    .map((c) => ({ ...c, color: colorOf(c.count) }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  return { rows: finalRows, added: placed, rungs };
}

/**
 * @typedef {(
 *   | { type: 'down', col: number, fromRow: number, toRow: number }
 *   | { type: 'rung', row: number, from: number, to: number, times: number }
 * )} TraceStep
 * rung … 横線を times 回渡る（往復を含む）。times が奇数なら to 側、偶数なら from 側に戻る
 */

/**
 * start 列の上から辿る。被った線は被った本数ぶん往復する
 * （黒線＝奇数本なので渡りきる、赤線＝偶数本なので元の縦線に戻る）。
 * @param {number} rows
 * @param {{ row: number, col: number, color: LineColor, count?: number }[]} rungs
 * @param {number} start
 * @returns {{ end: number, steps: TraceStep[] }}
 */
export function trace(rows, rungs, start) {
  const byCell = new Map(rungs.map((r) => [cellKey(r.row, r.col), r]));
  /** @type {TraceStep[]} */
  const steps = [];
  let col = start;
  let fromRow = -0.5; // 縦線の上端
  for (let row = 0; row < rows; row++) {
    const right = byCell.get(cellKey(row, col));
    const left = byCell.get(cellKey(row, col - 1));
    const rung = right ?? left;
    if (!rung) continue;
    const other = right ? col + 1 : col - 1;
    const times = rung.count ?? (rung.color === 'black' ? 1 : 2);
    steps.push({ type: 'down', col, fromRow, toRow: row });
    steps.push({ type: 'rung', row, from: col, to: other, times });
    if (times % 2 === 1) col = other;
    fromRow = row;
  }
  steps.push({ type: 'down', col, fromRow, toRow: rows - 0.5 });
  return { end: col, steps };
}

/**
 * 全ての列について、上の位置 → 下の位置 の対応を返す
 * @param {number} cols
 * @param {number} rows
 * @param {{ row: number, col: number, color: LineColor }[]} rungs
 */
export function mapping(cols, rows, rungs) {
  return Array.from({ length: cols }, (_, start) => trace(rows, rungs, start).end);
}
