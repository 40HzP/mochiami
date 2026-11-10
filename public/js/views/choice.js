// 選択肢追加URL
import { linePicker, sentLineBoard } from '../picker.js';
import { busy, fill, h, toast } from '../ui.js';

/**
 * @param {HTMLElement} root
 * @param {any} data
 * @param {{ act: (type: string, body?: object) => Promise<any> }} ctx
 */
export function choiceView(root, data, ctx) {
  const body = h('div');
  root.append(
    h(
      'section',
      { class: 'card' },
      h('p', { class: 'eyebrow' }, '選択肢を持ち寄る'),
      h('h1', null, data.title),
      data.rules
        ? h('div', { class: 'rules' }, h('span', { class: 'rules-label' }, 'ルール'), data.rules)
        : null,
      body,
    ),
  );

  let phase = '';
  /** 選択肢を追加したときの名前（線の名前の初期値に使う） */
  let lastName = '';

  function update(d) {
    const me = d.me;
    const next = !me.choice
      ? d.choicesFull
        ? 'full'
        : 'form'
      : !me.decision
        ? 'decide'
        : me.decision === 'draw' && !me.line
          ? 'draw'
          : 'done';
    if (next === phase) return;
    phase = next;
    fill(body, ...render(d, next));
    if (next !== 'form') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render(d, p) {
    const me = d.me;
    switch (p) {
      case 'full':
        return [h('p', { class: 'notice' }, '選択肢はすでに揃いました。ありがとうございました！')];

      case 'form': {
        const name = h('input', {
          type: 'text',
          maxlength: 20,
          placeholder: '例：はなこ',
          autocomplete: 'nickname',
        });
        const text = h('input', {
          type: 'text',
          maxlength: 30,
          required: true,
          placeholder: '例：カレー',
        });
        const submit = h(
          'button',
          { class: 'btn primary big', type: 'submit' },
          '選択肢を追加する',
        );
        return [
          h(
            'form',
            {
              onsubmit: (e) => {
                e.preventDefault();
                if (!text.value.trim()) {
                  toast('選択肢を入力してください', 'error');
                  text.focus();
                  return;
                }
                busy(submit, async () => {
                  try {
                    lastName = name.value.trim();
                    await ctx.act('choice', { name: lastName, text: text.value.trim() });
                  } catch (err) {
                    toast(err.message, 'error');
                  }
                });
              },
            },
            h(
              'p',
              { class: 'hint' },
              '選択肢を1つ作れます（この端末から1つまで）。置かれる場所は空いているところに自動で決まります。',
            ),
            h('label', { class: 'field' }, h('span', null, '選択肢'), text),
            h('label', { class: 'field' }, h('span', null, 'あなたの名前（任意）'), name),
            h('div', { class: 'sticky-action' }, submit),
          ),
        ];
      }

      case 'decide': {
        const draw = h(
          'button',
          { class: 'btn primary big', type: 'button' },
          'あみだくじの線を追加する',
        );
        const skip = h('button', { class: 'btn ghost big', type: 'button' }, '線を引かない');
        const decide = (btn, decision) =>
          busy(btn, async () => {
            try {
              await ctx.act('decide', { decision });
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        draw.addEventListener('click', () => decide(draw, 'draw'));
        skip.addEventListener('click', () => decide(skip, 'skip'));
        return [
          myChoiceCard(me.choice, d.cols),
          h('p', { class: 'center' }, 'つづけて、あみだくじに線を1本引けます。'),
          h('div', { class: 'stack' }, draw, skip),
        ];
      }

      case 'draw':
        return [
          myChoiceCard(me.choice, d.cols),
          linePicker({
            cols: d.cols,
            rows: d.rows,
            initialLines: d.initialLines,
            myChoice: me.choice,
            defaultName: lastName || me.choice.name,
            onSubmit: async (input) => {
              try {
                await ctx.act('line', input);
                toast('線を引きました');
              } catch (err) {
                toast(err.message, 'error');
              }
            },
          }),
        ];

      case 'done':
        return [
          h(
            'div',
            { class: 'done' },
            h('p', { class: 'done-icon', 'aria-hidden': 'true' }, '🍡'),
            h('p', { class: 'done-title' }, 'ありがとうございました！'),
            h('p', { class: 'hint' }, '主催者が締めると、完成したあみだくじが表示されます。'),
          ),
          myChoiceCard(me.choice, d.cols),
          me.line
            ? h(
                'div',
                { class: 'field' },
                h('span', null, 'あなたが引いた線'),
                sentLineBoard({
                  cols: d.cols,
                  rows: d.rows,
                  initialLines: d.initialLines,
                  myChoice: me.choice,
                  line: me.line,
                }),
              )
            : null,
        ];
    }
    return [];
  }

  update(data);
  return { update };
}

function myChoiceCard(choice, cols) {
  return h(
    'div',
    { class: 'my-choice' },
    h('span', { class: 'my-choice-label' }, 'あなたの選択肢'),
    h('span', { class: 'my-choice-text' }, choice.text),
    h(
      'span',
      { class: 'hint' },
      `下に並ぶ${cols}個のうち、左から${choice.position + 1}番目に置かれました`,
    ),
  );
}
