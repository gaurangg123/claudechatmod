# Shell Party for Claude Code: one-step install on Windows.
#   irm https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.ps1 | iex
# Installs the plugin for your user, then turns on its terminal colors.

$ErrorActionPreference = 'Stop'
$Marketplace = 'gaurangg123/claudechatmod'
$Theme = 'custom:shell-party:shell-party'

Write-Host ''
Write-Host '  Shell Party for Claude Code' -ForegroundColor Magenta
Write-Host ''

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host '  Claude Code is not installed (no "claude" command found).' -ForegroundColor Yellow
    Write-Host '  Install it from https://claude.com/claude-code, then run this again.'
    return
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host '  git is needed to download the theme. Install it from https://git-scm.com, then run this again.' -ForegroundColor Yellow
    return
}

Write-Host '  [1/2] Installing the plugin...' -ForegroundColor Cyan
& claude plugin install shell-party --marketplace $Marketplace -y
if ($LASTEXITCODE -ne 0) {
    Write-Host '  The install did not finish. See the message above.' -ForegroundColor Red
    return
}

Write-Host '  [2/2] Turning on the Shell Party terminal colors...' -ForegroundColor Cyan
$ConfigDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$Settings = Join-Path $ConfigDir 'settings.json'
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
try {
    if (Test-Path $Settings) {
        $raw = [IO.File]::ReadAllText($Settings)
        Copy-Item $Settings "$Settings.before-shell-party.bak" -Force
        $json = if ($raw.Trim()) { $raw | ConvertFrom-Json } else { New-Object PSObject }
    } else {
        $json = New-Object PSObject
    }
    $json | Add-Member -NotePropertyName theme -NotePropertyValue $Theme -Force
    $out = $json | ConvertTo-Json -Depth 32
    [IO.File]::WriteAllText($Settings, $out, (New-Object Text.UTF8Encoding $false))
} catch {
    Write-Host "  Could not update $Settings. Pick ""Shell Party"" in /theme instead." -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  Done. Start a new Claude Code session to see it:' -ForegroundColor Green
Write-Host '    - Desktop app: the scenes appear behind the chat, changing every minute.'
Write-Host '    - Terminal: a neon skyline above the prompt and Shell Party colors.'
Write-Host '    - Type /party-shell in a session for scenes and settings.'
Write-Host ''
