# Knowledge Query Workflow

## 目标

处理不依赖具体实时业务数据的规则、材料、报送要求和业务概念查询。

## 链路

Question Classifier
→ Knowledge Parameter Extractor
→ Knowledge Retrieval
→ Knowledge Answer LLM
→ Code
→ End

## 参数提取

输出：

- business_object
- topic
- search_query

其中 search_query 用于对原始问题进行 Query Rewrite 后再进入 RAG 检索。

## 当前知识库

矿业智询-监管知识库

检索配置：

- Hybrid Search
- Rerank
- Top K = 4

## 已验证问题

- 储量报告啥时候交？
- 过了截止时间再补交算什么？
- 没排污证做了登记行不行？