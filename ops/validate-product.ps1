[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Required = @(
    ".github\workflows\ci.yml","DECISIONS.md","EXPERIMENT.md","METRICS.md","PRIVACY.md","README.md",
    "SECURITY.md","STACK.md","migrations\0001_opportunities.sql","ops\product-metrics.ps1","ops\product-metrics.sql",
    "ops\submit-indexnow.ps1","public\app.js","public\common.js","public\directory.js","public\edit.js",
    "public\favicon.png","public\opportunity.js","public\manifest.webmanifest","public\og.png","public\robots.txt",
    "public\styles.css","public\sw.js","src\worker.tsx","test\worker.test.ts"
)
foreach ($Path in $Required) { if (-not (Test-Path (Join-Path $Root $Path))) { throw "Missing $Path" } }
$Worker = Get-Content -Raw (Join-Path $Root "src\worker.tsx")
$Scripts = (Get-Content -Raw (Join-Path $Root "public\*.js")) -join "`n"
$Styles = Get-Content -Raw (Join-Path $Root "public\styles.css")
$Migration = Get-Content -Raw (Join-Path $Root "migrations\0001_opportunities.sql")
foreach ($Marker in @('class="market-scene"','class="stall stall-a"','class="application-gate"','class="opportunity-card"','class="detail-stall"')) {
    if (-not $Worker.Contains($Marker)) { throw "Missing visual $Marker" }
}
if (($Worker + $Scripts) -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|収益性|innerHTML|eval\(|new Function') { throw "Unsafe or meta product copy" }
if (($Worker + $Scripts) -match '(?i)\son[a-z]+\s*=') { throw "Inline event handler" }
if (-not $Styles.Contains("clamp(1.75rem, 3.2vw, 2rem)") -or -not $Styles.Contains("@media print")) { throw "Heading or print contract" }
foreach ($Needle in @("randomBase64Url(32)","crypto.subtle.digest",'url.protocol === "https:"',"today + 180 * 86400000","createdToday","source_url_hash","COUNT(DISTINCT session_id)","crypto.subtle.sign","DELETE FROM opportunity_reports WHERE opportunity_id = ?","45 * 86400","30 * 86400")) {
    if (-not $Worker.Contains($Needle)) { throw "Missing boundary $Needle" }
}
if ($Worker -match '(?i)better-auth|betterAuth' -or $Worker.Contains("'unsafe-inline'") -or $Worker -match 'style=\{') { throw "Authentication or CSP contract" }
foreach ($Table in @("opportunities","opportunity_reports","product_events")) { if (-not $Migration.Contains("CREATE TABLE $Table")) { throw "Missing table $Table" } }
foreach ($Event in @("visited","directory_searched","opportunity_created","opportunity_opened","source_opened","opportunity_updated","opportunity_closed","opportunity_deleted","opportunity_reported","returned")) {
    if (-not $Migration.Contains("'$Event'") -or -not $Worker.Contains("`"$Event`"")) { throw "Missing event $Event" }
}
if ((Get-Item (Join-Path $Root "public\og.png")).Length -lt 50000) { throw "Missing social card" }
$Keys = @(Get-ChildItem (Join-Path $Root "public") -File | Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" })
if ($Keys.Count -ne 1 -or (Get-Content -Raw $Keys[0].FullName).Trim() -ne $Keys[0].BaseName) { throw "IndexNow key contract" }
Write-Output "Product release contract is satisfied"
