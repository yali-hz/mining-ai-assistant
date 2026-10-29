import test from 'node:test';
import assert from 'node:assert/strict';
import { createDifyKnowledgeTool } from './dify-knowledge.mjs';
const env = { DIFY_BASE_URL:'https://example.com/v1', DIFY_DATASET_ID:'demo', DIFY_KNOWLEDGE_API_KEY:'test-secret' };
test('Dify retrieval preserves source text and uses separate knowledge credential', async () => {
  const tool=createDifyKnowledgeTool({ env, fetchImpl: async (url, options) => {
    assert.equal(url.pathname,'/v1/datasets/demo/retrieve');
    assert.equal(options.headers.Authorization,'Bearer test-secret');
    assert.deepEqual(JSON.parse(options.body),{query:'储量年报'});
    return Response.json({records:[{segment:{id:'s',content:'原文',document:{name:'规则.md'}}}]});
  }});
  const result=await tool.execute('k',{query:'储量年报'});
  assert.equal(result.details.matches[0].content,'原文');
  assert.equal(result.details.matches[0].source,'规则.md');
});
test('missing configuration, failed upstream and malformed source do not fall back', async () => {
  await assert.rejects(createDifyKnowledgeTool({env:{}}).execute('k',{query:'年报'}),/尚未配置/);
  for(const response of [Response.json({}, {status:401}),Response.json({records:[{segment:{content:'text'}}]})]) {
    await assert.rejects(createDifyKnowledgeTool({env,fetchImpl:async()=>response}).execute('k',{query:'年报'}),e=>!e.message.includes('test-secret') && /失败/.test(e.message));
  }
});
test('no retrieval hits remain empty evidence',async()=>{
  const result=await createDifyKnowledgeTool({env,fetchImpl:async()=>Response.json({records:[]})}).execute('k',{query:'未知'});
  assert.deepEqual(result.details.matches,[]);
});
