# 统一业务查询 API

入口：`POST /api/business-query`。代码位于 `server/app.js` 和 `server/routes/business-query.js`。
Node.js 22+；Express 5；只通过已有 CloudBase PostgREST GET 查询，不写数据库。

## 本地运行

在项目根目录运行 `npm ci`，将下列配置追加到已有 `.env`（不要覆盖 Dify 配置）：

```dotenv
CLOUDBASE_BASE_URL=https://YOUR_ENV_ID.api.tcloudbasegateway.com/v1/rdb/rest
CLOUDBASE_TOKEN=填入已有PublishableKey
BUSINESS_API_PORT=3000
```

Token 不含 `Bearer ` 前缀；Base URL 不含表名或查询参数。`.env` 已被 Git 忽略。
`npm start` 启动业务 API；`npm run preview` 仍启动原有聊天页面。
业务端口优先级：BUSINESS_API_PORT → PORT → 3000。现有前端的 PORT=5174 可保留。

## 请求协议

```json
{
  "entity_type": "mine",
  "entity_keyword": "察尔汗一号盐湖矿山",
  "resource_type": "report",
  "requested_field": "status",
  "query_intent": "status",
  "year": 2026,
  "report_type_name": "储量年报"
}
```

| 查询 | resource_type | query_intent | requested_field |
| --- | --- | --- | --- |
| 矿山属性 | entity | attribute | mine_area_km2、mine_scale、production_scale、production_scale_unit、development_status、mining_methods、mineral_types、mining_license_no、valid_from、valid_to、mine_name |
| 生产线属性 | entity | attribute | design_capacity、capacity_unit、production_process、product_types、production_start_date、production_end_date、production_line_name |
| 矿山下属生产线 | relation | list / count | production_line |
| 矿山或生产线年度报告 | report | status | status / submitted_at / due_date |

属性、关系查询可以省略 year / report_type_name，或传 null。
报告查询必须传整数 year 和非空 report_type_name；不会默认当前年度。
第一版不支持 enterprise。名称先精确匹配，再按连续关键词模糊匹配；简称不连续时请提取共同核心词，例如“察尔汗一号”。

报告直接通过 object_type、object_id、year、report_type_name 查询 report_upload_record，不依赖当前 REST 未暴露的 report 表。报告名称和年度没有硬编码；report_type_code 从结果读取。无法校验报告配置是否启用或实体是否应交，无记录时返回 unknown。
矿山报告不能仅按 mine_id 过滤，否则会包含同矿山下生产线的报告。

成功统一返回 `{ "success": true, "entity": { "type": "…", "id": "…", "name": "…" }, "data": { … } }`。
属性值保留原值；产能/生产规模补充数据库单位；面积单位为 km²。列表含 count 和 items，数量含 count。
报告状态保留数据库原值，如 submitted、late_submitted、not_submitted、overdue。
无年度记录时返回 record_found=false、status=unknown，不能解释为未提交。

| HTTP | error.code | 处理 |
| --- | --- | --- |
| 400 | INVALID_PARAMETER / MISSING_YEAR / UNSUPPORTED_QUERY / INVALID_KEYWORD | 请用户补充或修正参数 |
| 404 | ENTITY_NOT_FOUND | 说明未匹配或未配置，不能编造结论 |
| 409 | AMBIGUOUS_ENTITY / MULTIPLE_REPORT_RECORDS | 澄清名称或核对重复数据 |
| 422 | RESULT_TOO_LARGE | 缩小范围，当前最多 10000 条 |
| 502 / 504 | CLOUDBASE_ERROR / CLOUDBASE_TIMEOUT | 数据服务失败或超过总计 15 秒，不能当作无数据 |
| 503 | CLOUDBASE_NOT_CONFIGURED | 检查服务端环境变量 |

PostgREST 查询使用 `Prefer: count=exact`，按稳定 ID 排序并遍历分页；没有精确 Content-Range 时明确报错，不静默返回截断数量。
报告重复记录不会擅自取第一条。公开字段使用白名单，错误响应不包含上游原文和 Token。

## 测试

```powershell
npm test
# 另一个 PowerShell 窗口，在业务 API 已启动后运行：
./server/test/smoke.ps1
```

smoke.ps1 包含矿山面积、生产线产能、生产线数量、生产线列表、矿山报告、生产线报告六个用例。
演示接口无需 API Key；测试请求仅发送 Content-Type。
可修改脚本中的名称、年度和报告名测试其他数据，示例值仅用于测试。

自动化集成测试使用独立本地 PostgREST 模拟服务，覆盖分页、不同实体/年度、自定义报告类型、实体重名、无年度记录、重复记录、非法字段、无鉴权访问、上游失败等；它不等于真实云端验证。

## 部署与 Dify

将业务服务部署到 Dify 能访问的 HTTPS 地址。安装命令 `npm ci`，启动命令 `npm start`。
部署平台配置 CLOUDBASE_BASE_URL、CLOUDBASE_TOKEN、NODE_ENV=production。
如果平台提供 PORT，不设置 BUSINESS_API_PORT。演示模式不要求业务接口密钥。
CloudBase Token 留在 Node 服务端，Dify 调用业务接口无需鉴权。现有 Publishable Key 仍受数据库 SELECT/RLS 权限约束。

Dify 分支：参数提取 → HTTP 请求 → 结果回答；需要安全序列化时在参数提取后加代码节点。

1. 参数提取输出上述七个字段，entity_type 仅 mine / production_line；year 用 Number，不猜测缺失年度。
2. HTTP 节点选择 POST，URL=`https://你的服务域名/api/business-query`。
3. 鉴权选择无；Headers 仅设置 `Content-Type: application/json`。
4. 请求体传七字段 JSON。year 是数字或 null，不能是字符串或空文本。为防名称包含引号造成 JSON 损坏，可使用以下 Python 代码节点，将七个输入变量绑定为同名参数，输出 body（String）：

```python
import json

def main(entity_type, entity_keyword, resource_type, requested_field,
         query_intent, year=None, report_type_name=None):
    return {"body": json.dumps({
        "entity_type": entity_type,
        "entity_keyword": entity_keyword,
        "resource_type": resource_type,
        "requested_field": requested_field,
        "query_intent": query_intent,
        "year": year if year not in (None, "") else None,
        "report_type_name": report_type_name or None
    }, ensure_ascii=False)}
```

HTTP Body 使用 raw 文本，内容仅插入代码节点 body 变量，保留 application/json 请求头。
5. 响应 body 交给回答节点，提示词：仅依据返回 JSON 回答；success=false 时解释错误或追问；unknown 表示无法判断；不把技术失败说成未提交；保留年度、名称、单位和原始状态的含义。
6. 为 HTTP 节点配置错误分支，处理连接失败和非成功状态；读取超时设为大于 15 秒。不要让错误分支继续生成成功答案。

Dify 云端不能访问你电脑的 localhost；本地容器的 localhost 也不指向宿主机。请使用实际可访问的服务地址。此次未部署公网服务，也未修改现有 Dify 工作流。

参考：[CloudBase HTTP 连接](https://docs.cloudbase.net/database/postgresql/connecting-to-postgresql)、[PostgREST 查询与分页](https://docs.postgrest.org/en/v14/references/api/tables_views.html)。
