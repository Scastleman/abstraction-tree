$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$head = git log --oneline -1
$trackedStat = git diff --stat
$trackedNames = git diff --name-status
$untracked = git ls-files --others --exclude-standard

Write-Host "# Diff Summary Since Last Commit"
Write-Host ""
Write-Host "Base: $head"
Write-Host ""

Write-Host "## Tracked Changes"
if ($trackedNames) {
  $trackedStat
  Write-Host ""
  $trackedNames
} else {
  Write-Host "No tracked changes."
}

Write-Host ""
Write-Host "## Untracked Files"
if ($untracked) {
  $untracked
} else {
  Write-Host "No untracked files."
}

Write-Host ""
Write-Host "## Review Commands"
Write-Host "git diff --stat"
Write-Host "git diff"
Write-Host "git status --short"
