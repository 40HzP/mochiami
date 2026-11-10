// 線を 1 本引く画面
import { isSelectableCell } from './amida.js';
import { boardFrame, createBoard, GEO } from './board.js';
import { busy, h, s, toast } from './ui.js';

const NAME_MAX = 20;

/**
 * 上は番号だけ、下は自分の選択肢だけ見える盤面
 * @param {{ cols: number, rows: number, initialLines: {row:number,col:number}[], myChoice?: {text:string, position:number} | null }} o
 */
function pickerBoard({ cols, rows, initialLines, myChoice }) {
  const board = createBoard({
    cols,
    rows,
    mode: 'scroll',
    top: Array.from({ length: cols }, (_, i) => ({ text: String(i + 1), className: 'num' })),
    bottom: Array.from({ length: cols }, (_, i) =>
      myChoice && myChoice.position === i
        ? { text: myChoice.text, className: 'mine' }
        : { text: '？', className: 'hidden-choice' },
    ),
  });
  for (const l of initialLines) board.layers.rungs.append(board.rung(l.row, l.col));
  return board;
}

/**
 * @param {{
 *   cols: number,
 *   rows: number,
 *   initialLines: {row:number,col:number}[],
 *   myChoice?: {text:string, position:number} | null,
 *   defaultName?: string,
 *   onSubmit: (input: { name: string, row: number, col: number }) => Promise<void>,
 * }} o
 */
export function linePicker({ cols, rows, initialLines, myChoice, defaultName = '', onSubmit }) {
  const board = pickerBoard({ cols, rows, initialLines, myChoice });
  /** @type {{row:number,col:number} | null} */
  let selected = null;

  const preview = s('line', { class: 'rung preview', visibility: 'hidden' });
  board.layers.preview.append(preview);

  const status = h('p', { class: 'pick-status' }, '線を引きたい場所をタップしてください');
  const nameInput = h('input', {
    type: 'text',
    maxlength: NAME_MAX,
    value: defaultName,
    placeholder: '例：たろう',
    autocomplete: 'nickname',
  });
  const submit = h(
    'button',
    { class: 'btn primary big', type: 'button', disabled: true },
    'この場所に線を引く',
  );

  const select = (row, col) => {
    selected = { row, col };
    preview.setAttribute('x1', String(board.x(col)));
    preview.setAttribute('x2', String(board.x(col + 1)));
    preview.setAttribute('y1', String(board.y(row)));
    preview.setAttribute('y2', String(board.y(row)));
    preview.setAttribute('visibility', 'visible');
    const overlaps = initialLines.some((l) => l.row === row && l.col === col);
    status.textContent = `上から${row + 1}段目・${col + 1}番と${col + 2}番の間${
      overlaps ? '（最初からある線に重ねます）' : ''
    }`;
    submit.disabled = false;
    for (const el of board.layers.hit.querySelectorAll('.selected'))
      el.classList.remove('selected');
    board.layers.hit.querySelector(`[data-cell="${row}:${col}"]`)?.classList.add('selected');
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const ok = isSelectableCell(cols, rows, initialLines, row, col);
      const rect = s('rect', {
        class: ok ? 'cell' : 'cell disabled',
        'data-cell': `${row}:${col}`,
        x: board.x(col) + 3,
        y: board.y(row) - GEO.rowGap / 2,
        width: GEO.colGap - 6,
        height: GEO.rowGap,
        rx: 6,
        onclick: () => {
          if (ok) select(row, col);
          else toast('最初からある線と同じ高さで隣り合う場所には引けません', 'error');
        },
      });
      board.layers.hit.append(rect);
    }
  }

  submit.addEventListener('click', () =>
    busy(submit, async () => {
      if (!selected) return;
      await onSubmit({ name: nameInput.value.trim(), ...selected });
    }),
  );

  return h(
    'div',
    { class: 'picker' },
    h(
      'ul',
      { class: 'notes' },
      h('li', null, '好きな場所をタップして、', h('b', null, '線を1本だけ'), '引けます'),
      h('li', null, '最初からある線は見えています。他の人が引いた線は完成まで見えません'),
      h('li', null, '最初からある線に重ねて引くこともできます'),
    ),
    h('label', { class: 'field' }, h('span', null, 'あなたの名前（任意）'), nameInput),
    boardFrame(board),
    h('p', { class: 'scroll-hint' }, '← 横にスクロールできます →'),
    status,
    h('div', { class: 'sticky-action' }, submit),
  );
}

/** 送った線を表示するだけの盤面 */
export function sentLineBoard({ cols, rows, initialLines, myChoice, line }) {
  const board = pickerBoard({ cols, rows, initialLines, myChoice });
  board.layers.preview.append(board.rung(line.row, line.col, 'rung mine'));
  return boardFrame(board);
}
