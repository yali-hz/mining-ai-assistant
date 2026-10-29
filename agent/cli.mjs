import { loadEnvFile } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createConfiguredAgent } from './config.mjs';
import { connectBusiness } from './local-business.mjs';

try { loadEnvFile(new URL('../.env', import.meta.url)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function main() {
  const connection = await connectBusiness();
  try {
  const runtime = createConfiguredAgent({ baseUrl: connection.baseUrl });
  runtime.agent.subscribe(event => {
    if (event.type === 'tool_execution_start') console.error('正在查询报告记录…');
  });
  const question = process.argv.slice(2).join(' ');
  if (question) { console.log(await runtime.ask(question)); return; }
  const input = createInterface({ input: process.stdin, output: process.stdout });
  console.log('矿业智询 Pi 验证版；输入 /exit 退出。会话仅保留在本次进程中。');
  try {
    for (;;) {
      const value = (await input.question('你：')).trim();
      if (value === '/exit') break;
      if (!value) continue;
      try { console.log(`助手：${await runtime.ask(value)}`); }
      catch (error) { console.error(error.message); }
    }
  } finally { input.close(); }
  } finally { await connection.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
