<div align="center">

<img src="screenshots/banner.png" alt="Shell Party: 14 animated pixel-art scenes behind your Claude Code chat" width="100%">

# Shell Party for Claude Code 🎉

**Animated pixel-art worlds behind your chat. Neon text. Fireworks when Claude finishes a big task.**

[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-ff2d95?style=for-the-badge)](https://claude.com/claude-code) [![Scenes](https://img.shields.io/badge/scenes-14-00e5ff?style=for-the-badge)](#-scenes) [![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-9b4dff?style=for-the-badge)](LICENSE) [![Install](https://img.shields.io/badge/install-one%20command-ffd23f?style=for-the-badge)](#-install-in-one-command)

[Install](#-install-in-one-command) • [Scenes](#-scenes) • [Commands](#-commands) • [Reactions](#-reactions) • [Where it works](#-where-it-works) • [Troubleshooting](#-troubleshooting) • [Make your own scene](#-make-your-own-scene)

</div>

---

## ✨ What you get

<img src="screenshots/demo.gif" alt="Shell Party demo: the chat over an animated neon city, then fireworks and a new scene" align="right" width="420">

- **14 animated scenes** behind the conversation: neon cities, deserts, deep space, a black hole,
  a night race, an AI lab, and cats and dogs. Cars drive, rain falls, stars twinkle.
- **A slideshow**: a new scene fades in every minute (or pick one and keep it).
- **Reactions**: fireworks when Claude finishes a long task, a red alert when your tests fail.
- **Neon text colors** that stay readable on every scene.
- **A pixel skyline** above the prompt when you use Claude Code in a terminal.
- **One `/party-shell` command** to change all of it.

<br clear="right">

## 🚀 Install in one command

You need [Claude Code](https://claude.com/claude-code) and `git`.

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.ps1 | iex
```

**macOS / Linux**:

```bash
curl -fsSL https://raw.githubusercontent.com/gaurangg123/claudechatmod/main/install.sh | bash
```

Then **start a new Claude Code session**, or type `/reload-plugins` in an open one. That's it.

<details>
<summary><b>What does the installer do?</b></summary>

1. Checks that `claude` and `git` are installed.
2. Installs the plugin: `claude plugin install shell-party --marketplace gaurangg123/claudechatmod`.
3. Sets `"theme": "custom:shell-party:shell-party"` in your Claude Code `settings.json`, after saving
   a backup next to it (`settings.json.before-shell-party.bak`).

Nothing else on your computer changes. Read [install.ps1](install.ps1) or [install.sh](install.sh)
before you run them.

</details>

<details>
<summary><b>Install by hand instead</b></summary>

In Claude Code, run:

```
/plugin install shell-party --marketplace gaurangg123/claudechatmod
```

Then pick the theme with `/theme` → **Shell Party**.

</details>

## 🎨 Scenes

A new scene shows every minute, in the order below. Jump to any of them with
`/party-shell scene <name>`. All of the art is original, drawn from code in [dev/build-scene.mjs](dev/build-scene.mjs).

### 🌆 Neon cities

| | |
| :---: | :---: |
| ![Neon Miami](screenshots/neon-miami.png) | ![Neon Rain](screenshots/neon-rain.png) |
| **Neon Miami** · `neon-miami`<br>Palm trees, a striped sunset, cars on a neon causeway | **Neon Rain** · `neon-rain`<br>A rainy megacity, hover cars, a hologram billboard |
| ![Gargoyle City](screenshots/gargoyle-city.png) | ![Night Ops](screenshots/night-ops.png) |
| **Gargoyle City** · `gargoyle-city`<br>Gothic towers in the rain, a searchlight on the clouds | **Night Ops** · `night-ops`<br>A night-vision base, a helicopter, a radar sweep |

### 🏜️ Desert

| | |
| :---: | :---: |
| ![Dune Sea](screenshots/dune-sea.png) | ![Desert Lab](screenshots/desert-lab.png) |
| **Dune Sea** · `dune-sea`<br>Dunes at sunset, a camel caravan, a rolling tumbleweed | **Desert Lab** · `desert-lab`<br>An old camper van under the stars, flasks bubbling |

### 🪐 Space

| | |
| :---: | :---: |
| ![Deep Space](screenshots/deep-space.png) | ![Black Hole](screenshots/black-hole.png) |
| **Deep Space** · `deep-space`<br>A ringed planet, a spinning station, a drifting astronaut | **Black Hole** · `black-hole`<br>A glowing black hole over an ocean world and a giant wave |

### 🏁 Games and racing

| | |
| :---: | :---: |
| ![Grand Prix](screenshots/grand-prix.png) | ![Blocklands Day](screenshots/blocklands-day.png) |
| **Grand Prix** · `grand-prix`<br>A night race, start lights counting down, cars flying by | **Blocklands Day** · `blocklands-day`<br>A sunny blocky world, clouds drifting over a lake |
| ![Blocklands Night](screenshots/blocklands.png) | |
| **Blocklands Night** · `blocklands`<br>The blocky world under a full moon, fireflies glowing | |

### 🤖 Tech

| |
| :---: |
| ![AI Lab](screenshots/ai-lab.png) |
| **AI Lab** · `ai-lab`<br>Blinking server racks, a neural network lighting up, a model training |

### 🐾 Pets

| | |
| :---: | :---: |
| ![Rooftop Cats](screenshots/rooftop-cats.png) | ![Dog Park](screenshots/dog-park.png) |
| **Rooftop Cats** · `rooftop-cats`<br>Cats on the roofs under a big moon, one says MEOW | **Dog Park** · `dog-park`<br>Dogs chasing a ball, catching a frisbee, napping in the shade |

<sub>The pictures of Neon Miami, Neon Rain, Night Ops and both Blocklands scenes are mockups of the
desktop app; the others show the scene on its own. In the app, every scene moves.</sub>

## ⌨️ Commands

Type these in any Claude Code chat:

| Command | What it does |
| --- | --- |
| `/party-shell` | Show what's on and the list of commands |
| `/party-shell next` | Show the next scene |
| `/party-shell scene <name>` | Pick a scene, for example `/party-shell scene dog-park` |
| `/party-shell slideshow on` \| `off` | Change scenes on a timer, or keep the current one |
| `/party-shell every <minutes>` | How long each scene stays, 1 to 240 minutes |
| `/party-shell motion on` \| `off` | Turn the animation on or off |
| `/party-shell reactions on` \| `off` | Fireworks and test alerts on or off |
| `/party-shell party` | Show the fireworks now |
| `/party-shell alert` | Show the test alert now |
| `/party-shell backdrop on` \| `off` | The scene behind the chat (desktop app) |
| `/party-shell band on` \| `off` | The pixel skyline above the prompt (terminal) |

Your choices are remembered across sessions.

## 🎆 Reactions

| When | What you see |
| --- | --- |
| Claude finishes a task that took **20 seconds or more** | 🎆 Fireworks over the scene for 7 seconds |
| A test command fails (`npm test`, `pytest`, `jest`, `cargo test`, `go test` and similar) | 🚨 The edges glow red with **TESTS FAILED** for 9 seconds, or until a run passes |

Turn them off with `/party-shell reactions off`.

## 💻 Where it works

| Where | What you get |
| --- | --- |
| **Claude desktop app** (Code tab) | ✅ Animated scenes, slideshow, reactions, neon text colors |
| **Terminal** (PowerShell, Windows Terminal, macOS Terminal, iTerm…) | ✅ Neon colors and the pixel skyline above the prompt |
| **Cloud sessions** (claude.ai/code) | ⚠️ Only with the project settings below |
| **Other AI tools** (Codex, Cursor…) | ❌ It's a Claude Code plugin, so it runs only in Claude Code |

<details>
<summary><b>Turn it on for cloud sessions</b></summary>

Cloud sessions run on Anthropic's servers and can't see plugins on your computer. Add this to the
project's `.claude/settings.json` and commit it:

```json
{
  "extraKnownMarketplaces": {
    "claudechatmod": { "source": { "source": "github", "repo": "gaurangg123/claudechatmod" } }
  },
  "enabledPlugins": { "shell-party@claudechatmod": true }
}
```

</details>

## 🛠️ Troubleshooting

<details>
<summary><b>Scrolling the chat feels slow or laggy</b></summary>

The scene is animated, and scrolling over moving art is heavy for some laptops. Type
`/party-shell motion off`: the scene stays but stops moving, and scrolling is smooth again.
`/party-shell motion on` brings the animation back.

</details>

<details>
<summary><b>The theme shows in one chat but not in another</b></summary>

The desktop app starts a chat's Claude Code session only when you send something in it. Open the
chat and send any message, or just type `/party-shell`.

</details>

<details>
<summary><b><code>/party-shell</code> is not found, or nothing changed after an update</b></summary>

Type `/reload-plugins`, or start a new session. To get the newest version:

```bash
claude plugin update shell-party@claudechatmod
```

</details>

<details>
<summary><b>The text colors changed but there's no scene behind the chat</b></summary>

Scenes are drawn by the Claude desktop app. In a terminal you get the colors and the skyline above
the prompt instead. In the desktop app, check that `/party-shell backdrop on` is set.

</details>

## 🧩 Make your own scene

Every scene is drawn from code, so you can change one or add your own.

```mermaid
flowchart LR
  A["dev/build-scene.mjs<br/>draws each scene as pixel art"] -->|node dev/build-scene.mjs| B["hooks/scenes/*.ts<br/>one SVG module per scene"]
  B --> C["hooks/register.tsx<br/>slideshow, reactions, /party-shell"]
  C --> D["Claude desktop app<br/>draws the scene behind the chat"]
```

1. Write a function in [dev/build-scene.mjs](dev/build-scene.mjs) that draws your scene for any
   width and height (see `dogs()` or `space()` for a short example), and add it to `BUILDERS`.
2. Add a one-line description to `ALT` in [hooks/register.tsx](hooks/register.tsx).
3. Run `node dev/build-scene.mjs --preview <folder>` and open the SVGs it saves in a browser.
4. Run the tests: `claude plugin test .`

Pull requests with new scenes are welcome. Please keep them
original art, with no logos or characters from games, films or shows.

<details>
<summary><b>What's in this repository</b></summary>

```
.claude-plugin/     plugin and marketplace manifests
hooks/
  register.tsx      the theme: backdrop, slideshow, reactions, /party-shell
  band.ts           the pixel skyline above the terminal prompt
  scene.ts          the list of scenes (generated)
  scenes/           one generated module per scene
themes/             terminal colors
types/              the plugin's state types
dev/                the scene builder (build-scene.mjs) and the tests
screenshots/        the pictures and the demo in this README
install.ps1         one-line installer for Windows
install.sh          one-line installer for macOS and Linux
```

</details>

## 🗑️ Uninstall

```bash
claude plugin uninstall shell-party@claudechatmod
```

Then pick another theme with `/theme`.

## 📄 License

[GPL-3.0](LICENSE). All scenes are original pixel art made for this project.

<sub>Shell Party was called Neon Miami before version 0.5.0. If you installed it under that name, run
`claude plugin uninstall neon-miami@claudechatmod`, then install again with the command above.</sub>
