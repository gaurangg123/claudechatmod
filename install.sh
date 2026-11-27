#!/usr/bin/env bash
# Shell Party for Claude Code: one-step install on macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.sh | bash
# Installs the plugin for your user, then turns on its terminal colors.
set -euo pipefail

MARKETPLACE="gaurangg123/claudechatmod"
THEME="custom:shell-party:shell-party"

printf '\n  \033[35mShell Party for Claude Code\033[0m\n\n'

if ! command -v claude >/dev/null 2>&1; then
  echo "  Claude Code is not installed (no \"claude\" command found)."
  echo "  Install it from https://claude.com/claude-code, then run this again."
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "  git is needed to download the theme. Install git, then run this again."
  exit 1
fi

printf '  \033[36m[1/2] Installing the plugin...\033[0m\n'
claude plugin install shell-party --marketplace "$MARKETPLACE" -y

printf '  \033[36m[2/2] Turning on the Shell Party terminal colors...\033[0m\n'
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CONFIG_DIR/settings.json"
mkdir -p "$CONFIG_DIR"
[ -f "$SETTINGS" ] && cp "$SETTINGS" "$SETTINGS.before-shell-party.bak"

set_theme() {
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs"); const [file, theme] = process.argv.slice(1)
      let s = {}; try { const t = fs.readFileSync(file, "utf8"); if (t.trim()) s = JSON.parse(t) } catch (e) { if (e.code !== "ENOENT") throw e }
      s.theme = theme; fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n")' "$SETTINGS" "$THEME"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$SETTINGS" "$THEME" <<'PY'
import json, os, sys
path, theme = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    text = open(path, encoding="utf-8").read()
    if text.strip():
        data = json.loads(text)
data["theme"] = theme
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
  else
    return 1
  fi
}
if ! set_theme; then
  echo "  Could not update $SETTINGS. Pick \"Shell Party\" in /theme instead."
fi

printf '\n  \033[32mDone. Start a new Claude Code session to see it:\033[0m\n'
echo "    - Desktop app: the scenes appear behind the chat, changing every minute."
echo "    - Terminal: a neon skyline above the prompt and Shell Party colors."
echo "    - Type /party-shell in a session for scenes and settings."
echo
