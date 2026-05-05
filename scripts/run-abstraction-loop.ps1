$ErrorActionPreference = "Stop"

# Runs one or more bounded Codex improvement loops with local runtime guards.
# Expected location: repo-root/scripts/run-abstraction-loop.ps1

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$ConfigPath = ".abstraction-tree/automation/loop-config.json"
$RuntimePath = ".abstraction-tree/automation/loop-runtime.json"
$RuntimeExamplePath = ".abstraction-tree/automation/loop-runtime.example.json"
$PromptPath = ".abstraction-tree/automation/codex-loop-prompt.md"
$PackagePath = "package.json"

function Read-JsonFile([string]$Path) {
  return Get-Content $Path -Raw | ConvertFrom-Json
}

function Save-JsonFile($Value, [string]$Path) {
  $Value | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $Path
}

function New-LoopRuntime {
  return [pscustomobject]@{
    loops_today = 0
    failed_loops_today = 0
    stagnation_count = 0
    consecutive_test_failures = 0
    last_result = ""
    last_run_date = ""
    stop_requested = $false
  }
}

function Ensure-Property($Object, [string]$Name, $DefaultValue) {
  if ($null -eq $Object.PSObject.Properties[$Name]) {
    Add-Member -InputObject $Object -NotePropertyName $Name -NotePropertyValue $DefaultValue
  }
}

function Normalize-Runtime($Runtime) {
  Ensure-Property $Runtime "loops_today" 0
  Ensure-Property $Runtime "failed_loops_today" 0
  Ensure-Property $Runtime "stagnation_count" 0
  Ensure-Property $Runtime "consecutive_test_failures" 0
  Ensure-Property $Runtime "last_result" ""
  Ensure-Property $Runtime "last_run_date" ""
  Ensure-Property $Runtime "stop_requested" $false
  return $Runtime
}

function Ensure-RuntimeFile {
  if (Test-Path $RuntimePath) {
    return
  }

  if (Test-Path $RuntimeExamplePath) {
    Copy-Item $RuntimeExamplePath $RuntimePath
    return
  }

  Save-JsonFile (New-LoopRuntime) $RuntimePath
}

function Read-Runtime {
  Ensure-RuntimeFile
  return Normalize-Runtime (Read-JsonFile $RuntimePath)
}

function Reset-RuntimeForNewDay($Runtime, [string]$Today) {
  if ($Runtime.last_run_date -eq $Today) {
    return $Runtime
  }

  $Runtime.loops_today = 0
  $Runtime.failed_loops_today = 0
  $Runtime.stagnation_count = 0
  $Runtime.consecutive_test_failures = 0
  $Runtime.last_run_date = $Today
  return $Runtime
}

function Get-ConfigInteger($Config, [string]$Name, [int]$DefaultValue) {
  $property = $Config.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $DefaultValue
  }

  $parsed = 0
  if ([int]::TryParse([string]$property.Value, [ref]$parsed)) {
    return $parsed
  }

  return $DefaultValue
}

function Get-ConfigFlag($Config, [string]$Name, [bool]$DefaultValue) {
  $property = $Config.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $DefaultValue
  }

  if ($property.Value -is [bool]) {
    return [bool]$property.Value
  }

  return $DefaultValue
}

function Test-NpmScript($Scripts, [string]$Name) {
  if ($null -eq $Scripts) {
    return $false
  }

  return $null -ne $Scripts.PSObject.Properties[$Name]
}

function Invoke-CheckedCommand([string]$Command, [string[]]$Arguments) {
  Write-Host ""
  Write-Host "Running: $Command $($Arguments -join ' ')"

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $Command @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  foreach ($line in $output) {
    Write-Host $line
  }

  if ($null -eq $exitCode) {
    return 0
  }

  return [int]$exitCode
}

function Invoke-NpmScript($Scripts, [string]$Name, [bool]$Required) {
  if (!(Test-NpmScript $Scripts $Name)) {
    $status = if ($Required) { "missing" } else { "skipped" }
    Write-Host ""
    Write-Host "Skipping npm script '$Name' ($status)."
    $exitCode = if ($Required) { 1 } else { 0 }
    return [pscustomobject]@{
      name = $Name
      exit_code = $exitCode
      skipped = !$Required
      required = $Required
    }
  }

  $arguments = if ($Name -eq "test") { @("test") } else { @("run", $Name) }
  $exitCode = Invoke-CheckedCommand "npm" $arguments

  return [pscustomobject]@{
    name = $Name
    exit_code = $exitCode
    skipped = $false
    required = $Required
  }
}

function Invoke-PostLoopChecks($Scripts) {
  $results = @()
  $results += Invoke-NpmScript $Scripts "build" $false
  $results += Invoke-NpmScript $Scripts "test" $false
  $results += Invoke-NpmScript $Scripts "atree:validate" $true
  $results += Invoke-NpmScript $Scripts "atree:evaluate" $false
  return $results
}

function Test-ChecksSucceeded($Results) {
  foreach ($result in $Results) {
    if ($result.skipped -eq $true) {
      continue
    }
    if ([int]$result.exit_code -ne 0) {
      return $false
    }
  }

  return $true
}

function Test-RequiredCommitChecksSucceeded($Results) {
  foreach ($name in @("build", "test", "atree:validate")) {
    $result = $Results | Where-Object { $_.name -eq $name } | Select-Object -First 1
    if ($null -eq $result -or $result.skipped -eq $true -or [int]$result.exit_code -ne 0) {
      return $false
    }
  }

  return $true
}

function Test-TestFailed($Results) {
  $result = $Results | Where-Object { $_.name -eq "test" } | Select-Object -First 1
  return $null -ne $result -and $result.skipped -ne $true -and [int]$result.exit_code -ne 0
}

function Test-TestPassed($Results) {
  $result = $Results | Where-Object { $_.name -eq "test" } | Select-Object -First 1
  return $null -ne $result -and $result.skipped -ne $true -and [int]$result.exit_code -eq 0
}

function Get-TextLineCount([string]$FilePath) {
  if (!(Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    return 0
  }

  $resolvedPath = (Resolve-Path -LiteralPath $FilePath).Path
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

function Get-DiffLineCount {
  $lineCount = 0

  foreach ($line in git -c core.safecrlf=false diff --numstat) {
    $parts = $line -split "`t"
    if ($parts.Length -lt 2) {
      continue
    }

    $added = 0
    $deleted = 0
    if ([int]::TryParse($parts[0], [ref]$added)) {
      $lineCount += $added
    }
    if ([int]::TryParse($parts[1], [ref]$deleted)) {
      $lineCount += $deleted
    }
  }

  foreach ($filePath in git ls-files --others --exclude-standard) {
    $lineCount += Get-TextLineCount $filePath
  }

  return $lineCount
}

function Get-WorkingTreeFingerprint {
  $parts = @()
  $parts += git -c core.safecrlf=false diff --no-ext-diff --binary
  $parts += git -c core.safecrlf=false diff --cached --no-ext-diff --binary

  foreach ($filePath in git ls-files --others --exclude-standard | Sort-Object) {
    if (Test-Path -LiteralPath $filePath -PathType Leaf) {
      $hash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
      $parts += "UNTRACKED`t$filePath`t$hash"
    }
  }

  return ($parts -join [Environment]::NewLine)
}

function Test-WorkingTreeHasChanges {
  $status = git status --porcelain
  return $null -ne $status -and @($status).Count -gt 0
}

function Get-StopReason($Runtime, $Config, [datetime]$StartedAt) {
  if ($Runtime.stop_requested -eq $true) {
    return "Stop requested."
  }

  $maxLoops = Get-ConfigInteger $Config "max_loops_today" 0
  if ($maxLoops -gt 0 -and [int]$Runtime.loops_today -ge $maxLoops) {
    return "Max loops reached."
  }

  $maxFailedLoops = Get-ConfigInteger $Config "max_failed_loops" 0
  if ($maxFailedLoops -gt 0 -and [int]$Runtime.failed_loops_today -ge $maxFailedLoops) {
    return "Max failed loops reached."
  }

  $maxMinutes = Get-ConfigInteger $Config "max_minutes_today" 0
  $elapsedMinutes = ((Get-Date) - $StartedAt).TotalMinutes
  if ($maxMinutes -gt 0 -and $elapsedMinutes -ge $maxMinutes) {
    return "Max minutes reached."
  }

  $maxStagnation = Get-ConfigInteger $Config "max_stagnation" 0
  if ($maxStagnation -gt 0 -and [int]$Runtime.stagnation_count -ge $maxStagnation) {
    return "Max stagnation reached."
  }

  if (Get-ConfigFlag $Config "stop_if_tests_fail_twice" $true) {
    if ([int]$Runtime.consecutive_test_failures -ge 2) {
      return "Repeated test failure reached."
    }
  }

  if (Get-ConfigFlag $Config "stop_if_diff_too_large" $true) {
    $maxDiffLines = Get-ConfigInteger $Config "max_diff_lines" 0
    if ($maxDiffLines -gt 0) {
      $diffLineCount = Get-DiffLineCount
      if ($diffLineCount -gt $maxDiffLines) {
        return "Diff too large: $diffLineCount changed lines exceeds max_diff_lines $maxDiffLines."
      }
    }
  }

  return ""
}

function Invoke-CodexCycle([string]$Prompt) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = $Prompt | & codex.cmd exec --cd $RepoRoot --sandbox workspace-write - 2>&1
    $exitCode = $LASTEXITCODE
    foreach ($line in $output) {
      Write-Host $line
    }

    if ($exitCode -is [int]) {
      return [int]$exitCode
    }
    return 0
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Update-RuntimeAfterChecks($Runtime, [int]$LoopStartedAt, [bool]$ChecksSucceeded, [bool]$DiffChanged, $CheckResults) {
  if ([int]$Runtime.loops_today -le $LoopStartedAt) {
    $Runtime.loops_today = $LoopStartedAt + 1
  }

  if (Test-TestFailed $CheckResults) {
    $Runtime.consecutive_test_failures = [int]$Runtime.consecutive_test_failures + 1
  } elseif (Test-TestPassed $CheckResults) {
    $Runtime.consecutive_test_failures = 0
  }

  if ($ChecksSucceeded) {
    if ($DiffChanged) {
      $Runtime.stagnation_count = 0
      $Runtime.last_result = "success"
    } else {
      $Runtime.stagnation_count = [int]$Runtime.stagnation_count + 1
      $Runtime.last_result = "no-op"
    }
  } else {
    $Runtime.failed_loops_today = [int]$Runtime.failed_loops_today + 1
    if (!$DiffChanged) {
      $Runtime.stagnation_count = [int]$Runtime.stagnation_count + 1
    }
    $Runtime.last_result = "failed"
  }

  return $Runtime
}

function Invoke-AutoCommitIfEnabled($Config, $CheckResults, [bool]$WorktreeWasCleanAtStart) {
  if (!(Get-ConfigFlag $Config "commit_each_successful_loop" $false)) {
    return
  }

  if (!(Test-RequiredCommitChecksSucceeded $CheckResults)) {
    Write-Host "Auto-commit skipped because build/test/validation did not all succeed."
    return
  }

  if (!$WorktreeWasCleanAtStart) {
    Write-Host "Auto-commit skipped because the worktree was not clean at loop start."
    return
  }

  if (!(Test-WorkingTreeHasChanges)) {
    Write-Host "Auto-commit skipped because there are no changes."
    return
  }

  & git add --all
  & git reset -- $RuntimePath | Out-Null

  $staged = git diff --cached --name-only
  if ($null -eq $staged -or @($staged).Count -eq 0) {
    Write-Host "Auto-commit skipped because there are no staged changes."
    return
  }

  $commitCode = Invoke-CheckedCommand "git" @("commit", "-m", "Run abstraction improvement loop")
  if ($commitCode -ne 0) {
    throw "Auto-commit failed with exit code $commitCode."
  }
}

foreach ($requiredPath in @($ConfigPath, $PromptPath, $PackagePath)) {
  if (!(Test-Path $requiredPath)) {
    Write-Host "Missing required file: $requiredPath"
    exit 1
  }
}

$startedAt = Get-Date
$config = Read-JsonFile $ConfigPath
$scripts = (Read-JsonFile $PackagePath).scripts
$runtime = Read-Runtime
$runtime = Reset-RuntimeForNewDay $runtime (Get-Date -Format "yyyy-MM-dd")
Save-JsonFile $runtime $RuntimePath

while ($true) {
  $runtime = Read-Runtime
  $stopReason = Get-StopReason $runtime $config $startedAt
  if ($stopReason) {
    Write-Host $stopReason
    break
  }

  $loopNumber = [int]$runtime.loops_today + 1
  Write-Host ""
  Write-Host "Starting Codex loop $loopNumber..."

  $loopStartedAt = [int]$runtime.loops_today
  $worktreeWasCleanAtStart = !(Test-WorkingTreeHasChanges)
  $beforeFingerprint = Get-WorkingTreeFingerprint
  $prompt = Get-Content $PromptPath -Raw
  $codexExitCode = Invoke-CodexCycle $prompt

  if ($codexExitCode -ne 0) {
    $runtime = Read-Runtime
    if ([int]$runtime.loops_today -le $loopStartedAt) {
      $runtime.loops_today = $loopStartedAt + 1
    }
    $runtime.failed_loops_today = [int]$runtime.failed_loops_today + 1
    $runtime.last_result = "failed"
    Save-JsonFile $runtime $RuntimePath
    Write-Host "Codex exited with code $codexExitCode."
    break
  }

  $checkResults = Invoke-PostLoopChecks $scripts
  $checksSucceeded = Test-ChecksSucceeded $checkResults
  $afterFingerprint = Get-WorkingTreeFingerprint
  $diffChanged = $beforeFingerprint -ne $afterFingerprint

  $runtime = Read-Runtime
  $runtime = Update-RuntimeAfterChecks $runtime $loopStartedAt $checksSucceeded $diffChanged $checkResults
  Save-JsonFile $runtime $RuntimePath

  Invoke-AutoCommitIfEnabled $config $checkResults $worktreeWasCleanAtStart

  $stopReason = Get-StopReason (Read-Runtime) $config $startedAt
  if ($stopReason) {
    Write-Host $stopReason
    break
  }

  Write-Host "Loop completed with result: $($runtime.last_result)."
}

Write-Host ""
Write-Host "Abstraction loop finished."
