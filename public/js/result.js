// 完成したあみだくじ（線のムービー → 名前を辿るムービー）
import { trace } from './amida.js';
import { animate, boardFrame, createBoard, GEO } from './board.js';
import { fill, h, s } from './ui.js';

const TRACE_COLORS = [
  '#2e86ab',
  '#5f9e3f',
  '#9b5de5',
  '#ee8a2a',
  '#1b998b',
  '#c05299',
  '#3d5a80',
  '#b08800',
  '#5c7cfa',
  '#8d6e63',
];

const wait = (ms, ctl) => animate(ms, ctl, () => {});

/**
 * @param {HTMLElement} root
 * @param {any} data サーバーからの view（closed: true）
 */
export function resultView(root, data) {
  const r = data.result;
  const me = data.role === 'join' ? data.me : null;
  const bySeat = new Map(r.participants.map((p) => [p.seat, p]));
  const byPosition = new Map(r.choices.map((c) => [c.position, c]));
  const noName = 'ななし';

  const board = createBoard({
    cols: r.cols,
    rows: r.rows,
    top: Array.from({ length: r.cols }, (_, i) => {
      const p = bySeat.get(i);
      if (!p) return { text: '・', className: 'empty' };
      return { text: p.name, className: me?.seat === i ? 'me' : 'name' };
    }),
    bottom: Array.from({ length: r.cols }, (_, i) => {
      const c = byPosition.get(i);
      return c
        ? { text: c.text, className: 'choice', title: c.name ? `${c.text}（${c.name}）` : c.text }
        : { text: '' };
    }),
  });
  for (const l of r.initialLines) board.layers.rungs.append(board.rung(l.row, l.col));
  const addedLayer = s('g', { class: 'added' });
  board.layers.rungs.append(addedLayer);

  // 寄るときの倍率（盤面の大きさに合わせる）
  const zoomLine = clamp(Math.min(board.W / (3 * GEO.colGap), board.H / (8 * GEO.rowGap)), 1.6, 4);
  const zoomFollow = clamp(Math.min(board.W / (4 * GEO.colGap), board.H / (9 * GEO.rowGap)), 1, 3);
  const follow = zoomFollow >= 1.3;

  // ---------------------------------------------------------------- 画面
  const caption = h('div', { class: 'caption', 'aria-live': 'polite' });
  const setCaption = (main, sub = '') => {
    fill(caption, h('strong', null, main), sub ? h('span', null, sub) : null);
  };
  const playBtn = h('button', { class: 'btn primary big', type: 'button' }, '▶ ムービーを再生');
  const skipBtn = h(
    'button',
    { class: 'btn ghost small skip', type: 'button', hidden: true },
    'スキップ ⏭',
  );
  const resultCard = h('div', { class: 'result-card', hidden: true });
  const list = h('ol', { class: 'result-list' });
  const listSection = h(
    'section',
    { class: 'card', hidden: true },
    h('h2', null, '結果'),
    h('p', { class: 'hint' }, '名前をタップすると、その人の線を辿ります'),
    list,
    h(
      'div',
      { class: 'row wrap' },
      h(
        'button',
        { class: 'btn small', type: 'button', onclick: () => revealAll() },
        '全員の結果を表示',
      ),
      h(
        'button',
        { class: 'btn small', type: 'button', onclick: () => replay() },
        'ムービーをもう一度',
      ),
    ),
  );

  const frame = boardFrame(board);
  const stage = h(
    'div',
    { class: 'stage' },
    caption,
    frame,
    h('div', { class: 'stage-actions' }, playBtn, skipBtn),
  );

  root.append(
    h(
      'section',
      { class: 'card result' },
      h('p', { class: 'eyebrow' }, 'あみだくじが完成しました！'),
      h('h1', null, data.title),
      h(
        'p',
        { class: 'hint' },
        `参加者 ${r.participants.length}人 ・ 選択肢 ${r.choices.length}個 ・ 追加の線 ${r.added.length}本`,
      ),
      me ? h('p', { class: 'me-note' }, `あなたは「${me.name}」（${me.seat + 1}番）です`) : null,
      stage,
      resultCard,
    ),
    listSection,
  );
  setCaption('準備ができたら再生してください', '追加された線を、送られた順に引いていきます');

  // ---------------------------------------------------------------- ムービー
  /** @type {{ skipped: boolean } | null} */
  let ctl = null;
  let running = false;
  let linesDrawn = false;
  const revealed = new Set();

  skipBtn.addEventListener('click', () => {
    if (ctl) ctl.skipped = true;
  });
  playBtn.addEventListener('click', () => start());

  async function start() {
    if (running) return;
    running = true;
    playBtn.hidden = true;
    skipBtn.hidden = false;
    resultCard.hidden = true;
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ctl = { skipped: false };
    await playLines(ctl);
    linesDrawn = true;
    skipBtn.hidden = true;
    running = false;
    ctl = null;
    if (me) {
      await tracePerson(me.seat);
    } else {
      setCaption('名前をタップして辿ってみよう', '下の一覧からも選べます');
    }
    listSection.hidden = false;
  }

  async function playLines(c) {
    addedLayer.replaceChildren();
    const n = r.added.length;
    if (n === 0) {
      setCaption('追加の線はありませんでした');
      await wait(1200, c);
      return;
    }
    setCaption(`追加の線は${n}本`, '送られた順に引いていきます');
    await wait(1000, c);
    for (let i = 0; i < n; i++) {
      const l = r.added[i];
      const last = i === n - 1;
      const who = `${l.name || noName} の線`;
      setCaption(last ? '最後の1本！' : `${i + 1} / ${n} 本目`, who);
      const cx = (board.x(l.col) + board.x(l.col + 1)) / 2;
      await board.moveView(board.boxAt(cx, board.y(l.row), zoomLine), i === 0 ? 700 : 400, c);
      const el = board.rung(l.row, l.col, `rung added ${l.color}`);
      addedLayer.append(el);
      await drawStroke(el, GEO.colGap, last ? 3000 : 1000, c);
      await wait(last ? 800 : 200, c);
    }
    setCaption('線がそろいました');
    await board.moveView(board.full(), 700, c);
  }

  /** @param {number} seat */
  async function tracePerson(seat) {
    const p = bySeat.get(seat);
    if (!p || running) return;
    if (!linesDrawn) {
      // ムービー前でも辿れるように線を全部出す
      playBtn.hidden = true;
      await playLines({ skipped: true });
      linesDrawn = true;
    }
    running = true;
    resultCard.hidden = true;
    const c = { skipped: false };
    ctl = c;
    skipBtn.hidden = false;

    const color = TRACE_COLORS[seat % TRACE_COLORS.length];
    for (const old of board.layers.trace.children) old.classList.add('faded');
    board.layers.marker.replaceChildren();
    for (const t of board.topEls) t.classList.remove('active');
    for (const t of board.bottomEls) t.classList.remove('active');
    board.topEls[seat].classList.add('active');

    const { end, steps } = trace(r.rows, r.rungs, seat);
    const pts = [[board.x(seat), board.lineTop]];
    for (const st of steps) {
      if (st.type === 'down') {
        pts.push([board.x(st.col), board.y(st.toRow)]);
        continue;
      }
      // 被った本数ぶん往復する
      for (let i = 0; i < st.times; i++) {
        pts.push([board.x(i % 2 === 0 ? st.to : st.from), board.y(st.row)]);
      }
    }
    const path = /** @type {SVGPathElement} */ (
      s('path', {
        class: 'trace',
        d: 'M' + pts.map(([px, py]) => `${px},${py}`).join(' L'),
        stroke: color,
      })
    );
    board.layers.trace.append(path);
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    const dot = s('circle', { class: 'marker', r: 9, fill: color, cx: pts[0][0], cy: pts[0][1] });
    board.layers.marker.append(dot);

    setCaption(`${p.name} を辿ります…`);
    if (follow) await board.moveView(board.boxAt(pts[0][0], pts[0][1], zoomFollow), 600, c);
    const ms = clamp((len / 230) * 1000, 2500, 9000);
    await animate(ms, c, (t) => {
      const at = len * t;
      path.style.strokeDashoffset = `${len - at}`;
      const pt = path.getPointAtLength(at);
      dot.setAttribute('cx', String(pt.x));
      dot.setAttribute('cy', String(pt.y));
      if (follow) board.setView(board.boxAt(pt.x, pt.y, zoomFollow));
    });
    board.bottomEls[end].classList.add('active');
    if (follow) await board.moveView(board.full(), 600, c);

    const choice = byPosition.get(end);
    revealed.add(seat);
    setCaption(`${p.name} → ${choice?.text ?? ''}`);
    fill(
      resultCard,
      h('p', { class: 'result-name' }, `${p.name} は…`),
      h('p', { class: 'result-choice', style: { color } }, choice?.text ?? ''),
      choice?.name ? h('p', { class: 'hint' }, `（${choice.name} さんが持ち寄った選択肢）`) : null,
    );
    resultCard.hidden = false;
    skipBtn.hidden = true;
    ctl = null;
    running = false;
    renderList();
  }

  function renderList() {
    list.replaceChildren(
      ...r.participants.map((p) => {
        const choice = byPosition.get(r.map[p.seat]);
        const shown = revealed.has(p.seat);
        return h(
          'li',
          { class: me?.seat === p.seat ? 'me' : '' },
          h(
            'button',
            { class: 'link', type: 'button', onclick: () => tracePerson(p.seat) },
            h('span', { class: 'seat' }, `${p.seat + 1}`),
            p.name,
            me?.seat === p.seat ? h('span', { class: 'tag' }, 'あなた') : null,
          ),
          h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
          shown
            ? h(
                'span',
                { class: 'choice' },
                choice?.text ?? '',
                choice?.name ? h('small', null, `（${choice.name}）`) : null,
              )
            : h('span', { class: 'choice secret' }, '？？？'),
        );
      }),
    );
    if (r.participants.length === 0)
      list.append(h('li', { class: 'hint' }, '参加者はいませんでした'));
  }

  function revealAll() {
    for (const p of r.participants) revealed.add(p.seat);
    renderList();
  }

  function replay() {
    if (running) return;
    board.layers.trace.replaceChildren();
    board.layers.marker.replaceChildren();
    for (const t of [...board.topEls, ...board.bottomEls]) t.classList.remove('active');
    linesDrawn = false;
    start();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  for (const [seat, el] of board.topEls.entries()) {
    if (!bySeat.has(seat)) continue;
    el.classList.add('clickable');
    el.addEventListener('click', () => tracePerson(seat));
  }
  renderList();
}

/** 線を端から描く */
function drawStroke(el, length, ms, ctl) {
  el.style.strokeDasharray = `${length}`;
  el.style.strokeDashoffset = `${length}`;
  return animate(ms, ctl, (t) => {
    el.style.strokeDashoffset = `${length * (1 - t)}`;
  });
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
