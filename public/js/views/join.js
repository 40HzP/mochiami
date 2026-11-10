// 参加URL
import { busy, fill, h, toast } from '../ui.js';

/**
 * @param {HTMLElement} root
 * @param {any} data
 * @param {{ act: (type: string, body?: object) => Promise<any>, refresh: () => Promise<void> }} ctx
 */
export function joinView(root, data, ctx) {
  /** @type {number | null} */
  let selected = null;
  let current = data;

  const nameInput = h('input', {
    type: 'text',
    maxlength: 20,
    required: true,
    placeholder: '例：たろう',
    autocomplete: 'nickname',
  });
  const seatRow = h('div', { class: 'seats', role: 'radiogroup', 'aria-label': '場所' });
  const seatHint = h('p', { class: 'hint' });
  const submit = h(
    'button',
    { class: 'btn primary big', type: 'submit', disabled: true },
    'この場所で参加する',
  );
  const body = h('div');

  root.append(
    h(
      'section',
      { class: 'card' },
      h('p', { class: 'eyebrow' }, 'あみだくじに参加'),
      h('h1', null, data.title),
      body,
    ),
  );

  const form = h(
    'form',
    {
      onsubmit: (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name) {
          toast('名前を入力してください', 'error');
          nameInput.focus();
          return;
        }
        if (selected === null) {
          toast('場所を選んでください', 'error');
          return;
        }
        busy(submit, async () => {
          try {
            await ctx.act('join', { name, seat: selected });
          } catch (err) {
            if (err.code === 'seat_taken') {
              selected = null;
              await ctx.refresh();
            }
            toast(err.message, 'error');
          }
        });
      },
    },
    h('label', { class: 'field' }, h('span', null, 'あなたの名前'), nameInput),
    h('div', { class: 'field' }, h('span', null, '場所を選ぶ'), seatRow, seatHint),
    h('div', { class: 'sticky-action' }, submit),
  );

  function renderSeats(d) {
    const mySeat = d.me?.seat ?? null;
    if (selected !== null && d.seats[selected] && mySeat === null) selected = null;
    seatRow.replaceChildren(
      ...d.seats.map((taken, i) => {
        const isMe = mySeat === i;
        const btn = h(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: `seat ${taken ? 'taken' : ''} ${isMe ? 'me' : ''} ${selected === i ? 'selected' : ''}`,
            'aria-checked': String(selected === i || isMe),
            'aria-label': `${i + 1}番 ${isMe ? '（あなた）' : taken ? '（埋まっています）' : '（空き）'}`,
            disabled: taken || mySeat !== null,
            onclick: () => {
              selected = i;
              renderSeats(current);
            },
          },
          h('span', { class: 'seat-num' }, String(i + 1)),
          h('span', { class: 'seat-state' }, isMe ? 'あなた' : taken ? '埋' : ''),
        );
        return btn;
      }),
    );
    const free = d.seats.filter((t) => !t).length;
    seatHint.textContent =
      mySeat !== null
        ? ''
        : free === 0
          ? '空いている場所がありません'
          : `空き ${free} / ${d.seats.length}　（ほかの人の名前は見えません）`;
    submit.disabled = selected === null;
  }

  function update(d) {
    current = d;
    if (d.me) {
      fill(
        body,
        h(
          'div',
          { class: 'done' },
          h('p', { class: 'done-icon', 'aria-hidden': 'true' }, '🍡'),
          h('p', { class: 'done-title' }, '参加しました！'),
          h('p', null, h('b', null, d.me.name), ` さん（${d.me.seat + 1}番）`),
          h(
            'p',
            { class: 'hint' },
            '主催者が締めると、完成したあみだくじが自動で表示されます。この画面を開いたままお待ちください。',
          ),
        ),
        h('div', { class: 'field' }, h('span', null, 'いまの埋まり具合'), seatRow),
      );
    } else if (d.seats.every(Boolean)) {
      fill(
        body,
        h('p', { class: 'notice' }, 'すべての場所が埋まりました。参加できる場所がありません。'),
      );
    } else if (!body.contains(form)) {
      fill(
        body,
        h(
          'p',
          { class: 'hint' },
          '名前を入力して、空いている場所を選んでください。選択肢は完成するまで見えません。',
        ),
        form,
      );
    }
    renderSeats(d);
  }

  update(data);
  return { update };
}
