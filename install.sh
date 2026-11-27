#!/usr/bin/env bash
# Shell Party for Claude Code: one-step install for macOS and Linux.
#
#   Install or update:  curl -fsSL https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.sh | bash
#   Uninstall:          curl -fsSL https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.sh | bash -s -- --uninstall
#
# What it changes, and nothing else:
#   1. Installs (or updates) the shell-party plugin for your Claude Code user.
#   2. Sets "theme" in Claude Code's settings.json, keeping every other key.
# settings.json is backed up once, next to it, as settings.json.before-shell-party.bak.
set -euo pipefail

REPO="gaurangg123/claudechatmod"
PLUGIN="shell-party@claudechatmod"
THEME="custom:shell-party:shell-party"
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CONFIG_DIR/settings.json"

say() { printf '  %b\n' "$*"; }

# Sets "theme" in settings.json, with node or python3, whichever is there. With
# an empty value it puts back the theme the backup had (or removes Shell
# Party's). Returns 1 when neither node nor python3 is there.
set_theme() {
  local value="$1"
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs"); const [file, theme, old] = process.argv.slice(1)
      let s = {}; try { const t = fs.readFileSync(file, "utf8"); if (t.trim()) s = JSON.parse(t) } catch (e) { if (e.code !== "ENOENT") throw e }
      let prev; try { prev = JSON.parse(fs.readFileSync(file + ".before-shell-party.bak", "utf8")).theme } catch {}
      if (theme) s.theme = theme
      else if (s.theme === old) { if (prev && prev !== old) s.theme = prev; else delete s.theme }
      fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n")' "$SETTINGS" "$value" "$THEME"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$SETTINGS" "$value" "$THEME" <<'PY'
import json, os, sys
path, theme, old = sys.argv[1:4]
data = {}
if os.path.exists(path):
    text = open(path, encoding="utf-8").read()
    if text.strip():
        data = json.loads(text)
prev = None
try:
    prev = json.load(open(path + ".before-shell-party.bak", encoding="utf-8")).get("theme")
except Exception:
    pass
if theme:
    data["theme"] = theme
elif data.get("theme") == old:
    if prev and prev != old:
        data["theme"] = prev
    else:
        del data["theme"]
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
  else
    return 1
  fi
}

backup_once() {
  if [ -f "$SETTINGS" ] && [ ! -f "$SETTINGS.before-shell-party.bak" ]; then
    cp "$SETTINGS" "$SETTINGS.before-shell-party.bak"
  fi
}

printf '\n  \033[35mShell Party for Claude Code\033[0m\n\n'

if ! command -v claude >/dev/null 2>&1; then
  say "Claude Code is not installed (no \"claude\" command found)."
  say "Install it from https://claude.com/claude-code, then run this again."
  exit 1
fi

if [ "${1:-}" = "--uninstall" ]; then
  say '\033[36mRemoving the plugin...\033[0m'
  claude plugin uninstall "$PLUGIN" >/dev/null 2>&1 || true
  set_theme "" || say "Could not update $SETTINGS; pick another theme with /theme."
  say '\033[32mDone. Shell Party is uninstalled.\033[0m'
  echo
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  say "git is needed to download the theme. Install git, then run this again."
  exit 1
fi

# The backup comes first: the plugin install below writes settings.json too.
mkdir -p "$CONFIG_DIR"
backup_once

# 1. The plugin: update it when it's there, install it when it isn't, and take
#    out the old Neon Miami plugin it replaces.
say '\033[36m[1/2] Installing the plugin...\033[0m'
listed="$(claude plugin list 2>/dev/null || true)"
case "$listed" in *neon-miami@claudechatmod*) claude plugin uninstall neon-miami@claudechatmod >/dev/null 2>&1 || true ;; esac
case "$listed" in
  *"$PLUGIN"*)
    claude plugin marketplace update claudechatmod >/dev/null 2>&1 || true
    claude plugin update "$PLUGIN" ;;
  *)
    claude plugin install shell-party --marketplace "$REPO" -y ;;
esac

# 2. Claude Code's terminal colors.
say '\033[36m[2/2] Turning on the Shell Party colors...\033[0m'
if ! set_theme "$THEME"; then
  say "Could not update $SETTINGS (needs node or python3). Pick \"Shell Party\" in /theme instead."
fi

echo
say '\033[32mDone. Start a new Claude Code session to see it:\033[0m'
say '  - Desktop app: animated scenes behind the chat. /party-shell mode light for bright scenes.'
say '  - Terminal (Terminal.app, iTerm2, any Linux terminal): neon colors and a skyline above the prompt.'
say '  - Type /party-shell in a session for scenes and settings.'
echo
