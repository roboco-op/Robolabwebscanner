param(
  [string]$TargetUrl = "https://example.com",
  [int]$PollAttempts = 30,
  [int]$PollIntervalSeconds = 4,
  [string]$SupabaseUrl,
  [string]$AnonKey
)

$ErrorActionPreference = "Stop"

function Read-EnvFileValue {
  param(
    [string[]]$Paths,
    [string]$Key
  )

  foreach ($path in $Paths) {
    if (-not (Test-Path $path)) { continue }
    $line = Get-Content $path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
    if ($line) {
      $value = $line -replace "^\s*$Key\s*=\s*", ""
      $value = $value.Trim().Trim('"').Trim("'")
      if ($value) { return $value }
    }
  }

  return $null
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPaths = @(
  (Join-Path $repoRoot ".env.local"),
  (Join-Path $repoRoot ".env")
)

if (-not $SupabaseUrl) {
  $SupabaseUrl = $env:VITE_SUPABASE_URL
}
if (-not $SupabaseUrl) {
  $SupabaseUrl = Read-EnvFileValue -Paths $envPaths -Key "VITE_SUPABASE_URL"
}

if (-not $AnonKey) {
  $AnonKey = $env:VITE_SUPABASE_ANON_KEY
}
if (-not $AnonKey) {
  $AnonKey = Read-EnvFileValue -Paths $envPaths -Key "VITE_SUPABASE_ANON_KEY"
}

if (-not $SupabaseUrl -or -not $AnonKey) {
  throw "Missing Supabase config. Provide -SupabaseUrl and -AnonKey, or define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in environment/.env(.local)."
}

$baseHeaders = @{
  "Content-Type" = "application/json"
  "Authorization" = "Bearer $AnonKey"
  "apikey" = $AnonKey
}

$insertHeaders = @{}
$baseHeaders.Keys | ForEach-Object { $insertHeaders[$_] = $baseHeaders[$_] }
$insertHeaders["Prefer"] = "return=representation"

Write-Host "Starting verify-scan-yslow for target: $TargetUrl"

$insertBody = @{ target_url = $TargetUrl; scan_status = "pending" } | ConvertTo-Json -Compress
$insert = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/scan_results" -Headers $insertHeaders -Body $insertBody

if (-not $insert -or -not $insert[0] -or -not $insert[0].id) {
  throw "Could not create scan row"
}

$scanId = $insert[0].id
Write-Host "Created scanId=$scanId"

$triggerBody = @{ scanId = $scanId; url = $TargetUrl } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/functions/v1/web-scanner" -Headers $baseHeaders -Body $triggerBody | Out-Null
Write-Host "Triggered web-scanner"

$status = "pending"
for ($i = 1; $i -le $PollAttempts; $i++) {
  Start-Sleep -Seconds $PollIntervalSeconds
  $row = Invoke-RestMethod -Method Get -Uri "$SupabaseUrl/rest/v1/scan_results?id=eq.$scanId&select=id,scan_status,overall_score,yslow_score" -Headers @{ Authorization = "Bearer $AnonKey"; apikey = $AnonKey }

  if ($row -and $row[0]) {
    $status = $row[0].scan_status
    Write-Host "Poll $i status=$status overall=$($row[0].overall_score) yslow=$($row[0].yslow_score)"
    if ($status -eq "completed" -or $status -eq "failed") {
      break
    }
  }
}

if ($status -ne "completed") {
  throw "Scan did not complete in time. Last status: $status"
}

$ysBody = @{ mode = "process-yslow"; scanId = $scanId } | ConvertTo-Json -Compress
$ysResult = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/functions/v1/web-scanner" -Headers $baseHeaders -Body $ysBody
Write-Host ("Targeted process-yslow result=" + ($ysResult | ConvertTo-Json -Compress))

$final = Invoke-RestMethod -Method Get -Uri "$SupabaseUrl/rest/v1/scan_results?id=eq.$scanId&select=id,target_url,scan_status,overall_score,yslow_score,yslow_results,analysis_explanations,pages_scanned,scan_depth" -Headers @{ Authorization = "Bearer $AnonKey"; apikey = $AnonKey }

if (-not $final -or -not $final[0]) {
  throw "Final scan row not found"
}

$finalRow = $final[0]
if ($finalRow.yslow_score -eq $null) {
  throw "YSlow score is still null after targeted processing"
}

Write-Host "Verification successful for scanId=$scanId"
$finalRow | ConvertTo-Json -Depth 12
