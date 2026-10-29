// Opt-in live acceptance test. Uses the running local Pi page and paid model.
import assert from 'node:assert/strict';
const base = process.env.PI_CHECK_WEB_URL || 'http://127.0.0.1:5180';
let cookie;
async function ask(question) {
  const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ question }), signal: AbortSignal.timeout(110_000) });
  assert.equal(response.status, 200, '网页请求失败');
  cookie ||= response.headers.get('set-cookie')?.split(';')[0];
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  const answer = events.find(e => e.type === 'answer')?.text;
  assert.ok(answer, '未收到最终回答');
  const tools = events.filter(e => e.type === 'tool' && e.status === 'running');
  assert.ok(!events.some(e => e.type === 'error' || e.status === 'error'), '查询发生错误');
  console.log('问题：', question); console.log('工具调用次数：', tools.length); console.log('回答：', answer);
  return { answer, tools };
}
try {
  const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const incomplete = await ask('察尔汗一号盐湖矿山储量年报提交了吗？');
  assert.equal(incomplete.tools.length, 0, '缺年度时不应自行查询');
  assert.match(incomplete.answer, /年度|哪一年|年份|哪年/);
  const complete = await ask('2024年');
  assert.ok(complete.tools.length > 0, '补齐年度后应调用工具');
  const unknown = await ask('那2030年的呢？');
  assert.ok(unknown.tools.length > 0, '未来年度仍应查询');
  assert.match(unknown.answer, /无法|不能|不代表|不足|未知/);
  console.log('网页真实联调通过：补问、工具查询、连续追问。');
} catch { console.error('网页联调未通过，请根据上方最后一条回答定位问题。'); process.exitCode = 1; }
finally {
  if (cookie) await fetch(`${base}/api/reset`, { method: 'POST', headers: { Cookie: cookie }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}
