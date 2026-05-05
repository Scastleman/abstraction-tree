$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Get-TextLineCount($filePath) {
  if (!(Test-Path -LiteralPath $filePath -PathType Leaf)) {
    return 0
  }

  $resolvedPath = (Resolve-Path -LiteralPath $filePath).Path
  $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
  if ($bytes.Length -eq 0 -or $bytes -contains [byte]0) {
    return 0
  }

  $lines = 0
  foreach ($byte in $bytes) {
    if ($byte -eq 10) {
      $lines += 1
    }
  }

  if ($bytes[$bytes.Length - 1] -ne 10) {
    $lines += 1
  }

  return $lines
}

$scriptPath = Join-Path $repo "scripts\diff-summary.mjs"
$configPath = ".abstraction-tree/automation/loop-config.json"
$untrackedFiles = @(git ls-files --others --exclude-standard)
$untrackedLineCounts = @{}

foreach ($filePath in $untrackedFiles) {
  $normalizedPath = $filePath -replace "\\", "/"
  $untrackedLineCounts[$normalizedPath] = Get-TextLineCount $filePath
}

if (Test-Path $configPath) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
  $config = @{}
}

$payload = [ordered]@{
  base = ((git log --oneline -1) -join "`n")
  numstat = ((git -c core.safecrlf=false diff --numstat) -join "`n")
  nameStatus = ((git -c core.safecrlf=false diff --name-status) -join "`n")
  untrackedFiles = ($untrackedFiles -join "`n")
  untrackedLineCounts = $untrackedLineCounts
  config = $config
}

$tempPath = [System.IO.Path]::GetTempFileName()
$exitCode = 0
try {
  $payload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $tempPath
  & node $scriptPath "--input-json" $tempPath @args
  $exitCode = $LASTEXITCODE
}
finally {
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
}

exit $exitCode
