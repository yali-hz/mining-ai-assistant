import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAgentWeb } from './web.mjs';

test('Pi page streams tools and keeps isolated conversations', async t => {
  const histories = [];
  let time = Date.now();
  const app = createAgentWeb({ modelName: 'test-model', now: () => time, createRuntime: () => {
    const history = []; histories.push(history); let listener;
    return { agent: { subscribe(fn) { listener = fn; return () => { listener = null; }; }, abort() {} },
      async ask(question) {
        history.push(question);
        listener?.({ type: 'tool_execution_start', toolName: 'query_report_status' });
        listener?.({ type: 'tool_execution_end', toolName: 'query_report_status', isError: false });
        return `第${history.length}轮：${question}`;
      } };
  } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, cookie, path = '/api/chat', extra = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: JSON.stringify(body) });

  await t.test('page assets and metadata', async () => {
    assert.match(await (await fetch(base)).text(), /Pi Agent/);
    assert.equal((await fetch(`${base}/chat.mjs`)).status, 200);
    assert.equal((await (await fetch(`${base}/api/info`)).json()).model, 'test-model');
  });
  let cookie;
  await t.test('tool events and answer are streamed without raw arguments', async () => {
    const response = await post({ question: '查询2024年' });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0];
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(e => e.type), ['tool', 'tool', 'answer']);
    assert.equal(events[0].status, 'running'); assert.equal(events[1].status, 'done');
    assert.equal(events[2].text, '第1轮：查询2024年');
    assert.equal(events[0].args, undefined);
  });
  await t.test('follow-up reuses session; another visitor has independent context', async () => {
    const followup = await post({ question: '那2030年呢' }, cookie);
    assert.match(await followup.text(), /第2轮/);
    const other = await post({ question: '新用户问题' });
    assert.match(await other.text(), /第1轮/);
    assert.deepEqual(histories[0], ['查询2024年', '那2030年呢']);
  });
  await t.test('input validation and cross-origin rejection', async () => {
    assert.equal((await post({ question: ' ' }, cookie)).status, 400);
    assert.equal((await post({ question: 'x'.repeat(1001) }, cookie)).status, 400);
    assert.equal((await post({ question: '查询' }, cookie, '/api/chat', { Origin: 'https://example.com' })).status, 403);
  });
  await t.test('reset clears the conversation cookie', async () => {
    const response = await post({}, cookie, '/api/reset');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    assert.equal((await post({ question: '旧会话' }, cookie)).status, 409);
  });
  await t.test('expired conversation requires explicit new conversation', async () => {
    const response = await post({ question: '新问题' });
    const fresh = response.headers.get('set-cookie').split(';')[0]; await response.text();
    time += 31 * 60_000;
    assert.equal((await post({ question: '追问' }, fresh)).status, 409);
  });
});
