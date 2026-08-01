[CmdletBinding()]
param([switch]$Local)
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content (Join-Path $PSScriptRoot "product-metrics.sql")) -join " "
$Output = & $Wrangler d1 execute shutten-fuda $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) { throw "D1 metrics query failed" }
$Row = ((($Output -join [Environment]::NewLine) | ConvertFrom-Json)[0]).results[0]
function Get-Percent([int]$Numerator, [int]$Denominator) {
    if ($Denominator -eq 0) { return $null }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}
$Visitors = [int]$Row.visitors
$Searchers = [int]$Row.searchers
$Viewers = [int]$Row.viewers
$SourceUsers = [int]$Row.source_users
[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "shutten-fuda"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        visitors = $Visitors; searchers = $Searchers; creators = [int]$Row.creators
        viewers = $Viewers; source_users = $SourceUsers; editors = [int]$Row.editors
        closers = [int]$Row.closers; returned = [int]$Row.returned
        reporters = [int]$Row.reporters; deleters = [int]$Row.deleters
    }
    depth = [ordered]@{
        active_opportunities = [int]$Row.active_opportunities; closed_opportunities = [int]$Row.closed_opportunities
        hidden_opportunities = [int]$Row.hidden_opportunities; opportunities_with_three_viewers = [int]$Row.opportunities_with_three_viewers
        opportunities_with_two_source_users = [int]$Row.opportunities_with_two_source_users
        qualified_opportunities = [int]$Row.qualified_opportunities; opportunities_updated_later = [int]$Row.opportunities_updated_later
    }
    rates = [ordered]@{
        search_to_view_percent = Get-Percent $Viewers $Searchers
        view_to_source_percent = Get-Percent $SourceUsers $Viewers
        create_percent = Get-Percent ([int]$Row.creators) $Visitors
    }
} | ConvertTo-Json -Depth 4
