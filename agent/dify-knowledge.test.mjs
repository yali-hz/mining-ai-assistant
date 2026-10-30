import test from 'node:test';
import assert from 'node:assert/strict';
import { createDifyKnowledgeTool, retrievalConfig } from './dify-knowledge.mjs';
const env = { DIFY_BASE_URL:'https://example.com/v1', DIFY_DATASET_ID:'demo', DIFY_KNOWLEDGE_API_KEY:'test-secret' };
test('Dify retrieval preserves source text and uses separate knowledge credential', async () => {
  const tool=createDifyKnowledgeTool({ env, fetchImpl: async (url, options) => {
    assert.equal(url.pathname,'/v1/datasets/demo/retrieve');
    assert.equal(options.headers.Authorization,'Bearer test-secret');
    assert.deepEqual(JSON.parse(options.body),{query:'储量年报', retrieval_model: {search_method:'semantic_search',top_k:6,reranking_enable:false,score_threshold_enabled:false,score_threshold:0.5}});
    return Response.json({records:[{segment:{id:'s',content:'原文',document:{name:'规则.md'}}}]});
  }});
  const result=await tool.execute('k',{query:'储量年报'});
  assert.equal(result.details.matches[0].content,'原文');
  assert.equal(result.details.matches[0].source,'规则.md');
});
test('custom retrieval settings reach Dify and results are not silently truncated', async () => {
  const custom = {...env,DIFY_RETRIEVAL_TOP_K:'10',DIFY_RETRIEVAL_METHOD:'hybrid_search',DIFY_RERANK_ENABLED:'true',DIFY_RERANK_PROVIDER:'provider',DIFY_RERANK_MODEL:'model',DIFY_RETRIEVAL_SCORE_THRESHOLD_ENABLED:'true',DIFY_RETRIEVAL_SCORE_THRESHOLD:'0.7'};
  const result = await createDifyKnowledgeTool({env:custom,fetchImpl:async(_url,options)=>{
    assert.deepEqual(JSON.parse(options.body).retrieval_model,{search_method:'hybrid_search',top_k:10,reranking_enable:true,reranking_model:{reranking_provider_name:'provider',reranking_model_name:'model'},score_threshold_enabled:true,score_threshold:0.7});
    return Response.json({records:Array.from({length:10},(_,i)=>({segment:{id:String(i),content:'原文',document:{name:'规则.md'}}}))});
  }}).execute('k',{query:'材料'});
  assert.equal(result.details.matches.length,10);
});
test('invalid retrieval settings fail before any requests',()=>{
  for(const settings of [{DIFY_RETRIEVAL_TOP_K:'0'},{DIFY_RETRIEVAL_TOP_K:'1.5'},{DIFY_RETRIEVAL_SCORE_THRESHOLD:'NaN'},{DIFY_RETRIEVAL_SCORE_THRESHOLD:'1.1'},{DIFY_RETRIEVAL_METHOD:'unknown'},{DIFY_RERANK_ENABLED:'yes'},{DIFY_RERANK_ENABLED:'true'},{DIFY_RETRIEVAL_METHOD:'hybrid_search'}]) assert.throws(()=>retrievalConfig(settings));
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
