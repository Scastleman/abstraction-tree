$ErrorActionPreference = "Stop"

# Runs Codex mission prompts one by one.
# Expected location: repo-root/scripts/run-codex-missions.ps1

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$MissionDir = ".abstraction-tree/automation/missions"
$RuntimePath = ".abstraction-tree/automation/mission-runtime.json"
$RuntimeExamplePath = ".abstraction-tree/automation/mission-runtime.example.json"
$LogDir = ".abstraction-tree/automation/mission-logs"
$CodexReasoningEffort = if ($env:CODEX_REASONING_EFFORT) { $env:CODEX_REASONING_EFFORT } else { "xhigh" }
$CodexApprovalPolicy = if ($env:CODEX_ASK_FOR_APPROVAL) { $env:CODEX_ASK_FOR_APPROVAL } else { "never" }
$CodexSandbox = if ($env:CODEX_SANDBOX) { $env:CODEX_SANDBOX } else { "workspace-write" }
$CodexEphemeral = if ($env:CODEX_EPHEMERAL) { $env:CODEX_EPHEMERAL -ne "false" } else { $true }

function Ensure-Directory([string]$Path) {
  if (!(Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Read-JsonFile([string]$Path) {
  return Get-Content $Path -Raw | ConvertFrom-Json
}

function Save-JsonFile($Value, [string]$Path) {
  $Value | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $Path
}

function Normalize-Array($Value) {
  if ($null -eq $Value) {
    return @()
  }

  if ($Value -is [System.Array]) {
    return @($Value)
  }

  return @($Value)
}

function Add-ToJsonArray($State, [string]$PropertyName, [string]$Item) {
  $existing = Normalize-Array $State.$PropertyName
  if (!($existing -contains $Item)) {
    $State.$PropertyName = @($existing + $Item)
  }
  return $State
}

function Invoke-CheckedCommand([string]$Command, [string[]]$Arguments) {
  Write-Host ""
  Write-Host "Running: $Command $($Arguments -join ' ')"

  $output = & $Command @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  foreach ($line in $output) {
    Write-Host $line
  }

  if ($null -eq $exitCode) {
    $exitCode = 0
  }

  return [int]$exitCode
}

function Invoke-CodexExec([string]$MissionPath, [string]$LogPath) {
  $relativeMissionPath = Resolve-Path -Relative $MissionPath
  $instruction = "Read the Codex mission prompt at $relativeMissionPath and execute that mission exactly. Treat that file as your full task prompt. Complete only that mission, then stop."

  $ephemeralFlag = if ($CodexEphemeral) { " --ephemeral" } else { "" }
  Write-Host "Invoking Codex CLI with: codex --ask-for-approval $CodexApprovalPolicy exec --cd `"$RepoRoot`" --sandbox $CodexSandbox -c model_reasoning_effort=$CodexReasoningEffort$ephemeralFlag `"$instruction`""

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = "cmd.exe"
  $codexCommand = 'codex.cmd --ask-for-approval ' + $CodexApprovalPolicy + ' exec --cd "' + $RepoRoot.Replace('"', '\"') + '" --sandbox ' + $CodexSandbox + ' -c model_reasoning_effort=' + $CodexReasoningEffort
  if ($CodexEphemeral) {
    $codexCommand += ' --ephemeral'
  }
  $codexCommand += ' "' + $instruction.Replace('"', '\"') + '"'
  $startInfo.Arguments = '/d /s /c "' + $codexCommand + '"'
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $false

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo

  $null = $process.Start()

  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()

  $process.WaitForExit()

  $stdout = $stdoutTask.Result
  $stderr = $stderrTask.Result

  $combined = @(
    "# Codex Mission Log",
    "",
    "## STDOUT",
    "",
    $stdout,
    "",
    "## STDERR",
    "",
    $stderr
  ) -join [Environment]::NewLine

  $combined | Set-Content -Encoding UTF8 $LogPath

  if ($stdout.Trim().Length -gt 0) {
    Write-Host $stdout
  }

  if ($stderr.Trim().Length -gt 0) {
    Write-Host $stderr
  }

  return [int]$process.ExitCode
}

if (!(Test-Path $MissionDir)) {
  Write-Host "Missing mission directory: $MissionDir"
  exit 1
}

Ensure-Directory $LogDir

if (!(Test-Path $RuntimePath)) {
  if (!(Test-Path $RuntimeExamplePath)) {
    Write-Host "Missing runtime example: $RuntimeExamplePath"
    exit 1
  }

  Copy-Item $RuntimeExamplePath $RuntimePath
}

$state = Read-JsonFile $RuntimePath

if ($state.stop_requested -eq $true) {
  Write-Host "Stop requested in mission-runtime.json."
  exit 0
}

$missions = Get-ChildItem $MissionDir -Filter "*.md" | Sort-Object Name
$maxMissions = 0

if ($env:MISSION_MAX -and [int]::TryParse($env:MISSION_MAX, [ref]$maxMissions)) {
  Write-Host "MISSION_MAX=$maxMissions"
} else {
  $maxMissions = 0
}

$missionsRun = 0

foreach ($mission in $missions) {
  $missionName = $mission.Name
  $state = Read-JsonFile $RuntimePath

  if ($state.stop_requested -eq $true) {
    Write-Host "Stop requested."
    break
  }

  $completed = Normalize-Array $state.completed
  $failed = Normalize-Array $state.failed

  if ($completed -contains $missionName) {
    Write-Host "Skipping completed mission: $missionName"
    continue
  }

  if ($failed -contains $missionName) {
    Write-Host "Skipping previously failed mission: $missionName"
    continue
  }

  if ($maxMissions -gt 0 -and $missionsRun -ge $maxMissions) {
    Write-Host "MISSION_MAX reached."
    break
  }

  Write-Host ""
  Write-Host "Starting mission: $missionName"

  $state.current = $missionName
  Save-JsonFile $state $RuntimePath

  $timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
  $logPath = Join-Path $LogDir "$timestamp-$missionName.log"

  try {
    $codexExitCode = Invoke-CodexExec -MissionPath $mission.FullName -LogPath $logPath

    if ($codexExitCode -ne 0) {
      throw "Codex exited with code $codexExitCode"
    }

    Write-Host ""
    Write-Host "Running post-mission checks..."

    $buildCode = Invoke-CheckedCommand "npm" @("run", "build")
    $testCode = Invoke-CheckedCommand "npm" @("test")
    $scanCode = Invoke-CheckedCommand "npm" @("run", "atree:scan")
    $validateCode = Invoke-CheckedCommand "npm" @("run", "atree:validate")

    if ($buildCode -ne 0 -or $testCode -ne 0 -or $scanCode -ne 0 -or $validateCode -ne 0) {
      throw "Post-mission checks failed. build=$buildCode test=$testCode scan=$scanCode validate=$validateCode"
    }

    $state = Read-JsonFile $RuntimePath
    $state = Add-ToJsonArray $state "completed" $missionName
    $state.current = ""
    Save-JsonFile $state $RuntimePath

    $missionsRun += 1
    Write-Host "Mission completed: $missionName"
  }
  catch {
    Write-Host ""
    Write-Host "Mission failed: $missionName"
    Write-Host $_

    $state = Read-JsonFile $RuntimePath
    $state = Add-ToJsonArray $state "failed" $missionName
    $state.current = ""
    Save-JsonFile $state $RuntimePath

    Write-Host "Stopping after failure for review."
    exit 1
  }
}

Write-Host ""
Write-Host "Mission runner finished."
