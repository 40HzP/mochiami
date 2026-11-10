// メニュー画面：①名前とルール → ②選択肢の数 → ③URL発行 → ④主催者画面
import { api } from '../api.js';
import { MAX_CHOICES, MIN_CHOICES } from '../amida.js';
import { roomUrl, shareCard } from '../share.js';
import { busy, copyText, fill, h, toast } from '../ui.js';

const HISTORY_KEY = 'mochiami:hosted';

function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  try {
    const list = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // 保存できなくても動作には影響しない
  }
}

const STEPS = ['名前とルール', '選択肢の数', 'URL発行', '主催者画面'];

function stepper(current) {
  return h(
    'ol',
    { class: 'steps', 'aria-label': '作成の手順' },
    STEPS.map((label, i) =>
      h(
        'li',
        {
          class: i < current ? 'done' : i === current ? 'current' : '',
          'aria-current': i === current ? 'step' : null,
        },
        h('span', { class: 'step-num' }, String(i + 1)),
        h('span', { class: 'step-label' }, label),
      ),
    ),
  );
}

/**
 * @param {HTMLElement} root
 * @param {(path: string) => void} navigate
 */
export function menuView(root, navigate) {
  const draft = { title: '', rules: '', numChoices: 4 };

  const show = (...children) => {
    fill(root, ...children);
    window.scrollTo({ top: 0 });
  };

  // ① あみだくじ名とルール
  function step1() {
    const title = h('input', {
      type: 'text',
      maxlength: 40,
      required: true,
      value: draft.title,
      placeholder: '例：今日のお昼ごはん',
    });
    const rules = h('textarea', {
      maxlength: 200,
      rows: 3,
      placeholder: '例：近所で食べられるお昼ごはんを1つ書いてね',
    });
    rules.value = draft.rules;
    const form = h(
      'form',
      {
        class: 'card',
        onsubmit: (e) => {
          e.preventDefault();
          draft.title = title.value.trim();
          draft.rules = rules.value.trim();
          if (!draft.title) {
            toast('あみだくじ名を入力してください', 'error');
            title.focus();
            return;
          }
          step2();
        },
      },
      stepper(0),
      h('label', { class: 'field' }, h('span', null, '作成するあみだくじ名'), title),
      h(
        'label',
        { class: 'field' },
        h('span', null, '選択肢に関するルール'),
        rules,
        h('small', { class: 'hint' }, '選択肢を持ち寄る人に表示されます（任意）'),
      ),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'submit' }, '次へ')),
    );
    show(intro(), form, historyList());
    title.focus();
  }

  // ② 選択肢の数
  function step2() {
    const value = h('output', { class: 'count-value' }, String(draft.numChoices));
    const set = (n) => {
      draft.numChoices = Math.min(MAX_CHOICES, Math.max(MIN_CHOICES, n));
      value.textContent = String(draft.numChoices);
      minus.disabled = draft.numChoices <= MIN_CHOICES;
      plus.disabled = draft.numChoices >= MAX_CHOICES;
    };
    const minus = h(
      'button',
      {
        class: 'btn round',
        type: 'button',
        'aria-label': '減らす',
        onclick: () => set(draft.numChoices - 1),
      },
      '−',
    );
    const plus = h(
      'button',
      {
        class: 'btn round',
        type: 'button',
        'aria-label': '増やす',
        onclick: () => set(draft.numChoices + 1),
      },
      '＋',
    );
    const create = h('button', { class: 'btn primary', type: 'submit' }, 'URLを発行する');
    const form = h(
      'form',
      {
        class: 'card',
        onsubmit: (e) => {
          e.preventDefault();
          busy(create, async () => {
            try {
              const created = await api.create(draft);
              saveHistory({
                id: created.id,
                key: created.keys.host,
                title: draft.title,
                at: Date.now(),
              });
              step3(created);
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        },
      },
      stepper(1),
      h('h2', null, '選択肢の数を指定'),
      h(
        'p',
        { class: 'hint' },
        `「${draft.title}」の選択肢（あみだくじの下に並ぶもの）の数です。参加できる人数もこの数までになります。`,
      ),
      h('div', { class: 'counter' }, minus, value, plus),
      h('p', { class: 'hint center' }, `${MIN_CHOICES}〜${MAX_CHOICES}個`),
      h(
        'div',
        { class: 'row between' },
        h('button', { class: 'btn ghost', type: 'button', onclick: step1 }, '戻る'),
        create,
      ),
    );
    show(form);
    set(draft.numChoices);
  }

  // ③ URL 発行
  function step3(created) {
    const { id, keys } = created;
    const hostUrl = roomUrl('host', id, keys.host);
    show(
      h(
        'section',
        { class: 'card' },
        stepper(2),
        h('h2', null, 'URLを発行しました'),
        h(
          'p',
          { class: 'hint' },
          'それぞれのURL（またはQRコード）を、渡したい人に送ってください。',
        ),
        ...['join', 'choice', 'line'].map((role) =>
          shareCard({ role: /** @type {any} */ (role), id, key: keys[role], title: draft.title }),
        ),
      ),
      h(
        'section',
        { class: 'card host-url' },
        h('h3', null, '主催者画面のURL'),
        h(
          'p',
          { class: 'hint' },
          '集まり具合の確認や「締める」はこの画面から行います。ブックマークしておくと安心です。',
          h('b', null, '他の人には教えないでください。'),
        ),
        h('input', {
          class: 'url-field',
          type: 'text',
          readonly: true,
          value: hostUrl,
          onfocus: (e) => e.target.select(),
        }),
        h(
          'div',
          { class: 'row between' },
          h(
            'button',
            { class: 'btn small', type: 'button', onclick: () => copyText(hostUrl) },
            'コピー',
          ),
          h(
            'button',
            {
              class: 'btn primary',
              type: 'button',
              onclick: () => navigate(`/h/${id}/${keys.host}`),
            },
            '主催者画面へ進む',
          ),
        ),
      ),
    );
  }

  step1();
}

function intro() {
  return h(
    'section',
    { class: 'intro' },
    h('p', { class: 'lead' }, 'みんなで選択肢と線を持ち寄って作る、あみだくじ。'),
    h(
      'ul',
      { class: 'intro-list' },
      h('li', null, h('b', null, '参加する人'), 'は、名前と場所だけ決めます'),
      h('li', null, h('b', null, '選択肢を持ち寄る人'), 'は、選択肢を1つ出して線を1本引けます'),
      h('li', null, h('b', null, '線だけ引く人'), 'も、気軽に1本加えられます'),
      h('li', null, '主催者が締めると、完成したあみだくじのムービーが流れます'),
    ),
  );
}

function historyList() {
  const list = loadHistory();
  if (list.length === 0) return null;
  return h(
    'section',
    { class: 'card history' },
    h('h2', null, '最近作ったあみだくじ'),
    h(
      'ul',
      null,
      list
        .slice(0, 5)
        .map((e) =>
          h(
            'li',
            null,
            h('a', { href: `/h/${e.id}/${e.key}`, 'data-link': true }, e.title),
            h('small', null, new Date(e.at).toLocaleDateString('ja-JP')),
          ),
        ),
    ),
  );
}
