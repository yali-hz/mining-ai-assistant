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
    // 与 dify.mjs 的 PREFERRED_FIELDS 保持同一优先级顺序
    const fields = ['text', 'result', 'output', 'answer1', 'answer2', 'answer',
      'business_answer', 'policy_answer', 'material_answer', 'compliance_answer'];
    for (const field of fields) {
      reply = { data: { status: 'succeeded', outputs: { [field]: '已提交。' } } };
      assert.deepEqual(await request({ question: '我们矿山的储量年报提交了吗？' }), { status: 200, body: { text: '已提交。' } });
    }
    assert.equal(received.url, '/v1/workflows/run');
    assert.equal(received.auth, 'Bearer test-secret-never-return');
    assert.equal(received.body.inputs.query, '我们矿山的储量年报提交了吗？');
    assert.equal(received.body.response_mode, 'blocking');
    for (let index = 0; index < fields.length; index++) {
      const outputs = Object.fromEntries([...fields].reverse().map(field => [field, `回答：${field}`]));
      for (let earlier = 0; earlier < index; earlier++) outputs[fields[earlier]] = ' \n\t ';
      reply = { data: { status: 'succeeded', outputs } };
      assert.deepEqual(await request({ question: '问题' }), {
        status: 200, body: { text: `回答：${fields[index]}` },
      });
    }
    // 真实 DSL 的 9 个 End 节点字段必须全部能出文（含补全引导/风险/报错/证照）
    const realEndFields = {
      answer1: '【知识库】煤系地层……', answer2: '察尔汗一号盐湖矿山的面积是 126.8 平方公里。',
      answer3: '参数有误，请补充矿山名称后重试。', answer5: '业务数据服务暂时不可用，请稍后再试。',
      answer8: '系统目前没有风险评级类数据，但可以帮您逐项核查……', answer9: '该报告已逾期未提交。',
      answer10: '采矿许可证有效期至 2027-05-31，还剩 218 天。',
      answer11: '这句还缺矿山名称，我没法直接查证照。', answer12: '这句还缺矿山或生产线名称，我没法直接查。',
    };
    for (const [field, expected] of Object.entries(realEndFields)) {
      reply = { data: { status: 'succeeded', outputs: { [field]: expected } } };
      assert.deepEqual(await request({ question: '问题' }), { status: 200, body: { text: expected } }, `字段 ${field} 应能出文`);
    }
    // 新增 End 节点用未见过的新字段名也必须兜底出文
    reply = { data: { status: 'succeeded', outputs: { some_new_field: '新字段回答' } } };
    assert.deepEqual(await request({ question: '问题' }), { status: 200, body: { text: '新字段回答' } });
    // 非字符串（含数组/对象）一律不算有效回答，但要能跳到下一个有效字符串
    reply = { data: { status: 'succeeded', outputs: { answer11: ['数组不算'], answer12: { a: 1 } } } };
    assert.equal((await request({ question: '问题' })).status, 502);
    reply = { data: { status: 'succeeded', outputs: { answer11: ['数组不算'], answer12: '补全引导文案' } } };
    assert.deepEqual(await request({ question: '问题' }), { status: 200, body: { text: '补全引导文案' } });
    for (const invalid of [null, false, 123, {}, [], '', ' \n\t ']) {
      reply = { data: { status: 'succeeded', outputs: { answer: invalid, answer1: invalid, answer2: '有效回答' } } };
      assert.deepEqual(await request({ question: '问题' }), { status: 200, body: { text: '有效回答' } });
      reply = { data: { status: 'succeeded', outputs: Object.fromEntries(fields.map(field => [field, invalid])) } };
      const empty = await request({ question: '问题' });
      assert.equal(empty.status, 502);
      assert.match(empty.body.error, /未返回有效回答/);
    }
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
