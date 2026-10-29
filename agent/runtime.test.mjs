import test from 'node:test';
import assert from 'node:assert/strict';
import { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { createMiningAgent, isToolInstruction } from './runtime.mjs';
import { createReportTool } from './report-tool.mjs';

const args = { entity_type: 'mine', entity_keyword: '察尔汗一号盐湖', year: 2024, report_type_name: '储量年报' };
test('textual tool calls never reach the user or remain in conversation as results', async () => {
  for (const text of [
    '!\nfunction!\ncall:{"call":"query_relations","arguments":{"entity_type":"mine","entity_keyword":"察尔汗一号盐湖矿山","target_type":"production_line","query_intent":"count"}}',
    '```json\n{"name":"query_entity","arguments":{"entity_keyword":"甲矿"}}\n```',
    '{"tool_calls":[{"function":{"name":"search_knowledge","arguments":"{}"}}]}',
  ]) {
    let count = 0;
    const runtime = setup([fauxAssistantMessage(text)], async () => { count++; throw Error('should not execute'); });
    const answer = await runtime.ask('有哪些生产线，共几条？');
    assert.match(answer, /未成功完成/);
    assert.doesNotMatch(answer, /function|arguments|query_|tool_calls/);
    assert.equal(runtime.agent.state.messages.at(-1).content[0].text, answer);
    assert.equal(count, 0);
  }
});
test('ordinary answers and grounded quote payloads are not tool instructions', () => {
  for (const text of ['查询失败，暂时无法判断。', '共3条生产线。', '{"status":"supported","quotes":[{"source":"规则.md","text":"截止日期"}]}']) {
    assert.equal(isToolInstruction(text), false);
  }
});
test('model JSON without current retrieval never leaks or becomes trusted citation', async () => {
  const runtime=setup([fauxAssistantMessage('{"status":"supported","quotes":[{"source":"rules.md","text":"未经检索的编造材料清单"}]}')]);
  const answer=await runtime.ask('储量年报最晚什么时候交？请给出原文依据。');
  assert.match(answer,/不足|无法/);
  assert.doesNotMatch(answer,/quotes|supported|rules.md|编造材料/);
});
const call = () => fauxAssistantMessage([fauxToolCall('query_report_status', args)], { stopReason: 'toolUse' });
function setup(responses, fetchImpl) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(responses);
  return createMiningAgent({ model: faux.getModel(), streamFn: models.streamSimple.bind(models), baseUrl: 'http://127.0.0.1:3000', fetchImpl });
}

test('Pi executes business tool and passes evidence back to model', async () => {
  let count = 0;
  const runtime = setup([call(), context => {
    const result = context.messages.find(m => m.role === 'toolResult');
    assert.equal(result.isError, false);
    const evidence = JSON.parse(result.content[0].text);
    assert.equal(evidence.data.record_found, true);
    assert.equal(evidence.data.is_overdue, false);
    return fauxAssistantMessage('2024 年储量年报已按时提交。');
  }], async (url, options) => {
    count++;
    assert.equal(url.pathname, '/api/business-query');
    assert.deepEqual(JSON.parse(options.body), { ...args, resource_type: 'report', query_intent: 'status', requested_field: 'status' });
    return Response.json({ success: true, entity: { name: args.entity_keyword }, data: { record_found: true, is_overdue: false } });
  });
  assert.equal(await runtime.ask('察尔汗一号盐湖2024年储量年报交了吗'), '2024 年储量年报已按时提交。');
  assert.equal(count, 1);
});

test('no record remains unknown evidence', async () => {
  const tool = createReportTool({ baseUrl: 'http://localhost:3000', fetchImpl: async () => Response.json({ success: true, entity: {}, data: { record_found: false, status: 'unknown' } }) });
  const result = await tool.execute('test', args);
  assert.equal(result.details.data.record_found, false);
  assert.equal(result.details.data.status, 'unknown');
});

test('service failures never become missing records or expose upstream details', async () => {
  for (const fetchImpl of [async () => { throw Error('secret-token'); }, async () => Response.json({ success: false, error: { message: 'secret-token' } }, { status: 500 })]) {
    const tool = createReportTool({ baseUrl: 'http://localhost:3000', fetchImpl });
    await assert.rejects(tool.execute('test', args), error => !error.message.includes('secret-token') && error.message.includes('无法判断'));
  }
});

test('tool errors are returned through real Pi loop', async () => {
  const runtime = setup([call(), context => {
    assert.equal(context.messages.find(m => m.role === 'toolResult').isError, true);
    return fauxAssistantMessage('查询失败，暂时无法判断。');
  }], async () => { throw Error('offline'); });
  assert.equal(await runtime.ask('查询报告'), '查询失败，暂时无法判断。');
});

test('repeated tool requests are capped', async () => {
  let count = 0;
  const runtime = setup(Array.from({ length: 8 }, call), async () => {
    count++;
    return Response.json({ success: true, entity: {}, data: { record_found: false } });
  });
  await assert.rejects(runtime.ask('查询报告'), /上限/);
  assert.equal(count, 4);
});

test('reject insecure remote service URLs', () => {
  assert.throws(() => createReportTool({ baseUrl: 'http://example.com' }), /HTTPS/);
});

test('Pi rejects missing required tool arguments before calling business API', async () => {
  let count = 0;
  const runtime = setup([
    fauxAssistantMessage([fauxToolCall('query_report_status', { entity_type: 'mine' })], { stopReason: 'toolUse' }),
    context => {
      assert.equal(context.messages.find(m => m.role === 'toolResult').isError, true);
      return fauxAssistantMessage('请补充矿山名称、年度和报告类型。');
    },
  ], async () => { count++; throw Error('should not execute'); });
  assert.match(await runtime.ask('年报交了吗'), /补充/);
  assert.equal(count, 0);
});

test('follow-up retains prior conversation in the model context', async () => {
  const runtime = setup([
    fauxAssistantMessage('请补充年度。'),
    context => {
      const users = context.messages.filter(m => m.role === 'user');
      assert.equal(users.length, 2);
      const text = message => typeof message.content === 'string' ? message.content : message.content.filter(c => c.type === 'text').map(c => c.text).join('');
      assert.equal(text(users[0]), '查询甲矿储量年报');
      assert.equal(text(users[1]), '2024年');
      return fauxAssistantMessage('已收到年度。');
    },
  ]);
  await runtime.ask('查询甲矿储量年报');
  assert.equal(await runtime.ask('2024年'), '已收到年度。');
});
