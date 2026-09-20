const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));

const server = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/reports/status') {
    return send(404, { error: '接口不存在' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(405, { error: '仅支持 GET 请求' });
  }

  const params = url.searchParams;
  const keys = ['mine_id', 'year', 'report_type'];
  if (keys.some((key) => params.getAll(key).length !== 1 || !params.get(key).trim())) {
    return send(400, { error: 'mine_id、year、report_type 均必填且不能重复' });
  }
  const mineId = params.get('mine_id').trim();
  const year = params.get('year').trim();
  const reportType = params.get('report_type').trim();
  if (!/^[1-9]\d{3}$/.test(year)) {
    return send(400, { error: 'year 必须为四位正整数，如 2026' });
  }

  const report = data.reports.find((item) =>
    item.mine_id === mineId && item.year === Number(year) && item.report_type === reportType
  );
  if (!report) {
    return send(404, { mock: true, error: '未找到匹配的报告记录，不能据此判断为未提交' });
  }
  return send(200, { mock: true, ...report });
});

server.on('error', (error) => {
  console.error(`Mock API 启动或运行失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(3000, '127.0.0.1', () => {
  console.log('Mock API: http://127.0.0.1:3000/reports/status');
});
