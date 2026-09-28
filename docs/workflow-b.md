# Workflow B：业务数据查询链路

## 1. 目标

Workflow B 用于处理矿山、生产线等业务实体的结构化数据查询，例如：

- 察尔汗一号盐湖矿山的面积是多少？
- 察尔汗一号盐湖矿山有哪些矿种？
- 某生产线的设计产能是多少？

核心目标是：将用户自然语言问题转换为结构化查询参数，调用统一业务 API 查询数据库，再由 LLM 生成自然语言回答。

---

## 2. 链路

```text
用户问题
  ↓
B-参数提取器
  ↓
B-格式清洗（Code）
  ↓
B-统一 API（Render）
  ↓
CloudBase SQL
  ↓
B-业务回答 LLM
  ↓
输出
```

---

## 3. 节点说明

### B-参数提取器

负责从用户问题中提取查询参数：

```json
{
  "entity_type": "mine",
  "entity_keyword": "察尔汗一号盐湖矿山",
  "resource_type": "entity",
  "requested_field": "mine_area_km2",
  "query_intent": "attribute"
}
```

主要字段：

- `entity_type`：实体类型，如 `mine`、`production_line`
- `entity_keyword`：实体名称或关键词
- `resource_type`：当前主要为 `entity`
- `requested_field`：需要查询的具体字段
- `query_intent`：查询意图

约束：

- 当 `requested_field` 有值时，`query_intent` 统一使用 `attribute`
- `list` 仅用于列举实体或关系，不用于具体字段查询

---

### B-格式清洗（Code）

用于将 LLM 输出转换为统一、稳定的 API 入参。

主要处理：

- 去除 Markdown / JSON 代码块包裹
- 字符串转 JSON
- 统一字段类型
- 清理空值
- 修正部分意图与字段不匹配的情况

增加该节点后，Dify 与 Business Query API 的联调成功跑通。

---

### B-统一 API（Render）

统一业务查询接口：

```text
/api/business-query
```

职责：

- 接收 Dify 清洗后的结构化参数
- 根据 `entity_type`、`entity_keyword` 等条件查询业务数据
- 返回统一 JSON 结果

示例成功响应：

```json
{
  "success": true,
  "entity": {
    "type": "mine",
    "id": "mine_001",
    "name": "察尔汗一号盐湖矿山"
  },
  "data": {
    "mine_area_km2": 126.8
  }
}
```

---

### CloudBase SQL

业务数据存储在 CloudBase 数据库中。

例如：

- API 参数：`entity_keyword`
- 数据库实际字段：`mine_name`

`entity_keyword` 是接口查询参数，并不是数据库字段名，后端负责完成参数与数据库字段之间的转换。

---

### B-业务回答 LLM

根据 API 返回的结构化数据生成自然语言回答。

示例：

> 察尔汗一号盐湖矿山的面积为 126.8 平方公里。

要求：

- 仅基于 API 返回结果作答
- 不补充接口未返回的信息
- 查询失败时不编造答案

---

## 4. 已验证 Case

### Case 1：矿山面积查询

用户问题：

> 察尔汗一号盐湖矿山的面积是多少？

结果：

> 察尔汗一号盐湖矿山的面积为 126.8 平方公里。

状态：已通过。

### Case 2：矿种查询

用户问题：

> 察尔汗一号盐湖矿山有哪些矿种？

结果：

```json
["钾盐", "镁盐", "锂矿"]
```

状态：已通过。

---

## 5. 异常处理

当前已记录的典型异常：

- `UNSUPPORTED_QUERY`：意图与字段不匹配
- `ENTITY_NOT_FOUND`：实体不存在
- 参数格式异常：通过 `B-格式清洗` 处理

详细排障记录见：

```text
bad_cases.md
```

---

## 6. 当前状态

- B-参数提取器：已完成
- B-格式清洗：已完成
- Business Query API：已完成
- Render 公网部署：已完成
- CloudBase SQL 查询：已完成
- B-业务回答 LLM：已完成
- 主链路联调：已通过
