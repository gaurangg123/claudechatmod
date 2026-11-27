# Shell Party for Claude Code: one-step install for Windows (PowerShell 5.1 or 7).
#
#   Install or update:  irm https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.ps1 | iex
#   Uninstall:          & ([scriptblock]::Create((irm https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.ps1))) -Uninstall
#
# What it changes, and nothing else:
#   1. Installs (or updates) the shell-party plugin for your Claude Code user.
#   2. Sets "theme" in Claude Code's settings.json, keeping every other key.
#   3. If Windows Terminal is installed, adds a "Shell Party" color scheme and a
#      separate "Shell Party" profile with an animated background. Your other
#      profiles are not touched. Set SHELL_PARTY_NO_TERMINAL=1 to skip this step.
# Every file it edits is backed up once, next to the file, as *.before-shell-party.bak.
param([switch]$Uninstall)

# 'Continue', not 'Stop': in Windows PowerShell 5.1 'Stop' turns any line a native
# program writes to stderr into a fatal error. Cmdlets that must succeed say -ErrorAction Stop.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$Repo = 'gaurangg123/claudechatmod'
$Raw = if ($env:SHELL_PARTY_RAW) { $env:SHELL_PARTY_RAW } else { "https://raw.githubusercontent.com/$Repo/main" }
$Plugin = 'shell-party@claudechatmod'
$Theme = 'custom:shell-party:shell-party'
$ProfileGuid = '{5e11f0a7-7a27-4c8a-9b1f-5e11a9a27e01}'
$DataDir = Join-Path $env:LOCALAPPDATA 'ShellParty'
$Utf8 = New-Object Text.UTF8Encoding $false

function Say($text, $color = 'Gray') { Write-Host "  $text" -ForegroundColor $color }

# Reads a JSON file into an object; $null for a missing or empty file. Throws
# on JSON it can't read (Windows PowerShell 5.1 doesn't accept comments).
function Read-Json($path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    $text = [IO.File]::ReadAllText($path)
    if (-not $text.Trim()) { return $null }
    return $text | ConvertFrom-Json -ErrorAction Stop
}

function Write-Json($path, $value) {
    $first = "$path.before-shell-party.bak"
    if ((Test-Path -LiteralPath $path) -and -not (Test-Path -LiteralPath $first)) { Copy-Item -LiteralPath $path $first -ErrorAction Stop }
    [IO.File]::WriteAllText($path, ($value | ConvertTo-Json -Depth 64), $Utf8)
}

function Set-Prop($object, $name, $value) {
    $object | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force
}

function Get-TerminalSettings {
    @(
        (Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json'),
        (Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\settings.json')
    ) | Where-Object { Test-Path -LiteralPath $_ }
}

$Scheme = [pscustomobject][ordered]@{
    name = 'Shell Party'; background = '#050505'; foreground = '#ECE8F5'; cursorColor = '#FF2D95'; selectionBackground = '#5C1E70'
    black = '#0B0714'; red = '#FF3D6E'; green = '#19F0AA'; yellow = '#FFD23F'; blue = '#2D7BFF'; purple = '#B14DFF'; cyan = '#00E5FF'; white = '#CFC8E0'
    brightBlack = '#5B4A7A'; brightRed = '#FF6B9A'; brightGreen = '#7CFFD2'; brightYellow = '#FFE27A'; brightBlue = '#6FA3FF'; brightPurple = '#E100FF'; brightCyan = '#7DF3FF'; brightWhite = '#FFFFFF'
}

# Adds (or, with $remove, takes out) the Shell Party scheme and profile in one
# Windows Terminal settings file. Returns what it did.
function Update-Terminal($file, $wallpaper, [switch]$remove) {
    try { $wt = Read-Json $file } catch { return "skipped $file (it has comments or isn't plain JSON; see the README to add the profile by hand)" }
    if ($null -eq $wt) { return "skipped $file (empty)" }

    $schemes = @($wt.schemes | Where-Object { $_ -and $_.name -ne 'Shell Party' })
    if (-not $remove) { $schemes += $Scheme }
    Set-Prop $wt 'schemes' $schemes

    $isList = $wt.profiles -is [array]
    $current = if ($isList) { $wt.profiles } elseif ($wt.profiles) { $wt.profiles.list } else { @() }
    $profiles = @($current | Where-Object { $_ -and $_.guid -ne $ProfileGuid })
    if (-not $remove) {
        $shell = if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { 'pwsh.exe -NoLogo' } else { 'powershell.exe -NoLogo' }
        $profiles += [pscustomobject][ordered]@{
            guid = $ProfileGuid; name = 'Shell Party'; commandline = $shell; startingDirectory = '%USERPROFILE%'
            colorScheme = 'Shell Party'; tabTitle = 'Shell Party'; hidden = $false
            backgroundImage = $wallpaper; backgroundImageOpacity = 0.3
            backgroundImageStretchMode = 'uniformToFill'; backgroundImageAlignment = 'center'
        }
    }
    if ($isList -or -not $wt.profiles) { Set-Prop $wt 'profiles' ([pscustomobject]@{ list = $profiles }) }
    else { Set-Prop $wt.profiles 'list' $profiles }

    Write-Json $file $wt
    if ($remove) { return "removed the Shell Party profile from $file" }
    return "added the Shell Party profile to $file"
}

Write-Host ''
Write-Host '  Shell Party for Claude Code' -ForegroundColor Magenta
Write-Host ''

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Say 'Claude Code is not installed (no "claude" command found).' Yellow
    Say 'Install it from https://claude.com/claude-code, then run this again.'
    return
}
$ConfigDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$Settings = Join-Path $ConfigDir 'settings.json'

if ($Uninstall) {
    Say 'Removing the plugin...' Cyan
    & claude plugin uninstall $Plugin 2>$null | Out-Null
    try {
        $json = Read-Json $Settings
        if ($json -and $json.theme -eq $Theme) {
            # put back the theme the backup had, if it had one
            $previous = $null
            try { $previous = (Read-Json "$Settings.before-shell-party.bak").theme } catch { }
            if ($previous -and $previous -ne $Theme) { Set-Prop $json 'theme' $previous; $back = "your previous theme ($previous)" }
            else { $json.PSObject.Properties.Remove('theme'); $back = 'its default theme' }
            Write-Json $Settings $json
            Say "Claude Code is back to $back."
        }
    } catch { Say "Could not update $Settings; pick another theme with /theme." Yellow }
    foreach ($file in Get-TerminalSettings) { Say (Update-Terminal $file '' -remove) }
    if (Test-Path -LiteralPath $DataDir) { Remove-Item -LiteralPath $DataDir -Recurse -Force -ErrorAction SilentlyContinue }
    Say 'Done. Shell Party is uninstalled.' Green
    Write-Host ''
    return
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Say 'git is needed to download the theme. Install it from https://git-scm.com, then run this again.' Yellow
    return
}

# The backup comes first: the plugin install below writes settings.json too.
New-Item -ItemType Directory -Force -Path $ConfigDir -ErrorAction Stop | Out-Null
if ((Test-Path -LiteralPath $Settings) -and -not (Test-Path -LiteralPath "$Settings.before-shell-party.bak")) {
    Copy-Item -LiteralPath $Settings "$Settings.before-shell-party.bak" -ErrorAction Stop
}

# 1. The plugin: update it when it's there, install it when it isn't, and
#    take out the old Neon Miami plugin it replaces.
Say '[1/3] Installing the plugin...' Cyan
$listed = (& claude plugin list 2>$null | Out-String)
if ($listed -match 'neon-miami@claudechatmod') { & claude plugin uninstall neon-miami@claudechatmod 2>$null | Out-Null }
if ($listed -match [regex]::Escape($Plugin)) {
    & claude plugin marketplace update claudechatmod 2>$null | Out-Null
    & claude plugin update $Plugin
} else {
    & claude plugin install shell-party --marketplace $Repo -y
}
if ($LASTEXITCODE -ne 0) {
    Say 'The plugin install did not finish. See the message above, then run this again.' Red
    return
}

# 2. Claude Code's terminal colors.
Say '[2/3] Turning on the Shell Party colors...' Cyan
try {
    New-Item -ItemType Directory -Force -Path $ConfigDir -ErrorAction Stop | Out-Null
    $json = Read-Json $Settings
    if ($null -eq $json) { $json = New-Object PSObject }
    Set-Prop $json 'theme' $Theme
    Write-Json $Settings $json
} catch {
    Say "Could not update $Settings. Pick ""Shell Party"" in /theme instead." Yellow
}

# 3. Windows Terminal: a scheme and a profile with the animated background.
Say '[3/3] Setting up Windows Terminal...' Cyan
$terminals = @(Get-TerminalSettings)
if ($env:SHELL_PARTY_NO_TERMINAL) {
    Say 'Skipped: SHELL_PARTY_NO_TERMINAL is set.'
} elseif ($terminals.Count -eq 0) {
    Say 'Windows Terminal is not installed (or has never been opened); skipped.'
} else {
    try {
        New-Item -ItemType Directory -Force -Path $DataDir -ErrorAction Stop | Out-Null
        $wallpaper = Join-Path $DataDir 'wallpaper.gif'
        Invoke-WebRequest -UseBasicParsing -Uri "$Raw/terminal/wallpaper.gif" -OutFile $wallpaper -ErrorAction Stop
        foreach ($file in $terminals) { Say (Update-Terminal $file $wallpaper) }
    } catch {
        Say "Could not set up Windows Terminal: $($_.Exception.Message)" Yellow
    }
}

Write-Host ''
Say 'Done. Start a new Claude Code session to see it:' Green
Say '  - Desktop app: animated scenes behind the chat. /party-shell mode light for bright scenes.'
Say '  - Windows Terminal: open the "Shell Party" profile (the tab menu), then run claude.'
Say '  - Any terminal: neon colors and a skyline above the prompt. Type /party-shell for settings.'
Write-Host ''
