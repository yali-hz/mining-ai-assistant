import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAgentWeb } from './web.mjs';
import { sendMessage } from '../app/static/assistant.mjs';
test('H5 assets and streaming client use Pi, display progress, and reset session', async () => {
  const server=createAgentWeb({modelName:'test',createRuntime:()=>{
    let listener;
    return {agent:{subscribe(fn){listener=fn;return()=>{};},abort(){}},async ask(){listener({type:'tool_execution_start',toolName:'search_knowledge'});return '已核验原文';}};
  }}).listen(0,'127.0.0.1');
  await once(server,'listening');
  const original=globalThis.fetch;
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.match(await (await original(base+'/h5')).text(),/矿业智询/);
    assert.equal((await original(base+'/static/chat.js')).status,200);
    globalThis.fetch=(url,options)=>original(new URL(url,base),options);
    const progress=[];
    assert.equal((await sendMessage({question:'储量年报什么时候交',onProgress:text=>progress.push(text)})).text,'已核验原文');
    assert.ok(progress.some(text=>text.includes('检索知识库')));
    assert.equal((await original(base+'/api/reset',{method:'POST'})).status,200);
  } finally {globalThis.fetch=original;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
