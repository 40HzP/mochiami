// 線追加URL
import { linePicker, sentLineBoard } from '../picker.js';
import { fill, h, toast } from '../ui.js';

/**
 * @param {HTMLElement} root
 * @param {any} data
 * @param {{ act: (type: string, body?: object) => Promise<any> }} ctx
 */
export function lineView(root, data, ctx) {
  const body = h('div');
  root.append(
    h(
      'section',
      { class: 'card' },
      h('p', { class: 'eyebrow' }, '線を1本引く'),
      h('h1', null, data.title),
      body,
    ),
  );

  let drawn = null;
  function update(d) {
    const hasLine = Boolean(d.me.line);
    if (hasLine === drawn) return;
    drawn = hasLine;
    if (!hasLine) {
      fill(
        body,
        linePicker({
          cols: d.cols,
          rows: d.rows,
          initialLines: d.initialLines,
          onSubmit: async (input) => {
            try {
              await ctx.act('line', input);
              toast('線を引きました');
            } catch (err) {
              toast(err.message, 'error');
            }
          },
        }),
      );
    } else {
      fill(
        body,
        h(
          'div',
          { class: 'done' },
          h('p', { class: 'done-icon', 'aria-hidden': 'true' }, '✏️'),
          h('p', { class: 'done-title' }, '線を引きました！'),
          h(
            'p',
            { class: 'hint' },
            'この端末から引ける線は1本までです。主催者が締めると、完成したあみだくじが表示されます。',
          ),
        ),
        h(
          'div',
          { class: 'field' },
          h('span', null, 'あなたが引いた線'),
          sentLineBoard({
            cols: d.cols,
            rows: d.rows,
            initialLines: d.initialLines,
            line: d.me.line,
          }),
        ),
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  update(data);
  return { update };
}
