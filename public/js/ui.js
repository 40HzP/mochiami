// 画面づくりの小さな道具

/**
 * 要素を作る
 * @param {string} tag
 * @param {Record<string, any> | null} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

/** 子要素を入れ替える（null や false は無視） */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG 要素を作る
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children
 * @returns {SVGElement}
 */
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

let toastTimer = 0;
/** 画面下に短いメッセージを出す */
export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/** 確認ダイアログ */
export function confirmDialog({ title, body, ok = 'OK', cancel = 'キャンセル', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog',
      { class: 'dialog' },
      h(
        'form',
        { method: 'dialog' },
        h('h2', null, title),
        body ? h('div', { class: 'dialog-body' }, body) : null,
        h(
          'div',
          { class: 'row end' },
          h('button', { value: 'cancel', class: 'btn ghost' }, cancel),
          h('button', { value: 'ok', class: `btn ${danger ? 'danger' : 'primary'}` }, ok),
        ),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
  } catch {
    const ta = h('textarea', { readonly: true, style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(
      ok ? 'コピーしました' : 'コピーできませんでした。長押しで選択してください',
      ok ? 'info' : 'error',
    );
  }
}

/** ボタンを押している間「処理中」にする */
export async function busy(button, fn) {
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add('loading');
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
  }
}

/** 文字数（サロゲートペアを1文字と数える）で切り詰める */
export function truncate(text, max) {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : text;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
