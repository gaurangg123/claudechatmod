// Neon Miami's state contract: the person's choices, kept for the session in
// $.state (so drawings redraw when they change) and across sessions in $.store.

export type NeonMiamiPrefs = {
  /** The pixel-art city drawn behind the conversation (desktop and mobile apps). */
  backdrop: boolean
  /** The pixel skyline band above the prompt (terminal). */
  band: boolean
  /** Blinking signs, stars and cursors in the backdrop. */
  motion: boolean
  /** The scene on show: neon-miami, neon-rain, blocklands or night-ops. */
  scene: string
  /** Rotate through the scenes on a timer. */
  slideshow: boolean
  /** Minutes between scenes while the slideshow runs. */
  minutes: number
  /** Shifts the slideshow's clock-based order, so /neon next and /neon scene take effect. */
  offset: number
}

declare module 'claude-code' {
  interface PluginState {
    'neon-miami': { prefs: NeonMiamiPrefs }
  }
}
