# 矿业智询（Mining AI Assistant）

面向矿业、盐湖监管场景的 AI 演示助手。项目目标是让用户用自然语言查询矿山与企业信息、年度报告状态和报送规则，并在回答中区分**业务数据**、**知识材料**和**无法确认的信息**。

**H5 演示地址：** [https://mining-pi-demo.onrender.com/h5](https://mining-pi-demo.onrender.com/h5)。演示页面需要访问口令；Render 免费实例闲置后首次打开可能较慢。

## 当前链路

```text
用户 → H5 页面 → Render 上的 Node.js 服务 → Pi Agent（DeepSeek / OpenRouter）
                                          ├─ 业务查询与规则工具 → CloudBase 数据接口
                                          └─ 知识检索工具 → Dify 知识库 API
```

- **Pi Agent** 选择工具、组织多轮对话并汇总结果。当前模型由 `PI_MODEL` 配置，默认是 `deepseek/deepseek-chat`。
- **CloudBase** 提供企业、矿山、生产线和报告等演示业务数据；报告逾期判断由后端规则工具完成。
- **Dify** 在当前 Pi 链路中提供知识库检索。Top K、检索方式、rerank 和分数阈值由本服务显式传入，配置见 [Dify 检索说明](docs/dify-retrieval-config.md)。
- `app/` 与 `dify/` 仍保留早期 H5 / Dify Workflow 实现和导出文件，供对照与回归；上述公网 H5 使用 Pi Agent 链路。

业务数据和部分知识材料使用虚构演示内容，不代表真实监管结论。**没有查询记录不能认定未提交；已提交也不代表审批通过。**

## 本地运行

需要 Node.js 22.19+。复制 `.env.example` 为 `.env`，填写模型、Dify 知识库和 CloudBase 的服务端密钥；不要提交 `.env`。

```sh
npm ci
npm run agent:web
```

本地 H5 默认位于 [http://127.0.0.1:5180/h5](http://127.0.0.1:5180/h5)。运行 `npm test` 可执行自动测试；测试使用模拟上游，不能代替线上联调。

## 部署与验证

Render Web Service 使用 `deploy/pi-demo` 分支，构建命令为 `npm ci`，启动命令为 `node agent/web.mjs`。在 Render 的 **Environment** 中配置 `.env.example` 所列的必要变量及 `DEMO_PASSWORD`；更新代码后确认最新提交在 **Deploys** 中显示为 Live。

可用 [/health](https://mining-pi-demo.onrender.com/health) 查看服务状态。真实模型、知识库和业务数据的问答结果需要在 H5 中逐题核对；记录模板见 [演示评测表](docs/demo-evaluation.md)。

## 主要目录

| 目录 | 内容 |
| --- | --- |
| `agent/` | Pi Agent、Dify 检索、业务与规则工具、H5 服务 |
| `server/` | 业务 API 与 CloudBase 查询 |
| `app/` | H5 页面与早期 Dify Workflow 代理 |
| `docs/` | 配置说明、知识材料、评测表 |
| `dify/` | 历史 Workflow 导出 |
