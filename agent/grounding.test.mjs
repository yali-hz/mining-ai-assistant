import test from 'node:test';
import assert from 'node:assert/strict';
import { groundKnowledgeAnswer, INSUFFICIENT, isKnowledgePayload } from './grounding.mjs';
test('internal knowledge payloads are detected even without a tool call', () => {
  assert.equal(isKnowledgePayload('{"status":"supported","quotes":[]}'),true);
  assert.equal(isKnowledgePayload('```json\n{"status":"insufficient","quotes":[]}\n```'),true);
  assert.equal(isKnowledgePayload('储量年报应于次年3月31日前报送。'),false);
});
const text = '储量年报应于次年3月31日前完成报送。';
const evidence = [{ matches: [{ source: 'rules.md', content: text }] }];
test('leading deadline question uses explicit retrieved rule despite model refusal', () => {
  assert.match(groundKnowledgeAnswer('{"status":"insufficient","quotes":[]}', evidence, '储量年报是六月交吧？'), /次年3月31日/);
});
test('deadline recovery cannot answer materials, another report, or conflicting evidence', () => {
  for (const question of ['储量年报六月交要准备哪些材料？', '卤水监测年报是六月交吧？', '储量年报最新规定什么时候交？']) assert.equal(groundKnowledgeAnswer('{}',evidence,question),INSUFFICIENT);
  const conflict=[...evidence,{matches:[{source:'other.md',content:'储量年报应于次年6月30日前完成报送。'}]}];
  assert.equal(groundKnowledgeAnswer('{}',conflict,'储量年报是六月交吧？'),INSUFFICIENT);
});
test('verbatim evidence is rendered with source, extra model prose is discarded', () => {
  const answer = groundKnowledgeAnswer(JSON.stringify({status:'supported', quotes:[{source:'rules.md', text}], extra:'还需要地质报告'}), evidence);
  assert.ok(answer.includes(text)); assert.ok(answer.includes('rules.md')); assert.ok(!answer.includes('地质报告'));
});
test('fabricated materials with a real filename are rejected', () => {
  assert.equal(groundKnowledgeAnswer(JSON.stringify({status:'supported',quotes:[{source:'rules.md',text:'需要地质报告、勘探数据和资源储量估算方法。'}]}),evidence), INSUFFICIENT);
});
test('missing source, free prose, no evidence and insufficient evidence fail closed', () => {
  for(const value of ['需要地质报告', '{"status":"insufficient","quotes":[]}', JSON.stringify({status:'supported',quotes:[{source:'invented.md',text}]})]) assert.equal(groundKnowledgeAnswer(value,evidence), INSUFFICIENT);
  assert.equal(groundKnowledgeAnswer(JSON.stringify({status:'supported',quotes:[{source:'rules.md',text}]}),[]), INSUFFICIENT);
});
