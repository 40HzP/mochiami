// もちあみ — 画面の切り替え
import { api, subscribe } from './api.js';
import { resultView } from './result.js';
import { fill, h } from './ui.js';
import { choiceView } from './views/choice.js';
import { hostView } from './views/host.js';
import { joinView } from './views/join.js';
import { lineView } from './views/line.js';
import { menuView } from './views/menu.js';

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const ROLE_VIEWS = { host: hostView, join: joinView, choice: choiceView, line: lineView };
const ROOM_ROUTE = /^\/([hjcl])\/([A-Za-z0-9]{8})\/([A-Za-z0-9]{12})\/?$/;

/** 画面を離れるときの後片付け */
let cleanup = () => {};

function navigate(path) {
  history.pushState(null, '', path);
  route();
}

function route() {
  cleanup();
  cleanup = () => {};
  root.replaceChildren();
  window.scrollTo({ top: 0 });
  const path = location.pathname;
  if (path === '/' || path === '/index.html') {
    document.title = 'もちあみ-持ち寄りあみだくじ-';
    menuView(root, navigate);
    return;
  }
  const m = path.match(ROOM_ROUTE);
  if (m) {
    mountRoom(m[2], m[3]);
    return;
  }
  showError('ページが見つかりません', 'URLをもう一度確認してください。');
}

function showError(title, message) {
  fill(
    root,
    h(
      'section',
      { class: 'card center' },
      h('p', { class: 'done-icon', 'aria-hidden': 'true' }, '🍡'),
      h('h1', null, title),
      h('p', null, message),
      h('a', { class: 'btn', href: '/', 'data-link': true }, 'トップへ'),
    ),
  );
}

/**
 * あみだくじの各画面（主催者・参加・選択肢追加・線追加）
 * @param {string} id
 * @param {string} key
 */
async function mountRoom(id, key) {
  let alive = true;
  /** @type {{ update: (d: any) => void } | null} */
  let view = null;
  let showingResult = false;
  let unsubscribe = () => {};
  cleanup = () => {
    alive = false;
    unsubscribe();
  };

  root.append(h('p', { class: 'loading-text' }, '読み込み中…'));

  const apply = (data) => {
    if (!alive || showingResult) return;
    document.title = `${data.title}｜もちあみ`;
    if (data.closed) {
      showingResult = true;
      unsubscribe();
      root.replaceChildren();
      resultView(root, data);
      window.scrollTo({ top: 0 });
      return;
    }
    if (view) {
      view.update(data);
      return;
    }
    root.replaceChildren();
    view = ROLE_VIEWS[data.role](root, data, ctx);
  };

  let refreshing = null;
  const refresh = async () => {
    // 同時に何度も取りに行かない
    refreshing ??= api
      .view(id, key)
      .then(apply)
      .catch((err) => {
        if (err.status === 404) showError('あみだくじが見つかりません', err.message);
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  const ctx = {
    id,
    key,
    refresh,
    /** 操作して、返ってきた最新の状態で画面を更新する */
    act: async (type, body = {}) => {
      try {
        const data = await api.act(id, key, type, body);
        apply(data);
        return data;
      } catch (err) {
        if (err.code === 'closed') await refresh();
        throw err;
      }
    },
  };

  try {
    apply(await api.view(id, key));
  } catch (err) {
    if (!alive) return;
    if (err.status === 404)
      showError(
        'あみだくじが見つかりません',
        'URLが間違っているか、期限が切れて削除された可能性があります。',
      );
    else showError('読み込めませんでした', err.message);
    return;
  }
  if (alive && !showingResult) unsubscribe = subscribe(id, key, refresh);
}

document.addEventListener('click', (e) => {
  const a = /** @type {HTMLElement} */ (e.target).closest?.('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(/** @type {HTMLAnchorElement} */ (a).getAttribute('href'));
});
window.addEventListener('popstate', route);
route();
