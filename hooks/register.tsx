import type { EngineInterface, Register, ThemeColors, ThemeResult, Timer } from 'claude-code'

import type { ShellPartyPrefs, ShellPartyView } from '../types'
import { bandCells } from './band'
import { REACTIONS, SCENE_NAMES, SCENES, STYLE, type Reaction, type SceneName } from './scene'

// v2 holds the slideshow's clock offset and the 1-minute default; v1 choices carry over once.
const STORE_KEY = 'prefs-v2'
const OLD_STORE_KEY = 'prefs'
const DEFAULTS: ShellPartyPrefs = {
  backdrop: true,
  band: true,
  motion: true,
  scene: 'neon-miami',
  slideshow: true,
  minutes: 1,
  offset: 0,
  reactions: true,
}
// How often the slideshow and reactions look at the clock.
const TICK_MS = 2_000

// The one backdrop name the app holds for the whole session. The look (glass,
// text colors) is sent once; the slideshow changes only the picture drawn for
// it, so a new scene fades in without the rest of the app redrawing.
const BACKDROP = 'shell-party'

// Reactions: fireworks when a task of 20 s or more finishes, a red alert when a
// test command fails.
const PARTY_MS = 7_000
const ALERT_MS = 9_000
const LONG_TASK_MS = 20_000
const TEST_COMMAND = /\b(tests?|jest|vitest|pytest|mocha|rspec|phpunit|go test|cargo test|dotnet test|spec)\b/i

// The person's choices, and what the backdrop shows now; drawings that read them
// redraw when they change.
const PREFS = { plugin: 'shell-party', key: 'prefs' } as const
const VIEW = { plugin: 'shell-party', key: 'view' } as const

// The words the terminal's spinner and turn footer use while the theme is on.
const VERBS = [
  'Cruising', 'Synthwaving', 'Night-driving', 'Neon-glowing', 'Sunset-chasing',
  'Palm-swaying', 'Downshifting', 'Turbo-compiling', 'Overclocking', 'Moonlighting',
  'Pixel-pushing', 'Drifting', 'Bass-boosting', 'Retro-rendering', 'Skyline-scanning',
  'Boulevard-cruising', 'Beach-coding', 'Rewinding the VHS', 'Chasing taillights', 'Tuning the synth',
]
const PAST = [
  'Cruised', 'Drifted', 'Synthwaved', 'Downshifted', 'Overclocked',
  'Moonlit', 'Pixel-pushed', 'Night-drove', 'Turbo-charged', 'Neon-lit',
]

const ALT: { readonly [K in SceneName]: string } = {
  'neon-miami': 'Neon Miami: a pixel-art skyline with palm trees, a striped sunset and supercars on a neon causeway',
  'blocklands-day': 'Blocklands Day: a sunny blocky world with grassy hills, fluffy clouds, trees, a lake and a cabin',
  'neon-rain': 'Neon Rain: a rainy neon megacity with glyph signs, a hologram billboard, hover cars and an elevated train',
  'night-ops': 'Night Ops: a night-vision base with a watchtower searchlight, a helicopter, a radar scope and a mission panel',
  blocklands: 'Blocklands Night: a blocky voxel world at night with a full moon, blossom trees, a lit cabin and a floating island',
  'dune-sea': 'Dune Sea: desert dunes at sunset with a big sun, cacti, a camel caravan and a rolling tumbleweed',
  'deep-space': 'Deep Space: a ringed planet, a spinning space station and a drifting astronaut above a planet at night',
  'grand-prix': 'Grand Prix: a night race under floodlights with start lights, a packed grandstand and open-wheel cars',
  'rooftop-cats': 'Rooftop Cats: cats on the rooftops under a big moon, one asleep, one on a chimney and one walking the wall',
  'ai-lab': 'AI Lab: server racks, a neural network lighting up, a training run, a loss curve and a little robot',
  'black-hole': 'Black Hole: a glowing black hole over an ocean world with a giant wave and a turning ring station',
  'dog-park': 'Dog Park: a sunny park with dogs chasing a ball, jumping for a frisbee and napping under a tree',
  'desert-lab': 'Desert Lab: an old camper van under desert stars, glowing flasks on a lab bench and red mesas',
  'gargoyle-city': 'Gargoyle City: a gothic city in the rain with a searchlight on the clouds and a caped figure on a ledge',
}

function pick(list: readonly string[], seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return list[(h >>> 0) % list.length] ?? seed
}

function isScene(name: unknown): name is SceneName {
  return typeof name === 'string' && (SCENE_NAMES as readonly string[]).includes(name)
}

const sceneIndex = (name: string) => Math.max(0, (SCENE_NAMES as readonly string[]).indexOf(name))
const mod = (n: number, m: number) => ((n % m) + m) % m
const slot = (now: number, minutes: number) => Math.floor(now / (minutes * 60_000))

// The scene on show: with the slideshow on, it follows the wall clock, so
// every window and every copy of the theme agrees on it.
function sceneAt(p: ShellPartyPrefs, now: number): SceneName {
  if (!p.slideshow) return isScene(p.scene) ? p.scene : 'neon-miami'
  return SCENE_NAMES[mod(slot(now, p.minutes) + p.offset, SCENE_NAMES.length)] ?? 'neon-miami'
}

// The offset that puts `scene` on show right now.
const offsetFor = (scene: SceneName, now: number, minutes: number) =>
  mod(sceneIndex(scene) - slot(now, minutes), SCENE_NAMES.length)

function normalize(value: unknown): ShellPartyPrefs {
  const v = typeof value === 'object' && value !== null ? (value as Partial<ShellPartyPrefs>) : {}
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : d)
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d)
  return {
    backdrop: bool(v.backdrop, DEFAULTS.backdrop),
    band: bool(v.band, DEFAULTS.band),
    motion: bool(v.motion, DEFAULTS.motion),
    scene: isScene(v.scene) ? v.scene : DEFAULTS.scene,
    slideshow: bool(v.slideshow, DEFAULTS.slideshow),
    minutes: Math.max(1, Math.min(240, num(v.minutes, DEFAULTS.minutes))),
    offset: mod(num(v.offset, 0), SCENE_NAMES.length),
    reactions: bool(v.reactions, DEFAULTS.reactions),
  }
}

// Copies kept in the module, for engines without $.state (older terminal builds).
let heldPrefs: ShellPartyPrefs = DEFAULTS
let heldView: ShellPartyView | undefined

async function readPrefs($: EngineInterface): Promise<ShellPartyPrefs> {
  try {
    const { value } = await $.state.get(PREFS)
    if (value !== undefined) return normalize(value)
  } catch {
    // no $.state here: the module's copy stands
  }
  return heldPrefs
}

async function readView($: EngineInterface): Promise<ShellPartyView | undefined> {
  try {
    const { value } = await $.state.get(VIEW)
    if (value !== undefined) return value
  } catch {
    // no $.state here: the module's copy stands
  }
  return heldView
}

// Writes go to $.state, which redraws the drawings that read the value; with
// no $.state, the module's copy and a redraw request stand in.
async function writeState($: EngineInterface, write: () => Promise<unknown>, hold: () => void): Promise<void> {
  hold()
  try {
    await write()
  } catch {
    try {
      $.ui.invalidate('ui.render')
    } catch {
      // nothing more to do; the next redraw picks the change up
    }
  }
}

const writePrefs = ($: EngineInterface, p: ShellPartyPrefs) =>
  writeState($, () => $.state.set(PREFS, p), () => (heldPrefs = p))
const writeView = ($: EngineInterface, v: ShellPartyView) =>
  writeState($, () => $.state.set(VIEW, v), () => (heldView = v))

// Saves the choices for this session and the next ones.
async function savePrefs($: EngineInterface, p: ShellPartyPrefs): Promise<void> {
  await writePrefs($, p)
  try {
    await $.store.set(STORE_KEY, p)
  } catch {
    // no store here: the choice lasts for this session
  }
}

// One readable text palette for every scene, sent once with the backdrop: light
// text, a soft neon accent that sits well on every scene.
const ACCENT = '#ff7ac6'
const PALETTE: ThemeColors = {
  v: 1,
  id: 'shell-party',
  label: 'Shell Party',
  inputs: {
    dark: {
      'text-primary': '#f6f2ff',
      'text-secondary': '#d6cff0',
      'text-muted': '#b0a8d2',
      'text-accent': ACCENT,
      'text-link-color': ACCENT,
      'fill-accent': ACCENT,
      'on-accent': '#0a0612',
      'border-accent': ACCENT,
      border: '#3d2f60',
      'border-strong': '#5a468e',
      'bg-user-message': '#25173f',
      'text-success': '#62ffb4',
      'text-warning': '#ffd45f',
      'text-danger': '#ff6f8f',
    },
  },
}

// Glass with no blur: a blur over a moving scene is redrawn every frame, which
// stutters on laptops. The dark tint alone keeps the text readable.
const GLASS = { blur: 0, tint: '#07050c', opacity: 0.5 }

// What the app answered when the theme asked for the backdrop, and the first
// time a surface asked to draw one: /party-shell shows it, and last-run.json keeps it.
const report: { set?: string; asked?: string; ticks: number; changes: number; shown?: string } = { ticks: 0, changes: 0 }

function describe(result: ThemeResult): string {
  return result.isDrawn ? 'the app accepted the backdrop' : `the app is not drawing it: ${result.reason}`
}

async function saveReport($: EngineInterface): Promise<void> {
  try {
    const text = JSON.stringify({ at: new Date().toISOString(), ...report }, null, 2)
    await $.fs.write(`${$.plugin.root}/last-run.json`, text)
  } catch {
    // only a diagnostic: nothing depends on it
  }
}

// Sends the look once (backdrop, glass, text colors), or clears it when the
// person turned the backdrop off. An engine without backdrops rejects, and the
// caller carries on.
async function applyLook($: EngineInterface, p: ShellPartyPrefs, isPersonAsking: boolean): Promise<string> {
  if (!p.backdrop) {
    if (isPersonAsking) await $.theme.clear()
    return 'Backdrop off.'
  }
  let result: ThemeResult
  try {
    result = await $.theme.set({ backdrop: { scene: BACKDROP, glass: GLASS }, overrideColorScheme: 'dark', colors: PALETTE })
  } catch (err) {
    report.set = `the engine refused the theme: ${err instanceof Error ? err.message : String(err)}`
    await saveReport($)
    throw err
  }
  report.set = describe(result)
  await saveReport($)
  return result.isDrawn ? 'Backdrop on.' : `Backdrop set; ${report.set}.`
}

// Looks at the clock: moves to the next scene when its minute has come, and
// ends a reaction whose time is up.
async function tick($: EngineInterface): Promise<void> {
  report.ticks++
  const p = await readPrefs($)
  if (!p.backdrop) return
  const now = await $.clock.now()
  const v = await readView($)
  const scene = sceneAt(p, now)
  let next: ShellPartyView | undefined
  if (v === undefined || v.scene !== scene) {
    next = { scene, fade: p.motion, reaction: v?.reaction, until: v?.until }
  }
  const base = next ?? v
  if (base?.reaction !== undefined && (base.until ?? 0) <= now) {
    next = { scene: base.scene, fade: next !== undefined && next.fade }
  }
  if (next === undefined) return
  await writeView($, next)
  if (next.scene !== v?.scene) {
    report.changes++
    report.shown = next.scene
    await saveReport($)
  }
}

// Draws a reaction over the scene for `ms`.
async function react($: EngineInterface, reaction: Reaction, ms: number, isPersonAsking = false): Promise<void> {
  const p = await readPrefs($)
  if (!p.backdrop || (!p.reactions && !isPersonAsking)) return
  const now = await $.clock.now()
  const v = await readView($)
  await writeView($, { scene: v?.scene ?? sceneAt(p, now), reaction, until: now + ms, fade: false })
}

// One clock per loaded copy of the module; a reload ends the old one's by itself.
let clock: Timer | undefined

function startClock($: EngineInterface): void {
  clock?.cancel()
  try {
    clock = $.clock.every(TICK_MS, () => {
      tick($).catch(() => {
        // a tick that fails leaves the scene as it is; the next one tries again
      })
    })
  } catch {
    // no timers on this engine: the scene changes with /party-shell next
  }
}

const label = (name: string) => (isScene(name) ? SCENES[name].label : name)
const flag = (b: boolean) => (b ? 'on' : 'off')

const HELP = [
  'Shell Party: animated pixel-art scenes behind the chat',
  '  /party-shell next                   show the next scene',
  `  /party-shell scene <name>           pick one: ${SCENE_NAMES.join(', ')}`,
  '  /party-shell slideshow on|off       change scenes on a timer',
  '  /party-shell every <minutes>        how long each scene stays (1 to 240)',
  '  /party-shell motion on|off          moving cars, rain, clouds and lights',
  '  /party-shell reactions on|off       fireworks when a long task ends, an alert when tests fail',
  '  /party-shell party | alert          show a reaction now',
  '  /party-shell backdrop on|off        the scene behind the chat (desktop, mobile)',
  '  /party-shell band on|off            the pixel skyline above the prompt (terminal)',
].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    let raw = await $.store.get(STORE_KEY)
    if (raw === undefined) {
      // first run of v2: keep the on/off choices, move to the 1-minute slideshow
      const old = normalize(await $.store.get(OLD_STORE_KEY))
      raw = { ...DEFAULTS, backdrop: old.backdrop, band: old.band, motion: old.motion }
    }
    const prefs = normalize(raw)
    await savePrefs($, prefs)
    await $.command.register({
      name: 'party-shell',
      description: 'Shell Party theme: pick a scene, run the slideshow, turn motion, reactions, the backdrop or band on and off',
      argumentHint: '[next|scene <name>|slideshow on|off|every <minutes>|motion|reactions|backdrop|band on|off|party|alert]',
    })
    await writeView($, { scene: sceneAt(prefs, await $.clock.now()), fade: prefs.motion })
    try {
      await applyLook($, prefs, false)
    } catch {
      // No backdrop on this engine or surface; the rest of the theme stays on.
    }
    startClock($)

    return next(e)
  })

  // Fireworks when Claude finishes a long task.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.reason === 'answer' && e.durationMs >= LONG_TASK_MS) {
      await react($, 'party', PARTY_MS).catch(() => undefined)
    }
    return result
  })

  // A red alert when a test command fails; a passing run clears it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    const command = String(e.command ?? '')
    if (TEST_COMMAND.test(command)) {
      const failed = 'isError' in result && result.isError === true
      if (failed) await react($, 'alert', ALERT_MS).catch(() => undefined)
      else {
        const v = await readView($)
        if (v?.reaction === 'alert') await writeView($, { scene: v.scene, fade: false })
      }
    }
    return result
  })

  on('command.run', { command: 'party-shell' }, async ($, e) => {
    const [part, arg] = e.args.trim().toLowerCase().split(/\s+/)
    const current = await readPrefs($)
    const now = await $.clock.now()
    const onShow = sceneAt(current, now)
    const change = async (p: ShellPartyPrefs, text: string) => {
      await savePrefs($, p)
      await tick($)
      return { text }
    }
    const toggle = (key: 'backdrop' | 'band' | 'motion' | 'reactions' | 'slideshow') =>
      arg === undefined ? !current[key] : arg === 'on' || arg === 'true' || arg === 'yes'

    if (part === undefined || part === '' || part === 'help' || part === 'status') {
      return {
        text: [
          HELP,
          '',
          `Now: ${label(onShow)}; slideshow ${flag(current.slideshow)} (every ${current.minutes} min), ` +
            `motion ${flag(current.motion)}, reactions ${flag(current.reactions)}, ` +
            `backdrop ${flag(current.backdrop)}, band ${flag(current.band)}.`,
          `Backdrop check: ${report.set ?? 'no answer from the app yet'}; ${report.asked ?? 'no window has asked to draw it yet'}.`,
        ].join('\n'),
      }
    }

    if (part === 'next') {
      const target = SCENE_NAMES[mod(sceneIndex(onShow) + 1, SCENE_NAMES.length)] ?? 'neon-miami'
      return change({ ...current, scene: target, offset: offsetFor(target, now, current.minutes) }, `Now showing ${label(target)}.`)
    }

    if (part === 'scene') {
      const wanted = SCENE_NAMES.find(n => n === arg || n.replace(/-/g, '') === arg?.replace(/-/g, ''))
      if (wanted === undefined) return { text: `Pick one of: ${SCENE_NAMES.join(', ')}.` }
      return change({ ...current, scene: wanted, offset: offsetFor(wanted, now, current.minutes) }, `Now showing ${label(wanted)}.`)
    }

    if (part === 'every') {
      const minutes = Math.round(Number(arg))
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) return { text: 'Give the minutes between scenes, 1 to 240: /party-shell every 1' }
      return change({ ...current, minutes, offset: offsetFor(onShow, now, minutes) }, `Each scene now stays ${minutes} min.`)
    }

    if (part === 'slideshow') {
      const value = toggle('slideshow')
      const p = { ...current, slideshow: value, scene: onShow, offset: offsetFor(onShow, now, current.minutes) }
      return change(p, value ? `Slideshow on: a new scene every ${p.minutes} min.` : `Slideshow off: ${label(onShow)} stays.`)
    }

    if (part === 'party' || part === 'alert') {
      await react($, part, part === 'party' ? PARTY_MS : ALERT_MS, true)
      return { text: part === 'party' ? 'Fireworks!' : 'Red alert (a test run failing looks like this).' }
    }

    if (part === 'motion' || part === 'reactions' || part === 'band') {
      const value = toggle(part)
      const words = { motion: 'Motion', reactions: 'Reactions', band: 'Skyline band' }[part]
      return change({ ...current, [part]: value }, `${words} ${flag(value)}.`)
    }

    if (part === 'backdrop') {
      const p = { ...current, backdrop: toggle('backdrop') }
      await savePrefs($, p)
      try {
        const text = await applyLook($, p, true)
        if (p.backdrop) await tick($)
        return { text }
      } catch {
        return { text: 'This Claude Code build draws no backdrop; it shows in the desktop and mobile apps.' }
      }
    }

    return { text: HELP }
  })

  // The scene behind the conversation: wide on desktop, tall on mobile. It reads
  // the view, so a new scene or a reaction redraws the picture and nothing else.
  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (report.asked === undefined) {
      report.asked = `the ${e.surface} app asked to draw scene "${e.props.scene}" from "${e.props.plugin}"`
      await saveReport($)
    }
    if (e.surface === 'terminal' || (e.props.scene !== BACKDROP && !isScene(e.props.scene))) return next(e)
    const p = await readPrefs($)
    const v = await readView($)
    const name: SceneName = isScene(v?.scene) ? v.scene : isScene(e.props.scene) ? e.props.scene : 'neon-miami'
    const scene = SCENES[name]
    const layout = e.surface === 'mobile' ? 'tall' : 'wide'
    let source: string = scene[layout]
    if (!p.motion) source = source.replace(STYLE, '')
    let over = ''
    if (p.motion && v?.fade === true) over += `<rect width="100%" height="100%" fill="${scene.sky}" opacity="0" class="fi"/>`
    if (v?.reaction !== undefined) over += REACTIONS[v.reaction][layout]
    if (over !== '') source = source.replace(/<\/svg>$/, `${over}</svg>`)
    const { Svg } = $.ui.resolve(e)

    // isInteractive draws it in a sandboxed frame, where its CSS animations run;
    // without it the app draws a still image.
    return <Svg source={source} alt={ALT[name]} isInteractive />
  })

  // The terminal's skyline band, above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const p = await readPrefs($)
    if (!p.band || e.props.maxRows < 5) return next(e)
    const below = await next(e)
    // A second copy of this mod (say, an installed one beside a working copy) draws one band, not two.
    if (JSON.stringify(below ?? null).includes('neon-skyline')) return below
    const { Box, Raster } = $.ui.resolve(e)
    const columns = Math.max(1, Math.min(512, e.props.bodyColumns))

    return (
      <Box flexDirection="column">
        <Raster key="neon-skyline" columns={columns} rows={4} cells={bandCells(columns)} />
        {below}
      </Box>
    )
  })

  // Spinner and turn footer words, terminal only (the desktop's spinner says what a step does).
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.message !== null) return next(e)

    return next({ ...e, props: { ...e.props, word: pick(VERBS, e.props.word) } })
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    return next({ ...e, props: { ...e.props, word: pick(PAST, `${e.props.word}${e.props.durationMs}`) } })
  })
}
