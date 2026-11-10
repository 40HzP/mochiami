import { MAX_CHOICES, MIN_CHOICES } from '../public/js/amida.js';
import { Room, type Action, type Outcome } from './room';
import { cleanText, randomId } from './util';

export { Room };

interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}

export const LIMITS = { title: 40, rules: 200, name: 20, choice: 30 } as const;

const ID_RE = /^[A-Za-z0-9]{8}$/;
const KEY_RE = /^[A-Za-z0-9]{12}$/;
const CID_RE = /^[A-Za-z0-9-]{16,64}$/;
/** 画面の URL（/h 主催者, /j 参加, /c 選択肢追加, /l 線追加） */
const PAGE_RE = /^\/[hjcl]\/[A-Za-z0-9]{8}\/[A-Za-z0-9]{12}\/?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/api/rooms') {
        if (request.method !== 'POST') return methodNotAllowed();
        return await createRoom(request, env);
      }
      const m = path.match(/^\/api\/r\/([^/]+)(?:\/([a-z]+))?$/);
      if (m) {
        const [, id, action] = m;
        if (!ID_RE.test(id)) return error(404, 'not_found', 'あみだくじが見つかりません');
        const room = env.ROOM.get(env.ROOM.idFromName(id));
        if (action === 'ws') return room.fetch(request);
        if (!action) {
          if (request.method !== 'GET') return methodNotAllowed();
          const key = url.searchParams.get('k') ?? '';
          const cid = url.searchParams.get('cid') ?? '';
          if (!KEY_RE.test(key)) return error(404, 'not_found', 'あみだくじが見つかりません');
          if (!CID_RE.test(cid)) return error(400, 'bad_client', '端末IDが不正です');
          return outcome(await room.view(key, cid));
        }
        if (request.method !== 'POST') return methodNotAllowed();
        return await act(room, action, request);
      }
      if (path.startsWith('/api/')) return error(404, 'not_found', 'Not Found');
      // ブラウザ以外（リンクのプレビューなど）からのアクセスにも画面の HTML を返す
      if (PAGE_RE.test(path) && (request.method === 'GET' || request.method === 'HEAD')) {
        return env.ASSETS.fetch(new Request(new URL('/', url), request));
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return error(500, 'internal', 'サーバーでエラーが起きました。もう一度お試しください');
    }
  },
} satisfies ExportedHandler<Env>;

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body) return error(400, 'bad_request', '入力を確認してください');
  const title = cleanText(body.title, LIMITS.title);
  const rules = cleanText(body.rules, LIMITS.rules, true);
  const cols = Number(body.numChoices);
  if (!title) return error(400, 'bad_title', 'あみだくじ名を入力してください');
  if (!Number.isInteger(cols) || cols < MIN_CHOICES || cols > MAX_CHOICES) {
    return error(
      400,
      'bad_count',
      `選択肢の数は${MIN_CHOICES}〜${MAX_CHOICES}個で指定してください`,
    );
  }
  const id = randomId(8);
  const room = env.ROOM.get(env.ROOM.idFromName(id));
  const created = await room.init({ id, title, rules, cols });
  return json(created, 201);
}

async function act(room: DurableObjectStub<Room>, type: string, request: Request) {
  const body = await readJson(request);
  if (!body) return error(400, 'bad_request', '入力を確認してください');
  const key = typeof body.k === 'string' ? body.k : '';
  const cid = typeof body.cid === 'string' ? body.cid : '';
  if (!KEY_RE.test(key)) return error(404, 'not_found', 'あみだくじが見つかりません');
  if (!CID_RE.test(cid)) return error(400, 'bad_client', '端末IDが不正です');

  const name = cleanText(body.name, LIMITS.name);
  let action: Action;
  switch (type) {
    case 'join':
      if (!name) return error(400, 'bad_name', '名前を入力してください');
      action = { type, name, seat: Number(body.seat) };
      break;
    case 'choice': {
      const text = cleanText(body.text, LIMITS.choice);
      if (!text) return error(400, 'bad_text', '選択肢を入力してください');
      action = { type, name, text };
      break;
    }
    case 'decide':
      if (body.decision !== 'draw' && body.decision !== 'skip') {
        return error(400, 'bad_decision', '線を引くかどうかを選んでください');
      }
      action = { type, decision: body.decision };
      break;
    case 'line':
      action = { type, name, row: Number(body.row), col: Number(body.col) };
      break;
    case 'close':
      action = { type };
      break;
    default:
      return error(404, 'not_found', 'Not Found');
  }
  return outcome(await room.act(key, cid, action));
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function outcome(o: Outcome): Response {
  return o.ok ? json(o.data) : error(o.status, o.error, o.message);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function error(status: number, code: string, message: string): Response {
  return json({ error: code, message }, status);
}

function methodNotAllowed(): Response {
  return error(405, 'method_not_allowed', 'Method Not Allowed');
}
