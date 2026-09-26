# CloudBase 数据库

## 数据库类型
PostgreSQL

## 数据表
- enterprise：3 条
- mine：6 条
- production_line：13 条
- report：172 条
- report_upload_record：135 条

## 关系
enterprise
→ mine
→ production_line

mine / production_line
→ report
→ report_upload_record

## 说明
- 所有数据均为虚拟测试数据
- 当前仅开放 SELECT 只读策略用于接口联调
- 后续通过 API 提供给 Dify 查询