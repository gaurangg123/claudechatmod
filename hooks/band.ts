// The terminal's skyline band: a pixel-art strip of neon Miami at midnight,
// drawn as one Raster. Each cell is an upper-half block, so one cell holds two
// square pixels (foreground on top, background below).

const UPPER_HALF = 0x2580
const ROWS = 4
const HEIGHT = ROWS * 2
const HORIZON = 6

const SKY = [0x07030d, 0x0e0519, 0x1a0830, 0x2e0c45, 0x55124f, 0x8a1f57] as const
const SUN = [-1, 0xffd23f, 0xffb03b, 0xff8a3d, -1, 0xff3d8b] as const
const STARS = [0x6b5a8a, 0x9a88c0, 0x4de8ff, 0xc9a7ff] as const
const BUILDING = 0x0c0616
const BUILDING_EDGE = 0x160c26
const NEON = [0xff2d95, 0x00e5ff, 0x9b4dff, 0x19f0c8] as const
const WINDOWS = [0xffd23f, 0xffd23f, 0xffb86b, 0x4de8ff, 0xff5fb0] as const
const ROAD = 0x0a0612
const DASH = 0x3a2f1c
const TAIL = 0xff2d55
const RIM = [0x7a2cff, 0xff2d95, 0xff9e3d, 0xff2d95, 0x2d7bff] as const

function seeded(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function one<T>(list: readonly T[], r: number): T {
  const v = list[Math.min(list.length - 1, Math.floor(r * list.length))]
  if (v === undefined) throw new Error('empty list')
  return v
}

function lerp(a: number, b: number, t: number) {
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff
    const y = (b >> shift) & 0xff
    return Math.round(x + (y - x) * t) << shift
  }
  return ch(16) | ch(8) | ch(0)
}

function gradient(stops: readonly number[], t: number) {
  const span = (stops.length - 1) * Math.min(1, Math.max(0, t))
  const i = Math.min(stops.length - 2, Math.floor(span))
  return lerp(stops[i] ?? 0, stops[i + 1] ?? 0, span - i)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? B64.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? B64.charAt(n & 63) : '='
  }
  return out
}

class Canvas {
  readonly px: Uint32Array
  constructor(readonly width: number) {
    this.px = new Uint32Array(width * HEIGHT)
  }
  get(x: number, y: number) {
    return this.px[y * this.width + x] ?? 0
  }
  set(x: number, y: number, color: number) {
    if (x >= 0 && x < this.width && y >= 0 && y < HEIGHT) this.px[y * this.width + x] = color
  }
}

/** The band's pixels, `columns` wide and 8 tall, as 0xRRGGBB. */
function paint(columns: number) {
  const W = columns
  const c = new Canvas(W)
  const rand = seeded(1984)

  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < W; x++) c.set(x, y, y < HORIZON ? (SKY[y] ?? 0) : ROAD)

  // stars
  for (let y = 0; y < 3; y++) for (let x = 0; x < W; x++) if (rand() < 0.03) c.set(x, y, one(STARS, rand()))

  // the striped sun, sitting on the horizon in the middle
  const cx = Math.floor(W / 2)
  for (let y = 1; y < HORIZON; y++) {
    const color = SUN[y] ?? -1
    if (color < 0) continue
    const dy = HORIZON - y - 0.5
    const hw = Math.round(Math.sqrt(Math.max(0, 25 - dy * dy)))
    for (let x = cx - hw; x < cx + hw; x++) c.set(x, y, color)
  }

  // the skyline: low around the sun, taller toward the edges
  let x = 0
  while (x < W) {
    const w = 2 + Math.floor(rand() * 4)
    const nearSun = x + w > cx - 9 && x < cx + 9
    const h = nearSun ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3)
    const top = HORIZON - h
    const neon = h >= 3 && rand() < 0.4 ? one(NEON, rand()) : -1
    for (let bx = x; bx < Math.min(W, x + w); bx++) {
      for (let by = top; by < HORIZON; by++) {
        c.set(bx, by, bx === x ? BUILDING_EDGE : BUILDING)
        if (by > top && bx > x && rand() < 0.1) c.set(bx, by, one(WINDOWS, rand()))
      }
      if (neon >= 0 && !nearSun) c.set(bx, top, neon)
    }
    if (!nearSun && h === 4 && rand() < 0.5) c.set(x + Math.floor(w / 2), top - 1, TAIL)
    x += w + (rand() < 0.25 ? 1 : 0)
  }

  // palm trees at both ends, drawn in neon
  const palm = (at: number, leaf: number, trunk: number) => {
    const lean = at < W / 2 ? -1 : 1
    const frond: Array<[number, number]> = [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-3, 1], [3, 1], [-1, 1], [1, 1]]
    for (const [dx, y] of frond) c.set(at + dx, y, leaf)
    for (let y = 1; y < HORIZON; y++) c.set(at + (y < 3 ? 0 : lean), y, trunk)
  }
  if (W >= 24) {
    palm(3, 0xff2d95, 0xa01a5e)
    palm(W - 4, 0x19f0c8, 0x0f8f7a)
  }

  // the road: lane dashes and a couple of supercars with tail-light streaks
  for (let rx = 0; rx < W; rx++) if (rx % 6 < 2) c.set(rx, HORIZON, DASH)
  const car = (at: number, dir: 1 | -1, body: number) => {
    const parts = [TAIL, body, body, body, 0xfff3b0]
    parts.forEach((color, i) => c.set(dir > 0 ? at + i : at + parts.length - 1 - i, HORIZON, color))
    for (let i = 1; i <= 4; i++) c.set(dir > 0 ? at - i : at + parts.length - 1 + i, HORIZON, lerp(TAIL, ROAD, i / 5))
  }
  if (W >= 30) {
    car(Math.floor(W * 0.22), 1, 0xff2d95)
    car(Math.floor(W * 0.7), -1, 0x00e5ff)
  }

  // the neon rim along the bottom
  for (let rx = 0; rx < W; rx++) c.set(rx, HEIGHT - 1, gradient(RIM, W === 1 ? 0 : rx / (W - 1)))

  return c
}

const cache = new Map<number, string>()

/** The Raster `cells` for a band `columns` wide and 4 rows tall. */
export function bandCells(columns: number): string {
  const hit = cache.get(columns)
  if (hit !== undefined) return hit
  const c = paint(columns)
  const words = new Uint32Array(columns * ROWS * 3)
  const put = (cx: number, cy: number, codePoint: number, fg: number, bg: number) => {
    const i = (cy * columns + cx) * 3
    words[i] = codePoint
    words[i + 1] = fg
    words[i + 2] = bg
  }
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < columns; cx++) put(cx, cy, UPPER_HALF, c.get(cx, cy * 2), c.get(cx, cy * 2 + 1))
  }
  // a small code tag in the night sky beside the right palm (no title text: it read as a label)
  if (columns >= 40) {
    const tag = '</>'
    const at = columns - 9 - tag.length
    for (let k = 0; k < tag.length; k++) put(at + k, 0, tag.charCodeAt(k), 0x00e5ff, c.get(at + k, 1))
  }
  const encoded = base64(new Uint8Array(words.buffer))
  if (cache.size > 16) cache.clear()
  cache.set(columns, encoded)
  return encoded
}
