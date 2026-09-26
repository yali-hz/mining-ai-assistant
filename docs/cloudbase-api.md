# CloudBase REST API

## 数据源
CloudBase PostgreSQL

## REST API
通过 CloudBase PostgREST 暴露表查询能力。

## 测试表
report_upload_record

## 查询参数
- mine_id
- year
- report_type_code

## 示例查询
查询 mine_001 的 2026 年储量年报：

GET /report_upload_record
?select=mine_id,year,report_type_name,status,submitted_at
&mine_id=eq.mine_001
&year=eq.2026
&report_type_code=eq.reserve_annual_report

## 验证结果
已验证：
- 切换 mine_id 可返回不同矿山数据
- 切换 year 可返回不同年度数据
- 切换 report_type_code 可返回不同报告数据

## 权限
当前使用 Publishable Key + RLS SELECT public 策略进行只读联调。

## 说明
所有数据均为虚拟测试数据。