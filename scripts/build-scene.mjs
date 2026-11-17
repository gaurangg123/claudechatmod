#!/usr/bin/env node
// Neon Miami: builds hooks/scene.ts, the pixel-art scenes the mod draws behind
// the conversation (wide for the desktop app, tall for the mobile app): Neon
// Miami, Neon Rain, Blocklands and Night Ops, which the slideshow rotates through.
//
//   node scripts/build-scene.mjs                  writes hooks/scene.ts
//   node scripts/build-scene.mjs --preview <dir>  also writes preview-<scene>-wide/tall.svg there
//
// Everything is drawn on a coarse pixel grid (viewBox 320x180 or 180x320) with
// crisp edges, so it reads as 8/16-bit pixel art at any window size. The centre
// is kept dark for the chat; the art lives along the bottom and in the corners.

import { writeFileSync } from 'node:fs'
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
function moving(L, cls, draw) {
  const a = new Layer()
  const g = new Layer('filter="url(#glow)"')
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
  '$': '011110010011110', '#': '101111101111101', ' ': '000000000000000',
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
.d1{animation:dr 9s linear infinite}
.d2{animation:dl 11s linear infinite -4s}
.d3{animation:dl 14s linear infinite -9s}
.d4{animation:dr 7s linear infinite -2s}
@keyframes fa{from{transform:translateY(-12px)}to{transform:translateY(12px)}}
.f1{animation:fa .7s linear infinite}
.f2{animation:fa .9s linear infinite -.4s}
@keyframes dt{from{transform:translateX(-40px)}to{transform:translateX(60px)}}
.dt{animation:dt 45s ease-in-out infinite alternate}
@keyframes fy{from{transform:translateX(140px)}to{transform:translateX(-260px)}}
.fy{animation:fy 28s linear infinite}
@keyframes pu{0%,100%{opacity:.7}50%{opacity:1}}
.pu{animation:pu 4s ease-in-out infinite}
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
    `<radialGradient id="calmDay" cx="0.5" cy="0.42" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
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

// ---------------------------------------------------------------- output
const BUILDERS = {
  'neon-miami': { label: 'Neon Miami', sky: C.bg, wide: () => wide(), tall: () => tall() },
  'blocklands-day': { label: 'Blocklands Day', sky: VD.bg, wide: () => voxel(320, 180, true), tall: () => voxel(180, 320, true) },
  'neon-rain': { label: 'Neon Rain', sky: RC.bg, wide: () => cyber(320, 180), tall: () => cyber(180, 320) },
  'night-ops': { label: 'Night Ops', sky: OC.bg, wide: () => ops(320, 180), tall: () => ops(180, 320) },
  blocklands: { label: 'Blocklands Night', sky: VC.bg, wide: () => voxel(320, 180), tall: () => voxel(180, 320) },
}
const out = {}
for (const [name, b] of Object.entries(BUILDERS)) {
  out[name] = { label: b.label, sky: b.sky }
  for (const layout of ['wide', 'tall']) {
    const { W, H, body, defs: extra = '', scan = true } = b[layout]()
    const svg = wrap(W, H, body, true, extra, scan)
    if (svg.length > 131072) throw new Error(`${name} ${layout} is ${svg.length} characters, over the 131072 an Svg takes`)
    out[name][layout] = svg
  }
}

const names = Object.keys(out)
const ts = `// Generated by scripts/build-scene.mjs. Do not edit by hand: change the script and run it again.
// The scenes the theme draws behind the conversation: wide on the desktop app,
// tall on the mobile app. STYLE is the blinking lights; without it, a scene is still.

export const STYLE = ${JSON.stringify(STYLE)}

export const SCENE_NAMES = ${JSON.stringify(names)} as const
export type SceneName = (typeof SCENE_NAMES)[number]

export const SCENES: { readonly [K in SceneName]: { readonly label: string; readonly sky: string; readonly wide: string; readonly tall: string } } = ${JSON.stringify(out, null, 1)}
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
