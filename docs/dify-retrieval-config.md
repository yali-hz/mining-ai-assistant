# Pi 的 Dify 检索配置

在本地 .env 或 Render Environment 中设置以下变量，重新启动/部署后生效。程序将它们作为 retrieval_model 明确传给知识库 retrieve API，覆盖默认检索选择；不经过 Dify 应用或工作流节点。

|环境变量|默认值|含义|
|---|---|---|
|DIFY_RETRIEVAL_TOP_K|6|请求的返回片段数，整数1–100；实际可少于此值|
|DIFY_RETRIEVAL_METHOD|semantic_search|semantic_search 语义、full_text_search 全文、hybrid_search 混合|
|DIFY_RERANK_ENABLED|false|是否启用重排序，仅接受true/false|
|DIFY_RERANK_PROVIDER|空|Dify 已配置的重排序提供方标识，启用时必填|
|DIFY_RERANK_MODEL|空|该提供方中的重排序模型标识，启用时必填|
|DIFY_RETRIEVAL_SCORE_THRESHOLD_ENABLED|false|是否按分数阈值过滤|
|DIFY_RETRIEVAL_SCORE_THRESHOLD|0.5|0–1之间；仅在过滤开启时生效|

模型标识必须从你的 Dify 模型配置中获取，不是 Pi 对话模型 PI_MODEL。提供方的模型凭据在 Dify 中配置。知识库必须支持所选检索方式；当前程序的混合检索只支持 rerank，不提供权重融合配置，混合且关闭 rerank 会拒绝启动。

默认值是可重复评测的起点，不是性能最优配置。更换检索方式或 rerank 模型后，需要重新评测阈值。未开启 rerank 时不发送 reranking_model，避免发送无效模型标识。

程序不再截取前6条，也不二次排序、二次过滤。数量、顺序及过滤交给 Dify 处理，保留接口返回片段。知识回答仍须通过原文引用校验。

示例：Top K 改为4，只修改 DIFY_RETRIEVAL_TOP_K=4；改为10则设置10，不再受本地6条限制。开启阈值需同时设置 DIFY_RETRIEVAL_SCORE_THRESHOLD_ENABLED=true 和目标阈值。

发布后用相同问题核对 Dify 检索日志/返回结果和答案质量。本地请求契约测试验证传参、配置校验和10条结果不截断，不替代线上 Dify 模型可用性验证。
