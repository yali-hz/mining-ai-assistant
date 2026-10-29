// Explicit live check: real CloudBase + real model; never prints credentials.
import { loadEnvFile } from 'node:process';
import { once } from 'node:events';
import { createModels } from '@earendil-works/pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import business from '../server/app.js';
import { createMiningAgent } from './runtime.mjs';

try { loadEnvFile(new URL('../.env', import.meta.url)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function main() {
  const server = business.createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/business-query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'mine', entity_keyword: '察尔汗一号盐湖矿山', resource_type: 'report', query_intent: 'status', requested_field: 'status', year: 2024, report_type_name: '储量年报' }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json();
    console.log('业务查询：', response.status, result.success ? JSON.stringify(result.data) : result.error?.code);
    if (!response.ok || !result.success) { process.exitCode = 1; return; }
    const models = createModels();
    models.setProvider(openrouterProvider());
    const model = models.getModel('openrouter', process.env.PI_MODEL);
    if (!model || !process.env.PI_MODEL_API_KEY) throw Error('模型配置不完整');
    const runtime = createMiningAgent({ model, streamFn: models.streamSimple.bind(models), baseUrl, getApiKey: async () => process.env.PI_MODEL_API_KEY });
    let calls = 0;
    runtime.agent.subscribe(event => {
      if (event.type === 'tool_execution_start') { calls++; console.log('调用工具：', event.toolName); }
    });
    for (const question of ['察尔汗一号盐湖矿山2024年储量年报提交了吗？', '那2030年的呢？']) {
      console.log('问题：', question);
      const before = calls;
      console.log('回答：', await runtime.ask(question));
      if (calls === before) throw Error('模型没有执行必要的查询工具');
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error('联调未完成：', error.cause?.code || (error.message.includes('模型') ? error.message : '连接失败或响应异常')); process.exitCode = 1; });
