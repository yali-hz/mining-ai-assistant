# 主 Workflow v1

- 当前主 Workflow 包含 4 个分类分支：`policy_query`、`material_query`、`business_status_query`、`compliance_judgement`。
- 4 条核心 Eval 已能正确路由（根据用户在 Dify 中的测试结果）。
- 当前分支输出仍存在幻觉，尚未接入 RAG / Tool / Rule。
- 下一步接入 RAG，为政策 / 材料问答提供知识依据，解决 grounding 问题。
