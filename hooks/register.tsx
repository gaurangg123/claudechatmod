import type { EngineInterface, Register, ThemeColors, ThemeResult, Timer } from 'claude-code'

import type { NeonMiamiPrefs } from '../types'
import { bandCells } from './band'
import { SCENE_NAMES, SCENES, STYLE, type SceneName } from './scene'

// v2 holds the slideshow's clock offset and the 1-minute default; v1 choices carry over once.
const STORE_KEY = 'prefs-v2'
const OLD_STORE_KEY = 'prefs'
const DEFAULTS: NeonMiamiPrefs = {
  backdrop: true,
  band: true,
  motion: true,
  scene: 'neon-miami',
  slideshow: true,
  minutes: 1,
  offset: 0,
}
// How often the slideshow looks at the clock. A scene changes only on its minute.
const TICK_MS = 5_000

// The person's choices for this session; drawings that read it redraw when it changes.
const PREFS = { plugin: 'neon-miami', key: 'prefs' } as const

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
}

// Each scene's accent for the app's text palette: bright enough to read on the dark panels.
const ACCENT: { readonly [K in SceneName]: `#${string}` } = {
  'neon-miami': '#ff5fb3',
  'blocklands-day': '#7ee36b',
  'neon-rain': '#3ee9ff',
  'night-ops': '#4dff9a',
  blocklands: '#5cf0c4',
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
function sceneAt(p: NeonMiamiPrefs, now: number): SceneName {
  if (!p.slideshow) return isScene(p.scene) ? p.scene : DEFAULTS.scene as SceneName
  return SCENE_NAMES[mod(slot(now, p.minutes) + p.offset, SCENE_NAMES.length)] ?? 'neon-miami'
}

// The offset that puts `scene` on show right now.
const offsetFor = (scene: SceneName, now: number, minutes: number) =>
  mod(sceneIndex(scene) - slot(now, minutes), SCENE_NAMES.length)

function normalize(value: unknown): NeonMiamiPrefs {
  const v = typeof value === 'object' && value !== null ? (value as Partial<NeonMiamiPrefs>) : {}
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : d)
  return {
    backdrop: typeof v.backdrop === 'boolean' ? v.backdrop : DEFAULTS.backdrop,
    band: typeof v.band === 'boolean' ? v.band : DEFAULTS.band,
    motion: typeof v.motion === 'boolean' ? v.motion : DEFAULTS.motion,
    scene: isScene(v.scene) ? v.scene : DEFAULTS.scene,
    slideshow: typeof v.slideshow === 'boolean' ? v.slideshow : DEFAULTS.slideshow,
    minutes: Math.max(1, Math.min(240, num(v.minutes, DEFAULTS.minutes))),
    offset: mod(num(v.offset, 0), SCENE_NAMES.length),
  }
}

// A copy kept in the module, for engines without $.state (older terminal
// builds). session.start fills it from the store on every load.
let held: NeonMiamiPrefs = DEFAULTS

async function readPrefs($: EngineInterface): Promise<NeonMiamiPrefs> {
  try {
    const { value } = await $.state.get(PREFS)
    if (value !== undefined) return normalize(value)
  } catch {
    // no $.state here: the module's copy stands
  }
  return held
}

async function writePrefs($: EngineInterface, p: NeonMiamiPrefs): Promise<void> {
  held = p
  try {
    await $.state.set(PREFS, p)
  } catch {
    // no $.state here: ask for a redraw so the band follows the change
    try {
      $.ui.invalidate('ui.render')
    } catch {
      // nothing more to do; the next redraw picks the change up
    }
  }
}

// Saves the choices for this session and the next ones.
async function savePrefs($: EngineInterface, p: NeonMiamiPrefs): Promise<void> {
  await writePrefs($, p)
  try {
    await $.store.set(STORE_KEY, p)
  } catch {
    // no store here: the choice lasts for this session
  }
}

// A readable text palette for the app, tinted with the scene's accent. The
// app keeps its own panels (the backdrop shows through them); this changes the
// text, links, accents and borders. Names the app does not use paint nothing.
function palette(scene: SceneName): ThemeColors {
  const accent = ACCENT[scene]
  return {
    v: 1,
    id: `neon-miami-${scene}`,
    label: `Neon Miami: ${SCENES[scene].label}`,
    inputs: {
      dark: {
        'text-primary': '#f3efff',
        'text-secondary': '#d0c8ec',
        'text-muted': '#a69dc8',
        'text-accent': accent,
        'text-link-color': accent,
        'fill-accent': accent,
        'on-accent': '#0a0612',
        'border-accent': accent,
        border: '#3d2f60',
        'border-strong': '#5a468e',
        'bg-user-message': '#25173f',
        'text-success': '#62ffb4',
        'text-warning': '#ffd45f',
        'text-danger': '#ff6f8f',
      },
    },
  }
}

// What the app answered when the theme asked for the backdrop, and the first
// time a surface asked to draw one: /neon shows it, and last-run.json keeps it.
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

// The scene this copy of the module last asked the app for.
let shown: SceneName | undefined

// Sets the backdrop and text palette for `scene`, or clears them when the
// person turned the backdrop off. An engine without backdrops rejects, and the
// caller carries on.
async function applyBackdrop($: EngineInterface, p: NeonMiamiPrefs, scene: SceneName, isPersonAsking: boolean): Promise<string> {
  if (p.backdrop) {
    let result: ThemeResult
    try {
      result = await $.theme.set({
        backdrop: { scene, glass: { blur: 4, tint: '#07050c', opacity: 0.7 } },
        overrideColorScheme: 'dark',
        colors: palette(scene),
      })
    } catch (err) {
      report.set = `the engine refused the theme: ${err instanceof Error ? err.message : String(err)}`
      await saveReport($)
      throw err
    }
    shown = scene
    report.set = describe(result)
    report.shown = scene
    report.changes++
    await saveReport($)
    return result.isDrawn ? `Now showing ${SCENES[scene].label}.` : `${SCENES[scene].label} set; ${report.set}.`
  }
  shown = undefined
  // Clearing removes whichever theme stands, so only do it when the person asked.
  if (isPersonAsking) await $.theme.clear()
  return 'Backdrop off.'
}

// Looks at the clock and switches the scene when its minute has come.
async function tick($: EngineInterface): Promise<void> {
  report.ticks++
  const p = await readPrefs($)
  if (!p.backdrop) return
  const scene = sceneAt(p, await $.clock.now())
  if (scene !== shown) await applyBackdrop($, p, scene, false)
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
    // no timers on this engine: the scene changes with /neon next
  }
}

const label = (name: string) => (isScene(name) ? SCENES[name].label : name)

const HELP = [
  'Neon Miami: a pixel-art backdrop with five scenes and a slideshow',
  '  /neon                        show what is on',
  `  /neon scene <name>           show one scene: ${SCENE_NAMES.join(', ')}`,
  '  /neon next                   go to the next scene now',
  '  /neon slideshow on|off       rotate through the scenes',
  '  /neon every <minutes>        how long each scene stays (1 to 240)',
  '  /neon backdrop on|off        the scene behind the chat (desktop, mobile)',
  '  /neon band on|off            the pixel skyline above the prompt (terminal)',
  '  /neon motion on|off          blinking lights, rain and radar in the scenes',
  'Terminal colors: pick "Neon Miami" in /theme.',
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
      name: 'neon',
      description: 'Neon Miami theme: pick a scene, run the slideshow, turn the backdrop, band or motion on and off',
      argumentHint: '[scene <name>|next|slideshow on|off|every <minutes>|backdrop|band|motion on|off]',
    })
    try {
      await applyBackdrop($, prefs, sceneAt(prefs, await $.clock.now()), false)
    } catch {
      // No backdrop on this engine or surface; the rest of the theme stays on.
    }
    startClock($)

    return next(e)
  })

  on('command.run', { command: 'neon' }, async ($, e) => {
    const [part, arg] = e.args.trim().toLowerCase().split(/\s+/)
    const current = await readPrefs($)
    const now = await $.clock.now()
    const onShow = sceneAt(current, now)
    const flag = (b: boolean) => (b ? 'on' : 'off')
    const show = async (p: NeonMiamiPrefs) => {
      await savePrefs($, p)
      try {
        return { text: await applyBackdrop($, p, sceneAt(p, now), true) }
      } catch {
        return { text: 'This Claude Code build draws no backdrop; it shows in the desktop and mobile apps.' }
      }
    }

    if (part === undefined || part === '' || part === 'help' || part === 'status') {
      return {
        text: [
          HELP,
          '',
          `Now: ${label(onShow)}; slideshow ${flag(current.slideshow)}, every ${current.minutes} min; ` +
            `backdrop ${flag(current.backdrop)}, band ${flag(current.band)}, motion ${flag(current.motion)}.`,
          `Backdrop check: ${report.set ?? 'no answer from the app yet'}; ${report.asked ?? 'no window has asked to draw it yet'}.`,
        ].join('\n'),
      }
    }

    if (part === 'next') {
      const target = SCENE_NAMES[mod(sceneIndex(onShow) + 1, SCENE_NAMES.length)] ?? 'neon-miami'
      return show({ ...current, scene: target, offset: offsetFor(target, now, current.minutes) })
    }

    if (part === 'scene') {
      const wanted = SCENE_NAMES.find(n => n === arg || n.replace(/-/g, '') === arg?.replace(/-/g, ''))
      if (wanted === undefined) return { text: `Pick one of: ${SCENE_NAMES.join(', ')}.` }
      return show({ ...current, scene: wanted, offset: offsetFor(wanted, now, current.minutes) })
    }

    if (part === 'every') {
      const minutes = Math.round(Number(arg))
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) return { text: 'Give the minutes between scenes, 1 to 240: /neon every 1' }
      await savePrefs($, { ...current, minutes, offset: offsetFor(onShow, now, minutes) })
      return { text: `Each scene now stays ${minutes} min.` }
    }

    if (part === 'slideshow') {
      const value = arg === undefined ? !current.slideshow : arg === 'on' || arg === 'true' || arg === 'yes'
      const p = { ...current, slideshow: value, scene: onShow, offset: offsetFor(onShow, now, current.minutes) }
      await savePrefs($, p)
      return { text: value ? `Slideshow on: a new scene every ${p.minutes} min.` : `Slideshow off: ${label(onShow)} stays.` }
    }

    if (part !== 'backdrop' && part !== 'band' && part !== 'motion') return { text: HELP }
    const value = arg === undefined ? !current[part] : arg === 'on' || arg === 'true' || arg === 'yes'
    const nextPrefs: NeonMiamiPrefs = { ...current, [part]: value }
    if (part === 'backdrop') return show(nextPrefs)
    await savePrefs($, nextPrefs)

    return { text: `${part === 'band' ? 'Skyline band' : 'Motion'} ${value ? 'on' : 'off'}.` }
  })

  // The scene behind the conversation: wide on desktop, tall on mobile.
  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (report.asked === undefined) {
      report.asked = `the ${e.surface} app asked to draw scene "${e.props.scene}" from "${e.props.plugin}"`
      await saveReport($)
    }
    const name = e.props.scene
    if (!isScene(name) || e.surface === 'terminal') return next(e)
    const p = await readPrefs($)
    const { Box, Svg } = $.ui.resolve(e)
    const scene = SCENES[name]
    const svg = e.surface === 'mobile' ? scene.tall : scene.wide
    const source = p.motion ? svg : svg.replace(STYLE, '')

    // The scene has a fixed pixel size, which the app shrinks to the window's
    // width; it sits on the bottom edge, and its sky color fills above it.
    return (
      <Box
        width="100%"
        height="100%"
        flexDirection="column"
        justifyContent="flex-end"
        overflow="hidden"
        backgroundColor={scene.sky}
      >
        <Svg source={source} alt={ALT[name]} />
      </Box>
    )
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
