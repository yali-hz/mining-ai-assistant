# 报告状态 Mock API

独立的本地演示接口，使用 Node.js 内置模块，无第三方依赖。所有数据均为虚构，存放在 `data.json`，包含 1 个企业、1 个矿山及 3 条 2026 年报告记录。修改数据后需重启服务。

## 本地运行

安装 Node.js（本次在 v24.19.0 验证），在仓库根目录执行：

```powershell
node mock-api/server.js
```

服务监听 `127.0.0.1:3000`，按 `Ctrl+C` 停止。不需要执行 `npm install`。

## 查询接口

`GET /reports/status`，以下三个查询参数均必填且只能出现一次：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| mine_id | mine_001 | 矿山 ID |
| year | 2026 | 四位报告年度 |
| report_type | 储量年报 | 精确匹配报告名称，中文需 URL 编码 |

支持的演示报告及状态：

| report_type | status |
| --- | --- |
| 储量年报 | 已提交 |
| 年度资源开发利用报告 | 未提交 |
| 卤水动态监测年报 | 已提交 |

成功返回 HTTP 200，例如：

```json
{"mock":true,"mine_id":"mine_001","year":2026,"report_type":"储量年报","status":"已提交"}
```

参数缺失、空白、重复或年度格式错误返回 400；记录或接口不存在返回 404；非 GET 请求返回 405。未知矿山、年度或报告类型均视为没有匹配记录，不等同于“未提交”。提交状态不代表审批通过。

## 本地测试

保持服务运行，在另一个 PowerShell 窗口执行以下命令，一次查询三条记录：

```powershell
$reportTypes = @('储量年报', '年度资源开发利用报告', '卤水动态监测年报')
foreach ($reportType in $reportTypes) {
    $encodedType = [uri]::EscapeDataString($reportType)
    Invoke-RestMethod "http://127.0.0.1:3000/reports/status?mine_id=mine_001&year=2026&report_type=$encodedType"
}
```

预期依次返回“已提交”“未提交”“已提交”。使用 Windows 自带的 `curl.exe` 查看错误状态码及 JSON：

```powershell
# 缺少参数：400
curl.exe -i "http://127.0.0.1:3000/reports/status?mine_id=mine_001"

# 没有匹配记录：404
curl.exe -i "http://127.0.0.1:3000/reports/status?mine_id=mine_001&year=2025&report_type=unknown"
```

本目录不使用数据库、前端或 Dify，也不进行逾期判断。
