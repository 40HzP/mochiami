import { DurableObject } from 'cloudflare:workers';
import {
  DEFAULT_ROWS,
  generateInitialLines,
  isSelectableCell,
  mapping,
  resolveLines,
} from '../public/js/amida.js';
import { randomId } from './util';

/** あみだくじを作成してから自動で削除するまでの期間 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Role = 'host' | 'join' | 'choice' | 'line';
type Decision = 'draw' | 'skip';
type Cell = { row: number; col: number };

interface Participant {
  cid: string;
  name: string;
  seat: number;
  at: number;
}
interface Choice {
  cid: string;
  name: string;
  text: string;
  position: number;
  decision: Decision | null;
  at: number;
}
interface Line extends Cell {
  cid: string;
  name: string;
  via: 'choice' | 'line';
  at: number;
}

export interface Result {
  cols: number;
  rows: number;
  participants: { seat: number; name: string }[];
  choices: { position: number; text: string; name: string }[];
  initialLines: Cell[];
  /** 送られた順。ずらされた線はずらした後の位置 */
  added: (Cell & { name: string; count: number; color: 'black' | 'red' })[];
  rungs: (Cell & { count: number; color: 'black' | 'red'; initial: boolean })[];
  /** 上の位置 → 下の位置 */
  map: number[];
}

interface State {
  id: string;
  title: string;
  rules: string;
  cols: number;
  rows: number;
  createdAt: number;
  closedAt: number | null;
  keys: Record<Role, string>;
  initialLines: Cell[];
  participants: Participant[];
  choices: Choice[];
  lines: Line[];
  result: Result | null;
}

export type Action =
  | { type: 'join'; name: string; seat: number }
  | { type: 'choice'; name: string; text: string }
  | { type: 'decide'; decision: Decision }
  | { type: 'line'; name: string; row: number; col: number }
  | { type: 'close' };

export type Outcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string; message: string };

const fail = (status: number, error: string, message: string): Outcome => ({
  ok: false,
  status,
  error,
  message,
});

export class Room extends DurableObject<unknown> {
  private state: State | null = null;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<State>('state')) ?? null;
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // ---------------------------------------------------------------- RPC

  async init(input: { id: string; title: string; rules: string; cols: number }) {
    if (this.state) throw new Error('room already exists');
    const now = Date.now();
    const state: State = {
      id: input.id,
      title: input.title,
      rules: input.rules,
      cols: input.cols,
      rows: DEFAULT_ROWS,
      createdAt: now,
      closedAt: null,
      keys: {
        host: randomId(12),
        join: randomId(12),
        choice: randomId(12),
        line: randomId(12),
      },
      initialLines: generateInitialLines(input.cols, DEFAULT_ROWS),
      participants: [],
      choices: [],
      lines: [],
      result: null,
    };
    await this.save(state);
    await this.ctx.storage.setAlarm(now + TTL_MS);
    return { id: state.id, keys: state.keys };
  }

  async view(key: string, cid: string): Promise<Outcome> {
    const s = this.state;
    if (!s) return notFound();
    const role = this.roleOf(key);
    if (!role) return notFound();
    return { ok: true, data: this.render(s, role, cid) };
  }

  async act(key: string, cid: string, action: Action): Promise<Outcome> {
    const s = this.state;
    if (!s) return notFound();
    const role = this.roleOf(key);
    if (!role) return notFound();
    if (s.closedAt !== null) {
      return fail(410, 'closed', 'このあみだくじは締め切られました');
    }
    const error = this.apply(s, role, cid, action);
    if (error) return error;
    await this.save(s);
    this.broadcast();
    return { ok: true, data: this.render(s, role, cid) };
  }

  // ---------------------------------------------------------- WebSocket

  async fetch(request: Request): Promise<Response> {
    const s = this.state;
    const role = this.roleOf(new URL(request.url).searchParams.get('k') ?? '');
    if (!s || !role) return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [role]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage() {
    // クライアントからのメッセージは ping のみ（自動応答で処理される）
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // すでに閉じている
    }
  }

  async alarm() {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1001, 'expired');
      } catch {
        // ignore
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.state = null;
  }

  // ---------------------------------------------------------- internals

  private roleOf(key: string): Role | null {
    const s = this.state;
    if (!s || !key) return null;
    for (const role of ['host', 'join', 'choice', 'line'] as const) {
      if (s.keys[role] === key) return role;
    }
    return null;
  }

  private async save(state: State) {
    this.state = state;
    await this.ctx.storage.put('state', state);
  }

  private broadcast() {
    const msg = JSON.stringify({ t: 'changed' });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        // 切断済み
      }
    }
  }

  /** 状態を変更する。エラーがあれば返す */
  private apply(s: State, role: Role, cid: string, action: Action): Outcome | null {
    switch (action.type) {
      case 'join': {
        if (role !== 'join') return forbidden();
        if (s.participants.some((p) => p.cid === cid)) {
          return fail(409, 'already_joined', 'この端末ではすでに参加しています');
        }
        if (!Number.isInteger(action.seat) || action.seat < 0 || action.seat >= s.cols) {
          return fail(400, 'bad_seat', '場所を選んでください');
        }
        if (s.participants.some((p) => p.seat === action.seat)) {
          return fail(409, 'seat_taken', '埋まっています。別の場所を選んでください');
        }
        s.participants.push({ cid, name: action.name, seat: action.seat, at: Date.now() });
        return null;
      }

      case 'choice': {
        if (role !== 'choice') return forbidden();
        if (s.choices.some((c) => c.cid === cid)) {
          return fail(409, 'already_added', 'この端末からはすでに選択肢を追加しています');
        }
        const free = range(s.cols).filter((p) => !s.choices.some((c) => c.position === p));
        if (free.length === 0) {
          return fail(409, 'choices_full', '選択肢はすでに揃いました');
        }
        const position = free[Math.floor(Math.random() * free.length)];
        s.choices.push({
          cid,
          name: action.name,
          text: action.text,
          position,
          decision: null,
          at: Date.now(),
        });
        return null;
      }

      case 'decide': {
        if (role !== 'choice') return forbidden();
        const mine = s.choices.find((c) => c.cid === cid);
        if (!mine) return fail(409, 'no_choice', '先に選択肢を追加してください');
        if (mine.decision === action.decision) return null;
        if (mine.decision) return fail(409, 'already_decided', 'すでに選んでいます');
        mine.decision = action.decision;
        return null;
      }

      case 'line': {
        if (role !== 'choice' && role !== 'line') return forbidden();
        if (role === 'choice') {
          const mine = s.choices.find((c) => c.cid === cid);
          if (mine?.decision !== 'draw') return forbidden();
        }
        if (s.lines.some((l) => l.cid === cid)) {
          return fail(409, 'line_exists', 'この端末からはすでに線を引いています');
        }
        if (!isSelectableCell(s.cols, s.rows, s.initialLines, action.row, action.col)) {
          return fail(400, 'bad_cell', 'その場所には線を引けません');
        }
        s.lines.push({
          cid,
          name: action.name,
          row: action.row,
          col: action.col,
          via: role,
          at: Date.now(),
        });
        return null;
      }

      case 'close': {
        if (role !== 'host') return forbidden();
        if (s.choices.length < s.cols) {
          return fail(409, 'not_ready', `選択肢があと${s.cols - s.choices.length}個必要です`);
        }
        s.closedAt = Date.now();
        s.result = buildResult(s);
        return null;
      }
    }
  }

  /** 役割ごとに見せてよい情報だけを返す */
  private render(s: State, role: Role, cid: string): Record<string, unknown> {
    const base = {
      role,
      id: s.id,
      title: s.title,
      cols: s.cols,
      closed: s.closedAt !== null,
      result: s.result,
    };

    switch (role) {
      case 'host': {
        const count = (d: Decision | null) => s.choices.filter((c) => c.decision === d).length;
        return {
          ...base,
          rules: s.rules,
          keys: { join: s.keys.join, choice: s.keys.choice, line: s.keys.line },
          counts: {
            participants: s.participants.length,
            choices: s.choices.length,
            drew: count('draw'),
            skipped: count('skip'),
            undecided: count(null),
            lineUrlLines: s.lines.filter((l) => l.via === 'line').length,
          },
          canClose: s.closedAt === null && s.choices.length >= s.cols,
        };
      }

      case 'join': {
        const me = s.participants.find((p) => p.cid === cid);
        return {
          ...base,
          seats: range(s.cols).map((i) => s.participants.some((p) => p.seat === i)),
          me: me ? { name: me.name, seat: me.seat } : null,
        };
      }

      case 'choice': {
        const mine = s.choices.find((c) => c.cid === cid);
        const line = s.lines.find((l) => l.cid === cid);
        return {
          ...base,
          rules: s.rules,
          rows: s.rows,
          initialLines: s.initialLines,
          choicesFull: s.choices.length >= s.cols,
          me: {
            choice: mine ? { name: mine.name, text: mine.text, position: mine.position } : null,
            decision: mine?.decision ?? null,
            line: line ? { row: line.row, col: line.col, name: line.name } : null,
          },
        };
      }

      case 'line': {
        const line = s.lines.find((l) => l.cid === cid);
        return {
          ...base,
          rows: s.rows,
          initialLines: s.initialLines,
          me: { line: line ? { row: line.row, col: line.col, name: line.name } : null },
        };
      }
    }
  }
}

function buildResult(s: State): Result {
  // s.lines は送られた順に並んでいる
  const resolved = resolveLines(
    s.cols,
    s.rows,
    s.initialLines,
    s.lines.map((l) => ({ row: l.row, col: l.col, name: l.name })),
  );
  return {
    cols: s.cols,
    rows: resolved.rows,
    participants: s.participants
      .map((p) => ({ seat: p.seat, name: p.name }))
      .sort((a, b) => a.seat - b.seat),
    choices: s.choices
      .map((c) => ({ position: c.position, text: c.text, name: c.name }))
      .sort((a, b) => a.position - b.position),
    initialLines: s.initialLines,
    added: resolved.added.map((l) => ({
      row: l.row,
      col: l.col,
      name: l.name,
      count: l.count,
      color: l.color,
    })),
    rungs: resolved.rungs,
    map: mapping(s.cols, resolved.rows, resolved.rungs),
  };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const notFound = () =>
  fail(404, 'not_found', 'あみだくじが見つかりません（URLを確認してください）');
const forbidden = () => fail(403, 'forbidden', 'このURLからはできない操作です');
