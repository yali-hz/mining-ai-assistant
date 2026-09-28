'use strict';
const express = require('express');
const { loadEnvFile } = require('node:process');
const path = require('node:path');
const { createBusinessRouter } = require('./routes/business-query');

function createApp(env = process.env, fetchImpl = fetch) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/business-query', createBusinessRouter(env, fetchImpl));
  app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }));
  app.use((err, _req, res, _next) => {
    const status = err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500;
    res.status(status).json({ success: false, error: { code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_JSON', message: status === 500 ? '服务内部错误' : '请求 JSON 无效或过大' } });
  });
  return app;
}

if (require.main === module) {
  try { loadEnvFile(path.resolve(__dirname, '../.env')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  const port = Number(process.env.BUSINESS_API_PORT || process.env.PORT || 3000);
  createApp().listen(port, '0.0.0.0', () => console.log(`Business API listening on port ${port}`));
}
module.exports = { createApp };
