# 矿业智询（Mining AI Assistant）

面向矿业 / 盐湖监管场景的 AI 查询助手。当前完成 Dify V2 单轮问答验证，下一阶段接入 Pi Agent。

[公网演示入口](https://mining-ai-assistant.onrender.com/)（当前线上版本及 H5 全链路尚需单独验证）。

## 当前进展

| 能力 | 当前状态 |
| --- | --- |
| 知识问答 | Dify 知识检索与基于材料的回答；无足够依据时明确说明 |
| 业务查询 | 企业、矿山、生产线的基础信息、关系及指定年度报告状态 |
| 规则判断 | 报告逾期、逾期补交与采矿许可证临期判断；缺记录时不能认定未提交或存在风险 |
| H5 页面 | 原生移动端聊天页面、加载与错误提示；代理兼容 answer1～answer30 及其他非空字符串输出 |
| 多轮与组合任务 | 尚未实现，计划由 Pi 负责追问、上下文和工具组合 |

业务数据为虚构演示数据，知识材料包含虚拟测试规则，不代表真实监管要求；提交不等于审批通过，局部检查不等于整体合规。

2026-10-26，维护者反馈代表问题在 Dify 内重新实测通过，决定冻结该阶段的功能范围。这不等于 H5 或已发布 API 完成端到端验收，也不覆盖全部异常边界。

## 当前架构

- H5 → Node.js 页面与代理服务 → 已发布 Dify Workflow。
- Dify 知识分支 → 知识库检索 → 回答。
- Dify 业务 / 规则分支 → `POST /api/business-query` → CloudBase PostgREST → 事实或规则回答。
- 页面代理和业务 API 是两个独立服务；Dify 云端需要可访问的业务 API 地址。

当前每次问题独立执行，采用 blocking 响应，无持久多轮会话。

## 工作流版本说明

`dify/` 中保留早期导出：`mining-ai-assistant.yml`、`workflow-v1.yml` 及多个 V2 文件。这些历史文件不应直接视为已经实测通过的最终版。

最终基线应从 Dify 中测试通过且已发布的应用导出后归档。导出文件不包含知识库文档本体，复现时仍需配置知识库、模型供应商和业务 API。最终基线已归档为 [dify-v2-baseline-2026-10-26.yml](dify/dify-v2-baseline-2026-10-26.yml)，历史文件保留供对照。

知识材料位于 `docs/knowledge-base/sources/`。旧架构文档和接口说明可能落后于实现，请结合当前代码核对。

## 本地运行

需要 Node.js 22+。

```sh
npm ci
```

首次将 `.env.example` 复制为 `.env`，已有配置不要覆盖。配置仅保存在服务端，不提交密钥。

```dotenv
DIFY_BASE_URL=https://api.dify.ai/v1
DIFY_API_KEY=YOUR_DIFY_APP_API_KEY
PORT=5174
BUSINESS_API_PORT=3000
CLOUDBASE_BASE_URL=https://YOUR_ENV_ID.api.tcloudbasegateway.com/v1/rdb/rest
CLOUDBASE_TOKEN=YOUR_CLOUDBASE_TOKEN
```

Dify Base URL 不包含 `/workflows/run`。在两个终端分别启动：

```sh
npm run preview
```

H5 默认按示例配置访问 http://localhost:5174 。

```sh
npm start
```

业务 API 按示例配置监听 3000 端口，健康检查为 `/health`。业务端口优先级：`BUSINESS_API_PORT` → `PORT` → `3000`。部署平台提供 PORT 时，不要再设置 BUSINESS_API_PORT。

## 验证

```sh
npm test
```

自动测试使用本地模拟上游，不代表 Dify / CloudBase 云端连通。H5 代理测试覆盖多分支输出、参数校验和安全错误提示。业务测试需结合当前接口实现检查结果。

Dify 代表问题：

1. 储量年报什么时候交？
2. 察尔汗一号盐湖矿山2024年储量年报提交了吗？
3. 察尔汗一号盐湖矿山2024年储量年报逾期了吗？
4. 察尔汗一号盐湖矿山的采矿证快到期了吗？
5. 察尔汗一号盐湖矿山2030年储量年报提交了吗？
6. 采矿证快到期了吗？

预期：依据实际查询结果回答；无记录不能认定未提交；缺名称应提示补充。逾期补交、无效日期等边界需准备对应数据独立验证。编辑器测试通过后须发布，外部 API 才会使用更新版本。

## 部署

- H5 / 代理：启动 `node app/preview.mjs`，配置 Dify 环境变量。
- 业务 API：仓库 `render.yaml` 描述独立 Render 服务，安装 `npm ci`，启动 `node server/app.js`，配置 CloudBase 环境变量。
- 密钥不得放入前端或上传 `.env`。真实数据接入前需补充用户鉴权与数据权限。

## Pi Agent 升级方向

已确定采用：Pi 分别调用业务 API、知识检索和确定性规则工具。Pi 负责多轮追问、任务拆解、工具选择与汇总；Dify 知识库继续复用，规则逐步整理为后端工具。

完整 Dify Workflow 保留为演示和回归对照，暂停新增复杂分支；影响正确性的错误仍修复。Pi 尚未接入，不将规划描述为已上线能力。

## 目录

- `app/`：H5、页面服务、Dify 代理与测试。
- `server/`：Express 业务 API 与测试。
- `data/`：虚构演示数据 CSV。
- `dify/`：历史工作流导出。
- `docs/`：接口说明、知识材料及历史设计文档。
- `mock-api/`：早期独立 Mock，非当前业务查询主链路。
