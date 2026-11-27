import { expect, mock, test } from 'claude-code/testing'

const backdrop = {
  plugin: 'shell-party',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: {
    scene: 'shell-party',
    plugin: 'shell-party',
    glass: { blur: 0, tint: '#07050c', opacity: 0.5 },
    overrideColorScheme: 'dark',
  },
} as const

const band = {
  plugin: 'shell-party',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

type Engine = Parameters<Parameters<typeof test>[1]>[0]
type On = Parameters<Parameters<typeof test>[1]>[1]

// Starts a desktop session with the app's answers stubbed; returns the theme.set calls.
async function start($: Engine, on: On): Promise<unknown[]> {
  const sets: unknown[] = []
  on('command.register', () => ({ value: { command: 'party-shell' } }))
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  return sets
}

// What the backdrop draws now: the Svg's alt text and source.
async function drawn($: Engine): Promise<{ alt: string; source: string }> {
  const ui = await $.ui.mount({ ...backdrop, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return { alt: String(svg?.props.alt ?? ''), source: String(svg?.props.source ?? '') }
}

const run = ($: Engine, args: string) =>
  $.command.run({ command: 'party-shell', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

test('a session sends the look once: the backdrop, glass and a text palette', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const sets = await start($, on)
  expect(sets.length).toBe(1)
  expect(JSON.stringify(sets[0])).toContain('"scene":"shell-party"')
  expect(JSON.stringify(sets[0])).toContain('"text-primary"')
})

test('desktop and mobile draw every scene as an animated Svg', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  for (const scene of [
    'neon-miami', 'main-stage', 'dune-sea', 'light-grid', 'deep-space', 'dj-booth', 'neon-rain', 'thunder-amps', 'grand-prix', 'rooftop-cats', 'robot-disco', 'blocklands-day', 'ai-lab', 'static-stage', 'black-hole', 'loop-room', 'night-ops', 'dog-park', 'stadium-rock', 'desert-lab', 'gargoyle-city', 'blocklands',
    'portal-garage', 'crayon-town', 'shadow-office', 'sky-lot', 'shape-games', 'exclusion-zone',
  ]) {
    for (const surface of ['desktop', 'mobile'] as const) {
      const ui = await $.ui.mount({ ...backdrop, surface, props: { ...backdrop.props, scene } })
      const svg = await ui.find({ type: 'Svg' })
      expect(svg?.props.isInteractive).toBe(true)
      await ui.unmount()
    }
  }
})

test('/party-shell scene and /party-shell next change the picture, not the look', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const sets = await start($, on)
  expect(JSON.stringify(await run($, 'scene night-ops'))).toContain('Night Ops')
  expect((await drawn($)).alt).toContain('Night Ops')
  // dark mode's next scene skips the light ones
  expect(JSON.stringify(await run($, 'next'))).toContain('Stadium Rock')
  expect((await drawn($)).alt).toContain('Stadium Rock')
  expect(JSON.stringify(await run($, 'every 15'))).toContain('15 min')
  expect(sets.length).toBe(1)
})

test('the slideshow moves to the next scene every minute, with a fade', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  await start($, on)
  expect((await drawn($)).alt).toContain('Neon Miami')
  await clock.advance(30_000)
  expect((await drawn($)).alt).toContain('Neon Miami')
  await clock.advance(35_000)
  const day = await drawn($)
  expect(day.alt).toContain('Main Stage')
  expect(day.source).toContain('class="fi"')
  await clock.advance(60_000)
  expect((await drawn($)).alt).toContain('Dune Sea')
})

test('fireworks show when a long task finishes, then go', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await start($, on)
  await $.turn.complete({ answer: 'Done.', durationMs: 5_000, isAborted: false, turnId: 't1', reason: 'answer' })
  expect((await drawn($)).source).not.toContain('class="fw1"')
  await $.turn.complete({ answer: 'Done.', durationMs: 45_000, isAborted: false, turnId: 't2', reason: 'answer' })
  expect((await drawn($)).source).toContain('class="fw1"')
  await clock.advance(10_000)
  expect((await drawn($)).source).not.toContain('class="fw1"')
})

test('/party-shell alert shows the alert, and /party-shell reactions off stops the fireworks', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 0 })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await start($, on)
  await run($, 'alert')
  expect((await drawn($)).source).toContain('alertEdge')
  await run($, 'reactions off')
  await $.turn.complete({ answer: 'Done.', durationMs: 45_000, isAborted: false, turnId: 't3', reason: 'answer' })
  expect((await drawn($)).source).not.toContain('class="fw1"')
})

test('light mode sends dark text and light glass, and shows only light scenes', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  const sets = await start($, on)
  expect(JSON.stringify(sets[0])).toContain('#f6f2ff')
  expect(JSON.stringify(await run($, 'mode light'))).toContain('Light mode')
  expect(sets.length).toBe(2)
  const look = JSON.stringify(sets[1])
  expect(look).toContain('#1b1530')
  expect(look).toContain('#fbf9ff')
  expect((await drawn($)).alt).toContain('Blocklands Day')
  await clock.advance(60_000)
  expect((await drawn($)).alt).toContain('Dog Park')
  // a dark scene by name brings dark mode back
  expect(JSON.stringify(await run($, 'scene neon-rain'))).toContain('switched to dark mode')
  expect(sets.length).toBe(3)
  expect(JSON.stringify(sets[2])).toContain('#f6f2ff')
})

test('a failing test run shows the red alert', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 0 })
  on('tool.call', () => ({ result: {}, text: '2 tests failed', isError: true }) as never)
  await start($, on)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect((await drawn($)).source).not.toContain('alertEdge')
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect((await drawn($)).source).toContain('alertEdge')
})

test('the terminal band is a 4-row Raster above the prompt', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({ ...band, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.unmount()
})

test('/party-shell band off removes the band, and it stays off', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'party-shell' } }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'backdrop' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(JSON.stringify(await run($, 'band off'))).toContain('Skyline band off')

  const ui = await $.ui.mount({ ...band, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()

  // A new session reads the choice back from the store.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const again = await $.ui.mount({ ...band, surface: 'terminal' })
  expect(await again.find({ type: 'Raster' })).toBeUndefined()
  await again.unmount()
})
