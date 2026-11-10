// 主催者画面
import { shareCard } from '../share.js';
import { busy, confirmDialog, h, toast } from '../ui.js';

/**
 * @param {HTMLElement} root
 * @param {any} data
 * @param {{ act: (type: string, body?: object) => Promise<any> }} ctx
 */
export function hostView(root, data, ctx) {
  const stat = (label, unit = '人') => {
    const value = h('span', { class: 'stat-value' }, '0');
    const sub = h('span', { class: 'stat-sub' });
    const el = h(
      'div',
      { class: 'stat' },
      h('span', { class: 'stat-label' }, label),
      h('span', { class: 'stat-number' }, value, h('small', null, unit)),
      sub,
    );
    return { el, value, sub };
  };

  const participants = stat('参加者');
  const choices = stat('選択肢', '個');
  const drew = stat('線を引いた');
  const skipped = stat('線を引かなかった');
  const lineUrl = stat('線追加URLから線を引いた');
  const undecided = h('p', { class: 'stat-group-note' });

  const closeHint = h('p', { class: 'hint center' });
  const closeBtn = h('button', { class: 'btn danger big', type: 'button' }, '締める');
  closeBtn.addEventListener('click', () => onClose());

  root.append(
    h(
      'section',
      { class: 'card' },
      h('p', { class: 'eyebrow' }, '主催者画面'),
      h('h1', null, data.title),
      data.rules ? h('p', { class: 'rules' }, data.rules) : null,
      h('div', { class: 'stats' }, participants.el, choices.el),
      h(
        'div',
        { class: 'stat-group' },
        h('p', { class: 'stat-group-title' }, '選択肢を追加した人のうち'),
        h('div', { class: 'stats' }, drew.el, skipped.el),
        undecided,
      ),
      h('div', { class: 'stats' }, lineUrl.el),
      h('div', { class: 'close-area' }, closeBtn, closeHint),
    ),
    h(
      'details',
      { class: 'card urls' },
      h('summary', null, '参加URL・選択肢追加URL・線追加URL'),
      ...['join', 'choice', 'line'].map((role) =>
        shareCard({
          role: /** @type {any} */ (role),
          id: data.id,
          key: data.keys[role],
          title: data.title,
        }),
      ),
    ),
  );

  /** @type {any} */
  let current = data;
  function update(d) {
    current = d;
    const c = d.counts;
    participants.value.textContent = String(c.participants);
    participants.sub.textContent = `最大 ${d.cols}人`;
    choices.value.textContent = String(c.choices);
    choices.sub.textContent = `/ ${d.cols}個`;
    choices.el.classList.toggle('complete', c.choices >= d.cols);
    drew.value.textContent = String(c.drew);
    skipped.value.textContent = String(c.skipped);
    undecided.textContent = c.undecided > 0 ? `線を引くか選んでいる途中：${c.undecided}人` : '';
    undecided.hidden = c.undecided === 0;
    lineUrl.value.textContent = String(c.lineUrlLines);
    closeBtn.disabled = !d.canClose;
    closeHint.textContent = d.canClose
      ? '締めるとすべてのURLの受付が終了し、あみだくじが完成します'
      : `選択肢があと${d.cols - c.choices}個そろうと締められます`;
  }

  async function onClose() {
    const c = current.counts;
    const notes = [];
    if (c.participants === 0) notes.push('まだ参加者がいません。');
    if (c.undecided > 0)
      notes.push(
        `線を引くか選んでいる途中の人が${c.undecided}人います（その人の線は入りません）。`,
      );
    const ok = await confirmDialog({
      title: 'あみだくじを締めますか？',
      body: h(
        'div',
        null,
        h(
          'p',
          null,
          '締めると、参加・選択肢の追加・線の追加の受付がすべて終了します。元には戻せません。',
        ),
        ...notes.map((n) => h('p', { class: 'warn' }, n)),
      ),
      ok: '締める',
      danger: true,
    });
    if (!ok) return;
    await busy(closeBtn, async () => {
      try {
        await ctx.act('close');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  update(data);
  return { update };
}
