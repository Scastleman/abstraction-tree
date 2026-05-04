$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repo ".abstraction-tree\automation\scheduled-loop.log"
$runnerPath = Join-Path $PSScriptRoot "run-abstraction-loop.ps1"

function Write-LoopLog {
  param([string]$Message)

  $Message | Tee-Object -FilePath $logPath -Append
}

Write-LoopLog ""
Write-LoopLog "=== Scheduled loop started $(Get-Date -Format o) ==="
Write-LoopLog "Repo: $repo"
Write-LoopLog "Log: $logPath"

try {
  & $runnerPath 2>&1 | Tee-Object -FilePath $logPath -Append
  $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
  Write-LoopLog "=== Scheduled loop finished $(Get-Date -Format o) exit=$exitCode ==="
  exit $exitCode
}
catch {
  Write-LoopLog "=== Scheduled loop failed $(Get-Date -Format o) ==="
  Write-LoopLog ($_ | Out-String)
  exit 1
}
