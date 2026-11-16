import { expect, mock, test } from 'claude-code/testing'

const backdrop = {
  plugin: 'neon-miami',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: {
    scene: 'neon-miami',
    plugin: 'neon-miami',
    glass: { blur: 4, tint: '#07050c', opacity: 0.7 },
    overrideColorScheme: 'dark',
  },
} as const

const band = {
  plugin: 'neon-miami',
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

test('a session starts on the slideshow scene, with a text palette', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const sets: unknown[] = []
  on('command.register', () => ({ value: { command: 'neon' } }))
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(sets.length).toBe(1)
  expect(JSON.stringify(sets[0])).toMatch(/"scene":"(neon-miami|blocklands-day|neon-rain|night-ops|blocklands)"/)
  expect(JSON.stringify(sets[0])).toContain('"text-primary"')
})

test('desktop and mobile draw every scene as an Svg', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  for (const scene of ['neon-miami', 'blocklands-day', 'neon-rain', 'night-ops', 'blocklands']) {
    for (const surface of ['desktop', 'mobile'] as const) {
      const ui = await $.ui.mount({ ...backdrop, surface, props: { ...backdrop.props, scene } })
      const svg = await ui.find({ type: 'Svg' })
      expect(svg).toBeDefined()
      await ui.unmount()
    }
  }
})

test('/neon scene and /neon next change the scene behind the chat', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const scenes: string[] = []
  on('command.register', () => ({ value: { command: 'neon' } }))
  on('theme.set', (_, e) => {
    const m = /"scene":"([a-z-]+)"/.exec(JSON.stringify(e))
    if (m?.[1]) scenes.push(m[1])
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const run = (args: string) =>
    $.command.run({ command: 'neon', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  expect(JSON.stringify(await run('scene night-ops'))).toContain('Night Ops')
  expect(JSON.stringify(await run('next'))).toContain('Blocklands Night')
  expect(JSON.stringify(await run('slideshow off'))).toContain('Slideshow off')
  expect(JSON.stringify(await run('every 15'))).toContain('15 min')
  expect(scenes.slice(-2)).toEqual(['night-ops', 'blocklands'])
})

test('the terminal band is a 4-row Raster above the prompt', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({ ...band, surface: 'terminal' })
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  await ui.unmount()
})

test('/neon band off removes the band, and it stays off', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'neon' } }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'backdrop' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const result = await $.command.run({
    command: 'neon',
    args: 'band off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(JSON.stringify(result)).toContain('Skyline band off')

  const ui = await $.ui.mount({ ...band, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()

  // A new session reads the choice back from the store.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const again = await $.ui.mount({ ...band, surface: 'terminal' })
  expect(await again.find({ type: 'Raster' })).toBeUndefined()
  await again.unmount()
})

test('the city draws whatever name the app gives the plugin', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ui = await $.ui.mount({
    ...backdrop,
    surface: 'desktop',
    props: { ...backdrop.props, plugin: 'neon-miami@local-mods' },
  })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('the slideshow moves to the next scene every minute', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  const scenes: string[] = []
  on('command.register', () => ({ value: { command: 'neon' } }))
  on('theme.set', (_, e) => {
    const m = /"scene":"([a-z-]+)"/.exec(JSON.stringify(e))
    if (m?.[1]) scenes.push(m[1])
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(scenes).toEqual(['neon-miami'])

  await clock.advance(30_000)
  expect(scenes).toEqual(['neon-miami'])
  await clock.advance(35_000)
  expect(scenes).toEqual(['neon-miami', 'blocklands-day'])
  await clock.advance(60_000)
  expect(scenes).toEqual(['neon-miami', 'blocklands-day', 'neon-rain'])
})
