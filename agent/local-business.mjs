import { once } from 'node:events';
import business from '../server/app.js';

export async function connectBusiness(env = process.env) {
  const configured = env.PI_BUSINESS_BASE_URL || 'http://127.0.0.1:3000';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(configured).hostname);
  if (!local || env.PI_BUSINESS_MODE === 'http') return { baseUrl: configured, close: async () => {} };
  const server = business.createApp(env).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
