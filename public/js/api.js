// サーバーとのやりとり

export class ApiError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      0,
      'network',
      '通信できませんでした。電波の良いところでもう一度お試しください',
    );
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // JSON 以外
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? 'unknown',
      data?.message ?? `エラーが発生しました（${res.status}）`,
    );
  }
  return data;
}

/** ブラウザごとの ID（「ブラウザごとに1つまで」の判定に使う） */
export const clientId = (() => {
  const KEY = 'mochiami:cid';
  const make = () =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      const s = storage();
      let id = s.getItem(KEY);
      if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
        id = make();
        s.setItem(KEY, id);
      }
      return id;
    } catch {
      // ストレージが使えない（プライベートモードなど）
    }
  }
  return make();
})();

export const api = {
  /** @param {{ title: string, rules: string, numChoices: number }} input */
  create: (input) => request('POST', '/api/rooms', input),
  view: (id, key) =>
    request('GET', `/api/r/${id}?k=${encodeURIComponent(key)}&cid=${encodeURIComponent(clientId)}`),
  act: (id, key, type, body = {}) =>
    request('POST', `/api/r/${id}/${type}`, { ...body, k: key, cid: clientId }),
};

/**
 * 変更をリアルタイムに受け取る。WebSocket が使えないときは定期的に問い合わせる。
 * @param {string} id
 * @param {string} key
 * @param {() => void} onChange
 */
export function subscribe(id, key, onChange) {
  let ws = null;
  let stopped = false;
  let retry = 0;
  let reconnectTimer = 0;

  const connect = () => {
    if (stopped) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(`${proto}//${location.host}/api/r/${id}/ws?k=${encodeURIComponent(key)}`);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.addEventListener('open', () => {
      if (retry > 0) onChange(); // 切断中の変化を取りこぼさない
      retry = 0;
    });
    ws.addEventListener('message', (e) => {
      if (e.data !== 'pong') onChange();
    });
    ws.addEventListener('close', scheduleReconnect);
  };
  const scheduleReconnect = () => {
    if (stopped) return;
    clearTimeout(reconnectTimer);
    const delay = Math.min(30000, 1000 * 2 ** retry++);
    reconnectTimer = setTimeout(connect, delay);
  };

  const ping = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
  }, 25000);
  const poll = setInterval(() => {
    if (ws?.readyState !== WebSocket.OPEN && document.visibilityState === 'visible') onChange();
  }, 6000);
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    onChange();
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      retry = 0;
      clearTimeout(reconnectTimer);
      connect();
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  connect();

  return () => {
    stopped = true;
    clearInterval(ping);
    clearInterval(poll);
    clearTimeout(reconnectTimer);
    document.removeEventListener('visibilitychange', onVisible);
    ws?.close();
  };
}
