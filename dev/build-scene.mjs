#!/usr/bin/env node
// Shell Party: builds hooks/scene.ts, the pixel-art scenes the mod draws behind
// the conversation (wide for the desktop app, tall for the mobile app), which
// the slideshow rotates through. The list is BUILDERS, near the end.
//
//   node dev/build-scene.mjs                  writes hooks/scene.ts
//   node dev/build-scene.mjs --preview <dir>  also writes preview-<scene>-wide/tall.svg there
//
// Everything is drawn on a coarse pixel grid (viewBox 320x180 or 180x320) with
// crisp edges, so it reads as 8/16-bit pixel art at any window size. The centre
// is kept dark for the chat; the art lives along the bottom and in the corners.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// ---------------------------------------------------------------- palette
const C = {
  bg: '#050505',
  pink: '#ff2d95',
  hot: '#ff4fd8',
  magenta: '#e100ff',
  purple: '#9b4dff',
  violet: '#7a2cff',
  lavender: '#c9a7ff',
  orange: '#ff7a1a',
  sunset: '#ff9e3d',
  yellow: '#ffd23f',
  blue: '#2d7bff',
  cyan: '#00e5ff',
  teal: '#19f0c8',
  white: '#f4efff',
  red: '#ff2d55',
  bldg: '#0b0714',
  bldgHi: '#150c25',
  far: '#170b29',
  farHi: '#241142',
  deck: '#0a0612',
  water: '#06030b',
  floor: '#07040b',
  case: '#120a1e',
}

// ---------------------------------------------------------------- helpers
function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const num = v => {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const mix = (a, b, t) => {
  const [r1, g1, b1] = hex(a)
  const [r2, g2, b2] = hex(b)
  const f = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${f(r1, r2)}${f(g1, g2)}${f(b1, b2)}`
}
const ramp = (stops, t) => {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i]
    const [t0, c0] = stops[i - 1]
    if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0))
  }
  return stops[stops.length - 1][1]
}

const fill = (color, opacity) =>
  opacity === undefined || opacity >= 1 ? `fill="${color}"` : `fill="${color}" opacity="${num(opacity)}"`

// A layer of axis-aligned rects, grouped by style into one <path> each.
class Layer {
  constructor(attrs = '') {
    this.attrs = attrs
    this.paths = new Map()
  }
  px(style, x, y, w = 1, h = 1) {
    if (w <= 0 || h <= 0) return
    let d = this.paths.get(style)
    if (d === undefined) this.paths.set(style, (d = []))
    d.push(`M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`)
  }
  raw(svg) {
    this.paths.set(Symbol('raw'), svg)
  }
  svg() {
    let out = ''
    for (const [style, d] of this.paths) {
      out += typeof style === 'symbol' ? d : `<path ${style} d="${d.join('')}"/>`
    }
    return this.attrs ? `<g ${this.attrs}>${out}</g>` : out
  }
}

// Draws into layers of its own and adds them to L as one group, so a CSS
// animation (the class) can move the whole thing: a car, a cloud, a helicopter.
// No glow filter inside: a blur that moves is redrawn every frame, which
// stutters on laptops.
function moving(L, cls, draw) {
  const a = new Layer()
  const g = new Layer()
  draw(a, g)
  L.raw(`<g class="${cls}">${a.svg()}${g.svg()}</g>`)
}

// A sparse bitmap: drawn into a layer at a scale, runs merged, with an
// optional neon outline around every filled pixel.
class Grid {
  constructor() {
    this.cells = new Map()
  }
  set(x, y, style) {
    this.cells.set(`${Math.round(x)},${Math.round(y)}`, style)
  }
  has(x, y) {
    return this.cells.has(`${x},${y}`)
  }
  rows() {
    const byRow = new Map()
    for (const [k, style] of this.cells) {
      const [x, y] = k.split(',').map(Number)
      if (!byRow.has(y)) byRow.set(y, [])
      byRow.get(y).push([x, style])
    }
    return byRow
  }
  outline() {
    const out = new Grid()
    for (const k of this.cells.keys()) {
      const [x, y] = k.split(',').map(Number)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!this.has(x + dx, y + dy)) out.set(x + dx, y + dy, 'o')
        }
      }
    }
    return out
  }
  draw(layer, ox, oy, s, styleOf = st => st) {
    for (const [y, cells] of this.rows()) {
      cells.sort((a, b) => a[0] - b[0])
      let i = 0
      while (i < cells.length) {
        let j = i
        while (j + 1 < cells.length && cells[j + 1][0] === cells[j][0] + 1 && cells[j + 1][1] === cells[i][1]) j++
        layer.px(styleOf(cells[i][1]), ox + cells[i][0] * s, oy + y * s, (j - i + 1) * s, s)
        i = j + 1
      }
    }
  }
}

// ---------------------------------------------------------------- pixel fonts
const FONT3 = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '(': '001010010010001', ')': '100010010010100', '{': '011010110010011', '}': '110010011010110',
  '[': '011010010010011', ']': '110010010010110', '<': '001010100010001', '>': '100010001010100',
  '/': '001001010100100', '=': '000111000111000', ';': '000010000010100', ':': '000010000010000',
  '.': '000000000000010', ',': '000000000010100', '"': '101101000000000', "'": '010010000000000',
  _: '000000000000111', '-': '000000111000000', '+': '000010111010000', '*': '000101010101000',
  '!': '010010010000010', '?': '110001010000010', '&': '010101010101011', '|': '010010010010010',
  '$': '011110010011110', '#': '101111101111101', '%': '101001010100101', ' ': '000000000000000',
}
const FONT5 = {
  A: '0111010001111111000110001', C: '0111110000100001000001111', D: '1111010001100011000111110',
  E: '1111110000111101000011111', H: '1000110001111111000110001', I: '1111100100001000010011111',
  L: '1000010000100001000011111', M: '1000111011101011000110001', N: '1000111001101011001110001',
  O: '0111010001100011000101110', P: '1111010001111101000010000', S: '0111110000011100000111110',
  T: '1111100100001000010000100', G: '0111110000100111000101111', R: '1111010001111101001010001',
  ' ': '0000000000000000000000000',
}

function text(layer, str, x, y, s, style, font = FONT3) {
  const w = font === FONT3 ? 3 : 5
  const h = 5
  let cx = x
  for (const ch of str.toUpperCase()) {
    const bits = font[ch] ?? font[' ']
    for (let r = 0; r < h; r++) {
      let c = 0
      while (c < w) {
        if (bits[r * w + c] === '1') {
          let e = c
          while (e + 1 < w && bits[r * w + e + 1] === '1') e++
          layer.px(style, cx + c * s, y + r * s, (e - c + 1) * s, s)
          c = e + 1
        } else c++
      }
    }
    cx += (w + 1) * s
  }
  return cx - x - s
}
const textWidth = (str, s, font = FONT3) => str.length * ((font === FONT3 ? 4 : 6) * s) - s

// ---------------------------------------------------------------- scene parts
function sky(L, W, top, HY) {
  const stops = [
    [0, C.bg],
    [0.4, '#1a0a33'],
    [0.66, '#34105a'],
    [0.82, '#5a1868'],
    [0.93, '#9a2a6e'],
    [1, '#d13e6c'],
  ]
  for (let y = top; y < HY; y += 2) {
    L.px(fill(ramp(stops, (y - top) / (HY - top))), 0, y, W, 2)
  }
}

function sun(L, cx, HY, r) {
  const gaps = new Set([HY - 3, HY - 4, HY - 8, HY - 9, HY - 13, HY - 17])
  for (let y = HY - r; y < HY; y++) {
    if (gaps.has(y)) continue
    const dy = HY - y - 0.5
    const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)))
    const t = (y - (HY - r)) / r
    const color = ramp([[0, C.yellow], [0.5, C.sunset], [0.78, '#ff5a5f'], [1, C.pink]], t)
    L.px(fill(color, 0.92), cx - hw, y, hw * 2, 1)
  }
}

function stars(L, rand, W, H, count, avoid) {
  const colors = [C.white, C.white, C.white, C.lavender, C.cyan, C.hot]
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 20) {
    const x = Math.floor(rand() * W * 2) / 2
    const y = Math.floor(rand() * H * 2) / 2
    if (avoid.some(([ax, ay, aw, ah]) => x >= ax && x <= ax + aw && y >= ay && y <= ay + ah)) continue
    const big = rand() < 0.14
    const color = colors[Math.floor(rand() * colors.length)]
    const op = 0.25 + rand() * 0.55
    const tw = rand() < 0.35 ? ` class="tw${1 + Math.floor(rand() * 3)}"` : ''
    const s = big ? 1 : 0.5
    L.px(`${fill(color, Math.round(op * 10) / 10)}${tw}`, x, y, s, s)
    if (big && rand() < 0.5) {
      // little four-point sparkle
      L.px(fill(color, 0.25), x - 0.5, y + 0.25, 2, 0.5)
      L.px(fill(color, 0.25), x + 0.25, y - 0.5, 0.5, 2)
    }
    placed++
  }
}

function circuits(L, rand, regions, count) {
  for (let i = 0; i < count; i++) {
    const [rx, ry, rw, rh] = regions[i % regions.length]
    let x = Math.round(rx + rand() * rw)
    let y = Math.round(ry + rand() * rh)
    const segs = 2 + Math.floor(rand() * 3)
    let horizontal = rand() < 0.6
    L.px(fill('#4b2a8a', 0.55), x - 0.5, y - 0.5, 1.4, 1.4)
    for (let s = 0; s < segs; s++) {
      const len = 3 + Math.floor(rand() * 9)
      const dir = rand() < 0.5 ? -1 : 1
      if (horizontal) {
        const nx = Math.max(rx, Math.min(rx + rw, x + dir * len))
        L.px(fill('#2c1656', 0.6), Math.min(x, nx), y, Math.abs(nx - x) + 0.4, 0.4)
        x = nx
      } else {
        const ny = Math.max(ry, Math.min(ry + rh, y + dir * len))
        L.px(fill('#2c1656', 0.6), x, Math.min(y, ny), 0.4, Math.abs(ny - y) + 0.4)
        y = ny
      }
      horizontal = !horizontal
    }
    L.px(fill(rand() < 0.3 ? C.cyan : '#6b3fd1', 0.5), x - 0.5, y - 0.5, 1.4, 1.4)
  }
}

function farSkyline(L, rand, x0, x1, HY, lowFrom, lowTo) {
  let x = x0
  while (x < x1) {
    const w = 3 + Math.floor(rand() * 7)
    const low = x + w > lowFrom && x < lowTo
    const h = low ? 2 + Math.floor(rand() * 6) : 9 + Math.floor(rand() * 24)
    L.px(fill(C.far), x, HY - h, w, h)
    L.px(fill(C.farHi), x, HY - h, w, 0.5)
    if (!low && rand() < 0.25) L.px(fill(C.farHi), x + Math.floor(w / 2), HY - h - 3, 0.5, 3)
    for (let wy = HY - h + 2; wy < HY - 1; wy += 2.5) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        if (rand() < 0.09) L.px(fill('#5a3388', 0.7), wx, wy, 0.5, 0.5)
      }
    }
    x += w + (rand() < 0.2 ? 1 : 0)
  }
}

function smallPalm(L, x, HY, h, lean) {
  const style = fill('#0d0614')
  for (let i = 0; i < h; i++) {
    const t = i / h
    L.px(style, Math.round(x + lean * t * t * 3), HY - i - 1, 1, 1)
  }
  const cx = Math.round(x + lean * 3)
  const cy = HY - h
  const fronds = [
    [-1, 0, -2, 0, -3, 1, -4, 2, -5, 3],
    [1, 0, 2, 0, 3, 1, 4, 2, 5, 3],
    [-1, -1, -2, -1, -3, -1, -4, 0],
    [1, -1, 2, -1, 3, -1, 4, 0],
    [0, -1, -1, -2, 1, -2],
    [-2, 1, -3, 2],
    [2, 1, 3, 2],
  ]
  for (const f of fronds) for (let i = 0; i < f.length; i += 2) L.px(style, cx + f[i], cy + f[i + 1], 1, 1)
}

function windows(L, rand, x, top, w, HY) {
  const palette = [
    [C.yellow, 0.75], [C.yellow, 0.55], ['#ffb86b', 0.6], [C.cyan, 0.6], [C.pink, 0.6], [C.lavender, 0.5],
  ]
  for (let wy = top + 3; wy < HY - 2; wy += 3) {
    for (let wx = x + 2; wx < x + w - 2; wx += 2.5) {
      if (rand() < 0.24) {
        const [c, o] = palette[Math.floor(rand() * palette.length)]
        L.px(fill(c, o), wx, wy, 1, 1)
      }
    }
  }
}

// buildings: [x, w, topY, neonColor, kind]
function nearSkyline(L, G, rand, buildings, HY) {
  for (const [x, w, top, neon, kind] of buildings) {
    if (kind === 'deco') {
      L.px(fill(C.bldg), x, top, w, HY - top)
      L.px(fill(C.bldg), x + 5, top - 6, w - 10, 6)
      L.px(fill(C.bldg), x + 9, top - 10, w - 18, 4)
      G.px(fill(neon), x + 9, top - 10, w - 18, 0.5)
      G.px(fill(neon), x + 5, top - 6, w - 10, 0.5)
      G.px(fill(neon), x, top, w, 0.5)
      for (let by = top + 7; by < HY - 3; by += 8) G.px(fill(C.pink, 0.8), x + 1, by, w - 2, 0.5)
      G.px(fill(C.teal, 0.9), x + Math.floor(w / 2) - 0.25, top - 14, 0.5, 4)
      for (let wy = top + 3; wy < HY - 2; wy += 3) {
        for (let wx = x + 3; wx < x + w - 3; wx += 3) {
          if (rand() < 0.35) L.px(fill(rand() < 0.5 ? C.yellow : C.teal, 0.6), wx, wy, 1.5, 1)
        }
      }
      continue
    }
    L.px(fill(C.bldg), x, top, w, HY - top)
    L.px(fill(C.bldgHi), x, top, 1, HY - top)
    G.px(fill(neon, 0.95), x, top, w, 0.5)
    if (kind === 'tower') {
      L.px(fill(C.bldg), x + Math.floor(w / 2) - 1, top - 4, 2, 4)
      L.px(fill(C.bldgHi), x + Math.floor(w / 2) - 0.25, top - 12, 0.5, 8)
      G.px(`${fill(C.red)} class="blink"`, x + Math.floor(w / 2) - 0.5, top - 13, 1, 1)
      G.px(fill(neon, 0.7), x + w - 0.5, top, 0.5, HY - top)
    }
    if (kind === 'strip') G.px(fill(neon, 0.55), x + Math.floor(w / 2), top + 2, 0.5, HY - top - 4)
    windows(L, rand, x, top, w, HY)
  }
}

function verticalSign(G, word, x, y, color) {
  G.px(fill('#090410', 0.9), x - 1, y - 1, 5, word.length * 6 + 1)
  G.px(fill(color, 0.9), x - 1, y - 1, 5, 0.4)
  G.px(fill(color, 0.9), x - 1, y + word.length * 6 - 0.4, 5, 0.4)
  for (let i = 0; i < word.length; i++) text(G, word[i], x, y + i * 6, 1, `${fill(color)} class="fl"`)
}

function water(L, W, HY, depth, sunX, reflections) {
  L.px(fill(C.water), 0, HY, W, depth)
  const rows = [[0.8, 34, 0.55, C.sunset], [2.3, 26, 0.45, '#ff5a7a'], [3.8, 18, 0.35, C.pink], [5.4, 10, 0.25, C.pink]]
  for (const [dy, w, o, c] of rows) if (dy < depth - 0.5) L.px(fill(c, o), sunX - w / 2, HY + dy, w, 0.7)
  for (const [x, y, w, c, o] of reflections) L.px(fill(c, o), x, y, w, 0.5)
}

function causeway(L, G, W, y, lampEvery) {
  L.px(fill(C.deck), 0, y + 0.6, W, 5.8)
  G.px(fill(C.pink), 0, y, W, 0.6)
  G.px(fill(C.cyan, 0.85), 0, y + 6.4, W, 0.5)
  for (let x = 2; x < W; x += 7) L.px(fill(C.yellow, 0.7), x, y + 3.2, 3, 0.4)
  for (let x = 10; x < W; x += lampEvery) {
    L.px(fill('#2a1446'), x, y - 3, 0.5, 3)
    G.px(fill(C.yellow), x - 0.5, y - 3.4, 1.5, 0.6)
    L.px(fill(C.deck), x - 1, y + 6.9, 2, 4)
  }
}

const CAR = [
  '.......#########........',
  '.....##wwwwwwwww###.....',
  '..#####################.',
  'T######################H',
  '#######################.',
  '..@@@.............@@@...',
]
function car(L, G, x, y, s, neon, facing, rand) {
  const g = new Grid()
  CAR.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === '.') continue
      g.set(facing > 0 ? c : row.length - 1 - c, r, ch)
    }
  })
  const o = g.outline()
  // outline everything but the row under the wheels
  for (const k of [...o.cells.keys()]) if (Number(k.split(',')[1]) >= 6) o.cells.delete(k)
  o.draw(G, x, y, s, () => fill(neon))
  g.draw(L, x, y, s, ch =>
    ch === 'w' ? fill('#6a4ab0') : ch === '@' ? fill('#030205') : ch === 'T' ? fill(C.red) : ch === 'H' ? fill('#fff3b0') : fill('#24113e'),
  )
  // a glint on the windscreen
  G.px(fill(C.cyan, 0.9), x + (facing > 0 ? 11 : 10) * s, y + 1 * s, 3 * s, s)
  const len = CAR[0].length * s
  const tailY = y + 3 * s
  if (facing > 0) {
    L.raw(`<rect x="${num(x - 34)}" y="${num(tailY)}" width="34" height="${num(s)}" fill="url(#trailR)"/>`)
    L.raw(`<rect x="${num(x + len)}" y="${num(tailY - s * 0.5)}" width="11" height="${num(s * 2)}" fill="url(#beamR)"/>`)
  } else {
    L.raw(`<rect x="${num(x + len)}" y="${num(tailY)}" width="34" height="${num(s)}" fill="url(#trailL)"/>`)
    L.raw(`<rect x="${num(x - 11)}" y="${num(tailY - s * 0.5)}" width="11" height="${num(s * 2)}" fill="url(#beamL)"/>`)
  }
  void rand
}

function palm(L, G, base, crown, neon, rand, scale = 1) {
  const g = new Grid()
  const [bx, by] = base
  const [cx, cy] = crown
  const ctrl = [bx + (cx - bx) * 0.15 + 4 * Math.sign(cx - bx || 1), by + (cy - by) * 0.55]
  const steps = Math.ceil(Math.abs(by - cy) * 1.4)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * ctrl[0] + t * t * cx
    const y = (1 - t) * (1 - t) * by + 2 * (1 - t) * t * ctrl[1] + t * t * cy
    const w = t < 0.35 ? 3 : 2
    const ring = Math.floor(y) % 3 === 0 ? 'r' : 't'
    for (let k = 0; k < w; k++) g.set(x - 1 + k, y, ring)
  }
  for (const [ox, oy] of [[-1, 1], [1, 1], [0, 2]]) {
    g.set(cx + ox, cy + oy, 'c')
    g.set(cx + ox + 1, cy + oy, 'c')
  }
  g.outline().draw(G, 0, 0, 1, () => fill(neon, 0.85))
  g.draw(L, 0, 0, 1, ch => (ch === 'r' ? fill('#22113a') : ch === 'c' ? fill('#3b1530') : fill('#140a22')))

  // fronds: thin neon spines that arc out and droop, feathered with leaflets
  const fronds = new Grid()
  const fan = [[-176, 1], [-152, 0.95], [-128, 0.8], [-102, 0.6], [-70, 0.7], [-44, 0.9], [-18, 1], [6, 0.95], [-200, 0.7]]
  for (const [deg, reach] of fan) {
    const a = (deg * Math.PI) / 180
    const L0 = (21 + rand() * 7) * reach * scale
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const p1 = [cx + dx * L0 * 0.55, cy + dy * L0 * 0.55 - 6 * scale]
    const p2 = [cx + dx * L0, cy + dy * L0 * 0.2 + (8 + rand() * 5) * scale]
    const n = Math.ceil(L0 * 2)
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
      const y = (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
      fronds.set(x, y, 's')
      if (t < 0.18) fronds.set(x, y + 1, 's')
      if (i % 3 === 0 && t > 0.15 && t < 0.92) {
        const leaf = Math.max(1, Math.round((1 - t) * 3.2))
        const side = Math.sign(dx) || 1
        for (let k = 1; k <= leaf; k++) fronds.set(x + side * k * 0.4, y + k, 'l')
        if (t < 0.7) for (let k = 1; k <= Math.max(1, leaf - 1); k++) fronds.set(x - side * k * 0.6, y + k * 0.9, 'l')
      }
    }
  }
  fronds.draw(G, 0, 0, 1, ch => (ch === 's' ? fill(neon) : fill(neon, 0.62)))
}

function floorGrid(L, W, y0, y1, vx, vy) {
  L.px(fill(C.floor), 0, y0, W, y1 - y0)
  L.raw(`<rect x="0" y="${num(y0)}" width="${W}" height="0.7" fill="url(#rim)"/>`)
  const lines = []
  for (const [y, o] of [[y0 + 2.2, 0.3], [y0 + 5, 0.25], [y0 + 9, 0.2], [y0 + 14, 0.16]]) {
    if (y < y1) L.px(fill(C.pink, o), 0, y, W, 0.3)
  }
  for (let xb = -W; xb <= W * 2; xb += W / 8) {
    const xt = vx + ((xb - vx) * (y0 - vy)) / (y1 - vy)
    lines.push(`M${num(xt)} ${num(y0)}L${num(xb)} ${num(y1)}`)
  }
  L.raw(`<path d="${lines.join('')}" stroke="${C.purple}" stroke-width="0.3" opacity="0.3" fill="none"/>`)
}

function crt(L, G, x, y, w, h, rand) {
  G.px(fill(C.purple, 0.8), x - 0.5, y - 0.5, w + 1, 0.5)
  G.px(fill(C.purple, 0.8), x - 0.5, y + h, w + 1, 0.5)
  G.px(fill(C.purple, 0.8), x - 0.5, y, 0.5, h)
  G.px(fill(C.purple, 0.8), x + w, y, 0.5, h)
  L.px(fill(C.case), x, y, w, h)
  const sx = x + 3
  const sy = y + 3
  const sw = w - 6
  const sh = h - 7
  L.raw(`<rect x="${num(sx - 4)}" y="${num(sy - 4)}" width="${num(sw + 8)}" height="${num(sh + 8)}" fill="url(#screenGlow)"/>`)
  L.px(fill('#03020a'), sx, sy, sw, sh)
  const colors = [C.pink, C.cyan, C.lavender, C.yellow, C.purple, C.teal]
  let ly = sy + 1.5
  let row = 0
  while (ly < sy + sh - 2) {
    let lx = sx + 1.5 + (row % 3 === 2 ? 2 : 0)
    const parts = 1 + Math.floor(rand() * 3)
    for (let p = 0; p < parts && lx < sx + sw - 3; p++) {
      const len = Math.min(2 + Math.floor(rand() * 6), sx + sw - 1.5 - lx)
      L.px(fill(colors[Math.floor(rand() * colors.length)], 0.85), lx, ly, len, 0.8)
      lx += len + 1
    }
    ly += 2
    row++
  }
  G.px(`${fill(C.white)} class="cur"`, sx + 1.5, ly - 0.2, 1.2, 1)
  L.px(fill(C.teal, 0.9), x + w - 4, y + h - 2.5, 1, 1)
  L.px(fill(C.case), x + w / 2 - 3, y + h, 6, 2)
  L.px(fill(C.case), x + w / 2 - 7, y + h + 1.5, 14, 1)
}

function keyboard(L, G, x, y, w) {
  G.px(fill(C.purple, 0.7), x - 0.5, y - 0.5, w + 1, 0.5)
  L.px(fill(C.case), x, y, w, 5)
  const keyW = 2
  for (let r = 0; r < 3; r++) {
    const ky = y + 0.7 + r * 1.4
    for (let kx = x + 0.8 + (r % 2) * 0.7; kx + keyW < x + w - 0.6; kx += keyW + 0.6) {
      const neon = (r === 1 && kx > x + 3 && kx < x + 9) ? C.pink : r === 1 && kx > x + w - 6 ? C.cyan : '#2a1a44'
      L.px(fill(neon, neon === '#2a1a44' ? 1 : 0.85), kx, ky, keyW, 0.9)
    }
  }
  L.px(fill('#2a1a44'), x + w / 2 - 7, y + 4.9, 14, 0)
}

function cassette(L, G, x, y) {
  G.px(fill(C.pink, 0.85), x - 0.5, y - 0.5, 23, 0.5)
  G.px(fill(C.pink, 0.85), x - 0.5, y + 8, 23, 0.5)
  G.px(fill(C.pink, 0.85), x - 0.5, y, 0.5, 8)
  G.px(fill(C.pink, 0.85), x + 22, y, 0.5, 8)
  L.px(fill('#150b24'), x, y, 22, 8)
  L.px(fill(C.pink, 0.75), x + 2, y + 1, 18, 2)
  text(L, 'NEON MIX', x + 3.4, y + 1.35, 0.3, fill('#150b24'))
  L.px(fill('#05030a'), x + 4, y + 4, 14, 2.5)
  for (const rx of [x + 6, x + 14]) {
    L.px(fill(C.lavender, 0.8), rx, y + 4.2, 2, 2)
    L.px(fill('#05030a'), rx + 0.6, y + 4.8, 0.8, 0.8)
  }
}

function gamepad(L, G, x, y) {
  const g = new Grid()
  const shape = [
    '.###########.',
    '#############',
    '#############',
    '####.....####',
    '.##.......##.',
  ]
  shape.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && g.set(c, r, '#')))
  g.outline().draw(G, x, y, 1.2, () => fill(C.cyan, 0.8))
  g.draw(L, x, y, 1.2, () => fill('#150b24'))
  L.px(fill(C.lavender, 0.85), x + 1.2 * 1.6, y + 1.2 * 1.3, 1.2 * 2.2, 0.9)
  L.px(fill(C.lavender, 0.85), x + 1.2 * 2.3, y + 1.2 * 0.6, 0.9, 1.2 * 2.2)
  L.px(fill(C.pink), x + 1.2 * 9.5, y + 1.2 * 1.6, 1.1, 1.1)
  L.px(fill(C.yellow), x + 1.2 * 10.9, y + 1.2 * 0.8, 1.1, 1.1)
}

const CODE = [
  [['// LATE NIGHT BUILD', 'cm']],
  [['CONST ', 'kw'], ['CITY', 'id'], [' = ', 'op'], ['"MIAMI"', 'str'], [';', 'op']],
  [['LET ', 'kw'], ['SKY', 'id'], [' = ', 'op'], ['SUNSET', 'fn'], ['();', 'op']],
  [['WHILE ', 'kw'], ['(', 'op'], ['NIGHT', 'id'], [') {', 'op']],
  [['  CODE', 'fn'], ['(); ', 'op'], ['CRUISE', 'fn'], ['();', 'op']],
  [['  SHIP', 'fn'], ['(', 'op'], ['NEON', 'id'], [');', 'op']],
  [['}', 'op']],
]
const SYNTAX = {
  cm: fill(C.teal, 0.55),
  kw: fill(C.pink),
  id: fill(C.cyan),
  op: fill(C.lavender, 0.85),
  str: fill(C.sunset),
  fn: fill(C.purple),
}

function codeWindow(L, G, x, y, s) {
  const lineH = 7 * s
  const gutter = 3 * 4 * s
  const longest = Math.max(...CODE.map(l => l.reduce((a, [t]) => a + t.length, 0)))
  const w = Math.ceil(gutter + longest * 4 * s + 6)
  const h = Math.ceil(5 + CODE.length * lineH + 4)
  L.px(fill('#07040e', 0.92), x, y, w, h)
  L.px(fill('#160b28'), x, y, w, 4)
  G.px(fill(C.pink), x - 0.5, y - 0.5, w + 1, 0.5)
  G.px(fill(C.pink), x - 0.5, y + h, w + 1, 0.5)
  G.px(fill(C.purple), x - 0.5, y, 0.5, h)
  G.px(fill(C.purple), x + w, y, 0.5, h)
  L.px(fill(C.pink), x + 1.5, y + 1.3, 1.4, 1.4)
  L.px(fill(C.yellow), x + 3.8, y + 1.3, 1.4, 1.4)
  L.px(fill(C.teal), x + 6.1, y + 1.3, 1.4, 1.4)
  const title = 'NIGHT.JS'
  text(L, title, x + w / 2 - textWidth(title, s) / 2, y + 0.9, s, fill(C.lavender, 0.8))
  let ly = y + 6
  CODE.forEach((line, i) => {
    text(L, String(i + 1), x + 2, ly, s, fill('#5b3c8f'))
    let lx = x + 2 + gutter
    for (const [t, kind] of line) {
      text(L, t, lx, ly, s, SYNTAX[kind])
      lx += t.length * 4 * s
    }
    if (i === CODE.length - 1) G.px(`${fill(C.hot)} class="cur"`, lx + s, ly, 3 * s, 5 * s)
    ly += lineH
  })
  return [x, y, w, h]
}

function billboard(L, G, cx, y, w) {
  const x = cx - w / 2
  const h = 34
  L.px(fill('#0a0514', 0.88), x, y, w, h)
  G.px(fill(C.cyan, 0.9), x - 0.5, y - 0.5, w + 1, 0.5)
  G.px(fill(C.cyan, 0.9), x - 0.5, y + h, w + 1, 0.5)
  G.px(fill(C.cyan, 0.9), x - 0.5, y, 0.5, h)
  G.px(fill(C.cyan, 0.9), x + w, y, 0.5, h)
  G.px(fill(C.pink, 0.6), x + 1.5, y + 1.5, w - 3, 0.4)
  G.px(fill(C.pink, 0.6), x + 1.5, y + h - 1.9, w - 3, 0.4)
  const s1 = 1.4
  const w1 = textWidth('NEON', s1, FONT5)
  const s2 = 1.4
  const w2 = textWidth('MIAMI', s2, FONT5)
  const y1 = y + 4
  const y2 = y + 13.5
  // chromatic aberration ghosts
  text(L, 'NEON', cx - w1 / 2 - 0.5, y1, s1, fill(C.cyan, 0.45), FONT5)
  text(L, 'MIAMI', cx - w2 / 2 + 0.5, y2, s2, fill(C.cyan, 0.4), FONT5)
  text(G, 'NEON', cx - w1 / 2, y1, s1, `${fill(C.pink)} class="fl"`, FONT5)
  text(G, 'MIAMI', cx - w2 / 2, y2, s2, 'fill="url(#sunText)"', FONT5)
  // glitch slice: a displaced copy that flashes now and then
  text(G, 'MIAMI', cx - w2 / 2 + 2.5, y2, s2, `${fill(C.cyan, 0.8)} class="gl"`, FONT5)
  const tag = '</> CODE ALL NIGHT'
  const s3 = 0.55
  text(L, tag, cx - textWidth(tag, s3) / 2, y + h - 6.2, s3, fill(C.teal, 0.9))
  return [x, y, w, h]
}

function floatingSymbols(L, rand, spots) {
  const symbols = ['</>', '{ }', ';', '=>', '()', '[]', '#', '&&', '!=', '++', '/>', '{}']
  const colors = [C.pink, C.cyan, C.purple, C.teal, C.lavender, C.sunset]
  spots.forEach(([x, y, s], i) => {
    const sym = symbols[i % symbols.length]
    const color = colors[Math.floor(rand() * colors.length)]
    const tw = i % 4 === 0 ? ` class="tw${1 + (i % 3)}"` : ''
    text(L, sym.replace('=>', '=>'), x, y, s, `${fill(color, 0.3 + rand() * 0.25)}${tw}`)
  })
}

// ---------------------------------------------------------------- defs and overlays
function defs(W, H, extra = '') {
  return `<defs>${extra}
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="sunGlow"><stop offset="0" stop-color="${C.pink}" stop-opacity="0.5"/><stop offset="0.5" stop-color="${C.magenta}" stop-opacity="0.18"/><stop offset="1" stop-color="${C.magenta}" stop-opacity="0"/></radialGradient>
<radialGradient id="screenGlow"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
<radialGradient id="calm" cx="0.5" cy="0.42" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.32"/><stop offset="0.65" stop-color="#000" stop-opacity="0.12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="sunText" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.yellow}"/><stop offset="0.45" stop-color="${C.sunset}"/><stop offset="1" stop-color="${C.pink}"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.violet}" stop-opacity="0.3"/><stop offset="0.3" stop-color="${C.pink}" stop-opacity="0.85"/><stop offset="0.5" stop-color="${C.sunset}" stop-opacity="0.9"/><stop offset="0.7" stop-color="${C.pink}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0.3"/></linearGradient>
<linearGradient id="trailR"><stop offset="0" stop-color="${C.red}" stop-opacity="0"/><stop offset="1" stop-color="${C.red}" stop-opacity="0.85"/></linearGradient>
<linearGradient id="trailL"><stop offset="0" stop-color="${C.red}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.red}" stop-opacity="0"/></linearGradient>
<linearGradient id="beamR"><stop offset="0" stop-color="#fff3b0" stop-opacity="0.7"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0"/></linearGradient>
<linearGradient id="beamL"><stop offset="0" stop-color="#fff3b0" stop-opacity="0"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0.7"/></linearGradient>
<pattern id="scan" width="4" height="1" patternUnits="userSpaceOnUse"><rect width="4" height="0.32" fill="#000" opacity="0.18"/></pattern>
<pattern id="noise" width="37" height="23" patternUnits="userSpaceOnUse">${noiseTile()}</pattern>
</defs>`
}

function noiseTile() {
  const rand = rng(91)
  let out = ''
  for (let i = 0; i < 46; i++) {
    const c = rand() < 0.7 ? '#ffffff' : rand() < 0.5 ? C.pink : C.cyan
    out += `<rect x="${num(Math.floor(rand() * 74) / 2)}" y="${num(Math.floor(rand() * 46) / 2)}" width="0.5" height="0.5" fill="${c}" opacity="${num(0.04 + rand() * 0.05)}"/>`
  }
  return out
}

const STYLE = `<style>
@keyframes tw{0%,64%{opacity:1}65%,82%{opacity:.15}83%,100%{opacity:1}}
@keyframes bl{0%,54%{opacity:1}55%,100%{opacity:0}}
@keyframes fl{0%,90%{opacity:1}91%{opacity:.3}93%{opacity:1}95%{opacity:.45}96%,100%{opacity:1}}
@keyframes gl{0%,93%{opacity:0}94%{opacity:1;transform:translate(0,0)}96%{opacity:1;transform:translate(-3px,.6px)}98%,100%{opacity:0}}
.tw1{animation:tw 3.7s steps(1,end) infinite}
.tw2{animation:tw 5.3s steps(1,end) infinite 1.2s}
.tw3{animation:tw 7.1s steps(1,end) infinite 2.9s}
.cur{animation:bl 1.1s steps(1,end) infinite}
.blink{animation:bl 2.4s steps(1,end) infinite}
.fl{animation:fl 6.5s steps(1,end) infinite}
.gl{opacity:0;animation:gl 8s steps(1,end) infinite}
@keyframes sw{to{transform:rotate(360deg)}}
@keyframes sl{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(12deg)}}
.sw{animation:sw 4.8s steps(24,end) infinite}
.sl{animation:sl 10s steps(20,end) infinite}
.ra{animation:bl .24s steps(1,end) infinite}
.rb{animation:bl .24s steps(1,end) infinite .12s}
@keyframes dr{from{transform:translateX(-360px)}to{transform:translateX(360px)}}
@keyframes dl{from{transform:translateX(360px)}to{transform:translateX(-360px)}}
.d1,.d2,.d3,.d4,.fy,.dt,.f1,.f2{will-change:transform}
.d1{animation:dr 9s linear infinite}
.d2{animation:dl 11s linear infinite -4s}
.d3{animation:dl 14s linear infinite -9s}
.d4{animation:dr 7s linear infinite -2s}
@keyframes fi{from{opacity:1}to{opacity:0}}
.fi{animation:fi 1.2s ease-out}
@keyframes fw{0%{transform:scale(.1);opacity:0}12%{opacity:1}70%{opacity:1}100%{transform:scale(1);opacity:0}}
.fw1{animation:fw 1.6s ease-out infinite}
.fw2{animation:fw 1.6s ease-out infinite -.55s}
.fw3{animation:fw 1.6s ease-out infinite -1.1s}
@keyframes al{0%,100%{opacity:.6}50%{opacity:1}}
.al{animation:al 1s ease-in-out infinite}
@keyframes fa{from{transform:translateY(-12px)}to{transform:translateY(12px)}}
.f1{animation:fa .7s linear infinite}
.f2{animation:fa .9s linear infinite -.4s}
@keyframes dt{from{transform:translateX(-40px)}to{transform:translateX(60px)}}
.dt{animation:dt 45s ease-in-out infinite alternate}
@keyframes fy{from{transform:translateX(140px)}to{transform:translateX(-260px)}}
.fy{animation:fy 28s linear infinite}
@keyframes pu{0%,100%{opacity:.7}50%{opacity:1}}
.pu{animation:pu 4s ease-in-out infinite}
@keyframes up{0%{transform:translateY(0);opacity:0}20%{opacity:.8}100%{transform:translateY(-14px);opacity:0}}
.up1{animation:up 3s linear infinite}
.up2{animation:up 3s linear infinite -1s}
.up3{animation:up 3s linear infinite -2s}
@keyframes bo{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.bo{animation:bo 4s ease-in-out infinite}
.hop{animation:bo .5s ease-in-out infinite}
@keyframes jp{0%,100%{transform:translateY(0)}45%{transform:translateY(-9px)}}
.jp{animation:jp 1.6s ease-in-out infinite}
.rs{animation:sw 40s linear infinite}
@keyframes ss{0%,80%{transform:translate(0,0);opacity:0}82%{opacity:1}100%{transform:translate(-70px,36px);opacity:0}}
.ss{animation:ss 7s linear infinite}
.d5{animation:dr 2.6s linear infinite}
.d6{animation:dr 3.3s linear infinite -1.4s}
.d7{animation:dr 4.1s linear infinite -2.6s}
.cw{animation:dr 70s linear infinite -25s}
.cw2{animation:dr 13s linear infinite -3s}
.d5,.d6,.d7,.cw,.cw2,.rs,.bo,.jp,.hop{will-change:transform}
@keyframes lt{0%,95%{opacity:0}96%{opacity:.45}97%{opacity:0}98%{opacity:.3}99%,100%{opacity:0}}
.lt{animation:lt 9s steps(1,end) infinite}
.wg{animation:sl 1.1s ease-in-out infinite}
@keyframes ey{0%,92%{opacity:1}93%,97%{opacity:0}98%,100%{opacity:1}}
.ey{animation:ey 4.5s steps(1,end) infinite}
@keyframes wv{0%,100%{transform:skewY(0)}50%{transform:skewY(10deg)}}
.wv{animation:wv .8s ease-in-out infinite}
${[0, 1, 2, 3, 4].map(i => `@keyframes g${i}{0%,${9 + 10 * i}%{opacity:.12}${10 + 10 * i}%,70%{opacity:1}71%,100%{opacity:.12}}.g${i}{animation:g${i} 6s steps(1,end) infinite}`).join('\n')}
@keyframes eq{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
.eq1,.eq2,.eq3,.eq4,.fj,.fj2{transform-box:fill-box;transform-origin:50% 100%}
.eq1{animation:eq .46s ease-in-out infinite}
.eq2{animation:eq .62s ease-in-out infinite -.2s}
.eq3{animation:eq .38s ease-in-out infinite -.1s}
.eq4{animation:eq .7s ease-in-out infinite -.35s}
@keyframes ls{0%,100%{transform:rotate(-24deg)}50%{transform:rotate(24deg)}}
.ls1{animation:ls 3.2s ease-in-out infinite}
.ls2{animation:ls 3.2s ease-in-out infinite -1.6s}
@keyframes fj{0%,100%{transform:scaleY(.35);opacity:.7}40%{transform:scaleY(1);opacity:1}70%{transform:scaleY(.6)}}
.fj{animation:fj .9s ease-in-out infinite}
.fj2{animation:fj .9s ease-in-out infinite -.45s}
.sp{animation:sw 1.8s linear infinite}
@keyframes hb{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}
.hb1{animation:hb .48s ease-in-out infinite}
.hb2{animation:hb .48s ease-in-out infinite -.24s}
.ls1,.ls2,.sp,.hb1,.hb2{will-change:transform}
.pr{animation:sw 6s linear infinite;will-change:transform}
@keyframes rl{0%,49%{opacity:1}50%,100%{opacity:0}}
.rl1{animation:rl 6s steps(1,end) infinite}
.rl2{animation:rl 6s steps(1,end) infinite -3s}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.gl{opacity:0}}
</style>`

function wrap(W, H, body, animated, extraDefs = '', scan = true) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">` +
    (animated ? STYLE : '') +
    defs(W, H, extraDefs) +
    body +
    `<rect width="${W}" height="${H}" fill="url(#noise)"/>` +
    (scan ? `<rect width="${W}" height="${H}" fill="url(#scan)"/>` : '') +
    `</svg>`
  )
}

// ---------------------------------------------------------------- layouts
// hud: the code window and the billboard up top. The terminal wallpaper leaves
// them out, since a terminal's text starts in the top-left corner.
function wide({ hud: withHud = true } = {}) {
  const W = 320
  const H = 180
  const HY = 146
  const rand = rng(1984)
  const bg = new Layer()
  const art = new Layer()
  const neon = new Layer('filter="url(#glow)"')
  const front = new Layer()
  const frontNeon = new Layer('filter="url(#glow)"')
  const hud = new Layer()
  const hudNeon = new Layer('filter="url(#glow)"')

  bg.px(fill(C.bg), 0, 0, W, H)
  sky(bg, W, 56, HY)
  bg.raw(`<ellipse cx="160" cy="${HY}" rx="70" ry="44" fill="url(#sunGlow)" class="pu"/>`)

  const code = withHud ? codeWindow(hud, hudNeon, 8, 8, 0.5) : [8, 8, 58, 36]
  const board = withHud ? billboard(hud, hudNeon, 262, 9, 80) : [222, 9, 80, 34]
  stars(bg, rand, W, 108, 170, [code, board, [130, 118, 60, 30]])
  circuits(bg, rand, [[4, 52, 92, 44], [226, 50, 90, 26]], 16)
  floatingSymbols(bg, rand, [
    [92, 14, 0.9], [14, 58, 1], [70, 70, 0.8], [36, 82, 1.2], [96, 50, 0.7],
    [206, 52, 1], [300, 56, 0.8], [232, 68, 1.2], [286, 84, 0.9], [210, 26, 0.7],
    [112, 30, 0.6], [196, 12, 0.6],
  ])

  sun(art, 160, HY, 24)
  farSkyline(art, rand, 0, W, HY, 128, 194)
  smallPalm(art, 137, HY, 15, -1)
  smallPalm(art, 147, HY, 11, 1)
  smallPalm(art, 185, HY, 14, 1)

  // the billboard's mast, up from the tallest tower
  if (withHud) art.px(fill('#2a1446'), 261.7, 43, 0.6, 22)

  nearSkyline(art, neon, rand, [
    [0, 14, 92, C.cyan, 'tower'],
    [14, 10, 104, C.purple],
    [24, 18, 86, C.pink, 'strip'],
    [42, 26, 116, C.teal, 'deco'],
    [70, 12, 100, C.purple],
    [82, 15, 118, C.cyan],
    [97, 10, 108, C.pink],
    [107, 15, 126, C.purple],
    [199, 13, 124, C.cyan],
    [212, 10, 108, C.purple],
    [222, 19, 98, C.pink, 'strip'],
    [241, 12, 114, C.teal],
    [254, 16, 78, C.cyan, 'tower'],
    [271, 24, 108, C.pink, 'deco'],
    [295, 11, 94, C.purple],
    [306, 14, 112, C.cyan, 'strip'],
  ], HY)
  verticalSign(neon, 'HOTEL', 38, 113, C.teal)

  const refl = []
  for (let i = 0; i < 70; i++) {
    const side = rand() < 0.5 ? rand() * 122 : 198 + rand() * 122
    const colors = [C.pink, C.cyan, C.purple, C.yellow, C.teal]
    refl.push([side, HY + 1 + rand() * 6.5, 1 + rand() * 3, colors[Math.floor(rand() * colors.length)], 0.18 + rand() * 0.2])
  }
  water(art, W, HY, 20, 160, refl)
  causeway(art, neon, W, 154, 22)
  moving(art, 'd1', (a, g) => car(a, g, 86, 155.5, 0.7, C.pink, 1, rand))
  moving(art, 'd2', (a, g) => car(a, g, 214, 155.5, 0.7, C.cyan, -1, rand))
  moving(art, 'd3', (a, g) => car(a, g, 150, 155.5, 0.7, C.purple, -1, rand))

  palm(front, frontNeon, [12, 172], [28, 72], C.pink, rand)
  palm(front, frontNeon, [308, 172], [291, 78], C.teal, rand)

  floorGrid(front, W, 166, H, 160, HY)
  crt(front, frontNeon, 40, 138, 32, 24, rand)
  keyboard(front, frontNeon, 37, 169.5, 40)
  cassette(front, frontNeon, 246, 169)
  gamepad(front, frontNeon, 280, 169.5)

  const calm = `<rect width="${W}" height="${H}" fill="url(#calm)"/>`
  return { W, H, body: bg.svg() + art.svg() + neon.svg() + front.svg() + frontNeon.svg() + calm + hud.svg() + hudNeon.svg() }
}

function tall() {
  const W = 180
  const H = 320
  const HY = 270
  const rand = rng(2077)
  const bg = new Layer()
  const art = new Layer()
  const neon = new Layer('filter="url(#glow)"')
  const front = new Layer()
  const frontNeon = new Layer('filter="url(#glow)"')
  const hud = new Layer()
  const hudNeon = new Layer('filter="url(#glow)"')

  bg.px(fill(C.bg), 0, 0, W, H)
  sky(bg, W, 170, HY)
  bg.raw(`<ellipse cx="90" cy="${HY}" rx="56" ry="40" fill="url(#sunGlow)" class="pu"/>`)

  const board = billboard(hud, hudNeon, 90, 14, 80)
  stars(bg, rand, W, 230, 150, [board, [60, 240, 60, 30]])
  circuits(bg, rand, [[4, 60, 36, 120], [140, 60, 36, 120]], 14)
  floatingSymbols(bg, rand, [
    [8, 64, 1], [150, 72, 0.9], [14, 120, 1.1], [152, 132, 1], [10, 176, 0.8],
    [148, 190, 1], [22, 20, 0.7], [144, 24, 0.7],
  ])

  sun(art, 90, HY, 20)
  farSkyline(art, rand, 0, W, HY, 64, 118)
  smallPalm(art, 70, HY, 13, -1)
  smallPalm(art, 112, HY, 12, 1)

  nearSkyline(art, neon, rand, [
    [0, 12, 222, C.cyan, 'tower'],
    [12, 10, 236, C.purple],
    [22, 22, 242, C.teal, 'deco'],
    [44, 10, 232, C.pink, 'strip'],
    [54, 9, 250, C.purple],
    [118, 10, 248, C.cyan],
    [128, 12, 230, C.pink, 'strip'],
    [140, 14, 208, C.cyan, 'tower'],
    [154, 12, 238, C.purple],
    [166, 14, 226, C.pink],
  ], HY)

  const refl = []
  for (let i = 0; i < 40; i++) {
    const side = rand() < 0.5 ? rand() * 62 : 118 + rand() * 62
    const colors = [C.pink, C.cyan, C.purple, C.yellow, C.teal]
    refl.push([side, HY + 1 + rand() * 6.5, 1 + rand() * 3, colors[Math.floor(rand() * colors.length)], 0.18 + rand() * 0.2])
  }
  water(art, W, HY, 22, 90, refl)
  causeway(art, neon, W, 279, 24)
  moving(art, 'd1', (a, g) => car(a, g, 30, 280.5, 0.7, C.pink, 1, rand))
  moving(art, 'd2', (a, g) => car(a, g, 116, 280.5, 0.7, C.cyan, -1, rand))

  palm(front, frontNeon, [14, 300], [26, 216], C.pink, rand, 0.75)
  palm(front, frontNeon, [166, 300], [154, 222], C.teal, rand, 0.75)
  floorGrid(front, W, 292, H, 90, HY)
  const calm = `<rect width="${W}" height="${H}" fill="url(#calm)"/>`
  return { W, H, body: bg.svg() + art.svg() + neon.svg() + front.svg() + frontNeon.svg() + calm + hud.svg() + hudNeon.svg() }
}

// ---------------------------------------------------------------- more scenes
// Three more original scenes for the slideshow. Each function draws for any
// W x H, so one serves the desktop (320x180) and the phone (180x320). They are
// genre moods (a rainy neon megacity, a blocky voxel night, a night-vision
// base), drawn from scratch: no game's characters, logos, maps or interface.

function band(L, W, top, bottom, stops) {
  for (let y = top; y < bottom; y += 2) {
    L.px(fill(ramp(stops, (y - top) / Math.max(1, bottom - top))), 0, y, W, Math.min(2, bottom - y))
  }
}

const op1 = v => Math.round(v * 10) / 10

function dots(L, rand, [x0, y0, w, h], count, colors, [lo, hi], twinkle, avoid = []) {
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 20) {
    const x = x0 + Math.floor(rand() * w * 2) / 2
    const y = y0 + Math.floor(rand() * h * 2) / 2
    if (avoid.some(([ax, ay, aw, ah]) => x >= ax && x <= ax + aw && y >= ay && y <= ay + ah)) continue
    const c = colors[Math.floor(rand() * colors.length)]
    const tw = rand() < twinkle ? ` class="tw${1 + Math.floor(rand() * 3)}"` : ''
    L.px(`${fill(c, op1(lo + rand() * (hi - lo)))}${tw}`, x, y, 0.5, 0.5)
    placed++
  }
}

// A glowing outlined panel with a title bar and lines of pixel text.
// lines: one list of [text, color, class?] segments per line.
function panel(L, G, x, y, w, title, lines, accent) {
  const lh = 4
  const h = 8 + lines.length * lh + 1
  L.px(fill('#000', 0.6), x, y, w, h)
  for (const [px, py, pw, ph] of [[x, y, w, 0.5], [x, y + h - 0.5, w, 0.5], [x, y, 0.5, h], [x + w - 0.5, y, 0.5, h]]) {
    G.px(fill(accent, 0.85), px, py, pw, ph)
  }
  L.px(fill(accent, 0.16), x + 0.5, y + 0.5, w - 1, 5)
  text(L, title, x + 2, y + 1.7, 0.5, fill(accent, 0.95))
  lines.forEach((segs, i) => {
    let cx = x + 2
    for (const [str, color, cls] of segs) {
      cx += text(L, str, cx, y + 8 + i * lh, 0.5, `${fill(color, 0.9)}${cls ? ` class="${cls}"` : ''}`) + 0.5
    }
  })
  return [x, y, w, h]
}

function corners(G, W, H, color) {
  const n = 7
  for (const [x, y, dx, dy] of [[3, 3, 1, 1], [W - 3, 3, -1, 1], [3, H - 3, 1, -1], [W - 3, H - 3, -1, -1]]) {
    G.px(fill(color, 0.55), dx > 0 ? x : x - n, dy > 0 ? y : y - 0.5, n, 0.5)
    G.px(fill(color, 0.55), dx > 0 ? x : x - 0.5, dy > 0 ? y : y - n, 0.5, n)
  }
}

// ---- Neon Rain: a rainy neon megacity
const RC = {
  bg: '#03040a', cyan: '#00f0ff', pink: '#ff2a6d', green: '#05ffa1', violet: '#b967ff', amber: '#ffb000',
  white: '#e8f6ff', slab: '#0d1531', slabHi: '#22336a', far: '#111b3a', street: '#05060d',
}

function glyph(G, rand, x, y, s, style) {
  let bits = 0
  while (bits.toString(2).replace(/0/g, '').length < 4) bits = Math.floor(rand() * 512)
  for (let i = 0; i < 9; i++) if (bits & (1 << i)) G.px(style, x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s)
}

function megaTower(L, G, rand, x, w, top, HY, side) {
  L.px(fill(RC.slab), x, top, w, HY - top)
  L.px(fill(RC.slabHi), side < 0 ? x : x + w - 1, top, 1, HY - top)
  for (let y = top + 4; y < HY - 3; y += 3) {
    for (let wx = x + 2; wx < x + w - 2; wx += 2) {
      if (rand() < 0.32) {
        const c = rand() < 0.6 ? RC.cyan : rand() < 0.5 ? RC.violet : RC.amber
        L.px(fill(c, op1(0.3 + rand() * 0.4)), wx, y, 1, 1)
      }
    }
  }
  // a vertical sign of made-up glyphs, on the side facing the middle
  const sx = side > 0 ? x + w - 5 : x + 1.5
  const color = rand() < 0.5 ? RC.pink : RC.cyan
  const n = Math.max(3, Math.min(9, Math.floor((HY - top) / 16)))
  const sy = top + 8 + Math.floor(rand() * 10)
  L.px(fill('#000', 0.75), sx - 0.5, sy - 0.5, 4, n * 4.5 + 0.5)
  for (let i = 0; i < n; i++) glyph(G, rand, sx, sy + i * 4.5, 1, `${fill(color, 0.95)}${i === 1 ? ' class="fl"' : ''}`)
  G.px(fill(rand() < 0.5 ? RC.violet : RC.green, 0.75), x, Math.round(top + (HY - top) * (0.3 + rand() * 0.3)), w, 0.5)
  if (w >= 13) {
    const bx = x + 2
    const by = Math.round(top + (HY - top) * (0.55 + rand() * 0.2))
    const bc = [RC.green, RC.pink, RC.cyan, RC.amber][Math.floor(rand() * 4)]
    L.px(fill('#000', 0.75), bx, by, w - 4, 6)
    for (const [px, py, pw, ph] of [[bx, by, w - 4, 0.4], [bx, by + 5.6, w - 4, 0.4], [bx, by, 0.4, 6], [bx + w - 4.4, by, 0.4, 6]]) G.px(fill(bc, 0.85), px, py, pw, ph)
    for (let k = 0; k < Math.floor((w - 6) / 4); k++) glyph(G, rand, bx + 1.5 + k * 4, by + 1.5, 1, fill(bc, 0.95))
  }
  L.px(fill('#1a2236'), x + Math.floor(w / 2), top - 8, 0.5, 8)
  G.px(`${fill(RC.pink)} class="blink"`, x + Math.floor(w / 2) - 0.25, top - 9, 1, 1)
}

function hoverCar(L, G, x, y, dir, color) {
  L.px(fill('#26335c'), x, y, 7, 2)
  L.px(fill('#3a4a80'), x + 2, y - 1, 3, 1)
  L.px(fill(RC.cyan, 0.5), x + 2.5, y - 0.8, 2, 0.6)
  G.px(fill(dir > 0 ? RC.pink : '#fff3b0', 0.95), dir > 0 ? x - 0.5 : x + 7, y + 0.5, 0.5, 0.8)
  L.raw(`<rect x="${num(dir > 0 ? x - 14 : x + 7.5)}" y="${num(y + 0.7)}" width="14" height="0.5" fill="url(#${dir > 0 ? 'trailR' : 'trailL'})" opacity="0.6"/>`)
  G.px(fill(color, 0.85), x + 1, y + 2, 5, 0.4)
}

function cable(L, x0, y0, x1, y1, sag) {
  const n = Math.ceil(Math.abs(x1 - x0))
  for (let i = 0; i < n; i++) {
    const t = i / n
    L.px(fill('#0f1626'), x0 + (x1 - x0) * t, Math.round((y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)) * 2) / 2, 1, 0.4)
  }
}

function stall(L, G, rand, x, y) {
  L.px(fill('#0b0f1e'), x, y - 9, 22, 9)
  for (let i = 0; i < 10; i++) L.px(fill(i % 2 ? RC.pink : '#2a0d22', i % 2 ? 0.85 : 1), x - 1 + i * 2.4, y - 12, 2.4, 3)
  G.px(fill(RC.pink, 0.9), x - 1, y - 9, 24, 0.4)
  L.px(fill(RC.amber, 0.85), x + 3, y - 7.5, 16, 3)
  text(L, 'NOODLES', x + 4, y - 6.7, 0.25 * 1.6, fill('#1a0d00', 0.9))
  L.px(fill('#151b30'), x + 2, y - 3.5, 18, 1)
  for (let i = 0; i < 6; i++) L.px(`${fill('#cfe6ff', 0.25)} class="tw${1 + (i % 3)}"`, x + 6 + rand() * 10, y - 14 - rand() * 6, 0.5, 0.5)
}

function hoverBike(L, G, x, y) {
  L.px(fill('#141a2e'), x, y - 4, 12, 2)
  L.px(fill('#1d2642'), x + 3, y - 5.5, 5, 1.5)
  L.px(fill('#0c1020'), x + 1, y - 2, 3, 1)
  L.px(fill('#0c1020'), x + 8, y - 2, 3, 1)
  G.px(fill(RC.cyan, 0.85), x + 1, y - 0.8, 10, 0.4)
  G.px(fill(RC.pink, 0.9), x + 11.5, y - 3.6, 0.5, 0.6)
}

function rainfall(L, rand, W, H, count) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * W * 2) / 2
    const y = Math.floor(rand() * H)
    L.px(`${fill('#8fb8ff', op1(0.1 + rand() * 0.18))} class="f${1 + (i % 2)}"`, x, y, 0.25, 2 + Math.floor(rand() * 4))
  }
}

function cyber(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 7311 : 2088)
  const HY = Math.round(H * (isTall ? 0.88 : 0.84))
  const bg = new Layer()
  const art = new Layer()
  const neon = new Layer('filter="url(#glow)"')
  const front = new Layer()
  const frontNeon = new Layer('filter="url(#glow)"')
  const wet = new Layer()
  const hud = new Layer()
  const hudNeon = new Layer('filter="url(#glow)"')

  bg.px(fill(RC.bg), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#070a1a'], [0.4, '#0e1838'], [0.72, '#26124f'], [0.9, '#4e1866'], [1, '#86206e']])
  bg.raw(`<ellipse cx="${num(W / 2)}" cy="${HY}" rx="${num(W * 0.5)}" ry="${num(H * 0.2)}" fill="url(#smog)"/>`)
  dots(bg, rand, [0, 0, W, HY * 0.45], isTall ? 40 : 70, [RC.white, RC.cyan, RC.violet], [0.15, 0.45], 0.15)

  // the far city, wall to wall
  for (let x = 0; x < W;) {
    const w = 4 + Math.floor(rand() * 8)
    const top = Math.round(HY - H * (isTall ? 0.16 : 0.26) - rand() * H * (isTall ? 0.14 : 0.2))
    art.px(fill(RC.far), x, top, w, HY - top)
    const n = Math.floor((w * (HY - top)) / 30)
    for (let i = 0; i < n; i++) {
      const c = [RC.cyan, RC.pink, RC.violet, RC.amber][Math.floor(rand() * 4)]
      art.px(fill(c, op1(0.35 + rand() * 0.35)), x + 1 + Math.floor(rand() * Math.max(1, w - 2)), top + 2 + Math.floor(rand() * (HY - top - 4)), 0.5, 0.5)
    }
    x += w + (rand() < 0.3 ? 1 : 0)
  }

  // sky traffic, kept to the sides
  const lanes = isTall ? [H * 0.42, H * 0.5] : [H * 0.36, H * 0.46]
  for (const [i, y] of lanes.entries()) {
    const dir = i % 2 ? -1 : 1
    for (const fx of isTall ? [0.12, 0.8] : [0.08, 0.22, 0.74, 0.9]) {
      moving(art, dir > 0 ? (fx < 0.5 ? 'd4' : 'd1') : (fx < 0.5 ? 'd2' : 'd3'), (a, g) =>
        hoverCar(a, g, Math.round(W * fx), Math.round(y), dir, i % 2 ? RC.violet : RC.cyan))
    }
  }

  // the elevated train line
  const railY = HY - (isTall ? 30 : 24)
  art.px(fill('#1c2748'), 0, railY, W, 3)
  art.px(fill('#2c3b6a'), 0, railY, W, 0.6)
  neon.px(fill(RC.cyan, 0.6), 0, railY + 3, W, 0.4)
  for (let x = 6; x < W; x += isTall ? 34 : 40) art.px(fill('#151d38'), x, railY + 3, 3, HY - railY - 3)
  const tx = Math.round(W * (isTall ? 0.3 : 0.55))
  const tw = isTall ? 60 : 84
  art.px(fill('#121b33'), tx, railY - 6, tw, 6)
  art.px(fill('#1b2847'), tx, railY - 6, tw, 0.6)
  for (let x = tx + 2; x < tx + tw - 3; x += 4) neon.px(fill(RC.cyan, 0.75), x, railY - 4.5, 2.5, 2)
  neon.px(fill('#fff3b0'), tx + tw - 0.6, railY - 4, 0.6, 1)

  // the towers at the edges
  const towers = isTall
    ? [[0, 20, 0.12, 1], [22, 14, 0.3, 1], [W - 36, 15, 0.26, -1], [W - 20, 20, 0.08, -1]]
    : [[0, 28, 0.05, 1], [30, 16, 0.22, 1], [48, 12, 0.38, 1], [W - 62, 13, 0.34, -1], [W - 47, 21, 0.14, -1], [W - 25, 25, 0.03, -1]]
  for (const [x, w, t, side] of towers) megaTower(art, neon, rand, x, w, Math.round(H * t), HY, side)
  cable(art, isTall ? 20 : 28, Math.round(H * 0.4), isTall ? 36 : 48, Math.round(H * 0.45), 4)
  cable(art, isTall ? W - 36 : W - 62, Math.round(H * 0.42), isTall ? W - 20 : W - 47, Math.round(H * 0.38), 3)

  // a hologram billboard floating over the right-hand towers
  const hw = 36
  const hh = 26
  const hx = isTall ? W - hw - 8 : W - hw - 14
  const hy = Math.round(H * (isTall ? 0.36 : 0.2))
  art.px(fill(RC.cyan, 0.07), hx, hy, hw, hh)
  for (const [px, py, pw, ph] of [[hx, hy, hw, 0.4], [hx, hy + hh - 0.4, hw, 0.4], [hx, hy, 0.4, hh], [hx + hw - 0.4, hy, 0.4, hh]]) {
    neon.px(fill(RC.cyan, 0.7), px, py, pw, ph)
  }
  for (const [word, wy] of [['NIGHT', hy + 3], ['SHIFT', hy + 10]]) {
    const wx = hx + (hw - textWidth(word, 1)) / 2
    text(art, word, wx + 0.6, wy, 1, fill(RC.pink, 0.45))
    text(neon, word, wx, wy, 1, fill(RC.cyan, 0.95))
  }
  text(art, '</> 24/7', hx + (hw - textWidth('</> 24/7', 0.5)) / 2, hy + 19, 0.5, fill(RC.green, 0.85))
  art.px(`${fill(RC.cyan, 0.5)} class="gl"`, hx + 2, hy + 15, hw - 4, 0.5)

  // street level
  front.px(fill(RC.street), 0, HY, W, H - HY)
  frontNeon.px(fill(RC.pink, 0.7), 0, HY, W, 0.4)
  for (let i = 0; i < (isTall ? 40 : 70); i++) {
    const c = [RC.cyan, RC.pink, RC.violet, RC.green][Math.floor(rand() * 4)]
    wet.px(fill(c, op1(0.15 + rand() * 0.25)), Math.floor(rand() * W), Math.round((HY + 1.5 + rand() * (H - HY - 3)) * 2) / 2, 0.5 + Math.floor(rand() * 4) / 2, rand() < 0.3 ? 2 + Math.floor(rand() * 4) : 0.5)
  }
  stall(front, frontNeon, rand, isTall ? 8 : 12, HY)
  hoverBike(front, frontNeon, isTall ? W - 22 : W - 34, HY)

  rainfall(wet, rand, W, H, isTall ? 120 : 160)

  const code = panel(hud, hudNeon, isTall ? 6 : 8, isTall ? 8 : 8, 58, 'RAIN.SH', [
    [['$ ', RC.green], ['SSH GRID:CITY', RC.white]],
    [['> UPLINK ', RC.cyan], ['OK', RC.green]],
    [['> DEPLOY --NIGHT', RC.pink]],
    [['$ ', RC.green], ['_', RC.white, 'cur']],
  ], RC.cyan)
  void code

  const calm = `<rect width="${W}" height="${H}" fill="url(#calm)"/>`
  const extra =
    `<radialGradient id="smog"><stop offset="0" stop-color="${RC.pink}" stop-opacity="0.22"/>` +
    `<stop offset="0.5" stop-color="${RC.violet}" stop-opacity="0.08"/><stop offset="1" stop-color="${RC.violet}" stop-opacity="0"/></radialGradient>`
  return {
    W, H, defs: extra,
    body: bg.svg() + art.svg() + neon.svg() + front.svg() + frontNeon.svg() + wet.svg() + calm + hud.svg() + hudNeon.svg(),
  }
}

// ---- Blocklands: a blocky voxel world, by night or on a sunny day
const VC = {
  sky: [[0, '#070a1c'], [0.55, '#10204e'], [1, '#2c4890']],
  bg: '#04050d', moon: '#e9efff', moonShade: '#b4c2e6', moss: '#2fbf8f', mossHi: '#78f2c0', soil: '#3b2633',
  soilSpeck: '#52344a', stone: '#221f2e', stoneSpeck: '#2f2b40', water: '#0f2a66', waterHi: '#4a8cff',
  wood: '#4a2c1c', woodHi: '#6b4027', pine: '#1b8a6a', pineHi: '#3ddba6', bloom: '#d9438f', bloomHi: '#ff8cc6',
  cyan: '#38f2ff', magenta: '#ff4fd8', warm: '#ffc861', far1: '#0c1434', far2: '#121d4a', firefly: '#d8ff6a',
  roof: '#2c1a12', door: '#1a0f0a', cube: '#1a2448', cubeHi: '#2a3a6e', cubeLo: '#121a36', sand: '#3b2633', sandHi: '#52344a',
}
const VD = {
  sky: [[0, '#3f8cec'], [0.6, '#78b8f6'], [1, '#c4e6ff']],
  bg: '#3f8cec', moon: '#fff6b0', moonShade: '#ffe066', moss: '#5cc84a', mossHi: '#a2ee72', soil: '#8a5a3b',
  soilSpeck: '#a8714c', stone: '#7a7c86', stoneSpeck: '#9a9ca8', water: '#3a8bd6', waterHi: '#c4ecff',
  wood: '#6b4a2b', woodHi: '#8f6539', pine: '#2f9a44', pineHi: '#62cf5c', bloom: '#ff8fc8', bloomHi: '#ffc6e2',
  cyan: '#3fe0ff', magenta: '#ff6fd8', warm: '#fff0b0', far1: '#7fa9dc', far2: '#a3c7ee', firefly: '#ffffff',
  roof: '#9a3f2c', door: '#4a2c1c', cube: '#8f6539', cubeHi: '#b07c46', cubeLo: '#6b4a2b', sand: '#e6d28a', sandHi: '#f6e8b0',
}

function cloud(L, x, y, w) {
  const rows = [[0.3, 0.4], [0.12, 0.76], [0, 1], [0.06, 0.88]]
  rows.forEach(([dx, f], r) => L.px(fill(r === 3 ? '#d9ecff' : '#ffffff', 0.92), Math.round(x + dx * w), y + r * 2, Math.round(w * f), 2))
}

function voxel(W, H, day = false) {
  const P = day ? VD : VC
  const isTall = H > W
  const rand = rng((isTall ? 4242 : 1337) + (day ? 99 : 0))
  const B = 4
  const cols = Math.ceil(W / B)
  const groundRow = Math.round((H * (isTall ? 0.8 : 0.76)) / B)
  const bg = new Layer()
  const art = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const grid = new Layer()
  const lit = day ? art : glow
  const clip = []

  bg.px(fill(P.bg), 0, 0, W, H)
  band(bg, W, 0, groundRow * B, P.sky)
  const mx = Math.round(W * (isTall ? 0.74 : 0.84))
  const my = Math.round(H * (isTall ? 0.12 : 0.17))
  const mr = isTall ? 9 : 10
  if (!day) dots(bg, rand, [0, 0, W, groundRow * B * 0.7], isTall ? 60 : 90, ['#ffffff', '#cfe0ff', P.cyan], [0.2, 0.6], 0.2, [[mx - 16, my - 16, 32, 32]])
  bg.raw(`<circle cx="${mx}" cy="${my}" r="${mr * 3}" fill="url(#${day ? 'sunDay' : 'moonGlow'})"/>`)
  for (let dy = -mr; dy < mr; dy++) {
    const hw = Math.round(Math.sqrt(mr * mr - (dy + 0.5) * (dy + 0.5)))
    art.px(fill(P.moon), mx - hw, my + dy, hw * 2, 1)
  }
  if (day) {
    // a bright core, then clouds and a few birds
    const r2 = mr - 3
    for (let dy = -r2; dy < r2; dy++) {
      const hw = Math.round(Math.sqrt(Math.max(0, r2 * r2 - (dy + 0.5) * (dy + 0.5))))
      art.px(fill('#fffde8'), mx - hw, my + dy, hw * 2, 1)
    }
    const clouds = isTall
      ? [[10, 40, 34], [96, 64, 40], [30, 108, 30], [110, 150, 36]]
      : [[18, 22, 40], [92, 40, 48], [168, 16, 36], [214, 58, 44], [60, 74, 30], [282, 92, 30]]
    moving(bg, 'dt', a => {
      for (const [cx, cy, cw] of clouds) cloud(a, cx, cy, cw)
    })
    for (const [bx, by] of isTall ? [[60, 30], [70, 26], [140, 96]] : [[140, 30], [150, 26], [246, 40], [120, 60]]) {
      art.px(fill('#2a3b5c', 0.8), bx, by, 1, 0.6)
      art.px(fill('#2a3b5c', 0.8), bx + 1, by + 0.6, 1, 0.6)
      art.px(fill('#2a3b5c', 0.8), bx + 2, by, 1, 0.6)
    }
  } else {
    for (const [cx, cy, r] of [[-3, -2, 2], [3, 3, 1.5], [2, -4, 1], [-4, 4, 1]]) art.px(fill(P.moonShade), mx + cx, my + cy, r, r)
  }

  // far stepped mountains
  for (const [color, lift, amp, step] of [[P.far2, 12, 10, 6], [P.far1, 6, 8, 5]]) {
    let h = amp / 2
    for (let x = 0; x < W; x += step) {
      h = Math.max(2, Math.min(amp, h + Math.round((rand() - 0.5) * 4)))
      const top = (groundRow - lift / 2 - h) * B / 2 + groundRow * B / 2
      art.px(fill(color), x, Math.round(top), step, groundRow * B - Math.round(top))
    }
  }

  // terrain heights in blocks above the waterline; the middle dips under water
  const hts = []
  let h = 3
  for (let i = 0; i < cols; i++) {
    h = Math.max(0, Math.min(7, h + (rand() < 0.35 ? (rand() < 0.5 ? -1 : 1) : 0)))
    hts.push(h)
  }
  for (let i = 0; i < cols; i++) {
    const d = Math.abs((i + 0.5) * B - W / 2) / (W / 2)
    if (d < 0.32) hts[i] = Math.min(hts[i], -1 - Math.round((0.32 - d) * 6))
    else if (d < 0.42) hts[i] = Math.min(hts[i], day ? 0 : 1)
  }
  const cabinCol = Math.floor(cols * (isTall ? 0.66 : 0.76))
  for (let i = cabinCol - 1; i < cabinCol + 5 && i < cols; i++) hts[i] = 3

  for (let i = 0; i < cols; i++) {
    const x = i * B
    const topRow = groundRow - hts[i]
    const y = topRow * B
    const beach = day && hts[i] === 0 && ((hts[i - 1] ?? 0) < 0 || (hts[i + 1] ?? 0) < 0)
    art.px(fill(beach ? P.sand : P.moss), x, y, B, B)
    art.px(fill(beach ? P.sandHi : P.mossHi), x, y, B, 1)
    art.px(fill(beach ? P.sand : P.soil), x, y + B, B, B * 2)
    art.px(fill(P.stone), x, y + B * 3, B, H - y - B * 3)
    clip.push(`M${x} ${y}h${B}v${H - y}h${-B}z`)
    for (let k = 0; k < 3; k++) {
      art.px(fill(P.soilSpeck), x + Math.floor(rand() * 3) + 0.5, y + B + Math.floor(rand() * 7) + 0.5, 1, 1)
      art.px(fill(P.stoneSpeck), x + Math.floor(rand() * 3) + 0.5, y + B * 3 + Math.floor(rand() * Math.max(1, H - y - B * 3 - 1)), 1, 1)
    }
    if (day && hts[i] > 0 && rand() < 0.35) {
      const fx = x + 1 + Math.floor(rand() * 2)
      art.px(fill('#3f9a3a'), fx + 0.25, y - 1, 0.5, 1)
      art.px(fill(rand() < 0.5 ? '#ff5050' : '#ffd23f'), fx, y - 2, 1, 1)
    }
    const left = hts[i - 1] ?? hts[i]
    if (hts[i] - left >= 2 || rand() < 0.08) {
      const c = rand() < 0.5 ? P.cyan : P.magenta
      const cy = y + B * (2 + Math.floor(rand() * 3))
      for (let k = 0; k < 3; k++) lit.px(fill(c, 0.95), x + 0.5 + k * 1.2, cy + (k === 1 ? 0 : 1), 0.7, k === 1 ? 2.5 : 1.5)
    }
  }

  // the water in the valley, with the sun's or moon's reflection
  const seaY = groundRow * B
  for (let i = 0; i < cols; i++) {
    if (hts[i] < 0) {
      const x = i * B
      art.px(fill(P.water, 0.92), x, seaY, B, -hts[i] * B)
      art.px(fill(P.waterHi, 0.55), x, seaY, B, 0.5)
    }
  }
  for (let k = 0; k < 6; k++) lit.px(fill(day ? '#ffffff' : P.moon, op1(0.5 - k * 0.07)), W / 2 - 3 + (k % 2), seaY + 1.5 + k * 1.5, 6 - k * 0.6, 0.5)

  // trees: pines and blossom, away from the middle
  const tree = (i, kind) => {
    const x = i * B
    const top = (groundRow - hts[i]) * B
    art.px(fill(P.wood), x, top - B * 2, B, B * 2)
    art.px(fill(P.woodHi), x, top - B * 2, 1, B * 2)
    clip.push(`M${x} ${top - B * 2}h${B}v${B * 2}h${-B}z`)
    const [leaf, hi] = kind ? [P.bloom, P.bloomHi] : [P.pine, P.pineHi]
    const rows = kind ? [[-1, 3], [-1, 3], [0, 1]] : [[-1, 3], [-1, 3], [0, 1], [0, 1]]
    rows.forEach(([dx, n], r) => {
      const ry = top - B * (3 + r)
      art.px(fill(leaf), x + dx * B, ry, n * B, B)
      art.px(fill(hi), x + dx * B, ry, n * B, 0.8)
      clip.push(`M${x + dx * B} ${ry}h${n * B}v${B}h${-n * B}z`)
    })
  }
  const spots = isTall ? [[2, 0], [6, 1], [9, 0], [cols - 4, 1], [cols - 9, 0]] : [[2, 0], [5, 1], [9, 0], [14, 1], [cols - 3, 0], [cols - 7, 1], [cols - 18, 0]]
  for (const [i, kind] of spots) if (i > 0 && i < cols - 1 && hts[i] >= 0 && (i < cabinCol - 1 || i > cabinCol + 4)) tree(i, kind)

  // the cabin
  {
    const x = cabinCol * B
    const base = (groundRow - 3) * B
    art.px(fill(P.wood), x, base - B * 2, B * 3, B * 2)
    art.px(fill(P.woodHi), x, base - B * 2, B * 3, 0.6)
    art.px(fill(P.roof), x - 2, base - B * 3, B * 3 + 4, B)
    art.px(fill(P.roof), x + 2, base - B * 3 - 3, B * 3 - 4, 3)
    art.px(fill(P.door), x + B * 2 + 0.5, base - B * 2 + 1.5, 2.5, B * 2 - 1.5)
    lit.px(fill(day ? '#bfe6ff' : P.warm, 0.95), x + 2, base - B * 2 + 2, 3, 2.5)
    art.px(fill('#3a2418'), x + B * 3 - 3, base - B * 3 - 6, 2, 4)
    for (let k = 0; k < 5; k++) {
      art.px(`${fill(day ? '#ffffff' : '#c8d2ee', op1((day ? 0.6 : 0.35) - k * 0.06))} class="tw${1 + (k % 3)}"`, x + B * 3 - 3 + (k % 2) * 1.5, base - B * 3 - 8 - k * 2, 1, 1)
    }
    if (!day) bg.raw(`<circle cx="${x + 3.5}" cy="${base - B * 2 + 3}" r="12" fill="url(#warmGlow)"/>`)
  }

  // lanterns and fireflies, by night
  if (!day) {
    for (const fx of isTall ? [0.12, 0.88] : [0.07, 0.3, 0.66, 0.95]) {
      const i = Math.min(cols - 1, Math.floor(cols * fx))
      if (hts[i] < 0) continue
      const x = i * B + 1.5
      const top = (groundRow - hts[i]) * B
      art.px(fill(P.wood), x, top - 6, 0.6, 6)
      glow.px(fill(P.warm, 0.95), x - 0.6, top - 7.5, 1.8, 1.6)
      bg.raw(`<circle cx="${num(x + 0.3)}" cy="${top - 7}" r="7" fill="url(#warmGlow)"/>`)
    }
    for (let k = 0; k < (isTall ? 18 : 30); k++) {
      const side = rand() < 0.5 ? rand() * W * 0.28 : W * 0.72 + rand() * W * 0.28
      glow.px(`${fill(P.firefly, op1(0.5 + rand() * 0.4))} class="tw${1 + (k % 3)}"`, Math.round(side * 2) / 2, Math.round((groundRow * B - 6 - rand() * 26) * 2) / 2, 0.5, 0.5)
    }
  }

  // a floating island with a waterfall, and a code block beside it
  {
    const ix = isTall ? 8 : 16
    const iy = Math.round(H * (isTall ? 0.26 : 0.2))
    const rows = [[0, 5, P.moss], [0, 5, P.soil], [1, 3, P.stone], [2, 1, P.stone]]
    rows.forEach(([dx, n, c], r) => {
      art.px(fill(c), ix + dx * B, iy + r * B, n * B, B)
      clip.push(`M${ix + dx * B} ${iy + r * B}h${n * B}v${B}h${-n * B}z`)
    })
    art.px(fill(P.mossHi), ix, iy, 5 * B, 1)
    art.px(fill(P.wood), ix + B, iy - B * 2, B, B * 2)
    art.px(fill(P.pine), ix, iy - B * 4, B * 3, B * 2)
    art.px(fill(P.pineHi), ix, iy - B * 4, B * 3, 0.8)
    for (let k = 0; k < 12; k++) art.px(`${fill(P.waterHi, op1(0.55 - k * 0.035))}${k % 3 === 0 ? ' class="tw2"' : ''}`, ix + 5 * B - 1.5, iy + 1 + k * 2, 1.2, 2)
    lit.px(fill(P.cyan, 0.9), ix + B * 2 + 1, iy + B * 4 - 0.5, 1, 2)
    const cx = ix + 5 * B + 10
    const cy = iy - 10
    art.px(fill(P.cube), cx, cy, 10, 10)
    art.px(fill(P.cubeHi), cx, cy, 10, 1)
    art.px(fill(P.cubeLo), cx + 9, cy, 1, 10)
    text(lit, '</>', cx + (10 - textWidth('</>', 0.5)) / 2, cy + 3.8, 0.5, fill(day ? '#2a1a0f' : P.cyan, 0.95))
  }

  grid.raw(`<rect width="${W}" height="${H}" fill="url(#blk)" clip-path="url(#terr)"/>`)
  const calm = `<rect width="${W}" height="${H}" fill="url(#${day ? 'calmDay' : 'calm'})"/>`
  const line = day ? 0.3 : 0.45
  const extra =
    `<radialGradient id="moonGlow"><stop offset="0" stop-color="#dfe8ff" stop-opacity="0.22"/><stop offset="1" stop-color="#dfe8ff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="sunDay"><stop offset="0" stop-color="#fff6b0" stop-opacity="0.6"/><stop offset="1" stop-color="#fff6b0" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="calmDay" cx="0.5" cy="0.36" r="0.55"><stop offset="0" stop-color="#0a1830" stop-opacity="0.5"/><stop offset="0.6" stop-color="#0a1830" stop-opacity="0.3"/><stop offset="1" stop-color="#0a1830" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="warmGlow"><stop offset="0" stop-color="${P.warm}" stop-opacity="0.3"/><stop offset="1" stop-color="${P.warm}" stop-opacity="0"/></radialGradient>` +
    `<pattern id="blk" width="${B}" height="${B}" patternUnits="userSpaceOnUse"><rect width="${B}" height="0.4" fill="#000" opacity="${line}"/>` +
    `<rect width="0.4" height="${B}" fill="#000" opacity="${line}"/><rect x="0.4" y="0.4" width="${B - 0.4}" height="0.4" fill="#fff" opacity="${day ? 0.18 : 0.07}"/></pattern>` +
    `<clipPath id="terr"><path d="${clip.join('')}"/></clipPath>`
  return { W, H, defs: extra, scan: !day, body: bg.svg() + art.svg() + grid.svg() + glow.svg() + calm }
}

// ---- Night Ops: a night-vision base under a quiet sky
const OC = {
  bg: '#010402', nv: '#39ff88', dim: '#2fae68', amber: '#ffb347', red: '#ff3b3b', far: '#123d25', near: '#0b2a18',
  ground: '#06180d', metal: '#1a4a2c', metalHi: '#2f7a4a', white: '#d9ffe9', tent: '#174a2b',
}

function container(L, x, y, w, h, label) {
  L.px(fill(OC.metal), x, y - h, w, h)
  L.px(fill(OC.metalHi), x, y - h, w, 0.6)
  for (let k = x + 1.5; k < x + w - 1; k += 1.5) L.px(fill('#071a0f'), k, y - h + 1, 0.4, h - 1.5)
  if (label) text(L, label, x + 2, y - h + 2, 0.5, fill(OC.dim, 0.8))
}

function tent(L, x, y, w, h) {
  for (let r = 0; r < h; r++) {
    const rw = Math.max(1, Math.round((w * (r + 1)) / h))
    L.px(fill(OC.tent), x + (w - rw) / 2, y - h + r, rw, 1)
  }
  L.px(fill('#040c07'), x + w / 2 - 1, y - h / 2, 2, h / 2)
}

function ops(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 5151 : 6161)
  const HY = Math.round(H * (isTall ? 0.84 : 0.8))
  const bg = new Layer()
  const art = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const hud = new Layer()
  const hudGlow = new Layer('filter="url(#glow)"')

  bg.px(fill(OC.bg), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#03100a'], [0.5, '#0a2c18'], [0.82, '#185a34'], [1, '#2c8a50']])
  bg.raw(`<ellipse cx="${num(W / 2)}" cy="${HY}" rx="${num(W * 0.35)}" ry="${num(H * 0.12)}" fill="url(#cityGlow)"/>`)
  dots(bg, rand, [0, 0, W, HY * 0.6], isTall ? 50 : 80, [OC.white, OC.nv], [0.15, 0.45], 0.12)

  // two ridgelines
  for (const [color, lift, amp, step] of [[OC.far, 10, 22, 5], [OC.near, 2, 12, 4]]) {
    let h = amp / 2
    for (let x = 0; x < W; x += step) {
      h = Math.max(2, Math.min(amp, h + (rand() - 0.5) * amp * 0.45))
      const top = Math.round(HY - lift - h)
      art.px(fill(color), x, top, step, HY - top)
    }
  }
  art.px(fill(OC.ground), 0, HY, W, H - HY)
  for (let y = HY + 3; y < H; y += 4) art.px(fill(OC.dim, 0.2), 0, y, W, 0.3)

  // the fence along the perimeter
  for (let x = 2; x < W; x += 8) art.px(fill(OC.metalHi), x, HY - 5, 0.5, 5)
  art.px(fill(OC.metalHi, 0.8), 0, HY - 4, W, 0.25)
  art.px(fill(OC.metalHi, 0.8), 0, HY - 2, W, 0.25)

  // the watchtower on the left, its searchlight sweeping the ground
  const wx = isTall ? 14 : 22
  const lampY = HY - 34
  art.px(fill(OC.metal), wx, HY - 28, 1, 28)
  art.px(fill(OC.metal), wx + 11, HY - 28, 1, 28)
  for (let y = HY - 26; y < HY; y += 6) art.px(fill(OC.metal, 0.8), wx, y, 12, 0.5)
  art.px(fill(OC.metalHi), wx - 2, HY - 30, 16, 2)
  art.px(fill(OC.metal), wx - 1, lampY, 14, 4)
  art.px(fill(OC.metalHi), wx - 2, lampY - 1.5, 16, 1.5)
  glow.px(fill(OC.white, 0.95), wx + 12, lampY + 1.5, 1.2, 1.2)
  bg.raw(`<polygon points="${wx + 12.6},${lampY + 2} ${wx + 40},${HY + 2} ${wx + 62},${HY + 2}" fill="url(#beam)" class="sl" style="transform-origin:${wx + 12.6}px ${lampY + 2}px"/>`)
  for (let k = 0; k < 6; k++) art.px(fill('#0d2617'), wx - 6 + k * 3, HY - 1.6, 2.6, 1.4)
  for (let k = 0; k < 5; k++) art.px(fill('#0d2617'), wx - 4.5 + k * 3, HY - 3, 2.6, 1.4)

  // containers, tents and a truck in the middle distance
  const mid = isTall ? [[42, 14, 7, 'BX-04'], [W - 58, 16, 7, 'BX-11']] : [[60, 20, 8, 'BX-04'], [82, 18, 8, ''], [70, 16, 7, 'BX-07'], [W - 112, 20, 8, 'BX-11']]
  mid.forEach(([x, w, h, label], i) => container(art, x, i === 2 && !isTall ? HY - 8 : HY, w, h, label))
  for (const [x, w, h] of isTall ? [[64, 14, 7], [96, 12, 6]] : [[112, 16, 8], [134, 14, 7], [W - 140, 16, 8]]) tent(art, x, HY, w, h)
  {
    const x = isTall ? W - 82 : W - 88
    art.px(fill(OC.metal), x, HY - 6, 14, 5)
    art.px(fill(OC.metal), x + 14, HY - 5, 6, 4)
    art.px(fill(OC.metalHi), x + 15, HY - 4.5, 3, 1.5)
    art.px(fill('#030805'), x + 2, HY - 1.5, 3, 1.5)
    art.px(fill('#030805'), x + 14, HY - 1.5, 3, 1.5)
    glow.px(fill(OC.amber, 0.9), x + 19.5, HY - 3, 0.6, 0.8)
  }

  // the radar dish and the comms mast on the right
  {
    const rx = isTall ? W - 34 : W - 44
    art.px(fill(OC.metal), rx + 5, HY - 10, 2, 10)
    const dish = [[0, 12], [1, 10], [2, 8], [3, 6]]
    for (const [r, w] of dish) art.px(fill(r === 0 ? OC.metalHi : OC.metal), rx + 6 - w / 2, HY - 20 + r * 1.2 + (12 - w) / 3, w, 1.2)
    art.px(fill(OC.metalHi), rx + 5.7, HY - 24, 0.6, 5)
    glow.px(`${fill(OC.red)} class="blink"`, rx + 5.5, HY - 25, 1, 1)
    const mx = isTall ? W - 12 : W - 18
    art.px(fill(OC.metal), mx, HY - 46, 0.8, 46)
    for (let y = HY - 42; y < HY; y += 7) art.px(fill(OC.metal), mx - 2, y, 4.8, 0.4)
    glow.px(`${fill(OC.red)} class="blink"`, mx - 0.1, HY - 47.5, 1, 1)
  }

  // a helicopter and a small drone, flying across the sky
  moving(art, 'fy', (art, glow) => {
    const hx = isTall ? W - 70 : W - 120
    const hy = Math.round(H * (isTall ? 0.3 : 0.28))
    art.px(fill(OC.metal), hx, hy, 14, 4)
    art.px(fill(OC.metal), hx + 2, hy - 1, 9, 1)
    art.px(fill(OC.metalHi, 0.9), hx + 1, hy + 0.6, 3.5, 2)
    art.px(fill(OC.metal), hx + 14, hy + 1, 14, 1.2)
    art.px(fill(OC.metal), hx + 27, hy - 2, 1.2, 4)
    art.px(fill(OC.metal), hx + 2, hy + 5.5, 11, 0.5)
    art.px(fill(OC.metal), hx + 4, hy + 4, 0.5, 1.5)
    art.px(fill(OC.metal), hx + 10, hy + 4, 0.5, 1.5)
    art.px(fill(OC.metalHi), hx + 6.5, hy - 2.5, 1, 1.5)
    art.px(`${fill(OC.metalHi)} class="ra"`, hx - 10, hy - 2.8, 34, 0.4)
    art.px(`${fill(OC.metalHi)} class="rb"`, hx - 4, hy - 2.8, 22, 0.4)
    glow.px(`${fill(OC.red)} class="blink"`, hx + 28, hy - 2.5, 0.8, 0.8)
    glow.px(fill(OC.nv, 0.9), hx + 13, hy + 3, 0.6, 0.6)
    const dx = isTall ? 30 : 92
    const dy = Math.round(H * (isTall ? 0.42 : 0.16))
    art.px(fill(OC.metal), dx, dy, 4, 1.2)
    art.px(fill(OC.metalHi), dx - 2, dy - 0.6, 3, 0.4)
    art.px(fill(OC.metalHi), dx + 3, dy - 0.6, 3, 0.4)
    glow.px(`${fill(OC.red)} class="blink"`, dx + 1.6, dy + 1.2, 0.6, 0.6)
  })

  // HUD: the corner frame, a radar scope, the mission panel and grid coordinates
  corners(hudGlow, W, H, OC.nv)
  {
    const r = isTall ? 13 : 15
    const cx = 8 + r
    const cy = 8 + r
    const ang = (Math.PI / 180) * 40
    hud.raw(
      `<g transform="translate(${cx} ${cy})" shape-rendering="geometricPrecision">` +
        `<circle r="${r}" fill="#000" fill-opacity="0.55" stroke="${OC.nv}" stroke-opacity="0.7" stroke-width="0.5"/>` +
        `<circle r="${num(r * 0.66)}" fill="none" stroke="${OC.dim}" stroke-opacity="0.7" stroke-width="0.3"/>` +
        `<circle r="${num(r * 0.33)}" fill="none" stroke="${OC.dim}" stroke-opacity="0.7" stroke-width="0.3"/>` +
        `<path d="M${-r} 0H${r}M0 ${-r}V${r}" stroke="${OC.dim}" stroke-opacity="0.6" stroke-width="0.3"/>` +
        `<path d="M0 0L${r} 0A${r} ${r} 0 0 1 ${num(r * Math.cos(ang))} ${num(r * Math.sin(ang))}Z" fill="url(#sweep)" class="sw"/>` +
        `</g>`,
    )
    for (const [bx, by] of [[0.4, -0.3], [-0.5, 0.45], [0.2, 0.6]]) hudGlow.px(`${fill(OC.nv)} class="tw${1 + Math.floor(rand() * 3)}"`, cx + bx * r, cy + by * r, 1, 1)
    hudGlow.px(fill(OC.amber), cx - 0.5, cy - 0.5, 1, 1)
  }
  panel(hud, hudGlow, W - 66, 8, 58, 'OP NIGHTFALL', [
    [['OBJ ', OC.dim], ['SHIP THE BUILD', OC.nv]],
    [['SQUAD ', OC.dim], ['4/4', OC.nv]],
    [['ETA ', OC.dim], ['02:00', OC.amber]],
    [['REC', OC.red, 'blink']],
  ], OC.nv)
  const grid = 'GRID 38S 4471 0952'
  text(hud, grid, W - 8 - textWidth(grid, 0.5), H - 9, 0.5, fill(OC.dim, 0.85))

  const calm = `<rect width="${W}" height="${H}" fill="url(#calm)"/>`
  const extra =
    `<radialGradient id="cityGlow"><stop offset="0" stop-color="${OC.amber}" stop-opacity="0.2"/><stop offset="0.6" stop-color="${OC.amber}" stop-opacity="0.05"/><stop offset="1" stop-color="${OC.amber}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${OC.nv}" stop-opacity="0.32"/><stop offset="1" stop-color="${OC.nv}" stop-opacity="0.03"/></linearGradient>` +
    `<linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${OC.nv}" stop-opacity="0"/><stop offset="1" stop-color="${OC.nv}" stop-opacity="0.45"/></linearGradient>`
  return { W, H, defs: extra, body: bg.svg() + art.svg() + glow.svg() + calm + hud.svg() + hudGlow.svg() }
}

// ---------------------------------------------------------------- the newer scenes
// Nine more original scenes: a desert at sunset, a desert lab at night, deep
// space, a black hole over an ocean world, a gothic city in the rain, a night
// race, an AI lab, cats on the rooftops and a dog park. Moods only: no show's,
// film's, team's or hero's names, logos or characters.

// An ASCII sprite: each character a colour from `colors` ('.' is empty), with an
// optional outline drawn first.
function sprite(L, rows, x, y, s, colors, { flip = false, outline } = {}) {
  const g = new Grid()
  const w = Math.max(...rows.map(r => r.length))
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] !== '.') g.set(flip ? w - 1 - c : c, r, row[c])
  })
  if (outline) g.outline().draw(L, x, y, s, () => outline)
  g.draw(L, x, y, s, ch => colors[ch] ?? colors['#'])
  return [x, y, w * s, rows.length * s]
}

function disc(L, cx, cy, r, style) {
  for (let dy = -r; dy < r; dy++) {
    const hw = Math.round(Math.sqrt(Math.max(0, r * r - (dy + 0.5) * (dy + 0.5))))
    if (hw > 0) L.px(style, Math.round(cx) - hw, Math.round(cy) + dy, hw * 2, 1)
  }
}

const svgOf = (...layers) => layers.map(l => l.svg()).join('')
const rot = (x, y) => `style="transform-origin:${num(x)}px ${num(y)}px"`
const radial = (id, color, a, b = 0) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/><stop offset="1" stop-color="${color}" stop-opacity="${b}"/></radialGradient>`
const calmOf = (id, color, a, b) =>
  `<radialGradient id="${id}" cx="0.5" cy="0.4" r="0.55"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/><stop offset="0.6" stop-color="${color}" stop-opacity="${b}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
const shooting = (x, y) =>
  `<g class="ss" opacity="0"><rect x="${num(x)}" y="${num(y)}" width="14" height="0.6" fill="url(#streak)" transform="rotate(-27 ${num(x)} ${num(y)})"/></g>`
const STREAK = `<linearGradient id="streak"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`

// ---- Dune Sea: a desert at sunset
const CACTUS = ['..##....', '..##....', '#.##....', '#.##..#.', '####..#.', '..#####.', '..##....', '..##....', '..##....', '..##....']
const CAMEL = ['.........##.', '..##....###.', '.####...##..', '#######.##..', '##########..', '.########...', '.#.#..#.#...', '.#.#..#.#...']

function desert(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 811 : 812)
  const HY = Math.round(H * (isTall ? 0.7 : 0.6))
  const bg = new Layer()
  const sunL = new Layer()
  const dunes = [0, 1, 2, 3].map(() => new Layer())
  const front = new Layer()
  bg.px(fill('#2a1640'), 0, 0, W, H)
  band(bg, W, 0, HY + 6, [[0, '#2a1640'], [0.35, '#6a2a5e'], [0.62, '#c8506a'], [0.82, '#ff8a4c'], [1, '#ffc46b']])
  dots(bg, rand, [0, 0, W, HY * 0.3], isTall ? 30 : 45, ['#ffffff', '#ffd9f0'], [0.25, 0.6], 0.35)
  const sx = Math.round(W / 2)
  const sr = isTall ? 18 : 22
  const sy = HY - 2
  bg.raw(`<ellipse cx="${sx}" cy="${sy}" rx="${sr * 3.4}" ry="${sr * 1.9}" fill="url(#heat)" class="pu"/>`)
  disc(sunL, sx, sy, sr, fill('#ffc36a'))
  disc(sunL, sx, sy - 1, sr - 4, fill('#ffe39a'))
  disc(sunL, sx, sy - 2, sr - 9, fill('#fff6d0'))
  for (const [dy, f, k] of [[-5, 0.95, 1], [-10, 0.85, 2], [-15, 0.6, 3]]) {
    sunL.px(`${fill('#ff9a5a', 0.75)} class="tw${k}"`, sx - sr * f, sy + dy, sr * 2 * f, 0.7)
  }
  // vultures circling far off
  moving(sunL, 'fy', a => {
    for (const [bx, by] of isTall ? [[120, 60], [132, 54], [150, 70]] : [[240, 34], [252, 28], [268, 42]]) {
      a.px(fill('#3a1a3a', 0.85), bx, by, 1.5, 0.6)
      a.px(fill('#3a1a3a', 0.85), bx + 1.5, by + 0.6, 1, 0.6)
      a.px(fill('#3a1a3a', 0.85), bx + 2.5, by, 1.5, 0.6)
    }
  })
  // the dunes: lit on the side facing the sun, shaded on the other
  const specs = isTall
    ? [[HY + 3, 2.5, 0.05], [HY + 22, 8, 0.035], [HY + 46, 12, 0.03], [H - 24, 9, 0.045]]
    : [[HY + 3, 2.5, 0.04], [HY + 16, 7, 0.028], [HY + 34, 10, 0.022], [H - 16, 8, 0.03]]
  const tones = [['#c96a4a', '#9a4a3e'], ['#de8a52', '#b0603e'], ['#eea562', '#c47648'], ['#f6c27a', '#d68c52']]
  const ridge = specs.map(([base, amp, f]) => {
    const ph = rand() * 6.28
    return x => base - amp * (0.6 * Math.sin(x * f + ph) + 0.4 * Math.sin(x * f * 2.3 + ph * 1.7))
  })
  // the caravan walks along the far ridge, its feet behind the first dune
  moving(sunL, 'cw', a => {
    const s = isTall ? 0.8 : 1
    const x0 = isTall ? 40 : 90
    for (let k = 0; k < 3; k++) sprite(a, CAMEL, x0 + k * 15 * s, specs[0][0] - 6.5 * s, s, { '#': fill('#4a1e36') })
    a.px(fill('#4a1e36'), x0 + 3 * s, specs[0][0] - 9.5 * s, 2 * s, 3 * s)
  })
  ridge.forEach((yAt, k) => {
    const [lit, shade] = tones[k]
    for (let x = 0; x < W; x++) {
      const y = Math.round(yAt(x + 0.5))
      const down = yAt(x + 1) > yAt(x)
      dunes[k].px(fill(down ? shade : lit), x, y, 1, H - y)
      if (!down) dunes[k].px(fill('#ffe0a0', 0.45), x, y, 1, 0.6)
    }
  })
  // ripples on the nearest dune
  for (let i = 0; i < (isTall ? 14 : 22); i++) {
    const x = Math.floor(rand() * W)
    const y = Math.round(ridge[3](x)) + 3 + Math.floor(rand() * 10)
    front.px(fill('#d68c52', 0.6), x, y, 3 + Math.floor(rand() * 5), 0.5)
  }
  // cacti and a road sign
  const cactus = (x, k, s) => {
    const y = Math.round(ridge[k](x + 4 * s)) + 1
    sprite(k === 3 ? front : dunes[k], CACTUS, x, y - 10 * s, s, { '#': fill('#3a6a3a') }, { outline: fill('#2a1a24', 0.8) })
  }
  cactus(isTall ? 8 : 14, 3, 1.6)
  cactus(isTall ? 146 : 290, 3, 1.4)
  cactus(isTall ? 30 : 60, 2, 0.9)
  cactus(isTall ? 130 : 250, 2, 0.8)
  {
    const x = isTall ? W - 60 : W - 86
    const y = Math.round(ridge[3](x)) + 2
    front.px(fill('#5a3a2a'), x + 10, y - 16, 1, 16)
    front.px(fill('#2e6a4a'), x, y - 22, 26, 8)
    front.px(fill('#f4efe0', 0.9), x + 0.5, y - 21.5, 25, 0.5)
    text(front, 'OASIS', x + 2, y - 20.6, 0.6, fill('#f4efe0'))
    text(front, '42 KM', x + 2, y - 16.9, 0.5, fill('#f4efe0', 0.85))
  }
  // a tumbleweed rolling past
  {
    const tw = new Layer()
    const tx = isTall ? 40 : 80
    const ty = H - 7
    for (let a = 0; a < 24; a++) {
      const r = 2.4 + (a % 3) * 0.6
      tw.px(fill(a % 2 ? '#8a5a32' : '#b07a42'), tx + Math.cos(a * 0.9) * r, ty + Math.sin(a * 0.9) * r, 0.8, 0.8)
    }
    front.raw(`<g class="d4"><g class="sw" ${rot(tx, ty)}>${tw.svg()}</g></g>`)
  }
  const extra = radial('heat', '#ffb36b', 0.6) + calmOf('calmWarm', '#1a0820', 0.45, 0.25)
  return { W, H, defs: extra, scan: false, body: svgOf(bg, sunL, ...dunes, front) + `<rect width="${W}" height="${H}" fill="url(#calmWarm)"/>` }
}

// ---- Desert Lab: an old camper van under desert stars, a lab bench beside it
const FLASK = ['.##.', '.##.', '#ll#', 'llll', 'llll']
function camper(art, glow, bg, x, y, s) {
  const P = (dx, dy, w, h, c, o) => art.px(fill(c, o), x + dx * s, y + dy * s, w * s, h * s)
  P(-2, 0, 50, 1.5, '#000', 0.45)
  P(0, -17, 40, 14, '#d9cfae')
  P(0, -18, 40, 1, '#ece4c8')
  P(40, -12, 6, 9, '#d9cfae')
  P(40, -14, 3, 2, '#d9cfae')
  P(41, -11, 4, 3, '#2a3550')
  P(0, -9, 46, 1.6, '#7a4a2a')
  P(0, -6.8, 46, 0.8, '#a8703a')
  P(0, -4, 46, 1.2, '#8a8270')
  P(15, -15, 6, 11, '#c2b590')
  P(20, -20, 4, 2, '#8a8a8a')
  glow.px(`${fill('#ffd27a', 0.95)} class="fl"`, x + 4 * s, y - 15 * s, 7 * s, 4 * s)
  glow.px(fill('#ffd27a', 0.9), x + 27 * s, y - 15 * s, 8 * s, 4 * s)
  glow.px(fill('#ffe6a0', 0.8), x + 15 * s, y - 15 * s, 1 * s, 11 * s)
  bg.raw(`<ellipse cx="${num(x + 17 * s)}" cy="${num(y)}" rx="${num(20 * s)}" ry="${num(5 * s)}" fill="url(#spill)"/>`)
  for (const wx of [8, 36]) {
    disc(art, x + wx * s, y - 2 * s, 3 * s, fill('#0c0a10'))
    art.px(fill('#7a7a80'), x + (wx - 1) * s, y - 3 * s, 2 * s, 2 * s)
  }
  for (const k of [1, 2, 3]) glow.px(`${fill('#e8ecf4', 0.45)} class="up${k}"`, x + (21 + k * 0.6) * s, y - 22 * s, 1.5 * s, 1.5 * s)
}

function lab(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 3131 : 3132)
  const HY = Math.round(H * (isTall ? 0.8 : 0.74))
  const bg = new Layer()
  const far = new Layer()
  const art = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const hud = new Layer()
  const hudGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#04050d'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#04050d'], [0.45, '#0c1636'], [0.78, '#2a2d5e'], [0.93, '#6a3f6a'], [1, '#b0605a']])
  const mx = Math.round(W * (isTall ? 0.8 : 0.86))
  const my = Math.round(H * (isTall ? 0.12 : 0.17))
  dots(bg, rand, [0, 0, W, HY * 0.75], isTall ? 110 : 170, ['#ffffff', '#ffffff', '#cfe0ff', '#ffe6b0'], [0.25, 0.8], 0.3, [[mx - 12, my - 12, 24, 24]])
  bg.raw(`<circle cx="${mx}" cy="${my}" r="26" fill="url(#moonHalo)"/>`)
  bg.raw(shooting(W * 0.42, H * 0.1))
  disc(far, mx, my, 8, fill('#f4ecd0'))
  disc(far, mx + 3, my - 2, 7, fill('#0a1230'))
  // mesas
  const mesas = isTall ? [[-10, 70, 30], [104, 90, 40]] : [[-6, 70, 26], [60, 46, 14], [192, 62, 34], [262, 80, 20]]
  for (const [x, w, h] of mesas) {
    for (let r = 0; r < h; r++) {
      const rw = w * (0.7 + 0.3 * (r / h) ** 2)
      far.px(fill(r === 0 ? '#3d2a4a' : r % 6 === 5 ? '#241a38' : '#1d1530'), x + (w - rw) / 2, HY - h + r, rw, 1)
    }
  }
  band(far, W, HY, H, [[0, '#3a2626'], [1, '#120a0e']])
  for (let i = 0; i < (isTall ? 40 : 70); i++) far.px(fill('#5a3a32', op1(0.3 + rand() * 0.4)), Math.floor(rand() * W), HY + 1 + Math.floor(rand() * (H - HY - 1)), 1, 0.5)
  for (let i = 0; i < (isTall ? 5 : 9); i++) {
    const x = Math.floor(rand() * W)
    const y = HY + 2 + Math.floor(rand() * (H - HY - 6))
    art.px(fill('#2a3a26'), x, y, 3, 1.5)
    art.px(fill('#2a3a26'), x + 0.5, y - 1, 2, 1)
  }
  // the camper, the lab bench and a camp chair
  const s = isTall ? 0.9 : 1
  const cx = Math.round(isTall ? W * 0.42 : W * 0.62)
  const cy = isTall ? HY + 18 : HY + 12
  camper(art, glow, bg, cx, cy, s)
  {
    const tx = cx - 28 * s
    const ty = cy - 8 * s
    art.px(fill('#9a9aa0'), tx, ty, 20 * s, 1 * s)
    art.px(fill('#6a6a70'), tx + 1 * s, ty + 1 * s, 0.6 * s, 7 * s)
    art.px(fill('#6a6a70'), tx + 18 * s, ty + 1 * s, 0.6 * s, 7 * s)
    ;[['#5dffb0', 2], ['#5fd3ff', 8], ['#ffd27a', 14]].forEach(([c, dx], k) => {
      sprite(glow, FLASK, tx + dx * s, ty - 5 * s, s, { '#': fill('#cfe0ff', 0.55), l: fill(c, 0.9) })
      glow.px(`${fill(c, 0.6)} class="up${1 + k}"`, tx + (dx + 1.5) * s, ty - 7 * s, 0.8 * s, 0.8 * s)
    })
    glow.px(`${fill('#4aa8ff', 0.9)} class="fl"`, tx + 9 * s, ty - 1.5 * s, 2 * s, 1.5 * s)
    const chx = cx + 52 * s
    art.px(fill('#2a5a8a'), chx, cy - 7 * s, 6 * s, 1.2 * s)
    art.px(fill('#2a5a8a'), chx + 5 * s, cy - 12 * s, 1.2 * s, 6 * s)
    art.px(fill('#5a5a60'), chx, cy - 6 * s, 0.6 * s, 6 * s)
    art.px(fill('#5a5a60'), chx + 5 * s, cy - 6 * s, 0.6 * s, 6 * s)
  }
  for (const [x, k] of isTall ? [[10, 1.4], [150, 1.2]] : [[16, 1.6], [120, 1], [292, 1.4]]) {
    sprite(art, CACTUS, x, HY + 6 - 10 * k, k, { '#': fill('#17261a') })
  }
  panel(hud, hudGlow, 8, 8, 60, 'LAB NOTES', [
    [['C8H10N4O2', '#7fffd4']],
    [['= COFFEE', '#ffd27a']],
    [['PURITY ', '#8a9ab8'], ['99.1%', '#7fdfff']],
    [['BUILD ', '#8a9ab8'], ['STABLE', '#5dffb0', 'blink']],
  ], '#5fd3c8')
  const extra = radial('moonHalo', '#f4ecd0', 0.25) + radial('spill', '#ffd27a', 0.35) + STREAK
  return { W, H, defs: extra, body: svgOf(bg, far, art, glow) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(hud, hudGlow) }
}

// ---- Deep Space: a ringed planet, a station, an astronaut drifting by
const ASTRO = ['..####..', '.#vvvv#.', '.#vvvv#.', '..####..', 'p######.', 'p#.##.##', 'p#####.#', '.######.', '.##..##.', '.##..##.']

function space(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 6060 : 6061)
  const bg = new Layer()
  const ringBack = new Layer()
  const planet = new Layer()
  const ringFront = new Layer()
  const art = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const ground = new Layer()
  const groundGlow = new Layer('filter="url(#glow)"')
  const hud = new Layer()
  const hudGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#02010a'), 0, 0, W, H)
  for (const [fx, fy, rx, ry, id] of [[0.25, 0.35, 0.4, 0.32, 'nebA'], [0.78, 0.55, 0.36, 0.3, 'nebB'], [0.55, 0.15, 0.3, 0.18, 'nebC']]) {
    bg.raw(`<ellipse cx="${num(W * fx)}" cy="${num(H * fy)}" rx="${num(W * rx)}" ry="${num(H * ry)}" fill="url(#${id})"/>`)
  }
  dots(bg, rand, [0, 0, W, H], isTall ? 160 : 240, ['#ffffff', '#ffffff', '#cfd8ff', '#ffd8f0', '#9ff0ff'], [0.2, 0.85], 0.3)
  bg.raw(shooting(W * 0.6, H * 0.12))
  // the ringed planet
  const px0 = Math.round(W * (isTall ? 0.24 : 0.17))
  const py0 = Math.round(H * (isTall ? 0.24 : 0.44))
  const pr = isTall ? 15 : 19
  const bands = ['#e8b07a', '#c77a4a', '#f0c890', '#b8643e', '#e0a26a', '#f4d4a0']
  for (let dy = -pr; dy < pr; dy++) {
    const hw = Math.round(Math.sqrt(Math.max(0, pr * pr - (dy + 0.5) * (dy + 0.5))))
    const c = bands[Math.floor(((dy + pr) / (2 * pr)) * bands.length * 1.5) % bands.length]
    planet.px(fill(c), px0 - hw, py0 + dy, Math.round(hw * 1.4), 1)
    planet.px(fill(mix(c, '#140a1e', 0.55)), px0 - hw + Math.round(hw * 1.4), py0 + dy, hw * 2 - Math.round(hw * 1.4), 1)
  }
  const tilt = -0.32
  for (let a = 0; a < Math.PI * 2; a += 0.025) {
    for (const [k, c, o] of [[2.0, '#a88a6a', 0.75], [2.25, '#e0cca8', 0.9], [2.45, '#c8b088', 0.6]]) {
      const ex = Math.cos(a) * pr * k
      const ey = Math.sin(a) * pr * k * 0.26
      const x = px0 + ex * Math.cos(tilt) - ey * Math.sin(tilt)
      const y = py0 + ex * Math.sin(tilt) + ey * Math.cos(tilt)
      ;(Math.sin(a) > 0 ? ringFront : ringBack).px(fill(c, o), Math.round(x * 2) / 2, Math.round(y * 2) / 2, 0.8, 0.6)
    }
  }
  // a small moon
  {
    const x = Math.round(W * (isTall ? 0.62 : 0.34))
    const y = Math.round(H * (isTall ? 0.1 : 0.2))
    disc(art, x, y, 5, fill('#9a9ab0'))
    disc(art, x + 1, y + 1, 4, fill('#7a7a92'))
    art.px(fill('#5e5e74'), x - 2, y - 2, 1.5, 1.5)
    art.px(fill('#5e5e74'), x + 1, y + 1, 1, 1)
  }
  // the station: a spinning ring, a hub and solar wings
  {
    const sx = Math.round(W * (isTall ? 0.76 : 0.83))
    const sy = Math.round(H * (isTall ? 0.24 : 0.3))
    const r = isTall ? 12 : 14
    for (const dir of [-1, 1]) {
      const wx = dir < 0 ? sx - r - 18 : sx + r + 3
      art.px(fill('#7a8aa8'), dir < 0 ? sx - r - 3 : sx + r, sy - 0.3, 3, 0.6)
      art.px(fill('#1f3a8a'), wx, sy - 4, 15, 8)
      for (let gx = wx + 3; gx < wx + 15; gx += 3) art.px(fill('#4a6ad0', 0.7), gx, sy - 4, 0.4, 8)
      art.px(fill('#4a6ad0', 0.7), wx, sy - 0.2, 15, 0.4)
    }
    const ring = new Layer()
    ring.raw(`<circle cx="${sx}" cy="${sy}" r="${r}" fill="none" stroke="#8a96b4" stroke-width="1.4"/>`)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      ring.raw(`<line x1="${sx}" y1="${sy}" x2="${num(sx + Math.cos(a) * r)}" y2="${num(sy + Math.sin(a) * r)}" stroke="#5a6680" stroke-width="0.5"/>`)
      ring.px(fill('#c8d0e4'), sx + Math.cos(a) * r - 1.5, sy + Math.sin(a) * r - 1.5, 3, 3)
      ring.px(fill('#ffd27a', 0.9), sx + Math.cos(a) * r - 0.5, sy + Math.sin(a) * r - 0.5, 1, 1)
    }
    art.raw(`<g class="rs" ${rot(sx, sy)}>${ring.svg()}</g>`)
    disc(glow, sx, sy, 3, fill('#d8e0f4'))
    glow.px(`${fill('#ff4a5a')} class="blink"`, sx - 0.5, sy - 0.5, 1, 1)
  }
  // a satellite crossing, and the astronaut bobbing
  moving(art, 'fy', (a, g) => {
    const x = isTall ? 120 : 210
    const y = Math.round(H * (isTall ? 0.42 : 0.16))
    a.px(fill('#b8bcc8'), x, y, 4, 3)
    a.px(fill('#2a4aa8'), x - 6, y + 1, 5, 1)
    a.px(fill('#2a4aa8'), x + 5, y + 1, 5, 1)
    g.px(`${fill('#5dffb0')} class="blink"`, x + 1.5, y - 1, 1, 1)
  })
  {
    const ax = Math.round(W * (isTall ? 0.66 : 0.7))
    const ay = Math.round(H * (isTall ? 0.52 : 0.52))
    const astro = new Layer()
    sprite(astro, ASTRO, ax, ay, 1.3, { '#': fill('#e8ecf4'), v: fill('#38c8ff'), p: fill('#a8b0c4') })
    astro.px(fill('#ffb347'), ax + 3 * 1.3, ay + 5 * 1.3, 1.3, 1.3)
    art.raw(`<g class="bo">${astro.svg()}</g>`)
  }
  // a big planet's night side along the bottom, its cities lit
  {
    const h = isTall ? 40 : 28
    const R = W * 1.6
    const cx = W / 2
    const cy = H - h + R
    for (let x = 0; x < W; x++) {
      const y = Math.round(cy - Math.sqrt(R * R - (x + 0.5 - cx) ** 2))
      ground.px(fill('#0b1a3a'), x, y, 1, H - y)
      groundGlow.px(fill('#4ad8ff', 0.85), x, y, 1, 0.6)
      if (rand() < 0.12) ground.px(fill('#123a5a'), x, y + 3 + Math.floor(rand() * 8), 3 + Math.floor(rand() * 6), 1.5)
      if (rand() < 0.08) ground.px(`${fill('#ffd27a', op1(0.5 + rand() * 0.4))}${rand() < 0.3 ? ' class="tw2"' : ''}`, x, y + 4 + Math.floor(rand() * (h - 6)), 0.5, 0.5)
    }
    bg.raw(`<ellipse cx="${num(cx)}" cy="${H - h}" rx="${W * 0.7}" ry="12" fill="url(#atmo)"/>`)
  }
  panel(hud, hudGlow, isTall ? W - 66 : 8, 8, 58, 'MISSION LOG', [
    [['ORBIT ', '#8a9ab8'], ['412 KM', '#9ff0ff']],
    [['O2 ', '#8a9ab8'], ['98%', '#5dffb0']],
    [['SIGNAL ', '#8a9ab8'], ['OK', '#5dffb0']],
    [['REC', '#ff4a5a', 'blink']],
  ], '#9ff0ff')
  const extra =
    radial('nebA', '#8a2cff', 0.28) + radial('nebB', '#00c8d8', 0.2) + radial('nebC', '#ff3fa8', 0.16) + radial('atmo', '#4ad8ff', 0.35) + STREAK
  return { W, H, defs: extra, body: svgOf(bg, ringBack, planet, ringFront, art, glow, ground, groundGlow) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(hud, hudGlow) }
}

// ---- Black Hole: a glowing disk over an ocean world, a ring station turning
function blackHole(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 7070 : 7071)
  const HY = Math.round(H * (isTall ? 0.84 : 0.8))
  const bg = new Layer()
  const art = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const sea = new Layer()
  const wave = new Layer()
  const hud = new Layer()
  const hudGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#010103'), 0, 0, W, H)
  band(bg, W, HY - 40, HY, [[0, '#010103'], [1, '#2a1a10']])
  dots(bg, rand, [0, 0, W, HY], isTall ? 120 : 170, ['#ffffff', '#ffe6c0', '#c0d0ff'], [0.2, 0.8], 0.25)
  const bx = W / 2
  const by = Math.round(H * (isTall ? 0.2 : 0.3))
  const r = isTall ? 11 : 13
  art.raw(
    `<g shape-rendering="geometricPrecision">` +
      `<circle cx="${bx}" cy="${by}" r="${r * 5}" fill="url(#bhGlow)" class="pu"/>` +
      `<circle cx="${bx}" cy="${by}" r="${num(r * 1.34)}" fill="none" stroke="#ffb060" stroke-width="${num(r * 0.42)}" opacity="0.9"/>` +
      `<circle cx="${bx}" cy="${by}" r="${num(r * 1.3)}" fill="none" stroke="#fff0d0" stroke-width="${num(r * 0.12)}" opacity="0.8"/>` +
      `<circle cx="${bx}" cy="${by}" r="${r}" fill="#000"/>` +
      `<circle cx="${bx}" cy="${by}" r="${num(r * 1.05)}" fill="none" stroke="#fff6e0" stroke-width="0.4" opacity="0.85"/>` +
      `<ellipse cx="${bx}" cy="${by}" rx="${num(r * 3.7)}" ry="${num(r * 0.36)}" fill="url(#disk)"/>` +
      `<ellipse cx="${bx}" cy="${by}" rx="${num(r * 3)}" ry="${num(r * 0.1)}" fill="#fff8e8" opacity="0.75"/>` +
      `</g>`,
  )
  // dust caught in the disk
  for (let k = 0; k < 26; k++) {
    const a = rand() * Math.PI * 2
    const d = r * (1.6 + rand() * 2.2)
    glow.px(`${fill(rand() < 0.5 ? '#ffd27a' : '#fff0d0', op1(0.4 + rand() * 0.5))} class="tw${1 + (k % 3)}"`, bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.18, 0.6, 0.5)
  }
  // the ring station, turning
  {
    const sx = Math.round(W * (isTall ? 0.8 : 0.15))
    const sy = Math.round(H * (isTall ? 0.38 : 0.22))
    const sr = isTall ? 9 : 11
    const ring = new Layer()
    ring.raw(`<circle cx="${sx}" cy="${sy}" r="${sr}" fill="none" stroke="#7a8090" stroke-width="0.7"/>`)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      ring.px(fill('#c8ccd6'), sx + Math.cos(a) * sr - 1.2, sy + Math.sin(a) * sr - 1.2, 2.4, 2.4)
      ring.px(fill('#3a4050'), sx + Math.cos(a) * sr - 0.4, sy + Math.sin(a) * sr - 0.4, 0.8, 0.8)
    }
    ring.raw(`<line x1="${sx - sr}" y1="${sy}" x2="${sx + sr}" y2="${sy}" stroke="#7a8090" stroke-width="0.4"/>`)
    art.raw(`<g class="rs" ${rot(sx, sy)}>${ring.svg()}</g>`)
    art.px(fill('#c8ccd6'), sx - 1.5, sy - 1.5, 3, 3)
  }
  // a long ship crossing
  moving(art, 'fy', (a, g) => {
    const x = isTall ? 110 : 230
    const y = Math.round(H * (isTall ? 0.5 : 0.48))
    a.px(fill('#b8bcc8'), x, y, 16, 1.6)
    a.px(fill('#8a90a0'), x + 2, y - 1, 6, 1)
    a.px(fill('#8a90a0'), x + 11, y + 1.6, 4, 1)
    g.px(fill('#7fd0ff'), x + 16, y + 0.2, 1.2, 1.2)
  })
  // the ocean, its sheen, and a wave as tall as a mountain
  band(sea, W, HY, H, [[0, '#0e4a5e'], [1, '#05202c']])
  for (let i = 0; i < (isTall ? 40 : 60); i++) {
    const y = HY + 1 + Math.floor(rand() * (H - HY - 2))
    sea.px(`${fill('#5ab8d0', op1(0.15 + rand() * 0.25))}${rand() < 0.3 ? ` class="tw${1 + (i % 3)}"` : ''}`, Math.floor(rand() * W), y, 2 + Math.floor(rand() * 6), 0.4)
  }
  for (let k = 0; k < 5; k++) sea.px(fill('#ffd27a', op1(0.5 - k * 0.08)), bx - 8 + k, HY + 1 + k * 1.8, 16 - k * 2, 0.5)
  {
    const xc = isTall ? 30 : 46
    const peak = isTall ? 54 : 52
    const sig = isTall ? 26 : 34
    for (let x = 0; x < xc + sig * 2.2; x++) {
      const t = (x - xc) / sig
      const hgt = peak * Math.exp(-t * t * (t > 0 ? 1.4 : 0.8))
      if (hgt < 1) continue
      const y = Math.round(HY - hgt)
      wave.px(fill('#12506a'), x, y, 1, HY - y + 1)
      wave.px(fill('#2a7a94'), x, y, 1, Math.min(6, HY - y))
      wave.px(fill('#d8f4ff', 0.85), x, y, 1, 0.8)
    }
    for (let k = 0; k < 18; k++) wave.px(`${fill('#e8fbff', op1(0.4 + rand() * 0.4))} class="tw${1 + (k % 3)}"`, xc - 6 + rand() * 24, HY - peak - 1 - rand() * 6, 0.6, 0.6)
  }
  panel(hud, hudGlow, isTall ? 8 : W - 66, 8, 58, 'NAV', [
    [['T+ ', '#8a9ab8'], ['01:42:07', '#ffb347']],
    [['DILATION ', '#8a9ab8'], ['HIGH', '#ff6a5a', 'blink']],
    [['FUEL ', '#8a9ab8'], ['64%', '#9ff0ff']],
    [['DOCKING ', '#8a9ab8'], ['READY', '#5dffb0']],
  ], '#ffb347')
  const extra =
    `<radialGradient id="bhGlow"><stop offset="0" stop-color="#ff9a40" stop-opacity="0.4"/><stop offset="0.4" stop-color="#ff6a1a" stop-opacity="0.14"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="disk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff6a1a" stop-opacity="0"/><stop offset="0.18" stop-color="#ff8a2a" stop-opacity="0.8"/><stop offset="0.38" stop-color="#ffe0a0"/><stop offset="0.5" stop-color="#ffffff"/>` +
    `<stop offset="0.66" stop-color="#ffc070"/><stop offset="0.84" stop-color="#ff7a1a" stop-opacity="0.7"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></linearGradient>`
  return { W, H, defs: extra, body: svgOf(bg, art, glow, sea, wave) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(hud, hudGlow) }
}

// ---- Gargoyle City: a gothic city in the rain, a searchlight on the clouds
const CAPED = ['.....###....', '....#####...', '....##e##...', '...######...', '..########..', '.##########.', '############', '############', '.###########', '..#########.', '...##..###..']
const GARGOYLE = ['#.......#', '##.###.##', '.#######.', '..#e#e#..', '...###...', '.#######.', '#########', '##.###.##']

function gothicTower(L, G, rand, x, w, top, HY, spire) {
  L.px(fill('#0a0e18'), x, top, w, HY - top)
  L.px(fill('#161c2c'), x, top, 1, HY - top)
  L.px(fill('#0a0e18'), x + 2, top - 4, w - 4, 4)
  if (spire) {
    for (let r = 0; r < 12; r++) {
      const half = 0.5 + (r / 12) * 2
      L.px(fill('#0a0e18'), x + w / 2 - half, top - 16 + r, half * 2, 1)
    }
  }
  L.px(fill('#1a2030'), x - 1, top, 2, 2)
  L.px(fill('#1a2030'), x + w - 1, top, 2, 2)
  for (let y = top + 4; y < HY - 3; y += 4) {
    for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      if (rand() < 0.22) G.px(fill(rand() < 0.8 ? '#e8b84a' : '#ffe6a0', op1(0.45 + rand() * 0.4)), wx, y, 1, 1.5)
    }
  }
}

function gothic(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 9191 : 9192)
  const HY = Math.round(H * (isTall ? 0.9 : 0.88))
  const bg = new Layer()
  const clouds = new Layer()
  const far = new Layer()
  const near = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const front = new Layer()
  const wet = new Layer()
  const hud = new Layer()
  const hudGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#04060c'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#05070e'], [0.45, '#0c1424'], [0.8, '#1c2840'], [1, '#33384a']])
  disc(bg, W * (isTall ? 0.2 : 0.36), H * (isTall ? 0.2 : 0.14), 9, fill('#d8dce8', 0.85))
  // the searchlight, swaying, its circle on the clouds
  const lx = Math.round(W * (isTall ? 0.78 : 0.84))
  const ly = Math.round(H * (isTall ? 0.5 : 0.44))
  const tx = Math.round(W * (isTall ? 0.5 : 0.62))
  const ty = Math.round(H * (isTall ? 0.07 : 0.1))
  bg.raw(
    `<g class="sl" ${rot(lx, ly)}><polygon points="${lx - 1},${ly} ${lx + 1},${ly} ${tx + 12},${ty} ${tx - 12},${ty}" fill="url(#search)"/>` +
      `<ellipse cx="${tx}" cy="${ty}" rx="13" ry="5.5" fill="#fff3c0" opacity="0.42"/><ellipse cx="${tx}" cy="${ty}" rx="9" ry="3.6" fill="#fff8e0" opacity="0.35"/></g>`,
  )
  // cloud banks drifting
  moving(clouds, 'dt', a => {
    for (let k = 0; k < (isTall ? 10 : 14); k++) {
      const cx = Math.floor(rand() * (W + 60)) - 40
      const cy = Math.floor(rand() * H * 0.3)
      const cw = 20 + Math.floor(rand() * 40)
      a.px(fill('#1a2236', 0.85), cx, cy, cw, 3)
      a.px(fill('#2a3450', 0.7), cx + 3, cy - 1, cw - 8, 1)
      a.px(fill('#141a2a', 0.85), cx + 5, cy + 3, cw - 6, 2)
    }
  })
  clouds.raw(`<rect width="${W}" height="${HY}" fill="#e8f0ff" opacity="0" class="lt"/>`)
  // far towers and spires
  for (let x = 0; x < W;) {
    const w = 5 + Math.floor(rand() * 9)
    const top = Math.round(HY - H * (isTall ? 0.18 : 0.3) - rand() * H * 0.18)
    far.px(fill('#0e1424'), x, top, w, HY - top)
    if (rand() < 0.45) for (let r = 0; r < 8; r++) far.px(fill('#0e1424'), x + w / 2 - (8 - r) / 8 * 1.5, top - 8 + r, ((8 - r) / 8) * 3 + 0.5, 1)
    for (let i = 0; i < Math.floor((w * (HY - top)) / 40); i++) far.px(fill('#c8a04a', op1(0.25 + rand() * 0.3)), x + 1 + Math.floor(rand() * (w - 2)), top + 2 + Math.floor(rand() * (HY - top - 4)), 0.5, 1)
    x += w + (rand() < 0.3 ? 1 : 0)
  }
  // near towers at the edges, one with a clock
  const towers = isTall
    ? [[0, 22, 0.3, true], [24, 14, 0.46, false], [W - 38, 16, 0.42, true], [W - 20, 20, 0.24, false]]
    : [[0, 26, 0.12, true], [28, 16, 0.34, false], [46, 12, 0.5, true], [W - 60, 14, 0.42, false], [W - 44, 20, 0.2, true], [W - 22, 22, 0.32, false]]
  for (const [x, w, t, spire] of towers) gothicTower(near, glow, rand, x, w, Math.round(H * t), HY, spire)
  {
    const [x, w, t] = towers[0]
    const cx = x + w / 2
    const cy = Math.round(H * t) + 26
    disc(glow, cx, cy, 6, fill('#f0d890', 0.9))
    near.px(fill('#3a2a10'), cx - 0.3, cy - 5, 0.6, 5)
    near.px(fill('#3a2a10'), cx, cy - 0.3, 3.5, 0.6)
  }
  // a gargoyle and a caped figure keeping watch on a ledge
  {
    const s = isTall ? 1.2 : 1.4
    const ex = isTall ? 4 : 10
    const ey = Math.round(H * (isTall ? 0.62 : 0.6))
    front.px(fill('#1a2030'), ex - 4, ey, 50 * s, 3)
    front.px(fill('#2a3244'), ex - 4, ey, 50 * s, 0.6)
    front.px(fill('#141a28'), ex, ey + 3, 6, H - ey - 3)
    sprite(front, GARGOYLE, ex + 2, ey - 8 * s, s, { '#': fill('#2a3244'), e: fill('#ff5a3a') })
    sprite(front, CAPED, ex + 18 * s, ey - 11 * s, s, { '#': fill('#020308'), e: fill('#cfe0ff') }, { outline: fill('#3a4a6e', 0.7) })
  }
  // the street: lamps and a wet shine
  front.px(fill('#070910'), 0, HY, W, H - HY)
  for (let x = 14; x < W; x += isTall ? 44 : 52) {
    front.px(fill('#1a2030'), x, HY - 10, 0.8, 10)
    glow.px(fill('#ffcc66', 0.95), x - 0.6, HY - 11.5, 2, 1.5)
    wet.px(fill('#ffcc66', 0.25), x - 2, HY + 2, 5, 0.5)
  }
  rainfall(wet, rand, W, H, isTall ? 130 : 170)
  moving(clouds, 'fy', (a, g) => {
    const x = isTall ? 120 : 200
    const y = Math.round(H * (isTall ? 0.2 : 0.3))
    a.px(fill('#2a3048'), x, y, 18, 5)
    a.px(fill('#2a3048'), x + 2, y - 1, 14, 1)
    a.px(fill('#1a2030'), x + 7, y + 5, 5, 1.5)
    g.px(`${fill('#ff4a4a')} class="blink"`, x + 17.5, y + 2, 0.8, 0.8)
  })
  panel(hud, hudGlow, isTall ? W - 66 : 8, 8, 58, 'NIGHT PATROL', [
    [['DISTRICT ', '#8a9ab8'], ['7', '#ffcc66']],
    [['RAIN ', '#8a9ab8'], ['HEAVY', '#8fb8ff']],
    [['STATUS ', '#8a9ab8'], ['ALL QUIET', '#5dffb0']],
  ], '#ffcc66')
  const extra = `<linearGradient id="search" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3c0" stop-opacity="0.35"/><stop offset="1" stop-color="#fff3c0" stop-opacity="0.06"/></linearGradient>`
  return { W, H, defs: extra, body: svgOf(bg, clouds, far, near, glow, front, wet) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(hud, hudGlow) }
}

// ---- Grand Prix: a night race under floodlights
const RACER = ['##...........o........', '##.........#####......', '##wwwwwwwwwwwwwwwwwwww#', '###@@@############@@@###', '...@@@............@@@...']

function race(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 4141 : 4142)
  const HY = Math.round(H * (isTall ? 0.74 : 0.64))
  const bg = new Layer()
  const city = new Layer()
  const cityGlow = new Layer('filter="url(#glow)"')
  const stand = new Layer()
  const track = new Layer()
  const trackGlow = new Layer('filter="url(#glow)"')
  const cars = new Layer()
  const hud = new Layer()
  const hudGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#03040c'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#03040c'], [0.55, '#0b1430'], [1, '#22306a']])
  dots(bg, rand, [0, 0, W, HY * 0.4], isTall ? 30 : 50, ['#ffffff', '#cfe0ff'], [0.2, 0.5], 0.2)
  // the city behind, with a big wheel turning
  for (let x = 0; x < W;) {
    const w = 4 + Math.floor(rand() * 9)
    const top = Math.round(HY - 26 - rand() * H * (isTall ? 0.14 : 0.2))
    city.px(fill('#0c1328'), x, top, w, HY - top)
    for (let i = 0; i < Math.floor((w * (HY - top)) / 24); i++) {
      city.px(fill(['#ffd27a', '#9ff0ff', '#ff6ab0'][Math.floor(rand() * 3)], op1(0.3 + rand() * 0.4)), x + 1 + Math.floor(rand() * (w - 2)), top + 2 + Math.floor(rand() * (HY - top - 4)), 0.5, 0.5)
    }
    x += w + 1
  }
  {
    const cx = Math.round(W * (isTall ? 0.76 : 0.82))
    const R = isTall ? 18 : 22
    const cy = HY - 26 - R
    city.px(fill('#2a3460'), cx - R * 0.5, cy, 0.8, HY - cy)
    city.px(fill('#2a3460'), cx + R * 0.5, cy, 0.8, HY - cy)
    const wheel = new Layer()
    wheel.raw(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#5a6ab0" stroke-width="0.6"/>`)
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      wheel.raw(`<line x1="${cx}" y1="${cy}" x2="${num(cx + Math.cos(a) * R)}" y2="${num(cy + Math.sin(a) * R)}" stroke="#3a4880" stroke-width="0.35"/>`)
      wheel.px(fill(['#ff6ab0', '#9ff0ff', '#ffd27a'][k % 3], 0.9), cx + Math.cos(a) * R - 1, cy + Math.sin(a) * R - 1, 2, 2)
    }
    cityGlow.raw(`<g class="rs" ${rot(cx, cy)}>${wheel.svg()}</g>`)
  }
  // floodlights
  for (const fx of isTall ? [0.1, 0.9] : [0.06, 0.38, 0.62, 0.94]) {
    const x = Math.round(W * fx)
    const top = HY - (isTall ? 64 : 58)
    stand.px(fill('#2a3050'), x, top, 1, HY - top)
    stand.px(fill('#2a3050'), x - 3, top, 7, 2)
    cityGlow.px(fill('#fff6d8'), x - 2.5, top + 0.4, 6, 1.2)
    bg.raw(`<polygon points="${x - 3},${top + 2} ${x + 4},${top + 2} ${x + 22},${H} ${x - 21},${H}" fill="url(#flood)"/>`)
  }
  // the grandstand and its crowd
  const st = HY - 22
  stand.px(fill('#1e2640'), 0, st - 4, W, 2)
  trackGlow.px(fill('#9ff0ff', 0.7), 0, st - 2.2, W, 0.4)
  for (let r = 0; r < 6; r++) {
    const y = st + r * 3.4
    stand.px(fill(r % 2 ? '#141a30' : '#18203a'), 0, y, W, 3.4)
    for (let x = 1; x < W; x += 1.5) {
      if (rand() < 0.62) stand.px(`${fill(['#ff6a5a', '#ffd27a', '#9ff0ff', '#ffffff', '#c86bff', '#5dffb0'][Math.floor(rand() * 6)], op1(0.45 + rand() * 0.35))}${rand() < 0.12 ? ` class="tw${1 + Math.floor(rand() * 3)}"` : ''}`, x, y + 0.8, 0.8, 1.2)
    }
  }
  // the barrier with banners, the kerbs, the asphalt and the start line
  track.px(fill('#c8ccd8'), 0, HY, W, 5)
  for (let x = 0; x < W; x += 44) {
    track.px(fill('#16204a'), x + 4, HY + 0.6, 34, 3.8)
    text(track, (x / 44) % 2 ? 'NIGHT RACE' : 'GRAND PRIX', x + 5.5, HY + 1.4, 0.55, fill('#ffffff', 0.92))
  }
  const ty = HY + 5
  track.px(fill('#16181e'), 0, ty, W, H - ty)
  for (let x = 0; x < W; x += 4) {
    track.px(fill(x % 8 ? '#ffffff' : '#e0242b'), x, ty, 4, 1.5)
    track.px(fill(x % 8 ? '#e0242b' : '#ffffff'), x, H - 5, 4, 1.5)
  }
  track.px(fill('#20232a'), 0, ty + 8, W, 3)
  track.px(fill('#0e1014'), 0, H - 3.5, W, 3.5)
  const sx = Math.round(W * (isTall ? 0.2 : 0.22))
  for (let y = ty + 1.5; y < H - 5; y += 1.5) for (let k = 0; k < 2; k++) track.px(fill(((y - ty) / 1.5 + k) % 2 < 1 ? '#ffffff' : '#000000', 0.9), sx + k * 1.5, y, 1.5, 1.5)
  // the start lights on a gantry over the line
  {
    const gy = HY - (isTall ? 10 : 9)
    stand.px(fill('#2a3050'), sx - 10, gy - 3, 0.8, HY - gy + 3)
    stand.px(fill('#2a3050'), sx + 12, gy - 3, 0.8, HY - gy + 3)
    stand.px(fill('#10141f'), sx - 10, gy - 3, 23, 4.5)
    for (let i = 0; i < 5; i++) trackGlow.px(`${fill('#ff2020')} class="g${i}"`, sx - 8 + i * 4.3, gy - 2, 2.2, 2.2)
  }
  // a checkered flag waving at the front
  {
    const fx = isTall ? W - 26 : W - 40
    const fy = ty + 2
    track.px(fill('#8a8a90'), fx, fy - 24, 0.8, 24)
    const flag = new Layer()
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) flag.px(fill((r + c) % 2 ? '#111111' : '#f4f4f4'), fx + 0.8 + c * 1.6, fy - 24 + r * 1.6, 1.6, 1.6)
    track.raw(`<g class="wv" ${rot(fx + 0.8, fy - 24)}>${flag.svg()}</g>`)
  }
  // the cars, fast
  const lanes = [[ty + 3, 'd5', '#e0242b'], [ty + 9, 'd6', '#7a3cff'], [ty + 15, 'd7', '#8ee000']]
  for (const [y, cls, color] of lanes) {
    if (y + 5 > H - 5) continue
    moving(cars, cls, a => {
      const x = isTall ? 60 : 120
      const s = 0.7
      a.raw(`<rect x="${x - 30}" y="${num(y + 2 * s)}" width="30" height="${num(1.4 * s)}" fill="url(#trailR)" opacity="0.6"/>`)
      sprite(a, RACER, x, y, s, { '#': fill(color), w: fill('#f4f4f4'), o: fill('#ffd23f'), '@': fill('#0a0a0c') })
    })
  }
  panel(hud, hudGlow, 8, 8, 62, 'LAP 42/57', [
    [['P1 ', '#ffffff'], ['RED ', '#ff5a5a'], ['LEADER', '#8a9ab8']],
    [['P2 ', '#ffffff'], ['LIME ', '#8ee000'], ['+0.8', '#ffd27a']],
    [['P3 ', '#ffffff'], ['VIOLET ', '#a87aff'], ['+1.2', '#ffd27a']],
    [['FASTEST ', '#8a9ab8'], ['1:31.4', '#c86bff', 'blink']],
  ], '#e0242b')
  const extra = `<linearGradient id="flood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.18"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>`
  return { W, H, defs: extra, body: svgOf(bg, city, cityGlow, stand, track, trackGlow, cars) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(hud, hudGlow) }
}

// ---- AI Lab: server racks, a neural network lighting up, a model training
const ROBOT = ['..#..', '.###.', '#e#e#', '#####', '.###.', '#####', '#.#.#', '@...@']

function rack(L, G, rand, x, top, w, HY) {
  L.px(fill('#0b1322'), x, top, w, HY - top)
  L.px(fill('#1c2a44'), x, top, w, 0.6)
  L.px(fill('#1c2a44'), x, top, 0.6, HY - top)
  L.px(fill('#1c2a44'), x + w - 0.6, top, 0.6, HY - top)
  for (let y = top + 2; y < HY - 3; y += 4) {
    L.px(fill('#101c30'), x + 1.5, y, w - 3, 3)
    for (let k = x + 3; k < x + w - 8; k += 1.5) L.px(fill('#0a1220'), k, y + 1, 0.6, 1.5)
    for (let k = 0; k < 3; k++) {
      const c = ['#3dff8a', '#38e8ff', '#ffb347', '#3dff8a'][Math.floor(rand() * 4)]
      const cls = rand() < 0.5 ? ` class="${['tw1', 'tw2', 'tw3', 'blink', 'cur'][Math.floor(rand() * 5)]}"` : ''
      G.px(`${fill(c, 0.95)}${cls}`, x + w - 6.5 + k * 1.6, y + 1, 0.8, 0.8)
    }
  }
}

function ai(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 2020 : 2021)
  const HY = Math.round(H * (isTall ? 0.84 : 0.8))
  const bg = new Layer()
  const net = new Layer()
  const netGlow = new Layer('filter="url(#glow)"')
  const art = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const front = new Layer()
  const hud = new Layer()
  const hudGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#02050e'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#02050e'], [0.6, '#071a2e'], [1, '#0c2a40']])
  // binary drifting in the dark
  for (let i = 0; i < (isTall ? 40 : 60); i++) {
    const x = Math.floor(rand() * W)
    const y = Math.floor(rand() * HY * 0.9)
    text(bg, rand() < 0.5 ? '0' : '1', x, y, 0.5, `${fill(rand() < 0.7 ? '#38e8ff' : '#3dff8a', op1(0.12 + rand() * 0.2))}${rand() < 0.4 ? ` class="tw${1 + (i % 3)}"` : ''}`)
  }
  // the neural network, top centre
  {
    const sizes = [3, 5, 5, 2]
    const x0 = W * (isTall ? 0.18 : 0.34)
    const x1 = W * (isTall ? 0.82 : 0.66)
    const y0 = H * (isTall ? 0.2 : 0.1)
    const y1 = H * (isTall ? 0.36 : 0.4)
    const nodes = sizes.map((n, l) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * l) / (sizes.length - 1), y0 + ((y1 - y0) * (i + 0.5)) / n]))
    let d = ''
    const hot = []
    for (let l = 0; l < nodes.length - 1; l++) {
      for (const [ax, ay] of nodes[l]) {
        for (const [bx, by] of nodes[l + 1]) {
          d += `M${num(ax)} ${num(ay)}L${num(bx)} ${num(by)}`
          if (rand() < 0.22) hot.push([ax + (bx - ax) * 0.5, ay + (by - ay) * 0.5])
        }
      }
    }
    net.raw(`<path d="${d}" stroke="#38e8ff" stroke-width="0.3" opacity="0.22" fill="none" shape-rendering="geometricPrecision"/>`)
    hot.forEach(([x, y], k) => netGlow.px(`${fill(k % 3 ? '#38e8ff' : '#c86bff', 0.9)} class="tw${1 + (k % 3)}"`, x - 0.4, y - 0.4, 0.8, 0.8))
    nodes.flat().forEach(([x, y], k) => {
      disc(net, x, y, 2, fill('#0e2a40'))
      netGlow.px(`${fill(k % 4 ? '#38e8ff' : '#3dff8a')}${k % 3 === 0 ? ' class="pu"' : ''}`, x - 1, y - 1, 2, 2)
    })
  }
  // racks on both sides
  const racks = isTall ? [[0, 22, 0.44], [W - 22, 22, 0.44]] : [[0, 20, 0.3], [21, 18, 0.4], [W - 39, 18, 0.4], [W - 20, 20, 0.3]]
  for (const [x, w, t] of racks) rack(art, glow, rand, x, Math.round(H * t), w, HY)
  // the floor
  front.px(fill('#040a14'), 0, HY, W, H - HY)
  glow.px(fill('#38e8ff', 0.7), 0, HY, W, 0.4)
  for (const [y, o] of [[HY + 3, 0.25], [HY + 7, 0.2], [HY + 13, 0.15], [HY + 21, 0.12]]) if (y < H) front.px(fill('#38e8ff', o), 0, y, W, 0.3)
  {
    let d = ''
    for (let xb = -W; xb <= W * 2; xb += W / 10) d += `M${num(W / 2 + (xb - W / 2) * 0.2)} ${HY}L${num(xb)} ${H}`
    front.raw(`<path d="${d}" stroke="#38e8ff" stroke-width="0.3" opacity="0.18" fill="none"/>`)
  }
  // a GPU, its fan spinning
  {
    const gx = isTall ? W - 48 : W - 74
    const gy = HY - 3
    front.px(fill('#161e32'), gx, gy - 14, 26, 14)
    front.px(fill('#2a3654'), gx, gy - 14, 26, 0.6)
    for (let k = gx + 2; k < gx + 24; k += 2) front.px(fill('#d8a840'), k, gy, 1, 1.5)
    const fan = new Layer()
    const fx = gx + 7
    const fy = gy - 7
    disc(fan, fx, fy, 5, fill('#0a0f1c'))
    for (let k = 0; k < 4; k++) fan.raw(`<rect x="${fx - 0.5}" y="${fy - 4.5}" width="1" height="4.5" fill="#3a4a6a" transform="rotate(${k * 90} ${fx} ${fy})"/>`)
    front.raw(`<g class="sw" ${rot(fx, fy)}>${fan.svg()}</g>`)
    text(glow, 'GPU', gx + 15, gy - 9, 0.6, fill('#3dff8a'))
    glow.px(`${fill('#3dff8a')} class="blink"`, gx + 15, gy - 4, 1, 1)
  }
  // a little robot rolling by
  moving(front, 'cw', (a, g) => {
    const x = isTall ? 60 : 120
    const y = HY - 9
    sprite(a, ROBOT, x, y, 1.1, { '#': fill('#c8d0e0'), e: fill('#0a1220'), '@': fill('#3a4a6a') })
    g.px(fill('#38e8ff'), x + 1.1, y + 2.2, 1.1, 1.1)
    g.px(fill('#38e8ff'), x + 3.3, y + 2.2, 1.1, 1.1)
    g.px(`${fill('#ff4a5a')} class="blink"`, x + 2.2, y - 1, 1.1, 1)
  })
  // the training run and its loss curve
  panel(hud, hudGlow, isTall ? 6 : 8, 8, 60, 'TRAIN.PY', [
    [['$ ', '#3dff8a'], ['PYTHON TRAIN.PY', '#e8f6ff']],
    [['EPOCH ', '#6a8ab0'], ['42/100', '#38e8ff']],
    [['LOSS ', '#6a8ab0'], ['0.013', '#ffb347']],
    [['ACC ', '#6a8ab0'], ['98.7%', '#3dff8a']],
    [['$ ', '#3dff8a'], ['_', '#e8f6ff', 'cur']],
  ], '#38e8ff')
  {
    const cw = isTall ? 56 : 60
    const ch = 28
    const cx = W - cw - 8
    const cy = isTall ? 8 : 8
    hud.px(fill('#000', 0.6), cx, cy, cw, ch)
    for (const [px, py, pw, ph] of [[cx, cy, cw, 0.5], [cx, cy + ch - 0.5, cw, 0.5], [cx, cy, 0.5, ch], [cx + cw - 0.5, cy, 0.5, ch]]) hudGlow.px(fill('#c86bff', 0.85), px, py, pw, ph)
    text(hud, 'LOSS', cx + 2, cy + 1.7, 0.5, fill('#c86bff'))
    hud.px(fill('#6a8ab0', 0.6), cx + 4, cy + 7, 0.4, ch - 11)
    hud.px(fill('#6a8ab0', 0.6), cx + 4, cy + ch - 4, cw - 8, 0.4)
    for (let x = 0; x < cw - 10; x += 0.5) {
      const v = Math.exp(-x / 9) + (rand() - 0.5) * 0.06
      hudGlow.px(fill('#38e8ff'), cx + 5 + x, cy + 7 + (ch - 12) * (1 - Math.max(0, Math.min(1, v))), 0.5, 0.5)
    }
    hudGlow.px(`${fill('#ffffff')} class="cur"`, cx + cw - 5.5, cy + ch - 6, 1, 1)
  }
  return { W, H, body: svgOf(bg, net, netGlow, art, glow, front) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(hud, hudGlow) }
}

// ---- Rooftop Cats: cats on the roofs under a big moon
const CAT_SIT = ['.#.....#.', '.##...##.', '.#######.', '.#e###e#.', '.###n###.', '..#####..', '..#####..', '.#######.', '.#######.', '.##.#.##.']
const TABBY = ['.#.....#.', '.##...##.', '.##s#s##.', '.#e###e#.', '.###n###.', '..#www#..', '..#www#..', '.s#www#s.', '.#######.', '.##.#.##.']
const CAT_SLEEP = ['.#.#........', '.####.####..', '#-#-########', '############', '.##########.', '..########..']
const CAT_WALK = ['#............', '.#.........#.#', '.#.........####', '.###########e#n', '..##########..', '..##########..', '..#.#....#.#..']
const TAIL = [[0, 0], [1, -1], [2, -2], [2, -3], [2, -4], [1, -5]]

function roof(L, x, w, base, peak, color, tile) {
  for (let r = 0; r < peak; r++) {
    const inset = ((peak - r) / peak) * (w / 2)
    L.px(fill(r % 3 === 0 ? tile : color), x + inset, base - peak + r, w - inset * 2, 1)
  }
}

function cats(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 5555 : 5556)
  const bg = new Layer()
  const far = new Layer()
  const farGlow = new Layer('filter="url(#glow)"')
  const houses = new Layer()
  const lit = new Layer('filter="url(#glow)"')
  const pets = new Layer()
  const petGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#07061a'), 0, 0, W, H)
  band(bg, W, 0, H, [[0, '#07061a'], [0.55, '#171640'], [0.85, '#3a2c68'], [1, '#4a3474']])
  const mx = Math.round(W * (isTall ? 0.72 : 0.8))
  const my = Math.round(H * (isTall ? 0.12 : 0.2))
  const mr = isTall ? 14 : 16
  dots(bg, rand, [0, 0, W, H * 0.55], isTall ? 80 : 120, ['#ffffff', '#fff4c8', '#cfc8ff'], [0.25, 0.75], 0.35, [[mx - mr - 4, my - mr - 4, mr * 2 + 8, mr * 2 + 8]])
  bg.raw(`<circle cx="${mx}" cy="${my}" r="${mr * 3}" fill="url(#moonWarm)"/>`)
  disc(far, mx, my, mr, fill('#fff2c4'))
  for (const [dx, dy, r] of [[-5, -3, 3], [4, 4, 2.5], [5, -6, 1.5], [-3, 7, 2]]) disc(far, mx + dx, my + dy, r, fill('#f0dca0'))
  // the town behind
  const HY = Math.round(H * (isTall ? 0.66 : 0.6))
  for (let x = 0; x < W;) {
    const w = 8 + Math.floor(rand() * 12)
    const top = HY - 6 - Math.floor(rand() * (isTall ? 26 : 22))
    far.px(fill('#141236'), x, top, w, H - top)
    if (rand() < 0.5) roof(far, x - 1, w + 2, top, 4, '#141236', '#1a1840')
    for (let i = 0; i < Math.floor(w / 4); i++) if (rand() < 0.6) farGlow.px(fill('#ffd27a', op1(0.35 + rand() * 0.4)), x + 2 + Math.floor(rand() * (w - 4)), top + 3 + Math.floor(rand() * 10), 1.5, 1.5)
    x += w + 1
  }
  // two houses in front, roofs meeting the sky
  const s = isTall ? 1.4 : 1.8
  const houseL = isTall ? [-6, 74, Math.round(H * 0.8), 22] : [-8, 112, Math.round(H * 0.78), 26]
  const houseR = isTall ? [W - 72, 80, Math.round(H * 0.84), 22] : [W - 112, 120, Math.round(H * 0.8), 28]
  for (const [x, w, base, peak] of [houseL, houseR]) {
    houses.px(fill('#1e1836'), x + 4, base, w - 8, H - base)
    roof(houses, x, w, base, peak, '#2a1e3a', '#3a2a4e')
    houses.px(fill('#3a2a4e'), x + w / 2 - 1, base - peak - 1, 2, 1)
    for (let k = 0; k < 2; k++) {
      const wx = x + 14 + k * (w - 40)
      lit.px(fill('#ffcf6a', 0.85), wx, base + 5, 10, 8)
      houses.px(fill('#1e1836'), wx + 4.6, base + 5, 0.8, 8)
      houses.px(fill('#1e1836'), wx, base + 8.6, 10, 0.8)
    }
  }
  // chimney on the right house, for the tabby
  const chx = houseR[0] + houseR[1] * 0.68
  const chTop = houseR[2] - houseR[3] * 0.7 - 10
  houses.px(fill('#4a2a2e'), chx, chTop, 9, 16)
  houses.px(fill('#5a3238'), chx - 1, chTop, 11, 2)
  // a silhouette cat in a lit window
  sprite(houses, CAT_SIT, houseL[0] + 15, houseL[2] + 6, 0.7, { '#': fill('#1e1836') })
  // the black cat on the left roof ridge, eyes blinking, tail swaying
  {
    const x = houseL[0] + houseL[1] / 2 - 4.5 * s
    const y = houseL[2] - houseL[3] - 10 * s
    sprite(pets, CAT_SIT, x, y, s, { '#': fill('#0c0a14'), e: fill('#0c0a14'), n: fill('#ff8fb0') }, { outline: fill('#5a4a8a', 0.6) })
    for (const ex of [2, 6]) petGlow.px(`${fill('#7dff6a')} class="ey"`, x + ex * s, y + 3 * s, s, s)
    const tail = new Layer()
    for (const [tx, ty] of TAIL) tail.px(fill('#0c0a14'), x + (8 + tx) * s, y + (9 + ty) * s, s, s)
    pets.raw(`<g class="wg" ${rot(x + 8 * s, y + 10 * s)}>${tail.svg()}</g>`)
    // a speech bubble now and then
    const bx = x + 10 * s
    const by = y - 8
    pets.raw(`<g class="tw3"><rect x="${num(bx)}" y="${num(by)}" width="19" height="6" fill="#f4efff" opacity="0.92"/><rect x="${num(bx + 1)}" y="${num(by + 6)}" width="2" height="1.5" fill="#f4efff" opacity="0.92"/></g>`)
    text(pets, 'MEOW', bx + 1.8, by + 1.6, 0.6, `${fill('#2a1e3a')} class="tw3"`)
  }
  // the tabby on the chimney
  {
    const x = chx + 4.5 - 4.5 * s
    const y = chTop - 10 * s
    sprite(pets, TABBY, x, y, s, { '#': fill('#ff9a3c'), s: fill('#c8641e'), w: fill('#fff0d8'), e: fill('#2a1a0a'), n: fill('#ff6f8f') })
    const tail = new Layer()
    for (const [tx, ty] of TAIL) tail.px(fill(ty % 2 ? '#c8641e' : '#ff9a3c'), x + (8 + tx) * s, y + (9 + ty) * s, s, s)
    pets.raw(`<g class="wg" style="transform-origin:${num(x + 8 * s)}px ${num(y + 10 * s)}px;animation-delay:-.5s">${tail.svg()}</g>`)
  }
  // a white cat asleep on the left roof, dreaming
  {
    const x = houseL[0] + houseL[1] * 0.74
    const y = houseL[2] - houseL[3] * 0.42 - 6 * s
    sprite(pets, CAT_SLEEP, x, y, s * 0.9, { '#': fill('#f4efff'), '-': fill('#5a4a8a') }, { outline: fill('#8a7ac0', 0.5) })
    for (const k of [1, 2, 3]) text(petGlow, 'Z', x + 9 * s + k * 2, y - 2 - k * 2, 0.5 + k * 0.12, `${fill('#cfc8ff', 0.9)} class="up${k}"`)
  }
  // a grey cat walking along the garden wall, past a ball of yarn
  {
    const wy = H - (isTall ? 10 : 8)
    houses.px(fill('#2a2448'), 0, wy, W, H - wy)
    houses.px(fill('#3a3460'), 0, wy, W, 0.8)
    for (let x = 0; x < W; x += 8) houses.px(fill('#221e3e'), x, wy + 2, 0.5, H - wy)
    moving(pets, 'cw', a => sprite(a, CAT_WALK, isTall ? 60 : 120, wy - 7 * s, s, { '#': fill('#8a8aa0'), e: fill('#ffd23f'), n: fill('#ff8fb0') }))
    disc(pets, isTall ? W - 30 : W - 50, wy - 2.5, 2.5, fill('#e84a6a'))
    pets.px(fill('#ff8fa8'), isTall ? W - 31 : W - 51, wy - 4, 2, 0.6)
    pets.px(fill('#e84a6a'), isTall ? W - 27.5 : W - 47.5, wy - 0.6, 6, 0.5)
  }
  const extra = radial('moonWarm', '#fff2c4', 0.28)
  return { W, H, defs: extra, body: svgOf(bg, far, farGlow, houses, lit) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(pets, petGlow) }
}

// ---- Dog Park: a sunny park, dogs chasing balls and frisbees
const DOG_RUN = ['...........rr.', '..........####', '#.........##e#n', '.#........####.', '.##########....', '.##########....', '..#######......']
const DOG_SIT = ['..rr......', '.####.....', 'n#e##.....', '.####.....', '..###.....', '..#####...', '..######..', '..#######.', '..##.####.', '..##.##.##']
const SPOTTY = ['..kk......', '.####.....', 'n#e##.....', '.####.....', '..#k#.....', '..###k#...', '..#k####..', '..####k##.', '..##.####.', '..##.##.##']

function runningDog(L, x, y, s, body, ear, legs = true) {
  sprite(L, DOG_RUN, x, y, s, { '#': fill(body), r: fill(ear), e: fill('#1a1008'), n: fill('#1a1008') })
  const leg = (cls, pts) => {
    const g = new Layer()
    for (const [lx, ly] of pts) g.px(fill(body), x + lx * s, y + ly * s, s, s)
    L.raw(cls ? `<g class="${cls}">${g.svg()}</g>` : g.svg())
  }
  if (legs) {
    leg('ra', [[2, 7], [1, 8], [9, 7], [10, 8]])
    leg('rb', [[3, 7], [4, 8], [8, 7], [7, 8]])
  } else leg('', [[1, 7], [0, 8], [10, 7], [11, 8]])
}

function dogs(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 1212 : 1213)
  const HY = Math.round(H * (isTall ? 0.64 : 0.56))
  const bg = new Layer()
  const sky = new Layer()
  const hills = new Layer()
  const trees = new Layer()
  const grass = new Layer()
  const props = new Layer()
  const pets = new Layer()
  bg.px(fill('#4f9fef'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#4f9fef'], [0.65, '#9fd2ff'], [1, '#d6efff']])
  const sx = Math.round(W * (isTall ? 0.2 : 0.14))
  const sy = Math.round(H * (isTall ? 0.08 : 0.16))
  bg.raw(`<circle cx="${sx}" cy="${sy}" r="30" fill="url(#sunPark)"/>`)
  disc(sky, sx, sy, 9, fill('#fff4b0'))
  disc(sky, sx, sy, 6, fill('#fffde8'))
  moving(sky, 'dt', a => {
    for (const [cx, cy, cw] of isTall ? [[60, 30, 34], [110, 70, 40], [20, 110, 30]] : [[70, 20, 40], [150, 36, 48], [230, 18, 36], [270, 54, 40]]) cloud(a, cx, cy, cw)
  })
  // a frisbee sailing across
  moving(sky, 'fy', a => {
    const x = isTall ? 120 : 200
    const y = Math.round(H * (isTall ? 0.36 : 0.3))
    a.px(fill('#ff4fd8'), x, y, 6, 1.2)
    a.px(fill('#ff9ae8'), x + 1, y - 0.6, 4, 0.6)
  })
  // hills and a row of trees
  for (const [color, lift, amp, f] of [['#86c86a', 14, 6, 0.03], ['#6ab858', 6, 4, 0.05]]) {
    const ph = rand() * 6
    for (let x = 0; x < W; x += 2) {
      const y = Math.round(HY - lift - amp * Math.sin(x * f + ph))
      hills.px(fill(color), x, y, 2, HY - y + 1)
    }
  }
  for (let x = 4; x < W; x += 14 + Math.floor(rand() * 10)) {
    const r = 5 + Math.floor(rand() * 4)
    trees.px(fill('#6b4a2b'), x - 0.5, HY - 6, 1.5, 6)
    disc(trees, x, HY - 6 - r, r, fill('#3f9a4a'))
    disc(trees, x - 1, HY - 7 - r, r - 2, fill('#5cc05a'))
  }
  // the grass, a path, flowers
  band(grass, W, HY, H, [[0, '#6ad050'], [1, '#3f9a36']])
  {
    const py = Math.round(H * (isTall ? 0.82 : 0.8))
    for (let x = 0; x < W; x += 2) {
      const y = Math.round(py + 3 * Math.sin(x * 0.03))
      grass.px(fill('#e8d29a'), x, y, 2, 8)
      grass.px(fill('#cdb478'), x, y, 2, 0.8)
    }
  }
  for (let i = 0; i < (isTall ? 50 : 80); i++) {
    const x = Math.floor(rand() * W)
    const y = HY + 2 + Math.floor(rand() * (H - HY - 3))
    if (rand() < 0.25) grass.px(fill(['#ff5a7a', '#ffd23f', '#ffffff', '#c86bff'][Math.floor(rand() * 4)]), x, y, 1, 1)
    else grass.px(fill('#8ee86a', 0.8), x, y, 0.5, 1.5)
  }
  // a big shade tree on the right, a dog asleep beneath it
  {
    const tx = Math.round(W * (isTall ? 0.84 : 0.88))
    const ty = HY + (isTall ? 26 : 22)
    props.raw(`<ellipse cx="${tx}" cy="${ty + 1}" rx="24" ry="4" fill="#000" opacity="0.15"/>`)
    props.px(fill('#6b4a2b'), tx - 2, ty - 26, 4, 26)
    props.px(fill('#8f6539'), tx - 2, ty - 26, 1, 26)
    for (const [dx, dy, r] of [[-12, -30, 10], [10, -32, 10], [0, -40, 12], [-4, -26, 8]]) disc(props, tx + dx, ty + dy, r, fill('#2f8a40'))
    for (const [dx, dy, r] of [[-12, -33, 6], [8, -35, 6], [-1, -44, 7]]) disc(props, tx + dx, ty + dy, r, fill('#4cb050'))
    const sleeper = new Layer()
    sprite(sleeper, CAT_SLEEP, tx - 22, ty - 6, 1, { '#': fill('#c88a4a'), '-': fill('#5a3a1a') })
    props.raw(sleeper.svg())
    for (const k of [1, 2, 3]) text(props, 'Z', tx - 12 + k * 2, ty - 10 - k * 2, 0.5 + k * 0.12, `${fill('#ffffff', 0.9)} class="up${k}"`)
  }
  // a bench, a lamp, a hydrant and the park sign
  {
    const bx = isTall ? 8 : 20
    const by = HY + (isTall ? 20 : 16)
    props.px(fill('#8f6539'), bx, by - 6, 22, 1.5)
    props.px(fill('#8f6539'), bx, by - 3.5, 22, 1.5)
    props.px(fill('#3a3a40'), bx + 2, by - 2, 1, 3)
    props.px(fill('#3a3a40'), bx + 19, by - 2, 1, 3)
    const hx = isTall ? W - 70 : W - 100
    const hy = HY + (isTall ? 30 : 26)
    props.px(fill('#e0242b'), hx, hy - 6, 3, 6)
    props.px(fill('#e0242b'), hx - 1, hy - 4, 5, 1.2)
    props.px(fill('#ff6a5a'), hx, hy - 7, 3, 1)
    const gx = isTall ? W - 40 : W - 140
    const gy = HY + 4
    props.px(fill('#6b4a2b'), gx + 4, gy - 10, 1, 10)
    props.px(fill('#6b4a2b'), gx + 20, gy - 10, 1, 10)
    props.px(fill('#8f6539'), gx, gy - 16, 25, 8)
    props.px(fill('#b07c46'), gx, gy - 16, 25, 0.6)
    text(props, 'DOG PARK', gx + 1.5, gy - 14.6, 0.55, fill('#fff0c8'))
    text(props, 'GOOD BOYS', gx + 3, gy - 11.2, 0.45, fill('#fff0c8', 0.85))
  }
  // the dogs
  const s = isTall ? 1.4 : 1.7
  {
    // chasing a ball across the park
    const y = Math.round(H * (isTall ? 0.86 : 0.84)) - 9 * s
    moving(pets, 'cw2', a => {
      const x = isTall ? 40 : 80
      runningDog(a, x, y, s, '#a8642e', '#6a3a1a')
      const ball = new Layer()
      disc(ball, x + 22 * s, y + 6 * s, 1.6 * s, fill('#e0242b'))
      ball.px(fill('#ff8a7a'), x + 21.5 * s, y + 5 * s, 0.8 * s, 0.8 * s)
      a.raw(`<g class="hop">${ball.svg()}</g>`)
    })
  }
  {
    // jumping for a frisbee
    const x = Math.round(W * (isTall ? 0.36 : 0.3))
    const y = HY + (isTall ? 16 : 12)
    const jumper = new Layer()
    runningDog(jumper, x, y - 9 * s, s, '#f0c060', '#c89038', false)
    jumper.px(fill('#38c8ff'), x + 13 * s, y - 8.5 * s, 4 * s, 1 * s)
    pets.raw(`<g class="jp">${jumper.svg()}</g>`)
    pets.raw(`<ellipse cx="${num(x + 7 * s)}" cy="${num(y + 0.5)}" rx="${num(6 * s)}" ry="1" fill="#000" opacity="0.15"/>`)
  }
  {
    // a spotty dog sitting by the bench, wagging
    const x = isTall ? 34 : 48
    const y = HY + (isTall ? 20 : 16) - 10 * s
    sprite(pets, SPOTTY, x, y, s, { '#': fill('#f4f4f4'), k: fill('#1a1a1a'), e: fill('#1a1a1a'), n: fill('#1a1a1a') }, { outline: fill('#5a5a5a', 0.35) })
    const tail = new Layer()
    for (const [tx, ty] of [[0, 0], [1, -1], [1, -2], [2, -3]]) tail.px(fill('#f4f4f4'), x + (9 + tx) * s, y + (8 + ty) * s, s, s)
    pets.raw(`<g class="wg" ${rot(x + 9 * s, y + 9 * s)}>${tail.svg()}</g>`)
  }
  const extra = radial('sunPark', '#fff6b0', 0.6) + calmOf('calmPark', '#0a2a20', 0.42, 0.25)
  return { W, H, defs: extra, scan: false, body: svgOf(bg, sky, hills, trees, grass, props, pets) + `<rect width="${W}" height="${H}" fill="url(#calmPark)"/>` }
}

// ---------------------------------------------------------------- music and grid scenes
// Eight more: a glowing grid world, a robot disco, a bedroom loop studio, a dark
// arena stage, a metal stage in a storm, a stadium at sunset, a DJ booth and a
// festival main stage. Moods only: no band's or film's names, logos or faces.

// A crowd along y: heads and shoulders, hands up bouncing, a few glowsticks.
function crowd(L, rand, W, y, H, body, sticks = []) {
  const up = [new Layer(), new Layer()]
  for (let x = -1; x < W; x += 2.4 * (0.8 + rand() * 0.5)) {
    const lift = Math.round(rand() * 2) / 2
    L.px(fill(body), x, y - lift + 1.2, 2.2, H - y + lift)
    L.px(fill(body), x + 0.4, y - lift - 0.4, 1.4, 1.6)
    if (rand() < 0.38) {
      const g = up[rand() < 0.5 ? 0 : 1]
      g.px(fill(body), x - 0.4, y - lift - 3.6, 0.6, 3.8)
      g.px(fill(body), x + 2, y - lift - 3.3, 0.6, 3.5)
      if (sticks.length && rand() < 0.35) g.px(fill(sticks[Math.floor(rand() * sticks.length)]), x - 0.5, y - lift - 5, 0.8, 1.6)
    }
  }
  L.raw(`<g class="hb1">${up[0].svg()}</g><g class="hb2">${up[1].svg()}</g>`)
}

// A fan of laser beams from (x, y), sweeping.
function lasers(L, x, y, color, n, len, spread, cls, base = -Math.PI / 2) {
  let beams = ''
  for (let k = 0; k < n; k++) {
    const a = base + (k - (n - 1) / 2) * spread
    const ex = x + Math.cos(a) * len
    const ey = y + Math.sin(a) * len
    beams += `<polygon points="${num(x)},${num(y)} ${num(ex - 0.7)},${num(ey - 0.7)} ${num(ex + 0.7)},${num(ey + 0.7)}" fill="${color}" opacity="0.5"/>`
  }
  L.raw(`<g class="${cls}" ${rot(x, y)} shape-rendering="geometricPrecision">${beams}</g>`)
}

// Equalizer bars that bounce.
function eqBars(L, x, y, n, w, gap, h, colors) {
  let out = ''
  for (let k = 0; k < n; k++) {
    const bh = h * (0.5 + ((k * 7) % 5) / 10)
    out += `<rect class="eq${1 + (k % 4)}" x="${num(x + k * (w + gap))}" y="${num(y - bh)}" width="${num(w)}" height="${num(bh)}" fill="${colors[k % colors.length]}"/>`
  }
  L.raw(out)
}

function flame(L, x, y, h, cls) {
  const f = new Layer()
  for (let r = 0; r < h; r++) {
    const t = r / h
    const w = 0.8 + 3.4 * Math.pow(t, 0.7)
    f.px(fill(t < 0.35 ? '#ff4a1a' : t < 0.7 ? '#ffb020' : '#fff3b0', t < 0.35 ? 0.75 : 0.95), x - w / 2, y - h + r, w, 1)
  }
  L.raw(`<g class="${cls}">${f.svg()}</g>`)
}

function cabinet(L, x, y, w, h) {
  L.px(fill('#0c0c10'), x, y, w, h)
  L.px(fill('#2a2a32'), x, y, w, 0.6)
  for (let gy = y + 1.6; gy < y + h - 0.8; gy += 1.2) L.px(fill('#18181e'), x + 1, gy, w - 2, 0.5)
  L.px(fill('#b8b8c4', 0.8), x + w / 2 - 2, y + 0.9, 4, 0.8)
}

// ---- Light Grid: a glowing grid world, light-bikes racing
const BIKE = ['....####......', '..########....', '.###########..', '@@@#######@@@.', '@.@.......@.@.', '@@@.......@@@.']

function lightGrid(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 3301 : 3302)
  const HY = Math.round(H * (isTall ? 0.58 : 0.5))
  const bg = new Layer()
  const far = new Layer()
  const floor = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const bikes = new Layer()
  const hud = new Layer()
  const hudGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#000308'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#000308'], [0.7, '#001428'], [1, '#00334a']])
  dots(bg, rand, [0, 0, W, HY * 0.7], isTall ? 40 : 60, ['#9ff0ff', '#ffffff'], [0.2, 0.5], 0.3)
  bg.raw(`<ellipse cx="${W / 2}" cy="${HY}" rx="${W * 0.6}" ry="22" fill="url(#hz)"/>`)
  // digital mountains, outlined
  for (const [lift, amp, op] of [[10, 18, 0.45], [2, 10, 0.75]]) {
    let d = `M0 ${HY}`
    let h = amp / 2
    for (let x = 0; x <= W; x += 6) {
      h = Math.max(1, Math.min(amp, h + (rand() - 0.5) * amp * 0.7))
      const mid = Math.abs(x - W / 2) < W * 0.18
      d += `L${x} ${num(HY - lift - (mid ? h * 0.25 : h))}`
    }
    far.raw(`<path d="${d}L${W} ${HY}Z" fill="#000a14" stroke="#00e5ff" stroke-opacity="${op}" stroke-width="0.4"/>`)
  }
  glow.px(fill('#00e5ff'), 0, HY, W, 0.6)
  // the floor grid, in perspective
  floor.px(fill('#00060c'), 0, HY + 0.6, W, H - HY)
  let d = ''
  for (let k = 1; k <= 14; k++) {
    const y = HY + (H - HY) * Math.pow(k / 14, 2)
    d += `M0 ${num(y)}H${W}`
  }
  const vy = HY - 30
  for (let xb = -W * 1.5; xb <= W * 2.5; xb += W / 12) d += `M${num(W / 2 + ((xb - W / 2) * (HY - vy)) / (H - vy))} ${HY}L${num(xb)} ${H}`
  floor.raw(`<path d="${d}" stroke="#00e5ff" stroke-width="0.35" opacity="0.4" fill="none"/>`)
  // light-bikes with their trails
  const lanes = [[HY + (H - HY) * 0.28, 'd6', '#ff9a1a', 'trO', 0.6], [HY + (H - HY) * 0.6, 'd5', '#00e5ff', 'trC', 0.9]]
  for (const [y, cls, color, tr, s] of lanes) {
    moving(bikes, cls, a => {
      const x = isTall ? 60 : 120
      a.raw(`<rect x="${x - 70}" y="${num(y + 1.5 * s)}" width="70" height="${num(2 * s)}" fill="url(#${tr})"/>`)
      sprite(a, BIKE, x, y, s, { '#': fill('#0a1420'), '@': fill(color) }, { outline: fill(color, 0.95) })
    })
  }
  panel(hud, hudGlow, 8, 8, 56, 'GRID.SYS', [
    [['USER ', '#5a8aa8'], ['YOU', '#9ff0ff']],
    [['PROGRAM ', '#5a8aa8'], ['CLAUDE', '#ff9a1a']],
    [['STATUS ', '#5a8aa8'], ['ONLINE', '#3dff8a', 'blink']],
  ], '#00e5ff')
  const trail = (id, c) => `<linearGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset="1" stop-color="${c}" stop-opacity="0.9"/></linearGradient>`
  const extra = radial('hz', '#00e5ff', 0.35) + trail('trC', '#00e5ff') + trail('trO', '#ff9a1a')
  return { W, H, defs: extra, body: svgOf(bg, far, floor, glow, bikes) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(hud, hudGlow) }
}

// ---- Robot Disco: a robot DJ, an LED pyramid, a disco ball
const ROBOT_DJ = ['....##....', '...####...', '..######..', '..#vvvv#..', '..######..', '...####...', '.########.', '##########', '##.####.##']

function robotDisco(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 4401 : 4402)
  const HY = Math.round(H * (isTall ? 0.76 : 0.72))
  const bg = new Layer()
  const stage = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const front = new Layer('opacity="0.3"')
  bg.px(fill('#06020e'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#06020e'], [0.7, '#1a0830'], [1, '#2a0c3a']])
  // the LED pyramid
  const cx = W / 2
  const cell = 3.2
  const rows = isTall ? 14 : 16
  const palette = ['#ff3fa8', '#ffd23f', '#38e8ff', '#9b4dff']
  for (let r = 0; r < rows; r++) {
    const n = r * 2 + 1
    for (let c = 0; c < n; c++) {
      const x = cx - (n * cell) / 2 + c * cell
      const y = HY - 12 - (rows - r) * cell
      stage.px(`${fill(palette[(r + c) % 4], 0.8)} class="${['tw1', 'tw2', 'tw3', 'pu'][(r * 3 + c) % 4]}"`, x + 0.3, y + 0.3, cell - 0.6, cell - 0.6)
    }
  }
  // the disco ball and its rays
  const by = Math.round(H * (isTall ? 0.14 : 0.1))
  stage.px(fill('#5a5a6a'), cx - 0.2, 0, 0.4, by - 7)
  disc(stage, cx, by, 7, fill('#8a8aa0'))
  for (let y = by - 7; y < by + 7; y += 1.6) for (let x = cx - 7; x < cx + 7; x += 1.6) {
    if ((x - cx) ** 2 + (y - by) ** 2 < 42) stage.px(fill(((x + y) * 10) % 3 < 1.2 ? '#f4f4ff' : '#b8b8cc', 0.9), x, y, 1.2, 1.2)
  }
  for (let k = 0; k < 14; k++) glow.px(`${fill(palette[k % 4])} class="tw${1 + (k % 3)}"`, cx + (rand() - 0.5) * W * 0.9, by + rand() * H * 0.4, 0.8, 0.8)
  lasers(bg, cx, by, '#ffffff', 4, W * 0.6, 0.5, 'ls1', Math.PI / 2)
  // the decks and the robot DJ
  const s = isTall ? 1.4 : 1.6
  sprite(stage, ROBOT_DJ, cx - 5 * s, HY - 12 - 9 * s, s, { '#': fill('#c8ccd6'), v: fill('#1a1020') }, { outline: fill('#ffd23f', 0.5) })
  glow.px(`${fill('#ff3fa8')} class="fl"`, cx - 2 * s, HY - 12 - 6 * s, 4 * s, s)
  stage.px(fill('#1a1030'), cx - 22, HY - 12, 44, 6)
  glow.px(fill('#ff3fa8', 0.9), cx - 22, HY - 12, 44, 0.5)
  for (const dx of [-13, 13]) {
    const t = new Layer()
    disc(t, cx + dx, HY - 9, 3.5, fill('#0a0a12'))
    t.px(fill('#f4f4ff'), cx + dx - 0.3, HY - 12.5, 0.6, 2.5)
    stage.raw(`<g class="sp" ${rot(cx + dx, HY - 9)}>${t.svg()}</g>`)
  }
  // speakers, and a dance floor that lights up
  for (const x of [isTall ? 4 : 12, isTall ? W - 22 : W - 34]) {
    stage.px(fill('#0e0a18'), x, HY - 30, isTall ? 18 : 22, 30)
    disc(stage, x + (isTall ? 9 : 11), HY - 20, isTall ? 6 : 7, fill('#2a2038'))
    disc(stage, x + (isTall ? 9 : 11), HY - 20, 2.5, fill('#4a3a60'))
    disc(stage, x + (isTall ? 9 : 11), HY - 6, 3, fill('#2a2038'))
  }
  const tw = 10
  for (let y = HY; y < H; y += 5) for (let x = 0; x < W; x += tw) {
    front.px(`${fill(palette[Math.floor(rand() * 4)])} class="${['tw1', 'tw2', 'tw3'][Math.floor(rand() * 3)]}"`, x + 0.5, y + 0.5, tw - 1, 4)
  }
  return { W, H, body: svgOf(bg, stage, glow, front) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` }
}

// ---- Loop Room: a late-night bedroom studio, pads lighting up
function loopRoom(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 5501 : 5502)
  const HY = Math.round(H * (isTall ? 0.8 : 0.8))
  const bg = new Layer()
  const room = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const desk = new Layer()
  const deskGlow = new Layer('filter="url(#glow)"')
  bg.px(fill('#120c1a'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#0c0812'], [1, '#1e1430']])
  // the window, a city asleep outside
  const wx = isTall ? 10 : 14
  const wy = isTall ? 40 : 14
  const ww = isTall ? 60 : 70
  const wh = isTall ? 50 : 46
  room.px(fill('#0a1230'), wx, wy, ww, wh)
  for (let x = wx; x < wx + ww;) {
    const w = 5 + Math.floor(rand() * 7)
    const t = wy + wh - 6 - Math.floor(rand() * 20)
    room.px(fill('#060a1e'), x, t, Math.min(w, wx + ww - x), wy + wh - t)
    for (let i = 0; i < 3; i++) if (rand() < 0.7) glow.px(fill('#ffd27a', 0.6), x + 1 + Math.floor(rand() * Math.max(1, w - 2)), t + 2 + Math.floor(rand() * 8), 0.8, 0.8)
    x += w + 1
  }
  disc(room, wx + ww - 12, wy + 10, 4, fill('#f4ecd0'))
  for (const [x, y, w, h] of [[wx - 1, wy - 1, ww + 2, 1.5], [wx - 1, wy + wh, ww + 2, 1.5], [wx - 1, wy, 1.5, wh], [wx + ww - 0.5, wy, 1.5, wh], [wx + ww / 2 - 0.5, wy, 1, wh]]) room.px(fill('#3a2a4a'), x, y, w, h)
  // words thrown on the wall
  const words = [['ONE MORE', 1.6], ['LOOP', 2.6]]
  let ty = isTall ? 104 : 24
  for (const [word, sc] of words) {
    const tx = isTall ? (W - textWidth(word, sc * 0.75, FONT5)) / 2 : W - 20 - textWidth(word, sc, FONT5)
    const scale = isTall ? sc * 0.75 : sc
    text(room, word, tx + 0.8, ty + 0.6, scale, fill('#ff3fa8', 0.4), FONT5)
    text(glow, word, tx, ty, scale, `${fill('#f4efff')} class="fl"`, FONT5)
    ty += 6 * scale + 3
  }
  // a warm lamp
  bg.raw(`<circle cx="${num(W * 0.12)}" cy="${HY - 10}" r="40" fill="url(#lamp)"/>`)
  desk.px(fill('#4a3a2a'), W * 0.12 - 0.5, HY - 22, 1, 22)
  desk.px(fill('#e8b050'), W * 0.12 - 4, HY - 26, 8, 4)
  // the desk and its gear
  desk.px(fill('#2a1e30'), 0, HY, W, 3)
  desk.px(fill('#3a2a40'), 0, HY, W, 0.6)
  desk.px(fill('#0c0810'), 0, HY + 3, W, H - HY - 3)
  const mid = W / 2
  // laptop with a waveform
  const lx = isTall ? mid - 34 : mid - 50
  desk.px(fill('#2a2a34'), lx, HY - 18, 30, 17)
  desk.px(fill('#0a0a14'), lx + 1.5, HY - 16.5, 27, 14)
  for (let x = 0; x < 25; x += 0.8) {
    const a = Math.abs(Math.sin(x * 0.7) * Math.sin(x * 0.13)) * 5 + 0.4
    deskGlow.px(fill(x < 14 ? '#ff3fa8' : '#38e8ff', 0.85), lx + 2.5 + x, HY - 9.5 - a, 0.5, a * 2)
  }
  deskGlow.px(`${fill('#ffffff')} class="blink"`, lx + 16.5, HY - 16, 0.5, 13)
  desk.px(fill('#3a3a44'), lx - 2, HY - 1.2, 34, 1.2)
  // the pad sampler
  const px0 = isTall ? mid + 2 : mid - 10
  desk.px(fill('#1a1a22'), px0, HY - 4, 26, 4)
  desk.px(fill('#2a2a34'), px0, HY - 4, 26, 0.5)
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
    deskGlow.px(`${fill(['#ff3fa8', '#38e8ff', '#ffd23f', '#3dff8a'][(r + c) % 4], 0.95)} class="g${(c + r * 2) % 5}"`, px0 + 1.2 + c * 4, HY - 3.4 + r * 1.6, 3, 1.2)
  }
  // speakers, the phone filming, headphones
  for (const x of [isTall ? 2 : mid - 74, isTall ? W - 16 : mid + 60]) {
    desk.px(fill('#16121e'), x, HY - 20, 14, 20)
    disc(desk, x + 7, HY - 7, 4.5, fill('#2a2236'))
    disc(desk, x + 7, HY - 7, 1.8, fill('#4a3a5a'))
    disc(desk, x + 7, HY - 15, 2, fill('#2a2236'))
  }
  if (!isTall) {
    const fx = mid + 30
    desk.px(fill('#3a3a44'), fx + 3, HY - 10, 0.6, 10)
    desk.px(fill('#0a0a10'), fx, HY - 20, 6.5, 10)
    deskGlow.px(`${fill('#ff3b3b')} class="blink"`, fx + 1, HY - 19, 1, 1)
    desk.raw(`<path d="M${mid + 44} ${HY}a5 5 0 0 1 10 0" fill="none" stroke="#5a4a6a" stroke-width="1.2"/>`)
  }
  const extra = radial('lamp', '#ffc46b', 0.28)
  return { W, H, defs: extra, body: svgOf(bg, room, glow) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(desk, deskGlow) }
}

// ---- Static Stage: a dark arena, a glitching screen, risers
function staticStage(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 6601 : 6602)
  const HY = Math.round(H * (isTall ? 0.74 : 0.7))
  const bg = new Layer()
  const screen = new Layer()
  const stage = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const front = new Layer()
  bg.px(fill('#050506'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#050506'], [0.7, '#120a0c'], [1, '#2a0e12']])
  // the big screen, full of static
  const sw = isTall ? 120 : 150
  const sh = isTall ? 60 : 64
  const sx = (W - sw) / 2
  const sy = Math.round(H * (isTall ? 0.24 : 0.08))
  screen.px(fill('#0e0e12'), sx, sy, sw, sh)
  for (let i = 0; i < (isTall ? 500 : 700); i++) {
    const g = Math.floor(rand() * 4)
    screen.px(fill(['#3a3a40', '#6a6a74', '#a0a0aa', '#ff2a3a'][g], op1(0.2 + rand() * 0.4)), sx + Math.floor(rand() * sw * 2) / 2, sy + Math.floor(rand() * sh * 2) / 2, 0.5 + Math.floor(rand() * 3) * 0.5, 0.5)
  }
  for (let k = 0; k < 5; k++) {
    const y = sy + 4 + rand() * (sh - 8)
    screen.px(`${fill(k % 2 ? '#ff2a3a' : '#e8e8f0', 0.7)} class="gl"`, sx + rand() * 20, y, sw * (0.4 + rand() * 0.5), 1 + rand() * 2)
  }
  const word = 'STATIC'
  text(screen, word, W / 2 - textWidth(word, 2) / 2 + 1, sy + sh / 2 - 4, 2, fill('#ff2a3a', 0.5))
  text(glow, word, W / 2 - textWidth(word, 2) / 2, sy + sh / 2 - 5, 2, `${fill('#e8e8f0', 0.9)} class="fl"`)
  // spotlights from above
  for (const [fx, cls] of [[0.2, 'sl'], [0.8, 'sl'], [0.5, 'ls2']]) {
    const x = W * fx
    bg.raw(`<g class="${cls}" ${rot(x, 0)}><polygon points="${x - 1},0 ${x + 1},0 ${x + 16},${HY} ${x - 16},${HY}" fill="url(#spot)"/></g>`)
  }
  // the stage: risers, a drum kit, decks, mic stands, amps
  stage.px(fill('#0e0e12'), 0, HY - 2, W, H - HY + 2)
  glow.px(fill('#ff2a3a'), 0, HY - 2, W, 0.6)
  const cx = W / 2
  stage.px(fill('#16161c'), cx - 20, HY - 10, 40, 8)
  stage.px(fill('#26262e'), cx - 20, HY - 10, 40, 0.6)
  disc(stage, cx, HY - 15, 5, fill('#2a2a34'))
  disc(stage, cx, HY - 15, 3.5, fill('#e8e8f0', 0.6))
  for (const [dx, dy, r] of [[-8, -18, 2.5], [8, -18, 2.5], [-13, -14, 3]]) disc(stage, cx + dx, HY + dy, r, fill('#2a2a34'))
  for (const dx of [-16, 14]) stage.px(fill('#c8a040', 0.8), cx + dx, HY - 24, 6, 0.6)
  const dx0 = isTall ? 8 : cx - 70
  stage.px(fill('#16161c'), dx0, HY - 10, 28, 8)
  stage.px(fill('#0a0a0e'), dx0 + 2, HY - 14, 24, 4)
  for (const dx of [8, 20]) disc(stage, dx0 + dx, HY - 13, 2.5, fill('#2a2a34'))
  glow.px(`${fill('#ff2a3a')} class="blink"`, dx0 + 13.5, HY - 13.5, 1, 1)
  for (const x of isTall ? [W * 0.35, W * 0.65] : [W * 0.3, W * 0.62, W * 0.72]) {
    stage.px(fill('#3a3a44'), x, HY - 20, 0.6, 18)
    stage.px(fill('#3a3a44'), x - 0.8, HY - 21, 2.2, 1.2)
  }
  for (const x of [isTall ? W - 26 : W - 40, isTall ? W - 26 : W - 58]) { cabinet(stage, x, HY - 14, 16, 12); cabinet(stage, x, HY - 26, 16, 12) }
  crowd(front, rand, W, H - (isTall ? 26 : 22), H, '#1c1418', ['#ff2a3a', '#ffffff'])
  const extra = `<linearGradient id="spot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/></linearGradient>`
  return { W, H, defs: extra, body: svgOf(bg, screen, stage, glow) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(front) }
}

// ---- Thunder Amps: a metal stage in a storm, walls of amps, fire
function thunderAmps(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 7701 : 7702)
  const HY = Math.round(H * (isTall ? 0.76 : 0.72))
  const bg = new Layer()
  const sky = new Layer()
  const stage = new Layer()
  const fire = new Layer()
  const front = new Layer()
  bg.px(fill('#05060c'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#05060c'], [0.6, '#121828'], [1, '#26304a']])
  moving(sky, 'dt', a => {
    for (let k = 0; k < (isTall ? 10 : 14); k++) {
      const x = Math.floor(rand() * (W + 60)) - 40
      const y = Math.floor(rand() * H * 0.35)
      const w = 24 + Math.floor(rand() * 40)
      a.px(fill('#1a2032', 0.9), x, y, w, 3)
      a.px(fill('#2a3450', 0.7), x + 4, y - 1, w - 10, 1)
    }
  })
  // lightning: two bolts and a sky flash
  const bolt = new Layer()
  for (const [bx, len] of [[W * 0.28, 50], [W * 0.74, 40]]) {
    let x = bx
    for (let y = 0; y < len; y += 3) {
      bolt.px(fill('#e8f0ff'), x, y, 1.2, 3)
      x += (rand() - 0.5) * 6
    }
  }
  sky.raw(`<g class="lt" opacity="0"><rect width="${W}" height="${HY}" fill="#c8d8ff" opacity="0.35"/>${bolt.svg()}</g>`)
  // the drum kit on its riser
  const cx = W / 2
  stage.px(fill('#101016'), 0, HY, W, H - HY)
  stage.px(fill('#2a2a34'), 0, HY, W, 0.6)
  stage.px(fill('#16161e'), cx - 18, HY - 8, 36, 8)
  disc(stage, cx, HY - 13, 6, fill('#1a1a24'))
  disc(stage, cx, HY - 13, 4.5, fill('#d8d8e0', 0.7))
  for (const [dx, dy, r] of [[-9, -17, 2.5], [9, -17, 2.5], [-14, -12, 3], [14, -12, 3]]) disc(stage, cx + dx, HY + dy, r, fill('#1a1a24'))
  for (const dx of [-20, 13]) stage.px(fill('#d8b040', 0.85), cx + dx, HY - 24, 7, 0.6)
  // walls of amps on both sides
  const stacks = isTall ? [[2, 3], [W - 22, 3]] : [[4, 4], [26, 3], [W - 46, 3], [W - 24, 4]]
  for (const [x, n] of stacks) {
    for (let k = 0; k < n; k++) cabinet(stage, x, HY - 12 * (k + 1), 20, 11.5)
    stage.px(fill('#16161c'), x, HY - 12 * n - 6, 20, 6)
    for (let k = 0; k < 5; k++) disc(stage, x + 3 + k * 3.5, HY - 12 * n - 3, 0.8, fill('#c8c8d0'))
    stage.px(`${fill('#ff3b3b')} class="blink"`, x + 18, HY - 12 * n - 4.5, 0.8, 0.8)
  }
  // fire jets along the front of the stage
  for (const [fx, k] of [[0.3, 0], [0.42, 1], [0.58, 1], [0.7, 0]]) {
    stage.px(fill('#2a2a34'), W * fx - 1.5, HY - 1, 3, 1)
    flame(fire, W * fx, HY - 1, isTall ? 26 : 30, k ? 'fj2' : 'fj')
  }
  bg.raw(`<ellipse cx="${cx}" cy="${HY}" rx="${W * 0.35}" ry="30" fill="url(#fireGlow)" class="pu"/>`)
  crowd(front, rand, W, H - (isTall ? 24 : 20), H, '#1a1a24', ['#ffb020'])
  const extra = radial('fireGlow', '#ff7a1a', 0.35)
  return { W, H, defs: extra, body: svgOf(bg, sky, stage, fire) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(front) }
}

// ---- Stadium Rock: an open-air stadium at sunset
function stadiumRock(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 8801 : 8802)
  const HY = Math.round(H * (isTall ? 0.62 : 0.55))
  const bg = new Layer()
  const stands = new Layer()
  const rig = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const front = new Layer()
  const air = new Layer()
  bg.px(fill('#2a1a50'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#2a1a50'], [0.5, '#7a2a6a'], [0.8, '#ff7a4a'], [1, '#ffc46b']])
  disc(bg, W * (isTall ? 0.2 : 0.14), HY - 8, isTall ? 10 : 13, fill('#ffe39a'))
  moving(bg, 'fy', a => {
    for (const [bx, by] of isTall ? [[120, 40], [130, 36]] : [[220, 30], [230, 26], [244, 34]]) {
      a.px(fill('#3a1a3a'), bx, by, 1.5, 0.6)
      a.px(fill('#3a1a3a'), bx + 1.5, by + 0.6, 1, 0.6)
      a.px(fill('#3a1a3a'), bx + 2.5, by, 1.5, 0.6)
    }
  })
  // the stands, curving round both sides
  for (let r = 0; r < 7; r++) {
    for (let x = 0; x < W; x += 2) {
      const t = Math.abs(x - W / 2) / (W / 2)
      const y = HY - 4 + r * 4 - t * t * (isTall ? 26 : 34)
      stands.px(fill(r % 2 ? '#24163a' : '#2c1c44'), x, y, 2, 4)
      if (rand() < 0.5) stands.px(fill(['#ffd27a', '#ff8fb0', '#ffffff', '#9ff0ff'][Math.floor(rand() * 4)], op1(0.35 + rand() * 0.4)), x + 0.5, y + 1, 0.8, 1)
    }
  }
  // the stage rig: a truss roof, lights, two screens
  const cx = W / 2
  const rw = isTall ? 100 : 130
  const top = HY - (isTall ? 34 : 40)
  rig.px(fill('#0c0814'), cx - rw / 2, top, rw, HY + 12 - top)
  for (let x = cx - rw / 2; x < cx + rw / 2; x += 6) {
    rig.raw(`<path d="M${x} ${top - 6}L${x + 3} ${top}L${x + 6} ${top - 6}" stroke="#4a4458" stroke-width="0.5" fill="none"/>`)
  }
  rig.px(fill('#4a4458'), cx - rw / 2 - 2, top - 7, rw + 4, 1)
  rig.px(fill('#4a4458'), cx - rw / 2 - 2, top, rw + 4, 1)
  for (let x = cx - rw / 2 + 4; x < cx + rw / 2; x += 8) {
    glow.px(`${fill(['#ffd27a', '#ff3fa8', '#38e8ff'][Math.floor(x) % 3])} class="tw${1 + (Math.floor(x) % 3)}"`, x, top + 1.5, 2, 1.2)
  }
  for (const dx of [-rw / 2 - 26, rw / 2 + 4]) {
    const x = cx + dx
    rig.px(fill('#0c0814'), x, top + 4, 22, 16)
    glow.px(fill('#ff7a4a', 0.5), x + 1, top + 5, 20, 14)
    eqBars(glow, x + 2, top + 18, 6, 2, 1.2, 10, ['#ffd27a', '#ff3fa8'])
  }
  // a guitarist and a drummer, in silhouette against the stage light
  bg.raw(`<ellipse cx="${cx}" cy="${HY + 6}" rx="${rw * 0.5}" ry="26" fill="url(#stageLight)"/>`)
  rig.px(fill('#1a1424'), cx - rw / 2, HY + 6, rw, 6)
  glow.px(fill('#ffd27a', 0.8), cx - rw / 2, HY + 6, rw, 0.6)
  rig.px(fill('#050308'), cx - 22, HY - 8, 3, 8)
  rig.px(fill('#050308'), cx - 22.5, HY - 10.5, 4, 3)
  rig.raw(`<path d="M${cx - 26} ${HY - 3}L${cx - 14} ${HY - 7}" stroke="#050308" stroke-width="1.4"/>`)
  disc(rig, cx + 14, HY + 2, 4, fill('#050308'))
  rig.px(fill('#050308'), cx + 12, HY - 6, 3, 6)
  // the crowd on the field, confetti in the air
  crowd(front, rand, W, H - (isTall ? 26 : 20), H, '#1e1230', ['#ffd27a'])
  for (let i = 0; i < (isTall ? 50 : 80); i++) {
    air.px(`${fill(['#ff3fa8', '#ffd23f', '#38e8ff', '#ffffff', '#3dff8a'][i % 5], 0.85)} class="f${1 + (i % 2)}"`, Math.floor(rand() * W), Math.floor(rand() * HY), 1, 0.8)
  }
  const extra = radial('stageLight', '#ffd27a', 0.4)
  return { W, H, defs: extra, scan: false, body: svgOf(bg, stands, rig, glow) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(front, air) }
}

// ---- DJ Booth: decks, a mixer and an equalizer wall
function djBooth(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 9901 : 9902)
  const TY = Math.round(H * (isTall ? 0.68 : 0.62))
  const bg = new Layer()
  const wall = new Layer()
  const booth = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  bg.px(fill('#08060e'), 0, 0, W, H)
  band(bg, W, 0, TY, [[0, '#08060e'], [1, '#160c24']])
  // the equalizer wall behind
  const cols = isTall ? 18 : 32
  const bw = W / cols
  const colors = ['#ff3fa8', '#9b4dff', '#38e8ff', '#3dff8a', '#ffd23f']
  let bars = ''
  for (let k = 0; k < cols; k++) {
    const h = TY * (0.2 + 0.25 * Math.abs(Math.sin(k * 0.55)) + rand() * 0.1)
    bars += `<rect class="eq${1 + (k % 4)}" x="${num(k * bw + 1)}" y="${num(TY - 6 - h)}" width="${num(bw - 2)}" height="${num(h)}" fill="${colors[Math.floor((k / cols) * colors.length)]}" opacity="0.32"/>`
  }
  wall.raw(bars)
  lasers(wall, W / 2, TY - 4, '#ff3fa8', 3, W * 0.7, 0.35, 'ls1')
  lasers(wall, W / 2, TY - 4, '#38e8ff', 3, W * 0.7, 0.35, 'ls2')
  // the booth
  booth.px(fill('#1a1624'), 0, TY, W, 4)
  booth.px(fill('#0e0c16'), 0, TY + 4, W, H - TY - 4)
  glow.px(fill('#ff3fa8'), 0, TY + 4, W, 0.6)
  const s = isTall ? 0.62 : 1
  const deckW = 44 * s
  const mixW = 30 * s
  const total = deckW * 2 + mixW + 8 * s
  const x0 = (W - total) / 2
  const y0 = TY - 1 - 34 * s
  for (const [k, x] of [[0, x0], [1, x0 + deckW + mixW + 8 * s]]) {
    booth.px(fill('#22202c'), x, y0, deckW, 34 * s)
    booth.px(fill('#34303e'), x, y0, deckW, 0.6)
    const pcx = x + 20 * s
    const pcy = y0 + 17 * s
    const platter = new Layer()
    disc(platter, pcx, pcy, 14 * s, fill('#0a0a10'))
    disc(platter, pcx, pcy, 11 * s, fill('#14141c'))
    disc(platter, pcx, pcy, 4 * s, fill(k ? '#38e8ff' : '#ff3fa8'))
    platter.px(fill('#f4f4ff'), pcx - 0.3, pcy - 13 * s, 0.6, 6 * s)
    booth.raw(`<g class="sp" ${rot(pcx, pcy)}>${platter.svg()}</g>`)
    booth.px(fill('#3a3644'), x + 38 * s, y0 + 6 * s, 2 * s, 22 * s)
    booth.px(fill('#c8c8d0'), x + 37 * s, y0 + (k ? 18 : 12) * s, 4 * s, 2 * s)
  }
  // the mixer: VU meters, knobs, faders
  const mx = x0 + deckW + 4 * s
  booth.px(fill('#18161f'), mx, y0, mixW, 34 * s)
  eqBars(glow, mx + 4 * s, y0 + 14 * s, 4, 2.6 * s, 1.6 * s, 10 * s, ['#3dff8a', '#3dff8a', '#ffd23f', '#ff3b3b'])
  eqBars(glow, mx + 17 * s, y0 + 14 * s, 4, 2.6 * s, 1.6 * s, 10 * s, ['#3dff8a', '#ffd23f', '#3dff8a', '#ff3b3b'])
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) disc(booth, mx + 5 * s + c * 6.5 * s, y0 + (18 + r * 4.5) * s, 1.4 * s, fill('#5a5668'))
  for (let c = 0; c < 4; c++) {
    booth.px(fill('#0a0a10'), mx + 5 * s + c * 6.5 * s - 0.3, y0 + 26 * s, 0.6, 5 * s)
    booth.px(fill('#e8e8f0'), mx + 5 * s + c * 6.5 * s - 1.2 * s, y0 + (27 + (c % 3)) * s, 2.4 * s, 1.2 * s)
  }
  // a laptop behind the mixer, its waveform scrolling
  const lw = 30 * s
  booth.px(fill('#2a2a34'), mx, y0 - 20 * s, lw, 18 * s)
  booth.px(fill('#06060c'), mx + 1.5 * s, y0 - 18.5 * s, lw - 3 * s, 15 * s)
  for (let x = 0; x < lw - 5 * s; x += 0.7) {
    const a = (Math.abs(Math.sin(x * 0.9) * Math.sin(x * 0.21)) * 4 + 0.4) * s
    glow.px(fill(x < (lw - 5 * s) / 2 ? '#ff3fa8' : '#38e8ff', 0.85), mx + 2.5 * s + x, y0 - 11 * s - a, 0.5, a * 2)
  }
  glow.px(`${fill('#ffffff')} class="blink"`, mx + lw / 2, y0 - 18 * s, 0.5, 15 * s)
  // headphones on the booth
  booth.raw(`<path d="M${num(x0 - 2)} ${TY}a6 6 0 0 1 12 0" fill="none" stroke="#5a5668" stroke-width="1.4"/>`)
  return { W, H, body: svgOf(bg, wall) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(booth, glow) }
}

// ---- Main Stage: a festival, lasers, strobes and a drop
function mainStage(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 1101 : 1102)
  const HY = Math.round(H * (isTall ? 0.68 : 0.64))
  const bg = new Layer()
  const beams = new Layer()
  const stage = new Layer()
  const glow = new Layer('filter="url(#glow)"')
  const front = new Layer()
  const air = new Layer()
  bg.px(fill('#020208'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#020208'], [0.6, '#0c0620'], [1, '#2a0c3a']])
  dots(bg, rand, [0, 0, W, HY * 0.5], isTall ? 30 : 50, ['#ffffff'], [0.2, 0.5], 0.3)
  // the LED wall
  const cx = W / 2
  const lw = isTall ? 120 : 160
  const lh = isTall ? 54 : 62
  const ly = HY - lh - 10
  stage.px(fill('#0a0614'), cx - lw / 2 - 3, ly - 3, lw + 6, lh + 13)
  for (const [r, c, cls] of [[1, '#9b4dff', 'pu'], [0.7, '#ff3fa8', 'tw2'], [0.42, '#38e8ff', 'tw1']]) {
    stage.raw(`<ellipse cx="${cx}" cy="${ly + lh / 2}" rx="${num((lw / 2) * r)}" ry="${num((lh / 2) * r)}" fill="none" stroke="${c}" stroke-width="2" opacity="0.7" class="${cls}"/>`)
  }
  const word = 'DROP'
  const ws = isTall ? 2.6 : 3.2
  text(glow, word, cx - textWidth(word, ws, FONT5) / 2, ly + lh / 2 - 2.5 * ws, ws, `${fill('#ffffff')} class="fl"`, FONT5)
  eqBars(glow, cx - lw / 2 + 4, ly + lh - 2, isTall ? 22 : 30, 3, 2, 10, ['#ff3fa8', '#9b4dff', '#38e8ff', '#3dff8a'])
  // side towers of lights
  for (const x of [cx - lw / 2 - 18, cx + lw / 2 + 6]) {
    stage.px(fill('#0a0614'), x, ly - 10, 12, HY - ly + 10)
    for (let y = ly - 8; y < HY - 4; y += 4) glow.px(`${fill(['#ff3fa8', '#38e8ff', '#ffd23f'][Math.floor(y) % 3], 0.9)} class="tw${1 + (Math.floor(y) % 3)}"`, x + 2, y, 8, 1.5)
  }
  // lasers and strobes
  lasers(beams, cx - lw / 2, ly - 4, '#3dff8a', 5, W * 0.8, 0.22, 'ls1')
  lasers(beams, cx + lw / 2, ly - 4, '#ff3fa8', 5, W * 0.8, 0.22, 'ls2')
  lasers(beams, cx, ly - 4, '#38e8ff', 3, W * 0.8, 0.3, 'ls2')
  for (const [x, cls] of [[cx - lw / 2 + 6, 'ra'], [cx + lw / 2 - 8, 'rb'], [cx - 6, 'rb'], [cx + 4, 'ra']]) glow.px(`${fill('#ffffff')} class="${cls}"`, x, ly - 6, 3, 1.5)
  // the deck in front, CO2 jets
  stage.px(fill('#12101a'), 0, HY, W, H - HY)
  glow.px(fill('#9b4dff'), 0, HY, W, 0.6)
  stage.px(fill('#1a1426'), cx - 18, HY - 8, 36, 8)
  glow.px(fill('#38e8ff', 0.9), cx - 18, HY - 8, 36, 0.5)
  for (const [fx, k] of [[0.18, 0], [0.82, 1]]) {
    const f = new Layer()
    for (let r = 0; r < 30; r++) f.px(fill('#e8f0ff', op1(0.15 + (r / 30) * 0.4)), W * fx - (0.8 + r * 0.15), HY - 30 + r, 1.6 + r * 0.3, 1)
    air.raw(`<g class="${k ? 'fj2' : 'fj'}">${f.svg()}</g>`)
  }
  // the crowd, glowsticks and confetti
  crowd(front, rand, W, H - (isTall ? 30 : 24), H, '#1a1028', ['#3dff8a', '#ff3fa8', '#38e8ff', '#ffd23f'])
  for (let i = 0; i < (isTall ? 50 : 80); i++) {
    air.px(`${fill(['#ff3fa8', '#ffd23f', '#38e8ff', '#ffffff', '#3dff8a'][i % 5], 0.85)} class="f${1 + (i % 2)}"`, Math.floor(rand() * W), Math.floor(rand() * HY * 0.8), 1, 0.8)
  }
  return { W, H, body: svgOf(bg, beams, stage, glow) + `<rect width="${W}" height="${H}" fill="url(#calm)"/>` + svgOf(air, front) }
}

// ---------------------------------------------------------------- light scenes
// Six bright scenes for light mode: a garage lab with a portal, an office that
// hides a conspiracy, a crayon-bright town, a vacant lot under a summer sky, a
// pastel games hall and an abandoned zone. Moods only: no show's characters,
// names, logos or costumes.

// A light panel: white glass, dark text.
function lightPanel(L, x, y, w, title, lines, accent) {
  const lh = 4
  const h = 8 + lines.length * lh + 1
  L.px(fill('#ffffff', 0.86), x, y, w, h)
  for (const [px, py, pw, ph] of [[x, y, w, 0.5], [x, y + h - 0.5, w, 0.5], [x, y, 0.5, h], [x + w - 0.5, y, 0.5, h]]) L.px(fill(accent), px, py, pw, ph)
  L.px(fill(accent, 0.18), x + 0.5, y + 0.5, w - 1, 5)
  text(L, title, x + 2, y + 1.7, 0.5, fill(accent))
  lines.forEach((segs, i) => {
    let cx = x + 2
    for (const [str, color, cls] of segs) cx += text(L, str, cx, y + 8 + i * lh, 0.5, `${fill(color)}${cls ? ` class="${cls}"` : ''}`) + 0.5
  })
  return [x, y, w, h]
}

// Every light scene ends the same way: a soft white centre so dark text reads.
const lightScene = (W, H, below, above = [], defs = '') => ({
  W, H, scan: false, defs: defs + calmOf('calmLight', '#ffffff', 0.55, 0.3),
  body: svgOf(...below) + `<rect width="${W}" height="${H}" fill="url(#calmLight)"/>` + svgOf(...above),
})

// ---- Portal Garage: a sunny garage lab with a swirling green portal
function portalGarage(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 1301 : 1302)
  const HY = Math.round(H * (isTall ? 0.8 : 0.76))
  const bg = new Layer()
  const room = new Layer()
  const portal = new Layer()
  const gear = new Layer()
  const hud = new Layer()
  bg.px(fill('#efe4cc'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#f6eedc'], [1, '#e6d8bc']])
  // the open garage door, a strip of blue sky
  room.px(fill('#9fe0ff'), 0, 0, W, 10)
  room.px(fill('#c9b48e'), 0, 10, W, 2)
  for (let x = 0; x < W; x += 16) room.px(fill('#b89a72'), x, 10, 1, 2)
  // the pegboard of tools and the shelf of jars
  const px0 = isTall ? 8 : 12
  room.px(fill('#d8c49c'), px0, 22, 60, 34)
  for (let y = 25; y < 54; y += 4) for (let x = px0 + 3; x < px0 + 58; x += 4) room.px(fill('#b8a47c'), x, y, 0.6, 0.6)
  for (const [x, y, w, h, c] of [[8, 28, 2, 14, '#5a6a7a'], [16, 26, 6, 3, '#d83a3a'], [16, 29, 1.2, 10, '#5a4a3a'], [28, 30, 10, 2, '#3a8ad8'], [44, 26, 2, 16, '#5a6a7a'], [50, 34, 7, 7, '#e8a020']]) room.px(fill(c), px0 + x, y, w, h)
  const sx = isTall ? W - 60 : W - 90
  room.px(fill('#a8865a'), sx, 30, 52, 1.5)
  for (let k = 0; k < 7; k++) {
    const c = ['#5dff6a', '#38c8ff', '#ff8a3a', '#c86bff'][k % 4]
    room.px(fill('#cfe6f0', 0.8), sx + 2 + k * 7, 23, 5, 7)
    room.px(fill(c, 0.85), sx + 2 + k * 7, 26, 5, 4)
  }
  // a hanging bulb
  room.px(fill('#6a5a4a'), W * 0.42, 12, 0.5, 10)
  disc(room, W * 0.42 + 0.25, 23.5, 2, fill('#fff3b0'))
  bg.raw(`<circle cx="${num(W * 0.42)}" cy="24" r="22" fill="url(#bulb)"/>`)
  // the floor and the workbench
  room.px(fill('#c8b898'), 0, HY, W, H - HY)
  room.px(fill('#b4a482'), 0, HY, W, 0.8)
  room.raw(`<ellipse cx="${num(W * 0.32)}" cy="${HY + 8}" rx="12" ry="2" fill="#5a4a3a" opacity="0.2"/>`)
  const bx = isTall ? 6 : 14
  gear.px(fill('#8a6a42'), bx, HY - 14, 56, 3)
  gear.px(fill('#6a5032'), bx + 2, HY - 11, 2, 11)
  gear.px(fill('#6a5032'), bx + 52, HY - 11, 2, 11)
  for (const [dx, c] of [[6, '#5dff6a'], [14, '#38c8ff'], [22, '#ff5ad8']]) {
    sprite(gear, FLASK, bx + dx, HY - 19, 1, { '#': fill('#7a8a9a', 0.7), l: fill(c, 0.9) })
    gear.px(`${fill(c, 0.7)} class="up${1 + (dx % 3)}"`, bx + dx + 1.5, HY - 21, 0.8, 0.8)
  }
  gear.px(fill('#3a4a5a'), bx + 32, HY - 22, 16, 8)
  gear.px(fill('#0a1a10'), bx + 33, HY - 21, 14, 6)
  for (let x = 0; x < 13; x += 1) gear.px(fill('#5dff6a', 0.9), bx + 33.5 + x, HY - 18 + Math.round(Math.sin(x * 0.9) * 1.5), 0.6, 0.6)
  // the portal: a glow, rings, and a spiral that turns
  const cx = Math.round(W * (isTall ? 0.62 : 0.66))
  const cy = Math.round(isTall ? H * 0.5 : H * 0.46)
  const r = isTall ? 24 : 30
  bg.raw(`<circle cx="${cx}" cy="${cy}" r="${r * 1.8}" fill="url(#portalGlow)" class="pu"/>`)
  portal.raw(`<g shape-rendering="geometricPrecision"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#2fd94a"/><circle cx="${cx}" cy="${cy}" r="${num(r * 0.78)}" fill="#6aff5a"/><circle cx="${cx}" cy="${cy}" r="${num(r * 0.5)}" fill="#c8ffa0"/><circle cx="${cx}" cy="${cy}" r="${num(r * 0.22)}" fill="#f4ffe0"/></g>`)
  let spiral = ''
  for (let arm = 0; arm < 3; arm++) {
    let d = ''
    for (let t = 0; t <= 1; t += 0.04) {
      const a = arm * 2.094 + t * 7
      d += `${t === 0 ? 'M' : 'L'}${num(cx + Math.cos(a) * r * t)} ${num(cy + Math.sin(a) * r * t)}`
    }
    spiral += `<path d="${d}" stroke="#1a9a30" stroke-width="1.6" fill="none" opacity="0.7"/>`
  }
  portal.raw(`<g class="pr" ${rot(cx, cy)} shape-rendering="geometricPrecision">${spiral}</g>`)
  for (let k = 0; k < 16; k++) {
    const a = rand() * Math.PI * 2
    const d = r * (1.05 + rand() * 0.3)
    portal.px(`${fill('#3ae04a', 0.9)} class="tw${1 + (k % 3)}"`, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1)
  }
  // a saucer, hovering
  {
    const s = new Layer()
    const x = isTall ? 22 : W - 70
    const y = isTall ? H * 0.32 : HY - 22
    s.raw(`<g shape-rendering="geometricPrecision"><ellipse cx="${x + 16}" cy="${y}" rx="9" ry="6" fill="#9fe8ff" opacity="0.85"/><ellipse cx="${x + 16}" cy="${y + 4}" rx="18" ry="4.5" fill="#b8c0cc"/><ellipse cx="${x + 16}" cy="${y + 5.5}" rx="12" ry="2" fill="#8a94a4"/></g>`)
    for (let k = 0; k < 5; k++) s.px(`${fill(['#ff3a3a', '#ffd23f', '#3ae04a'][k % 3])} class="${k % 2 ? 'ra' : 'rb'}"`, x + 5 + k * 5.5, y + 4, 1, 1)
    gear.raw(`<g class="bo">${s.svg()}</g>`)
    gear.raw(`<ellipse cx="${x + 16}" cy="${num(isTall ? y + 18 : HY + 2)}" rx="14" ry="1.5" fill="#000" opacity="0.12"/>`)
  }
  lightPanel(hud, isTall ? W - 64 : W - 66, isTall ? 14 : 36, 58, 'GARAGE.LOG', [
    [['PORTAL ', '#6a6a7a'], ['STABLE', '#1a9a30']],
    [['DIMENSION ', '#6a6a7a'], ['42-B', '#c0187a']],
    [['FLUX ', '#6a6a7a'], ['88%', '#2a6ad8', 'blink']],
  ], '#1a9a30')
  const extra = radial('portalGlow', '#5dff6a', 0.45) + radial('bulb', '#fff3b0', 0.5)
  return lightScene(W, H, [bg, room, portal, gear], [hud], extra)
}

// ---- Shadow Office: a bright office hiding a conspiracy board and a moon set
function shadowOffice(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 1401 : 1402)
  const HY = Math.round(H * (isTall ? 0.78 : 0.74))
  const bg = new Layer()
  const wall = new Layer()
  const props = new Layer()
  const hud = new Layer()
  bg.px(fill('#f2f5f7'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#eef2f5'], [1, '#e2e8ec']])
  for (let x = 10; x < W; x += 40) wall.px(fill('#ffffff'), x, 2, 24, 2)
  wall.px(fill('#d9dee3'), 0, HY, W, H - HY)
  for (let x = 0; x < W; x += 12) wall.px(fill('#c8ced4'), x, HY, 0.4, H - HY)
  for (let y = HY + 6; y < H; y += 6) wall.px(fill('#c8ced4'), 0, y, W, 0.4)
  // the conspiracy board: photos, pins and red string
  const kx = isTall ? 10 : 14
  const ky = isTall ? 40 : 22
  const kw = isTall ? 74 : 92
  const kh = isTall ? 52 : 58
  wall.px(fill('#8a6038'), kx - 2, ky - 2, kw + 4, kh + 4)
  wall.px(fill('#c9965a'), kx, ky, kw, kh)
  for (let i = 0; i < 70; i++) wall.px(fill('#b07e48', 0.6), kx + rand() * kw, ky + rand() * kh, 0.6, 0.6)
  const pins = []
  for (let i = 0; i < (isTall ? 6 : 8); i++) {
    const x = kx + 4 + rand() * (kw - 16)
    const y = ky + 4 + rand() * (kh - 16)
    wall.px(fill('#ffffff'), x, y, 11, 9)
    wall.px(fill(['#9ab0c0', '#c0a890', '#a8b8a0', '#b0a0c0'][i % 4]), x + 1, y + 1, 9, 6)
    wall.px(fill('#5a5a64', 0.6), x + 3, y + 3, 4, 3)
    pins.push([x + 5.5, y + 0.6])
  }
  let strings = ''
  for (let i = 0; i < pins.length; i++) for (const j of [i + 1, i + 3]) if (j < pins.length) strings += `M${num(pins[i][0])} ${num(pins[i][1])}L${num(pins[j][0])} ${num(pins[j][1])}`
  wall.raw(`<path d="${strings}" stroke="#d81e2a" stroke-width="0.45" fill="none" shape-rendering="geometricPrecision"/>`)
  for (const [x, y] of pins) disc(wall, x, y, 1, fill('#e0242b'))
  text(wall, '?', kx + kw - 8, ky + 3, 1.2, fill('#d81e2a'))
  // the big screen: a world map and a stamp
  const mx = isTall ? W - 74 : W - 104
  const my = isTall ? 104 : 18
  const mw = isTall ? 66 : 90
  const mh = isTall ? 40 : 50
  wall.px(fill('#2a3240'), mx - 2, my - 2, mw + 4, mh + 4)
  wall.px(fill('#0e1a26'), mx, my, mw, mh)
  for (let i = 0; i < 260; i++) {
    const x = rand()
    const y = rand()
    const land = Math.sin(x * 9) * Math.cos(y * 7) + Math.sin(x * 3 + y * 5) > 0.35
    if (land) wall.px(fill('#3ad08a', 0.7), mx + 2 + x * (mw - 4), my + 2 + y * (mh - 10), 0.8, 0.8)
  }
  for (let k = 0; k < 4; k++) wall.px(`${fill('#ff3a3a')} class="tw${1 + (k % 3)}"`, mx + 8 + rand() * (mw - 16), my + 6 + rand() * (mh - 18), 1.2, 1.2)
  const stamp = 'TOP SECRET'
  wall.px(`${fill('#ffffff', 0.9)} class="blink"`, mx + mw / 2 - textWidth(stamp, 0.7) / 2 - 1.5, my + mh - 8, textWidth(stamp, 0.7) + 3, 5.5)
  text(wall, stamp, mx + mw / 2 - textWidth(stamp, 0.7) / 2, my + mh - 7, 0.7, fill('#d81e2a'))
  // the moon set: a grey dune, a flag, a light and a camera filming
  const ms = isTall ? W - 60 : W * 0.56
  props.raw(`<path d="M${ms - 10} ${HY + 1}Q${ms + 22} ${HY - 18} ${ms + 56} ${HY + 1}Z" fill="#c8c8cc"/>`)
  for (let k = 0; k < 6; k++) disc(props, ms + 4 + k * 8, HY - 4 - (k % 2) * 3, 1.5, fill('#a8a8b0'))
  props.px(fill('#8a8a90'), ms + 26, HY - 26, 0.6, 18)
  props.px(fill('#f4f4f4'), ms + 26.6, HY - 26, 10, 6)
  for (let k = 0; k < 3; k++) props.px(fill('#c8ccd4'), ms + 26.6, HY - 25 + k * 2, 10, 0.5)
  const lx = ms + 66
  props.px(fill('#4a4a54'), lx, HY - 26, 0.8, 26)
  props.px(fill('#4a4a54'), lx - 3, HY - 1, 7, 1)
  props.px(fill('#2a2a34'), lx - 3, HY - 30, 7, 5)
  bg.raw(`<polygon points="${lx - 3},${HY - 28} ${lx - 3},${HY - 26} ${ms + 10},${HY} ${ms + 40},${HY}" fill="#fff8d8" opacity="0.5"/>`)
  if (!isTall) {
    const cx = ms - 30
    props.px(fill('#2a2a34'), cx, HY - 14, 10, 7)
    disc(props, cx + 2, HY - 16, 2.5, fill('#2a2a34'))
    disc(props, cx + 8, HY - 16, 2.5, fill('#2a2a34'))
    props.px(fill('#1a1a22'), cx + 10, HY - 12, 4, 3)
    for (const dx of [1, 5, 9]) props.px(fill('#4a4a54'), cx + dx, HY - 7, 0.6, 7)
    props.px(`${fill('#ff3a3a')} class="blink"`, cx + 1, HY - 13, 1, 1)
  }
  // cubicles and a plant
  const cbx = isTall ? 4 : 10
  for (let k = 0; k < (isTall ? 1 : 2); k++) {
    props.px(fill('#9ab4c8'), cbx + k * 34, HY - 14, 30, 14)
    props.px(fill('#b8ccdc'), cbx + k * 34, HY - 14, 30, 1)
    props.px(fill('#3a4a5a'), cbx + k * 34 + 8, HY - 20, 12, 7)
    props.px(fill('#7ac8ff', 0.8), cbx + k * 34 + 9, HY - 19, 10, 5)
  }
  props.px(fill('#c87a4a'), isTall ? 40 : 82, HY - 6, 6, 6)
  for (const [dx, dy, r] of [[3, -9, 4], [0, -12, 3], [6, -12, 3]]) disc(props, (isTall ? 40 : 82) + dx, HY + dy, r, fill('#4aa860'))
  lightPanel(hud, isTall ? 8 : W / 2 - 30, isTall ? 8 : 6, 58, 'MEMO', [
    [['NOTHING TO SEE HERE', '#2a2a3a']],
    [['CLEARANCE ', '#6a6a7a'], ['LEVEL 9', '#d81e2a', 'blink']],
    [['SHRED BY ', '#6a6a7a'], ['FRIDAY', '#2a6ad8']],
  ], '#2a3a5a')
  return lightScene(W, H, [bg, wall, props], [hud])
}

// ---- Crayon Town: a sunny street, a kindergarten bus, crayon doodles
function crayonTown(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 1501 : 1502)
  const HY = Math.round(H * (isTall ? 0.76 : 0.72))
  const bg = new Layer()
  const sky = new Layer()
  const town = new Layer()
  const detail = new Layer()
  const street = new Layer()
  bg.px(fill('#7cc8ff'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#6ab8ff'], [1, '#d8f0ff']])
  // a crayon sun with rays
  const sx = isTall ? 24 : 26
  const sy = isTall ? 26 : 24
  disc(sky, sx, sy, 9, fill('#ffd23f'))
  disc(sky, sx, sy, 6, fill('#ffe680'))
  const rays = new Layer()
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    rays.raw(`<line x1="${num(sx + Math.cos(a) * 11)}" y1="${num(sy + Math.sin(a) * 11)}" x2="${num(sx + Math.cos(a) * 16)}" y2="${num(sy + Math.sin(a) * 16)}" stroke="#ff9a2a" stroke-width="1.2"/>`)
  }
  sky.raw(`<g class="rs" ${rot(sx, sy)}>${rays.svg()}</g>`)
  moving(sky, 'dt', a => {
    for (const [cx, cy, cw] of isTall ? [[70, 30, 34], [120, 60, 30]] : [[90, 18, 40], [170, 34, 36], [250, 14, 44]]) cloud(a, cx, cy, cw)
  })
  // houses with tiled roofs, block walls and power lines
  const houses = isTall ? [[2, 40, '#fff0e0', '#3a5a9a'], [46, 42, '#ffe0e8', '#9a3a2a'], [92, 44, '#e8f4e0', '#4a4a6a'], [140, 40, '#fff4c8', '#3a6a5a']] : [[0, 46, '#fff0e0', '#3a5a9a'], [52, 50, '#ffe0e8', '#9a3a2a'], [210, 50, '#e8f4e0', '#4a4a6a'], [266, 54, '#fff4c8', '#3a6a5a']]
  for (const [x, w, wallC, roofC] of houses) {
    const top = HY - 38
    town.px(fill(wallC), x + 3, top, w - 6, 38)
    for (let r = 0; r < 8; r++) town.px(fill(r % 2 ? roofC : mix(roofC, '#000000', 0.2)), x + r * 0.8, top - 8 + r, w - r * 1.6, 1)
    detail.px(fill('#7ac8ff'), x + 8, top + 6, 8, 6)
    detail.px(fill('#7ac8ff'), x + w - 16, top + 6, 8, 6)
    detail.px(fill('#ffffff'), x + 11.6, top + 6, 0.8, 6)
    detail.px(fill('#ffffff'), x + w - 12.4, top + 6, 0.8, 6)
    detail.px(fill('#8a5a3a'), x + w / 2 - 3, top + 22, 6, 16)
  }
  town.px(fill('#c8c8c0'), 0, HY - 10, W, 10)
  for (let x = 0; x < W; x += 6) for (let y = HY - 10; y < HY; y += 3) town.px(fill('#b4b4ac'), x + ((y / 3) % 2) * 3, y, 0.5, 3)
  // crayon doodles on the wall
  const dx = isTall ? 60 : 120
  const doodles = new Layer()
  doodles.raw(`<g stroke-width="0.8" fill="none" shape-rendering="geometricPrecision">` +
    `<circle cx="${dx}" cy="${HY - 7}" r="1.6" stroke="#ff3a3a"/><path d="M${dx} ${HY - 5.4}V${HY - 2}M${dx - 2} ${HY - 4}H${dx + 2}M${dx} ${HY - 2}L${dx - 1.5} ${HY}M${dx} ${HY - 2}L${dx + 1.5} ${HY}" stroke="#ff3a3a"/>` +
    `<path d="M${dx + 10} ${HY - 3}l2 -5l2 5l-5 -3h6z" stroke="#ffb020"/>` +
    `<path d="M${dx + 22} ${HY - 4}c-2 -3 -5 0 0 3c5 -3 2 -6 0 -3z" stroke="#ff5ad8"/>` +
    `<path d="M${dx + 30} ${HY - 2}q3 -6 6 0q3 -6 6 0" stroke="#3a8ad8"/></g>`)
  town.raw(doodles.svg())
  for (const px of isTall ? [36, 140] : [44, 200, 310]) town.px(fill('#7a6a5a'), px, HY - 62, 1.4, 62)
  town.raw(`<path d="M0 ${HY - 58}Q${W / 4} ${HY - 52} ${W / 2} ${HY - 58}T${W} ${HY - 58}M0 ${HY - 54}Q${W / 4} ${HY - 48} ${W / 2} ${HY - 54}T${W} ${HY - 54}" stroke="#4a4a4a" stroke-width="0.35" fill="none" opacity="0.7"/>`)
  // the street, and the bus going by
  street.px(fill('#a8a8a8'), 0, HY, W, H - HY)
  for (let x = 4; x < W; x += 14) street.px(fill('#ffffff'), x, HY + (H - HY) / 2, 7, 0.8)
  moving(street, 'cw2', a => {
    const x = isTall ? 40 : 90
    const y = HY + 4
    a.raw(`<rect x="${x}" y="${y}" width="44" height="16" rx="4" fill="#ffd23f"/><rect x="${x + 40}" y="${y + 4}" width="6" height="10" rx="2" fill="#ffd23f"/>`)
    for (let k = 0; k < 5; k++) a.px(fill('#9fe0ff'), x + 3 + k * 7.5, y + 3, 6, 5)
    a.px(fill('#ff8a3a'), x, y + 10, 46, 1.2)
    for (const wx of [9, 35]) {
      disc(a, x + wx, y + 16, 3, fill('#2a2a2a'))
      disc(a, x + wx, y + 16, 1.2, fill('#b8b8b8'))
    }
    a.px(fill('#fff8c8'), x + 44.5, y + 11, 1.5, 1.5)
  })
  return lightScene(W, H, [bg, sky, town, detail, street])
}

// ---- Sky Lot: concrete pipes in a vacant lot, propeller toys in a summer sky
function skyLot(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 1601 : 1602)
  const HY = Math.round(H * (isTall ? 0.66 : 0.62))
  const bg = new Layer()
  const sky = new Layer()
  const far = new Layer()
  const lot = new Layer()
  const toys = new Layer()
  bg.px(fill('#5ab4ff'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#4aa8ff'], [0.7, '#9fd4ff'], [1, '#e0f4ff']])
  // towering summer clouds
  moving(sky, 'dt', a => {
    for (const [cx, cy, r] of isTall ? [[40, 60, 14], [130, 40, 12]] : [[60, 46, 16], [250, 40, 18], [170, 58, 10]]) {
      for (const [ox, oy, k] of [[0, 0, 1], [-r * 0.9, r * 0.5, 0.7], [r * 0.9, r * 0.5, 0.75], [0, -r * 0.7, 0.7], [-r * 0.4, r * 0.8, 0.8], [r * 0.5, r * 0.85, 0.8]]) disc(a, cx + ox, cy + oy, Math.round(r * k), fill('#ffffff', 0.95))
      a.px(fill('#dcecff', 0.9), cx - r * 1.6, cy + r * 1.1, r * 3.2, 2)
    }
  })
  // far rooftops and a fence
  for (let x = 0; x < W;) {
    const w = 14 + Math.floor(rand() * 16)
    const t = HY - 10 - Math.floor(rand() * 10)
    far.px(fill('#c8d4e0'), x, t, w, HY - t)
    for (let r = 0; r < 4; r++) far.px(fill(['#6a7a9a', '#9a5a4a', '#5a8a7a'][x % 3]), x - 1 + r * 0.6, t - 4 + r, w + 2 - r * 1.2, 1)
    x += w + 2
  }
  far.px(fill('#c8a878'), 0, HY - 6, W, 6)
  for (let x = 0; x < W; x += 3) far.px(fill('#a8885a'), x, HY - 6, 0.6, 6)
  // the lot: grass, bare patches, a telephone pole
  band(lot, W, HY, H, [[0, '#9ad06a'], [1, '#7ab84a']])
  for (let i = 0; i < 14; i++) lot.raw(`<ellipse cx="${num(rand() * W)}" cy="${num(HY + 4 + rand() * (H - HY - 6))}" rx="${num(4 + rand() * 8)}" ry="${num(1 + rand() * 2)}" fill="#c8b088" opacity="0.7"/>`)
  for (let i = 0; i < 60; i++) lot.px(fill('#5aa83a', 0.8), Math.floor(rand() * W), HY + 1 + Math.floor(rand() * (H - HY - 2)), 0.5, 1.5)
  const tp = isTall ? W - 20 : W - 34
  lot.px(fill('#8a7a6a'), tp, HY - 70, 2, 76)
  lot.px(fill('#8a7a6a'), tp - 6, HY - 66, 14, 1.2)
  // three concrete pipes, stacked
  const cx = Math.round(W * (isTall ? 0.5 : 0.62))
  const r = isTall ? 13 : 15
  const py = Math.round(isTall ? H * 0.82 : H * 0.8)
  lot.raw(`<ellipse cx="${cx}" cy="${py + r}" rx="${r * 3}" ry="3" fill="#000" opacity="0.12"/>`)
  for (const [ox, oy] of [[-r, 0], [r, 0], [0, -r * 1.72]]) {
    const x = cx + ox
    const y = py + oy
    lot.px(fill('#a8a8b0'), x - r, y - r, r * 0.5, r * 2)
    disc(lot, x, y, r, fill('#c4c4cc'))
    disc(lot, x, y, Math.round(r * 0.72), fill('#9a9aa4'))
    disc(lot, x, y, Math.round(r * 0.6), fill('#4a4a54'))
    for (let k = 0; k < 4; k++) lot.px(fill('#b0b0b8'), x - r * 0.6 + rand() * r * 1.2, y - r * 0.9 + rand() * 1.5, 1, 0.6)
  }
  disc(lot, cx - r * 2.6, py + r - 2.5, 2.5, fill('#e0242b'))
  lot.px(fill('#ff8a7a'), cx - r * 2.6 - 1, py + r - 4, 1.2, 1)
  // propeller toys flying across
  for (const [x, y, cls] of isTall ? [[120, 70, 'fy'], [60, 110, 'cw']] : [[200, 50, 'fy'], [120, 80, 'cw']]) {
    moving(toys, cls, a => {
      a.px(fill('#ffd23f'), x - 0.4, y, 0.8, 4)
      a.px(fill('#e0a020'), x - 1.5, y + 3.5, 3, 1.4)
      a.px(`${fill('#ff5a3a')} class="ra"`, x - 4, y - 0.4, 8, 0.8)
      a.px(`${fill('#ff5a3a')} class="rb"`, x - 1.5, y - 0.4, 3, 0.8)
    })
  }
  return lightScene(W, H, [bg, sky, far, lot, toys])
}

// ---- Shape Games: a pastel hall of stair mazes, shapes and a signal
function shapeGames(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 1701 : 1702)
  const HY = Math.round(H * (isTall ? 0.76 : 0.72))
  const bg = new Layer()
  const stairs = new Layer()
  const shapes = new Layer()
  const floor = new Layer()
  const hud = new Layer()
  bg.px(fill('#fbe8f0'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#fdf0f5'], [1, '#f4d4e2']])
  // stair mazes in pastel, climbing up the walls
  const colors = [['#ff8fb8', '#e06a98'], ['#7fe0c4', '#4ab89a'], ['#ffd86a', '#e0b040'], ['#b8a0ff', '#8a6ae0']]
  const flights = isTall
    ? [[4, HY, 1, 0], [W - 4, HY - 30, -1, 1], [10, HY - 70, 1, 2], [W - 10, HY - 110, -1, 3]]
    : [[4, HY, 1, 0], [W - 4, HY, -1, 1], [30, HY - 48, 1, 2], [W - 30, HY - 50, -1, 3]]
  for (const [x0, y0, dir, ci] of flights) {
    const [top, side] = colors[ci]
    for (let k = 0; k < 10; k++) {
      const x = dir > 0 ? x0 + k * 4 : x0 - (k + 1) * 4
      const y = y0 - (k + 1) * 3
      stairs.px(fill(side), x, y + 1, 4, y0 - y - 1)
      stairs.px(fill(top), x, y, 4, 1.2)
    }
    stairs.px(fill(side), dir > 0 ? x0 + 40 : x0 - 52, y0 - 33, 12, 2)
  }
  // circle, triangle, square
  const cy = Math.round(H * (isTall ? 0.2 : 0.2))
  const step = isTall ? 40 : 52
  const cx = W / 2
  const sz = isTall ? 13 : 16
  shapes.raw(`<g fill="none" stroke="#ff3f8a" stroke-width="2.4" shape-rendering="geometricPrecision">` +
    `<circle cx="${cx - step}" cy="${cy}" r="${sz}"/>` +
    `<path d="M${cx} ${cy - sz}L${cx + sz} ${cy + sz * 0.8}L${cx - sz} ${cy + sz * 0.8}Z"/>` +
    `<rect x="${cx + step - sz}" y="${cy - sz}" width="${sz * 2}" height="${sz * 2}"/></g>`)
  // the signal: red light, green light
  const sx = isTall ? 18 : 30
  const sy = HY - 50
  shapes.px(fill('#3a3a44'), sx + 3.5, sy + 20, 1.5, HY - sy - 20)
  shapes.px(fill('#2a2a34'), sx, sy, 8, 20)
  disc(shapes, sx + 4, sy + 5, 3, fill('#5a2a2a'))
  disc(shapes, sx + 4, sy + 14, 3, fill('#2a4a2a'))
  const red = new Layer()
  disc(red, sx + 4, sy + 5, 3, fill('#ff2a2a'))
  const green = new Layer()
  disc(green, sx + 4, sy + 14, 3, fill('#2aff5a'))
  shapes.raw(`<g class="rl1">${red.svg()}</g><g class="rl2">${green.svg()}</g>`)
  // the sand floor, painted lines, a slide
  floor.px(fill('#ead8b4'), 0, HY, W, H - HY)
  floor.raw(`<path d="M0 ${HY + 10}H${W}M${W * 0.3} ${HY}V${H}M${W * 0.7} ${HY}V${H}" stroke="#ffffff" stroke-width="0.8" opacity="0.8"/>`)
  for (let i = 0; i < 50; i++) floor.px(fill('#d4c098', 0.8), rand() * W, HY + 1 + rand() * (H - HY - 2), 0.6, 0.6)
  const lx = isTall ? W - 50 : W - 80
  floor.px(fill('#ff8fb8'), lx, HY - 30, 3, 30)
  floor.px(fill('#ff8fb8'), lx + 12, HY - 30, 3, 30)
  for (let y = HY - 26; y < HY; y += 5) floor.px(fill('#e06a98'), lx, y, 15, 1)
  floor.raw(`<path d="M${lx + 15} ${HY - 30}Q${lx + 30} ${HY - 26} ${lx + 40} ${HY}" stroke="#7fe0c4" stroke-width="4" fill="none" shape-rendering="geometricPrecision"/>`)
  lightPanel(hud, isTall ? W - 64 : W - 66, isTall ? 104 : 8, 58, 'ROUND 3', [
    [['PLAYERS ', '#6a6a7a'], ['101', '#ff3f8a']],
    [['TIME ', '#6a6a7a'], ['04:56', '#2a6ad8', 'blink']],
    [['NEXT ', '#6a6a7a'], ['TUG OF CODE', '#1a9a6a']],
  ], '#ff3f8a')
  return lightScene(W, H, [bg, stairs, shapes, floor], [hud])
}

// ---- Exclusion Zone: an abandoned fairground, a reactor stack, a dosimeter
function exclusionZone(W, H) {
  const isTall = H > W
  const rand = rng(isTall ? 1801 : 1802)
  const HY = Math.round(H * (isTall ? 0.76 : 0.72))
  const bg = new Layer()
  const far = new Layer()
  const mid = new Layer()
  const front = new Layer()
  const hud = new Layer()
  bg.px(fill('#d8dcd4'), 0, 0, W, H)
  band(bg, W, 0, HY, [[0, '#c4cac2'], [0.7, '#dfe3da'], [1, '#eceee6']])
  moving(bg, 'dt', a => {
    for (let k = 0; k < 8; k++) a.px(fill('#f4f6f0', 0.7), rand() * W - 20, rand() * H * 0.3, 30 + rand() * 40, 3)
  })
  moving(bg, 'fy', a => {
    for (const [bx, by] of [[200, 34], [210, 30], [222, 38]]) {
      a.px(fill('#5a5a5a'), bx, by, 1.5, 0.6)
      a.px(fill('#5a5a5a'), bx + 1.5, by + 0.6, 1, 0.6)
      a.px(fill('#5a5a5a'), bx + 2.5, by, 1.5, 0.6)
    }
  })
  // panel blocks on the left, the reactor and its stack on the right
  for (const [x, w, h] of isTall ? [[0, 30, 70], [32, 24, 52]] : [[0, 34, 78], [36, 28, 60], [66, 24, 48]]) {
    far.px(fill('#b4b8b0'), x, HY - h, w, h)
    for (let y = HY - h + 3; y < HY - 2; y += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) far.px(fill(rand() < 0.8 ? '#8a8e88' : '#5a5e58'), wx, y, 1.6, 2)
  }
  const rx = isTall ? W - 64 : W - 110
  far.px(fill('#a4aaa4'), rx, HY - 40, isTall ? 60 : 90, 40)
  far.px(fill('#8a908a'), rx, HY - 40, isTall ? 60 : 90, 2)
  far.px(fill('#9aa09a'), rx + 10, HY - 52, 30, 12)
  for (let x = rx + 4; x < rx + (isTall ? 56 : 86); x += 6) far.px(fill('#7a807a'), x, HY - 34, 3, 6)
  const vx = rx + (isTall ? 44 : 64)
  for (let k = 0; k < 10; k++) far.px(fill(k % 2 ? '#e8e8e0' : '#d84a3a'), vx, HY - 100 + k * 6, 6, 6)
  for (const y of [HY - 80, HY - 60]) far.px(fill('#6a706a'), vx - 3, y, 12, 1)
  far.px(`${fill('#d84a3a')} class="blink"`, vx + 2, HY - 102, 2, 2)
  // the Ferris wheel, still
  const wx = Math.round(W * (isTall ? 0.4 : 0.34))
  const R = isTall ? 30 : 36
  const wy = HY - R - 6
  mid.px(fill('#8a7a4a'), wx - R * 0.5, wy, 1.2, HY - wy)
  mid.px(fill('#8a7a4a'), wx + R * 0.5, wy, 1.2, HY - wy)
  mid.raw(`<circle cx="${wx}" cy="${wy}" r="${R}" fill="none" stroke="#c8a040" stroke-width="1"/><circle cx="${wx}" cy="${wy}" r="${R - 3}" fill="none" stroke="#a8883a" stroke-width="0.5"/>`)
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    mid.raw(`<line x1="${wx}" y1="${wy}" x2="${num(wx + Math.cos(a) * R)}" y2="${num(wy + Math.sin(a) * R)}" stroke="#a8883a" stroke-width="0.4"/>`)
    if (k % 2 === 0) {
      mid.px(fill('#e0b830'), wx + Math.cos(a) * R - 2, wy + Math.sin(a) * R + 0.5, 4, 3.5)
      mid.px(fill('#b08a20'), wx + Math.cos(a) * R - 2, wy + Math.sin(a) * R + 3, 4, 1)
    }
  }
  disc(mid, wx, wy, 3, fill('#a8883a'))
  // overgrown trees, a fence with a hazard sign
  for (let x = -4; x < W; x += 10 + rand() * 12) {
    const r = 5 + rand() * 5
    front.px(fill('#6a5a4a'), x + 0.5, HY - 6, 1.2, 6)
    disc(front, x + 1, HY - 6 - r, Math.round(r), fill(['#7a9a6a', '#6a8a5a', '#8aa878'][Math.floor(rand() * 3)]))
  }
  front.px(fill('#bfc4b8'), 0, HY, W, H - HY)
  for (let i = 0; i < 60; i++) front.px(fill('#8aa878', 0.8), rand() * W, HY + 1 + rand() * (H - HY - 2), 0.6, 1.5)
  const fy = HY + (isTall ? 18 : 14)
  for (let x = 0; x < W; x += 2) front.px(fill('#8a8e88', 0.7), x, fy - 12, 0.3, 12)
  for (let y = fy - 12; y < fy; y += 2) front.px(fill('#8a8e88', 0.7), 0, y, W, 0.3)
  for (let x = 0; x < W; x += 24) front.px(fill('#6a6e68'), x, fy - 14, 1, 14)
  const hx = isTall ? W / 2 - 6 : W * 0.6
  front.raw(`<g shape-rendering="geometricPrecision"><path d="M${hx + 6} ${fy - 13}L${hx + 13} ${fy - 1}L${hx - 1} ${fy - 1}Z" fill="#ffd23f" stroke="#2a2a2a" stroke-width="0.6"/>` +
    `<circle cx="${hx + 6}" cy="${fy - 5}" r="1" fill="#2a2a2a"/>` +
    [0, 1, 2].map(k => {
      const a = -Math.PI / 2 + k * 2.094
      const p = d => `${num(hx + 6 + Math.cos(a + d) * 3.6)} ${num(fy - 5 + Math.sin(a + d) * 3.6)}`
      return `<path d="M${hx + 6} ${fy - 5}L${p(-0.5)}L${p(0.5)}Z" fill="#2a2a2a"/>`
    }).join('') + `</g>`)
  for (let i = 0; i < 20; i++) front.px(`${fill('#ffffff', 0.7)} class="tw${1 + (i % 3)}"`, rand() * W, rand() * HY, 0.6, 0.6)
  lightPanel(hud, isTall ? 8 : 8, 8, 58, 'DOSIMETER', [
    [['DOSE ', '#6a6a7a'], ['0.42 USV/H', '#1a8a4a', 'blink']],
    [['ZONE ', '#6a6a7a'], ['30 KM', '#a86a00']],
    [['STATUS ', '#6a6a7a'], ['SAFE TO CODE', '#2a6ad8']],
  ], '#a86a00')
  return lightScene(W, H, [bg, far, mid, front], [hud])
}

// ---------------------------------------------------------------- reactions
// Drawn over any scene for a few seconds, as SVG pieces in the scene's own
// coordinates: fireworks when Claude finishes a long task, a red alert when tests fail.

function fireworks(W, H) {
  const L = new Layer()
  const spots = [[0.16, 0.22, C.pink, 'fw1'], [0.84, 0.18, C.cyan, 'fw2'], [0.72, 0.4, C.yellow, 'fw3'], [0.28, 0.42, C.teal, 'fw2']]
  for (const [fx, fy, color, cls] of spots) {
    const cx = Math.round(W * fx)
    const cy = Math.round(H * fy)
    const r = Math.round(Math.min(W, H) * 0.12)
    let rays = ''
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      for (const t of [0.45, 0.7, 1]) {
        const x = cx + Math.cos(a) * r * t
        const y = cy + Math.sin(a) * r * t
        rays += `<rect x="${num(x - 0.6)}" y="${num(y - 0.6)}" width="1.2" height="1.2" fill="${t === 1 ? C.white : color}"/>`
      }
    }
    L.raw(`<g class="${cls}" style="transform-origin:${cx}px ${cy}px">${rays}</g>`)
  }
  return L.svg()
}

function alert(W, H) {
  const L = new Layer()
  const red = '#ff3b3b'
  const t = 2
  L.raw(
    `<radialGradient id="alertEdge" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="${red}" stop-opacity="0"/><stop offset="1" stop-color="${red}" stop-opacity="0.45"/></radialGradient>` +
      `<g class="al"><rect width="${W}" height="${H}" fill="url(#alertEdge)"/>` +
      `<rect width="${W}" height="${t}" fill="${red}"/><rect y="${H - t}" width="${W}" height="${t}" fill="${red}"/>` +
      `<rect width="${t}" height="${H}" fill="${red}"/><rect x="${W - t}" width="${t}" height="${H}" fill="${red}"/></g>`,
  )
  const word = 'TESTS FAILED'
  const s = 0.8
  const x = W - 8 - textWidth(word, s)
  L.px(fill('#000', 0.7), x - 2, H - 16, textWidth(word, s) + 4, 8)
  text(L, word, x, H - 14, s, `${fill(red)} class="al"`)
  return L.svg()
}

// ---------------------------------------------------------------- output
const BUILDERS = {
  'neon-miami': { mode: 'dark', label: 'Neon Miami', sky: C.bg, wide: () => wide(), tall: () => tall() },
  'main-stage': { mode: 'dark', label: 'Main Stage', sky: '#020208', wide: () => mainStage(320, 180), tall: () => mainStage(180, 320) },
  'dune-sea': { mode: 'dark', label: 'Dune Sea', sky: '#2a1640', wide: () => desert(320, 180), tall: () => desert(180, 320) },
  'light-grid': { mode: 'dark', label: 'Light Grid', sky: '#000308', wide: () => lightGrid(320, 180), tall: () => lightGrid(180, 320) },
  'deep-space': { mode: 'dark', label: 'Deep Space', sky: '#02010a', wide: () => space(320, 180), tall: () => space(180, 320) },
  'dj-booth': { mode: 'dark', label: 'DJ Booth', sky: '#08060e', wide: () => djBooth(320, 180), tall: () => djBooth(180, 320) },
  'neon-rain': { mode: 'dark', label: 'Neon Rain', sky: RC.bg, wide: () => cyber(320, 180), tall: () => cyber(180, 320) },
  'thunder-amps': { mode: 'dark', label: 'Thunder Amps', sky: '#05060c', wide: () => thunderAmps(320, 180), tall: () => thunderAmps(180, 320) },
  'grand-prix': { mode: 'dark', label: 'Grand Prix', sky: '#03040c', wide: () => race(320, 180), tall: () => race(180, 320) },
  'rooftop-cats': { mode: 'dark', label: 'Rooftop Cats', sky: '#07061a', wide: () => cats(320, 180), tall: () => cats(180, 320) },
  'robot-disco': { mode: 'dark', label: 'Robot Disco', sky: '#06020e', wide: () => robotDisco(320, 180), tall: () => robotDisco(180, 320) },
  'blocklands-day': { mode: 'light', label: 'Blocklands Day', sky: VD.bg, wide: () => voxel(320, 180, true), tall: () => voxel(180, 320, true) },
  'ai-lab': { mode: 'dark', label: 'AI Lab', sky: '#02050e', wide: () => ai(320, 180), tall: () => ai(180, 320) },
  'static-stage': { mode: 'dark', label: 'Static Stage', sky: '#050506', wide: () => staticStage(320, 180), tall: () => staticStage(180, 320) },
  'black-hole': { mode: 'dark', label: 'Black Hole', sky: '#010103', wide: () => blackHole(320, 180), tall: () => blackHole(180, 320) },
  'loop-room': { mode: 'dark', label: 'Loop Room', sky: '#120c1a', wide: () => loopRoom(320, 180), tall: () => loopRoom(180, 320) },
  'night-ops': { mode: 'dark', label: 'Night Ops', sky: OC.bg, wide: () => ops(320, 180), tall: () => ops(180, 320) },
  'dog-park': { mode: 'light', label: 'Dog Park', sky: '#4f9fef', wide: () => dogs(320, 180), tall: () => dogs(180, 320) },
  'stadium-rock': { mode: 'dark', label: 'Stadium Rock', sky: '#2a1a50', wide: () => stadiumRock(320, 180), tall: () => stadiumRock(180, 320) },
  'desert-lab': { mode: 'dark', label: 'Desert Lab', sky: '#04050d', wide: () => lab(320, 180), tall: () => lab(180, 320) },
  'gargoyle-city': { mode: 'dark', label: 'Gargoyle City', sky: '#04060c', wide: () => gothic(320, 180), tall: () => gothic(180, 320) },
  blocklands: { mode: 'dark', label: 'Blocklands Night', sky: VC.bg, wide: () => voxel(320, 180), tall: () => voxel(180, 320) },
  'portal-garage': { mode: 'light', label: 'Portal Garage', sky: '#efe4cc', wide: () => portalGarage(320, 180), tall: () => portalGarage(180, 320) },
  'crayon-town': { mode: 'light', label: 'Crayon Town', sky: '#7cc8ff', wide: () => crayonTown(320, 180), tall: () => crayonTown(180, 320) },
  'shadow-office': { mode: 'light', label: 'Shadow Office', sky: '#f2f5f7', wide: () => shadowOffice(320, 180), tall: () => shadowOffice(180, 320) },
  'sky-lot': { mode: 'light', label: 'Sky Lot', sky: '#5ab4ff', wide: () => skyLot(320, 180), tall: () => skyLot(180, 320) },
  'shape-games': { mode: 'light', label: 'Shape Games', sky: '#fbe8f0', wide: () => shapeGames(320, 180), tall: () => shapeGames(180, 320) },
  'exclusion-zone': { mode: 'light', label: 'Exclusion Zone', sky: '#d8dcd4', wide: () => exclusionZone(320, 180), tall: () => exclusionZone(180, 320) },
}
const out = {}
for (const [name, b] of Object.entries(BUILDERS)) {
  out[name] = { label: b.label, sky: b.sky, mode: b.mode }
  for (const layout of ['wide', 'tall']) {
    const { W, H, body, defs: extra = '', scan = true } = b[layout]()
    const svg = wrap(W, H, body, true, extra, scan)
    if (svg.length > 131072) throw new Error(`${name} ${layout} is ${svg.length} characters, over the 131072 an Svg takes`)
    out[name][layout] = svg
  }
}

const names = Object.keys(out)
// One module per scene: the engine reads a module only up to 1 MB.
const sceneDir = join(root, 'hooks', 'scenes')
rmSync(sceneDir, { recursive: true, force: true })
mkdirSync(sceneDir)
const ident = name => name.replace(/-(.)/g, (_, c) => c.toUpperCase())
for (const name of names) {
  writeFileSync(
    join(sceneDir, `${name}.ts`),
    `// Generated by dev/build-scene.mjs. Do not edit by hand.
export default ${JSON.stringify(out[name], null, 1)} as const
`,
  )
}
const ts = `// Generated by dev/build-scene.mjs. Do not edit by hand: change the script and run it again.
// The scenes the theme draws behind the conversation: wide on the desktop app,
// tall on the mobile app, one module each in ./scenes. STYLE is what moves; without it, a scene is still.
${names.map(n => `import ${ident(n)} from './scenes/${n}'`).join('\n')}

export const STYLE = ${JSON.stringify(STYLE)}

export const SCENE_NAMES = ${JSON.stringify(names)} as const
export type SceneName = (typeof SCENE_NAMES)[number]

export const SCENES: { readonly [K in SceneName]: { readonly label: string; readonly sky: string; readonly mode: 'dark' | 'light'; readonly wide: string; readonly tall: string } } = {
${names.map(n => `  ${JSON.stringify(n)}: ${ident(n)},`).join('\n')}
}

// Pieces drawn over a scene for a few seconds: placed just before its </svg>.
export const REACTIONS = ${JSON.stringify({
  party: { wide: fireworks(320, 180), tall: fireworks(180, 320) },
  alert: { wide: alert(320, 180), tall: alert(180, 320) },
}, null, 1)} as const
export type Reaction = keyof typeof REACTIONS
`
writeFileSync(join(root, 'hooks', 'scene.ts'), ts)
if (process.argv.includes('--preview')) {
  const dir = process.argv[process.argv.indexOf('--preview') + 1] ?? root
  for (const [name, s] of Object.entries(out)) {
    writeFileSync(join(dir, `preview-${name}-wide.svg`), s.wide)
    writeFileSync(join(dir, `preview-${name}-tall.svg`), s.tall)
  }
}
if (process.argv.includes('--wallpaper')) {
  // A still scene for a terminal's background image (Windows Terminal and the like).
  const dir = process.argv[process.argv.indexOf('--wallpaper') + 1] ?? root
  const { W, H, body } = wide({ hud: false })
  writeFileSync(join(dir, 'terminal-wallpaper.svg'), wrap(W, H, body, false))
}
for (const [k, v] of Object.entries(out)) console.log(`${k}: wide ${v.wide.length}, tall ${v.tall.length} chars`)
