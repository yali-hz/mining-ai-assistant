param(
    [string]$BaseUrl = 'http://127.0.0.1:3000',
    [string]$ApiKey = $env:BUSINESS_API_KEY
)
$ErrorActionPreference = 'Stop'
$headers = @{}
if ($ApiKey) { $headers.Authorization = "Bearer $ApiKey" }
$cases = @(
    @{entity_type='mine';entity_keyword='察尔汗一号盐湖矿山';resource_type='entity';requested_field='mine_area_km2';query_intent='attribute'},
    @{entity_type='production_line';entity_keyword='氯化钾一号生产线';resource_type='entity';requested_field='design_capacity';query_intent='attribute'},
    @{entity_type='mine';entity_keyword='察尔汗一号盐湖矿山';resource_type='relation';requested_field='production_line';query_intent='count'},
    @{entity_type='mine';entity_keyword='察尔汗一号盐湖矿山';resource_type='relation';requested_field='production_line';query_intent='list'},
    @{entity_type='mine';entity_keyword='察尔汗一号盐湖矿山';resource_type='report';requested_field='status';query_intent='status';year=2026;report_type_name='储量年报'},
    @{entity_type='production_line';entity_keyword='氯化钾一号生产线';resource_type='report';requested_field='status';query_intent='status';year=2026;report_type_name='卤水监测年报'}
)
foreach ($case in $cases) {
    $json = $case | ConvertTo-Json -Compress
    $result = Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/business-query" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
    if (!$result.success) { throw 'Business query failed' }
    [PSCustomObject]@{ query=$case; result=$result } | ConvertTo-Json -Depth 10 -Compress
}
