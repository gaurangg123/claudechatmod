# Neon Miami for Claude Code

Fourteen animated pixel-art scenes behind your Claude Code chat (neon cities, deserts, deep space,
a night race, an AI lab, cats and dogs), with neon text colors and a neon skyline in the terminal.
Fireworks go off when Claude finishes a long task, and a red alert flashes when tests fail.

![Neon Miami demo](screenshots/demo.gif)

**[▶ Watch the full demo video (28 s)](screenshots/demo.mp4)**

## Install

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.ps1 | iex
```

**macOS / Linux**:

```bash
curl -fsSL https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.sh | bash
```

Then start a new Claude Code session. That's it.

You need [Claude Code](https://claude.com/claude-code) and `git`.

## Use

A new scene appears every minute. Type `/neon` in Claude Code to change things:

| Command | What it does |
| --- | --- |
| `/neon next` | Show the next scene |
| `/neon scene deep-space` | Pick a scene by name (see below) |
| `/neon slideshow off` | Keep the current scene |
| `/neon motion off` | Stop the animation |
| `/neon party` | Show the fireworks now |
| `/neon reactions off` | No fireworks or test alerts |

## Scenes

| | |
| --- | --- |
| ![Neon Miami](screenshots/neon-miami.png) **Neon Miami** `neon-miami` | ![Dune Sea](screenshots/dune-sea.png) **Dune Sea** `dune-sea` |
| ![Deep Space](screenshots/deep-space.png) **Deep Space** `deep-space` | ![Neon Rain](screenshots/neon-rain.png) **Neon Rain** `neon-rain` |
| ![Grand Prix](screenshots/grand-prix.png) **Grand Prix** `grand-prix` | ![Rooftop Cats](screenshots/rooftop-cats.png) **Rooftop Cats** `rooftop-cats` |
| ![Blocklands Day](screenshots/blocklands-day.png) **Blocklands Day** `blocklands-day` | ![AI Lab](screenshots/ai-lab.png) **AI Lab** `ai-lab` |
| ![Black Hole](screenshots/black-hole.png) **Black Hole** `black-hole` | ![Night Ops](screenshots/night-ops.png) **Night Ops** `night-ops` |
| ![Dog Park](screenshots/dog-park.png) **Dog Park** `dog-park` | ![Desert Lab](screenshots/desert-lab.png) **Desert Lab** `desert-lab` |
| ![Gargoyle City](screenshots/gargoyle-city.png) **Gargoyle City** `gargoyle-city` | ![Blocklands Night](screenshots/blocklands.png) **Blocklands Night** `blocklands` |

All scenes are original art. A new scene shows every minute, in this order. The pictures of Neon
Miami, Neon Rain, Night Ops and both Blocklands are mockups of the desktop app; the rest show the
scene alone.

## Uninstall

```bash
claude plugin uninstall neon-miami@claudechatmod
```

Then pick another theme with `/theme`.

<details>
<summary>More options</summary>

**Install by hand.** In a Claude Code terminal session:
`/plugin install neon-miami --marketplace gaurangg123/claudechatmod`

**Cloud sessions.** Add this to the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "claudechatmod": { "source": { "source": "github", "repo": "gaurangg123/claudechatmod" } }
  },
  "enabledPlugins": { "neon-miami@claudechatmod": true }
}
```

**Change the art.** See [dev/README.md](dev/README.md).

</details>

## License

GPL-3.0
