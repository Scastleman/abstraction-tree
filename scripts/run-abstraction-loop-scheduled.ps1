$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repo ".abstraction-tree\automation\scheduled-loop.log"
$runnerPath = Join-Path $PSScriptRoot "run-abstraction-loop.ps1"

Add-Content -Path $logPath -Value ""
Add-Content -Path $logPath -Value "=== Scheduled loop started $(Get-Date -Format o) ==="

try {
  & $runnerPath *>> $logPath
  $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
  Add-Content -Path $logPath -Value "=== Scheduled loop finished $(Get-Date -Format o) exit=$exitCode ==="
  exit $exitCode
}
catch {
  Add-Content -Path $logPath -Value "=== Scheduled loop failed $(Get-Date -Format o) ==="
  Add-Content -Path $logPath -Value ($_ | Out-String)
  exit 1
}
