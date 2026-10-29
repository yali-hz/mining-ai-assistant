import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeTool } from './knowledge-tool.mjs';
test('knowledge retrieval returns original source for report deadline', async () => {
  const result = await createKnowledgeTool().execute('k', { query: '储量年报要求什么时候交' });
  assert.ok(result.details.matches.length);
  assert.ok(result.details.matches.some(doc => doc.source.includes('年度报告报送管理办法')));
  assert.ok(result.details.matches.every(doc => doc.content && doc.source.endsWith('.md')));
});
test('unmatched knowledge query does not invent evidence', async () => {
  const result = await createKnowledgeTool().execute('k', { query: 'zzzzqqqqxxxx' });
  assert.deepEqual(result.details.matches, []);
});
test('missing knowledge directory fails safely', async () => {
  await assert.rejects(createKnowledgeTool({ directory: new URL('./missing-knowledge/', import.meta.url) }).execute('k', { query: '年报' }), /无法确认/);
});
