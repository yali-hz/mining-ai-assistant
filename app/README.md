# 手机端矿业智询 + Dify

保留现有原生 H5 页面，无第三方依赖，无登录。链路：页面 → 同源 POST /api/chat → 已发布的 Dify Workflow → 最终回答。

## 本地配置与启动

需要 Node.js 22 或以上（当前已使用 Node.js 24 验证）。在仓库根目录操作：

1. 首次使用复制 `.env.example` 为 `.env`；已有 `.env` 时不要覆盖。
2. 在本地编辑 `.env`，填写 Dify 应用「访问 API」页面的 Base URL 和 API Key：

```dotenv
DIFY_BASE_URL=https://api.dify.ai/v1
DIFY_API_KEY=在本地填入应用密钥
PORT=5174
```

Base URL 使用你的实际地址，通常以 `/v1` 结尾，不包含 `/workflows/run`。密钥不要发到聊天里，不要写入前端。`.env` 已被 Git 忽略，静态服务也不会提供此文件。系统环境变量优先于 `.env`，改配置后需重启服务。

3. 执行 `node app/preview.mjs`，打开 http://localhost:5174 。停止服务用 Ctrl+C。
4. 手机和电脑在同一局域网时，打开 `http://电脑局域网IP:5174`，需要防火墙允许此端口。此服务用于本地课程演示。

## Dify 应用约定

按仓库 `dify/mining-ai-assistant.yml` 对接 Workflow（不是 Chatflow）：

- POST `/workflows/run`，`inputs.query` 为问题，`response_mode` 为 `blocking`。
- 必须先发布应用；每个问题独立运行，不添加多轮会话功能。
- 读取 `data.outputs` 中非空的 `business_answer`、`policy_answer`、`material_answer`、`compliance_answer`。
- 若线上应用改了输入或输出字段，需要同步 `app/dify.mjs`。
- 后端等待最多 120 秒，前端 125 秒；不自动重试，避免重复调用。
- Dify 内部业务接口必须能从 Dify 服务访问。本地前端代理不能解决 Dify 内部接口的连通性问题。

## 本地验证

1. 点击“我们矿山的储量年报提交了吗？”：出现用户消息和“正在查询…”，最后显示 Dify 实际回答（期望“已提交。”，取决于已发布工作流和演示数据）。
2. 手动输入同样的问题，确认也能返回回答；再测试另外两个示例。
3. 加载期间重复点击不重复发送，空白输入不发送；失败后可以重新提问。
4. 未配置密钥时应显示配置提示；错误密钥应显示授权失败；不返回 Dify 原始错误或凭据。
5. 浏览器网络面板只应看到 `/api/chat` 和 `{question}`，不应有 Dify API Key。

运行自动检查：`node --test app/dify.test.mjs`。测试使用本机模拟 Dify 响应，不代表真实 Dify 已联通。

## 文件

- `preview.mjs`：读取根目录 `.env`、静态页面和 API 路由。
- `dify.mjs`：问题校验、Dify 服务端请求、输出提取、错误处理。
- `static/assistant.mjs`：调用同源代理。
- `static/chat.js`：现有消息展示、加载、防重复提交及错误提示。
- `templates/index.html`：保留结构，更新演示说明。
- `static/style.css`：未修改。
