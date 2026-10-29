import { createModels } from '@earendil-works/pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { createMiningAgent } from './runtime.mjs';
import { createDifyKnowledgeTool } from './dify-knowledge.mjs';
import { createKnowledgeTool } from './knowledge-tool.mjs';

export function createConfiguredAgent({ baseUrl, env = process.env }) {
  const key = env.PI_MODEL_API_KEY?.trim();
  const id = env.PI_MODEL?.trim();
  if (!key || !id) throw Error('请在 .env 中配置 PI_MODEL_API_KEY 和 PI_MODEL（独立模型密钥）。');
  const models = createModels();
  models.setProvider(openrouterProvider());
  const model = models.getModel('openrouter', id);
  if (!model) throw Error('PI_MODEL 不在 Pi 模型目录中，请核对模型 ID。');
  return createMiningAgent({ model, streamFn: models.streamSimple.bind(models), getApiKey: async () => key, baseUrl, knowledgeTool: env.PI_KNOWLEDGE_MODE === 'local' ? createKnowledgeTool() : createDifyKnowledgeTool({ env }) });
}
