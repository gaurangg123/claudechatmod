# Neon Miami

A night-time pixel-art theme for Claude Code, kept dark in the middle so the chat stays easy to
read. Five original scenes take turns behind the conversation. Each is a mood drawn from scratch
and uses no game's characters, logos, maps or interface:

| Scene | What's in it |
| --- | --- |
| **Neon Miami** | Synthwave sunset, neon skyline, palm trees, supercars on a causeway, a CRT and a cassette on the desk |
| **Neon Rain** | A rainy neon megacity: glyph signs, a hologram billboard, hover cars, an elevated train, a noodle stall |
| **Blocklands Day** | A sunny blocky world: grassy hills, fluffy clouds, blossom trees, a lake, a cabin, a floating island |
| **Blocklands Night** | The same world at night: full moon, glowing crystals, lanterns, fireflies, a lit cabin |
| **Night Ops** | A night-vision base: watchtower searchlight, helicopter, radar scope, containers, a mission panel |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install neon-miami --marketplace gaurangg123/claudechatmod
```

Answer `y` to add the marketplace, then press Enter for the user scope.

From a shell:

```
claude plugin install neon-miami --marketplace gaurangg123/claudechatmod
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins,
Add marketplace with `gaurangg123/claudechatmod`, then Add plugin.

Installing needs `git` on the computer; no GitHub account is needed.

### In a project's cloud sessions

Add this to the project's `.claude/settings.json`, so sessions on that repository load the theme:

```json
{
  "extraKnownMarketplaces": {
    "claudechatmod": { "source": { "source": "github", "repo": "gaurangg123/claudechatmod" } }
  },
  "enabledPlugins": { "neon-miami@claudechatmod": true }
}
```

## What it changes

| Where | What you get |
| --- | --- |
| Desktop app (Code tab) | The scene behind the chat under dark frosted panels, changing every minute, and a neon text palette tinted to match each scene |
| Mobile app (a session from this computer) | The same scenes, laid out for a tall screen |
| Terminal | A 4-row pixel skyline band above the prompt, neon spinner words and a **Neon Miami** color theme |

## Controls

```
/neon                       show what is on
/neon scene <name>          neon-miami, blocklands-day, neon-rain, night-ops or blocklands
/neon next                  the next scene now
/neon slideshow on|off      rotate through the scenes (on by default)
/neon every <minutes>       how long each scene stays (1 by default)
/neon backdrop on|off       the scene behind the chat (desktop, mobile)
/neon band on|off           the pixel skyline above the prompt (terminal)
/neon motion on|off         blinking lights, rain and the radar sweep
```

Your choices are remembered across sessions. The slideshow follows the clock, so every window shows the same scene.
Terminal colors: pick **Neon Miami** in `/theme`.

## Changing the art

The scenes are generated: edit `scripts/build-scene.mjs` and run `node scripts/build-scene.mjs` to
rewrite `hooks/scene.ts`. Add `--preview <folder>` to also write each scene's SVGs there.

## License

GPL-3.0. See [LICENSE](LICENSE).
