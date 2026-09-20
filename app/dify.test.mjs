import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { handleChat } from './dify.mjs';

test('proxy contract, validation, output branches and safe failures', async () => {
  let reply = { data: { status: 'succeeded', outputs: { business_answer: '已提交。' } } };
  let status = 200;
  let received;
  const upstream = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply));
  });
  const proxy = http.createServer(handleChat);
  upstream.listen(0, '127.0.0.1');
  proxy.listen(0, '127.0.0.1');
  await Promise.all([once(upstream, 'listening'), once(proxy, 'listening')]);
  const saved = { base: process.env.DIFY_BASE_URL, key: process.env.DIFY_API_KEY };
  const request = async (body) => {
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    delete process.env.DIFY_API_KEY;
    assert.equal((await request({ question: '问题' })).status, 503);
    process.env.DIFY_API_KEY = 'test-secret-never-return';
    process.env.DIFY_BASE_URL = `http://127.0.0.1:${upstream.address().port}/v1/`;
    assert.equal((await request({ question: ' ' })).status, 400);
    assert.equal((await request({ question: '字'.repeat(1001) })).status, 400);
    for (const field of ['business_answer', 'policy_answer', 'material_answer', 'compliance_answer']) {
      reply = { data: { status: 'succeeded', outputs: { [field]: '已提交。' } } };
      assert.deepEqual(await request({ question: '我们矿山的储量年报提交了吗？' }), { status: 200, body: { text: '已提交。' } });
    }
    assert.equal(received.url, '/v1/workflows/run');
    assert.equal(received.auth, 'Bearer test-secret-never-return');
    assert.equal(received.body.inputs.query, '我们矿山的储量年报提交了吗？');
    assert.equal(received.body.response_mode, 'blocking');
    reply = { data: { status: 'failed', error: 'test-secret-never-return' } };
    assert.equal((await request({ question: '问题' })).status, 502);
    reply = { data: { status: 'succeeded', outputs: {} } };
    assert.equal((await request({ question: '问题' })).status, 502);
    status = 401;
    reply = { error: 'test-secret-never-return' };
    const failure = await request({ question: '问题' });
    assert.equal(failure.status, 502);
    assert.match(failure.body.error, /授权失败/);
    assert.ok(!JSON.stringify(failure).includes('test-secret-never-return'));
    status = 429;
    assert.match((await request({ question: '问题' })).body.error, /繁忙/);
  } finally {
    if (saved.base === undefined) delete process.env.DIFY_BASE_URL; else process.env.DIFY_BASE_URL = saved.base;
    if (saved.key === undefined) delete process.env.DIFY_API_KEY; else process.env.DIFY_API_KEY = saved.key;
    proxy.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
  }
});
