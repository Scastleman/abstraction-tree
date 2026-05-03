$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$statePath = ".abstraction-tree/automation/loop-state.json"
$promptPath = ".abstraction-tree/automation/codex-loop-prompt.md"

if (!(Test-Path $statePath)) {
  Write-Output "Missing loop-state.json"
  exit 1
}

if (!(Test-Path $promptPath)) {
  Write-Output "Missing codex-loop-prompt.md"
  exit 1
}

$start = Get-Date
$state = Get-Content $statePath | ConvertFrom-Json

$today = Get-Date -Format "yyyy-MM-dd"

if ($state.last_run_date -ne $today) {
  $state.loops_today = 0
  $state.stagnation_count = 0
  $state.last_run_date = $today
  $state | ConvertTo-Json -Depth 10 | Set-Content $statePath
}

while ($true) {
  $state = Get-Content $statePath | ConvertFrom-Json

  $elapsedMinutes = ((Get-Date) - $start).TotalMinutes

  if ($state.stop_requested -eq $true) {
    Write-Output "Stop requested."
    break
  }

  if ($state.loops_today -ge $state.max_loops_today) {
    Write-Output "Max loops reached."
    break
  }

  if ($elapsedMinutes -ge $state.max_minutes_today) {
    Write-Output "Max minutes reached."
    break
  }

  if ($state.stagnation_count -ge $state.max_stagnation) {
    Write-Output "Max stagnation reached."
    break
  }

  Write-Output "Starting Codex loop $($state.loops_today + 1)..."

  $loopStartedAt = [int]$state.loops_today
  $prompt = Get-Content $promptPath -Raw

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $prompt | & codex.cmd exec --cd $repo --sandbox workspace-write - 2>&1
    $codexExitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($codexExitCode -ne 0) {
    Write-Output "Codex exited with code $codexExitCode."
    break
  }

  $state = Get-Content $statePath | ConvertFrom-Json
  if ([int]$state.loops_today -le $loopStartedAt) {
    $state.loops_today = $loopStartedAt + 1
  }
  $state | ConvertTo-Json -Depth 10 | Set-Content $statePath

  Write-Output "Loop completed."
}

Write-Output "Abstraction loop finished."
