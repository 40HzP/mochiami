import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateInitialLines,
  isSelectableCell,
  resolveLines,
  trace,
  mapping,
  cellKey,
} from '../public/js/amida.js';

/** 決定的な乱数 */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const noAdjacent = (rungs) => {
  const set = new Set(rungs.map((r) => cellKey(r.row, r.col)));
  return rungs.every((r) => !set.has(cellKey(r.row, r.col + 1)));
};

test('最初からある線は隣り合わず、全ての隙間に1本以上ある', () => {
  for (let seed = 1; seed < 200; seed++) {
    const cols = 2 + (seed % 29);
    const lines = generateInitialLines(cols, 15, seeded(seed));
    assert.ok(noAdjacent(lines), `seed ${seed}`);
    for (let c = 0; c < cols - 1; c++) {
      assert.ok(
        lines.some((l) => l.col === c),
        `seed ${seed} gap ${c}`,
      );
    }
    for (const l of lines) {
      assert.ok(l.row >= 0 && l.row < 15 && l.col >= 0 && l.col < cols - 1);
    }
  }
});

test('最初からある線と同じ高さで隣り合うマスは選べない（被せるのはOK）', () => {
  const initial = [{ row: 3, col: 1 }];
  assert.equal(isSelectableCell(4, 10, initial, 3, 0), false);
  assert.equal(isSelectableCell(4, 10, initial, 3, 2), false);
  assert.equal(isSelectableCell(4, 10, initial, 3, 1), true);
  assert.equal(isSelectableCell(4, 10, initial, 4, 0), true);
  assert.equal(isSelectableCell(4, 10, initial, 10, 0), false);
  assert.equal(isSelectableCell(4, 10, initial, 0, 3), false);
  assert.equal(isSelectableCell(4, 10, initial, 0.5, 0), false);
});

test('被った本数で色が切り替わる（最初からある線も1本と数える）', () => {
  const initial = [{ row: 2, col: 0 }];
  const added = [
    { row: 2, col: 0, id: 'a' }, // 2本 → 赤
    { row: 5, col: 1, id: 'b' }, // 1本 → 黒
    { row: 2, col: 0, id: 'c' }, // 3本 → 黒
    { row: 5, col: 1, id: 'd' }, // 2本 → 赤
  ];
  const r = resolveLines(3, 10, initial, added);
  assert.deepEqual(
    r.added.map((l) => [l.id, l.row, l.col, l.count, l.color]),
    [
      ['a', 2, 0, 2, 'red'],
      ['b', 5, 1, 1, 'black'],
      ['c', 2, 0, 3, 'black'],
      ['d', 5, 1, 2, 'red'],
    ],
  );
  assert.deepEqual(
    r.rungs.map((g) => [g.row, g.col, g.count, g.color, g.initial]),
    [
      [2, 0, 3, 'black', true],
      [5, 1, 2, 'red', false],
    ],
  );
});

test('追加の線どうしが隣り合ったら後の線を1段下へ、埋まっていればさらに下へ', () => {
  const initial = [{ row: 4, col: 2 }];
  const added = [
    { row: 3, col: 0, id: 'a' },
    { row: 3, col: 1, id: 'b' }, // a と隣 → 4段目へ。4段目は列2の最初の線と隣 → 5段目へ
    { row: 5, col: 0, id: 'c' }, // b(5,1) と隣 → 6段目へ
  ];
  const r = resolveLines(4, 10, initial, added);
  assert.deepEqual(
    r.added.map((l) => [l.id, l.row, l.col, l.color]),
    [
      ['a', 3, 0, 'black'],
      ['b', 5, 1, 'black'],
      ['c', 6, 0, 'black'],
    ],
  );
  assert.ok(noAdjacent(r.rungs));
});

test('ずらした先に線があれば被せずにさらに下へ', () => {
  const added = [
    { row: 0, col: 0, id: 'a' },
    { row: 1, col: 1, id: 'b' },
    { row: 0, col: 1, id: 'c' }, // a と隣 → 1段目は b と同じマス（埋まっている）→ 2段目
  ];
  const r = resolveLines(3, 10, [], added);
  assert.deepEqual(
    r.added.map((l) => [l.id, l.row, l.col, l.count]),
    [
      ['a', 0, 0, 1],
      ['b', 1, 1, 1],
      ['c', 2, 1, 1],
    ],
  );
});

test('一番下の段でずらすと段が増える', () => {
  const added = [
    { row: 9, col: 0 },
    { row: 9, col: 1 },
  ];
  const r = resolveLines(3, 10, [], added);
  assert.equal(r.rows, 11);
  assert.deepEqual([r.added[1].row, r.added[1].col], [10, 1]);
});

test('黒線は渡り、赤線は往復して戻る（被った本数ぶん往復）', () => {
  const rungs = [
    { row: 1, col: 0, color: 'black', count: 1 },
    { row: 3, col: 1, color: 'red', count: 2 },
    { row: 5, col: 1, color: 'black', count: 3 },
  ];
  const t = trace(8, rungs, 0);
  assert.equal(t.end, 2);
  assert.deepEqual(
    t.steps.map((s) => (s.type === 'rung' ? `rung${s.times}` : s.type)),
    ['down', 'rung1', 'down', 'rung2', 'down', 'rung3', 'down'],
  );
  assert.deepEqual(mapping(3, 8, rungs), [2, 0, 1]);
});

test('どんな線の置き方でも結果は1対1になる', () => {
  for (let seed = 1; seed < 300; seed++) {
    const rand = seeded(seed);
    const cols = 2 + Math.floor(rand() * 12);
    const rows = 15;
    const initial = generateInitialLines(cols, rows, rand);
    const added = [];
    for (let i = 0; i < Math.floor(rand() * 40); i++) {
      const row = Math.floor(rand() * rows);
      const col = Math.floor(rand() * (cols - 1));
      if (isSelectableCell(cols, rows, initial, row, col)) added.push({ row, col });
    }
    const r = resolveLines(cols, rows, initial, added);
    assert.ok(noAdjacent(r.rungs), `seed ${seed}`);
    const m = mapping(cols, r.rows, r.rungs);
    assert.equal(new Set(m).size, cols, `seed ${seed}`);
  }
});
