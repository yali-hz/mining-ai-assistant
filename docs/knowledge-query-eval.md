Knowledge Query Eval

Bad Case 01：规则问法误分类

问题：
过了截止时间再补交算什么？

原结果：
compliance\_judgement

预期：
knowledge\_query

原因：
knowledge\_query 与 compliance\_judgement 对“状态判断”的边界不够清楚。

优化：
无具体业务对象、只询问通用规则 → knowledge\_query；
涉及具体矿山、年度、业务记录并需要实时事实参与 → compliance\_judgement。

结果：
回归测试通过。

