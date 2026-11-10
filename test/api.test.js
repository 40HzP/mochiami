// Worker + Durable Object をローカルで起動して API を確かめる
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { unstable_startWorker } from 'wrangler';

/** @type {Awaited<ReturnType<typeof unstable_startWorker>>} */
let worker;

before(async () => {
  worker = await unstable_startWorker({
    config: 'wrangler.jsonc',
    dev: { server: { port: 0 }, inspector: false, persist: false, logLevel: 'error' },
  });
  await worker.ready;
});
after(async () => {
  await worker?.dispose();
});

async function call(method, path, body) {
  const res = await worker.fetch(`http://localhost${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

async function createRoom(numChoices = 3) {
  const { status, data } = await call('POST', '/api/rooms', {
    title: 'テスト',
    rules: '1つ書いてね',
    numChoices,
  });
  assert.equal(status, 201);
  const act = (type, key, cid, body = {}) =>
    call('POST', `/api/r/${data.id}/${type}`, { ...body, k: data.keys[key], cid });
  const view = (key, cid) => call('GET', `/api/r/${data.id}?k=${data.keys[key]}&cid=${cid}`);
  return { ...data, act, view };
}

const cid = (name) => `test-client-${name}-0000`;

test('作成時の入力チェック', async () => {
  assert.equal((await call('POST', '/api/rooms', { title: '', numChoices: 3 })).status, 400);
  assert.equal((await call('POST', '/api/rooms', { title: 'x', numChoices: 1 })).status, 400);
  assert.equal((await call('POST', '/api/rooms', { title: 'x', numChoices: 31 })).status, 400);
});

test('参加：埋まっている場所は選べず、1端末1人まで', async () => {
  const room = await createRoom(3);
  assert.equal((await room.act('join', 'join', cid('a'), { name: 'A', seat: 0 })).status, 200);
  const taken = await room.act('join', 'join', cid('b'), { name: 'B', seat: 0 });
  assert.equal(taken.status, 409);
  assert.equal(taken.data.error, 'seat_taken');
  const again = await room.act('join', 'join', cid('a'), { name: 'A2', seat: 1 });
  assert.equal(again.data.error, 'already_joined');

  // 参加者には名前や選択肢が見えない
  const v = await room.view('join', cid('b'));
  assert.deepEqual(v.data.seats, [true, false, false]);
  assert.equal(v.data.me, null);
  assert.ok(!JSON.stringify(v.data).includes('"A"'));
});

test('URLごとにできる操作が決まっている', async () => {
  const room = await createRoom(3);
  assert.equal((await room.act('join', 'choice', cid('a'), { name: 'A', seat: 0 })).status, 403);
  assert.equal((await room.act('choice', 'join', cid('a'), { text: 'x' })).status, 403);
  assert.equal((await room.act('close', 'join', cid('a'))).status, 403);
  assert.equal((await call('GET', `/api/r/${room.id}?k=AAAAAAAAAAAA&cid=${cid('a')}`)).status, 404);
});

test('選択肢から線まで、締めて完成するまで', async () => {
  const room = await createRoom(3);
  await room.act('join', 'join', cid('p1'), { name: 'たろう', seat: 0 });
  await room.act('join', 'join', cid('p2'), { name: 'はなこ', seat: 2 });

  // 選択肢がそろうまで締められない
  assert.equal((await room.act('close', 'host', cid('host'))).data.error, 'not_ready');

  const choices = [];
  for (const [i, text] of ['ラーメン', 'カレー', 'お寿司'].entries()) {
    const r = await room.act('choice', 'choice', cid(`c${i}`), { name: `人${i}`, text });
    assert.equal(r.status, 200);
    choices.push(r.data.me.choice.position);
  }
  assert.deepEqual([...choices].sort(), [0, 1, 2]);
  const full = await room.act('choice', 'choice', cid('c9'), { text: 'そば' });
  assert.equal(full.data.error, 'choices_full');
  assert.equal(
    (await room.act('choice', 'choice', cid('c0'), { text: '二つ目' })).data.error,
    'already_added',
  );

  // 選択肢を出した人は「線を引く」を選んでから引ける
  assert.equal((await room.act('line', 'choice', cid('c0'), { row: 0, col: 0 })).status, 403);
  await room.act('decide', 'choice', cid('c0'), { decision: 'draw' });
  await room.act('decide', 'choice', cid('c1'), { decision: 'skip' });

  const { data: lv } = await room.view('line', cid('l1'));
  const init = lv.initialLines;
  // 最初からある線と同じ高さで隣り合うマスは選べない
  const bad = init.find((l) => l.col + 1 < 2);
  if (bad) {
    const r = await room.act('line', 'line', cid('lbad'), { row: bad.row, col: bad.col + 1 });
    assert.equal(r.data.error, 'bad_cell');
  }
  // 最初からある線に被せる（2本 → 赤）
  const target = init[0];
  assert.equal((await room.act('line', 'choice', cid('c0'), target)).status, 200);
  // 同じ端末からは線追加URLでも引けない
  assert.equal(
    (await room.act('line', 'line', cid('c0'), { row: 0, col: 0 })).data.error,
    'line_exists',
  );
  // 線追加URLからも同じ場所に（3本 → 黒）
  assert.equal(
    (await room.act('line', 'line', cid('l1'), { ...target, name: 'さぶろう' })).status,
    200,
  );

  // 主催者画面の人数
  const host = (await room.view('host', cid('host'))).data;
  assert.deepEqual(host.counts, {
    participants: 2,
    choices: 3,
    drew: 1,
    skipped: 1,
    undecided: 1,
    lineUrlLines: 1,
  });
  assert.equal(host.canClose, true);

  // 他の人の線は見えない
  const other = (await room.view('line', cid('l2'))).data;
  assert.equal(other.me.line, null);
  assert.ok(!('lines' in other));

  const closed = await room.act('close', 'host', cid('host'));
  assert.equal(closed.status, 200);
  const r = closed.data.result;
  assert.deepEqual(
    r.added.map((l) => [l.row, l.col, l.count, l.color]),
    [
      [target.row, target.col, 2, 'red'],
      [target.row, target.col, 3, 'black'],
    ],
  );
  assert.equal(r.added[1].name, 'さぶろう');
  assert.equal(new Set(r.map).size, 3);
  assert.deepEqual(
    r.participants.map((p) => p.name),
    ['たろう', 'はなこ'],
  );

  // 締めた後はすべての受付が終了し、だれでも結果が見られる
  assert.equal((await room.act('join', 'join', cid('late'), { name: 'x', seat: 1 })).status, 410);
  assert.equal((await room.act('line', 'line', cid('late'), { row: 0, col: 0 })).status, 410);
  const late = (await room.view('join', cid('late'))).data;
  assert.equal(late.closed, true);
  assert.deepEqual(late.result.map, r.map);
});
